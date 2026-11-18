"use client";

import { fmtDate, useApi } from "../api";
import { Badge, Loading, Notice, Panel, StatGrid } from "../ui";
import { go, type Profile } from "../types";

type Usage = {
  profile: Profile;
  limits: { maxSitesPerRun: number; label: string };
  usedThisMonth: number;
  ledger: { id: number; delta: number; reason: string; run_id: string | null; note: string | null; created_at: string }[];
};

const PLANS = [
  { id: "free", name: "Free", price: "$0", credits: "200 / month", perSite: "free", sites: "500 per run" },
  { id: "starter", name: "Starter", price: "$19 / mo", credits: "10,000 / month", perSite: "$0.0019", sites: "5,000 per run" },
  { id: "pro", name: "Pro", price: "$49 / mo", credits: "30,000 / month", perSite: "$0.0016", sites: "25,000 per run" },
  { id: "scale", name: "Scale", price: "$149 / mo", credits: "100,000 / month", perSite: "$0.0015", sites: "100,000 per run" },
];

const REASONS: Record<string, string> = {
  signup: "Welcome credits",
  monthly_grant: "Monthly top-up",
  contact_site: "Site with contact found",
  ai_summary: "AI summary",
  refund: "Refund",
  purchase: "Purchase",
  adjustment: "Adjustment",
};

export function UsageView() {
  const { data, error, loading } = useApi<Usage>("/api/usage");
  if (!data) return <Loading error={error} loading={loading} />;
  const { profile, usedThisMonth, ledger, limits } = data;
  return (
    <>
      <StatGrid
        items={[
          { label: "Credits left", value: profile.credits.toLocaleString(), note: `Tops up on ${new Date(profile.credits_reset_at).toLocaleDateString()}` },
          { label: "Used this month", value: usedThisMonth.toLocaleString(), note: "Sites with a contact found" },
          { label: "Plan", value: limits.label, note: `${limits.maxSitesPerRun.toLocaleString()} sites per run` },
          { label: "Price per found site", value: profile.plan === "free" ? "Free" : "≈ $0.002", note: "Empty sites are always free" },
        ]}
      />
      <Panel title="Plans">
        <Notice tone="info">
          You pay per <b>website where we found a contact</b>, not per page crawled. A site with no email, phone or WhatsApp, a parked domain or a site that blocks us costs nothing.
        </Notice>
        <div className="plans">
          {PLANS.map((p) => (
            <div key={p.id} className={`plan ${profile.plan === p.id ? "current" : ""}`}>
              <div className="eyebrow">{p.name.toUpperCase()}</div>
              <div className="plan-price">{p.price}</div>
              <ul>
                <li>{p.credits} credits</li>
                <li>{p.sites}</li>
                <li>{p.perSite} per found site</li>
              </ul>
              {profile.plan === p.id ? <Badge tone="ok">current plan</Badge> : <Badge tone="muted">billing opens soon</Badge>}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Credit history" flush>
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>Credits</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.id} onClick={() => l.run_id && go(`runs/${l.run_id}`)} style={{ cursor: l.run_id ? "pointer" : "default" }}>
                  <td className="pf-muted">{fmtDate(l.created_at)}</td>
                  <td>{l.note ?? REASONS[l.reason] ?? l.reason}</td>
                  <td className="pf-mono">{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}
