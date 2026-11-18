"use client";

import { ArrowRight } from "lucide-react";
import { useApi, timeAgo } from "../api";
import { Badge, Button, Loading, Panel, StatGrid, statusTone } from "../ui";
import { FunnelRow, Trends } from "../charts";
import { FAILURE_LABELS, go, pct, type Profile, type Run } from "../types";

type Overview = {
  profile: Profile;
  stats: { sites14d: number; found14d: number; hitRate: number; contacts: number };
  trends: { days: string[]; processed: number[]; found: number[]; charged: number[] };
  outcome: Record<string, number>;
  failureReasons: [string, number][];
  recentRuns: Run[];
};

export function OverviewView() {
  const { data, error, loading } = useApi<Overview>("/api/overview");
  if (!data) return <Loading error={error} loading={loading} />;
  const { profile, stats, trends, outcome, failureReasons, recentRuns } = data;
  const resets = new Date(profile.credits_reset_at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const totalOutcome = Object.values(outcome).reduce((a, b) => a + b, 0);

  return (
    <>
      {profile.credits < 20 && (
        <div className="pf-notice warn">
          You have {profile.credits} credits left. They top up to {profile.monthly_grant} on {resets}. Sites with no contact found never use credits.
        </div>
      )}

      {recentRuns.length === 0 && (
        <section className="panel onboarding">
          <div>
            <div className="eyebrow">GET STARTED</div>
            <h2>Find contacts on your first list in under a minute</h2>
            <p>Paste websites or upload a CSV. We read each site&apos;s contact, legal-notice and about pages and return emails, phones, WhatsApp and social profiles, each with the page it came from.</p>
          </div>
          <Button variant="primary" onClick={() => go("new/sample")}>
            Try a sample list <ArrowRight size={12} />
          </Button>
        </section>
      )}

      <StatGrid
        items={[
          { label: "Credits left", value: profile.credits.toLocaleString(), note: `Tops up to ${profile.monthly_grant} on ${resets}` },
          { label: "Sites checked (14 days)", value: stats.sites14d.toLocaleString(), note: `${stats.found14d.toLocaleString()} with a contact` },
          { label: "Hit rate", value: `${stats.hitRate}%`, note: "Sites where a contact was found" },
          { label: "Contact book", value: stats.contacts.toLocaleString(), note: "Unique domains with contacts" },
        ]}
      />

      <Panel title="14-day trends" right={<button className="ov-link" onClick={() => go("runs")}>All runs</button>}>
        <Trends
          days={trends.days}
          series={[
            { title: "Sites checked", values: trends.processed },
            { title: "With contact", values: trends.found },
            { title: "Credits used", values: trends.charged },
          ]}
        />
      </Panel>

      <div className="pf-grid2">
        <Panel title="Outcomes (14 days)">
          {totalOutcome === 0 ? (
            <div className="pf-empty">No sites processed yet.</div>
          ) : (
            <>
              <FunnelRow label="Contact found" count={outcome.found ?? 0} of={totalOutcome} />
              <FunnelRow label="No contact (free)" count={outcome.empty ?? 0} of={totalOutcome} tone="warn" />
              <FunnelRow label="Unreachable (free)" count={outcome.failed ?? 0} of={totalOutcome} tone="bad" />
              {(outcome.skipped ?? 0) > 0 && <FunnelRow label="Locked (no credits)" count={outcome.skipped} of={totalOutcome} tone="warn" />}
              <div className="ov-sub" style={{ marginTop: 6 }}>
                You are charged only for the first row. {pct(outcome.found ?? 0, totalOutcome)}% of checked sites cost a credit.
              </div>
            </>
          )}
        </Panel>
        <Panel title="Why sites were unreachable">
          {failureReasons.length === 0 ? (
            <div className="pf-empty">Nothing failed. Good list.</div>
          ) : (
            failureReasons.map(([k, n]) => (
              <div className="ov-kv" key={k}>
                <span>{FAILURE_LABELS[k] ?? k}</span>
                <Badge tone="muted">{n}</Badge>
              </div>
            ))
          )}
        </Panel>
      </div>

      <Panel title="Recent runs" right={<button className="ov-link" onClick={() => go("new")}>New extraction</button>}>
        {recentRuns.length === 0 ? (
          <div className="pf-empty">No runs yet.</div>
        ) : (
          recentRuns.map((r) => (
            <button key={r.id} className="run-row" onClick={() => go(`runs/${r.id}`)}>
              <div className="pf-row-copy">
                <strong>{r.name}</strong>
                <span>
                  {r.processed}/{r.total} sites · {r.found} with contact · {r.charged} credits · {timeAgo(r.created_at)}
                </span>
              </div>
              <div className="run-row-end">
                <div className="pf-bar" style={{ width: 90 }}>
                  <i style={{ width: `${pct(r.processed, r.total)}%` }} />
                </div>
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
              </div>
            </button>
          ))
        )}
      </Panel>
    </>
  );
}
