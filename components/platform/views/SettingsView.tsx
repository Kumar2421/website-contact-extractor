"use client";

import { useState } from "react";
import { apiPost, useApi } from "../api";
import { Button, Loading, Notice, Panel } from "../ui";

type Settings = {
  defaults: { maxPagesPerSite: number; includePhones: boolean; includeSocials: boolean; validateEmails: boolean; aiSummary: boolean };
  webhookUrl: string | null;
  aiAvailable: boolean;
};

export function SettingsView() {
  const { data, error, loading } = useApi<Settings>("/api/settings");
  if (!data) return <Loading error={error} loading={loading} />;
  return <SettingsForm data={data} />;
}

function SettingsForm({ data }: { data: Settings }) {
  const [d, setD] = useState(data.defaults);
  const [webhook, setWebhook] = useState(data.webhookUrl ?? "");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  async function save() {
    setMsg(null);
    try {
      await apiPost("/api/settings", { defaults: d, webhookUrl: webhook || null });
      setMsg({ tone: "ok", text: "Saved. New runs use these defaults." });
    } catch (e) {
      setMsg({ tone: "bad", text: e instanceof Error ? e.message : "Could not save." });
    }
  }

  const row = (key: keyof Settings["defaults"], label: string, note: string, disabled = false) => (
    <div className="settings-row" key={key}>
      <div className="settings-copy">
        <strong>{label}</strong>
        <span>{note}</span>
      </div>
      <input type="checkbox" checked={Boolean(d[key])} disabled={disabled} onChange={(e) => setD({ ...d, [key]: e.target.checked })} style={{ accentColor: "#00ab92" }} />
    </div>
  );

  return (
    <div className="pf-grid2">
      <Panel title="Default extraction options">
        <div className="settings-row">
          <div className="settings-copy">
            <strong>Pages per site</strong>
            <span>More pages find more contacts on large sites but take longer.</span>
          </div>
          <select className="pf-select" value={d.maxPagesPerSite} onChange={(e) => setD({ ...d, maxPagesPerSite: Number(e.target.value) })}>
            {[3, 5, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {row("includePhones", "Phone numbers", "Validated and normalised to +E.164.")}
        {row("includeSocials", "Social profiles", "LinkedIn, Facebook, Instagram, X, YouTube, TikTok, Pinterest, Telegram.")}
        {row("validateEmails", "Email domain (MX) check", "Flags addresses whose domain cannot receive mail.")}
        {row("aiSummary", "AI company summary", data.aiAvailable ? "One sentence and an industry per site." : "Not configured on this server.", !data.aiAvailable)}
      </Panel>
      <Panel title="Notifications">
        <div className="pf-section">
          <label className="pf-field">
            Default webhook (https)
            <input className="pf-input" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.zapier.com/..." />
          </label>
          <div className="settings-note">
            When a run finishes we POST <code>{`{ event: "run.completed", runId, counts, exportCsvUrl }`}</code> to this address. Private and non-https addresses are refused.
          </div>
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button variant="primary" onClick={save}>
            Save settings
          </Button>
        </div>
      </Panel>
    </div>
  );
}
