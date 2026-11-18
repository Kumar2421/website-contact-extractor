"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { apiPost, fmtDate, timeAgo, useApi } from "../api";
import { Badge, Button, Empty, Notice, Panel } from "../ui";

type Key = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export function ApiView() {
  const { data, reload } = useApi<{ keys: Key[] }>("/api/keys");
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-app";

  async function create() {
    setErr("");
    try {
      const r = await apiPost<{ key: string }>("/api/keys", { name });
      setFresh(r.key);
      setName("");
      void reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create the key.");
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this key? Apps using it stop working immediately.")) return;
    await fetch(`/api/keys?id=${id}`, { method: "DELETE" });
    void reload();
  }

  const key = fresh ?? "ce_live_YOUR_KEY";
  return (
    <>
      <div className="pf-grid2">
        <Panel title="API keys">
          <div className="pf-section">
            <div className="pf-toolbar">
              <input className="pf-input grow" placeholder="Key name, e.g. Zapier" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              <Button variant="primary" onClick={create}>
                <KeyRound size={10} /> Create key
              </Button>
            </div>
            {err && <Notice tone="bad">{err}</Notice>}
            {fresh && (
              <Notice tone="ok">
                Copy this key now. It is shown once and stored only as a hash.
                <pre className="pf-pre" style={{ marginTop: 8 }}>{fresh}</pre>
              </Notice>
            )}
            {!data?.keys.length ? (
              <Empty>No keys yet.</Empty>
            ) : (
              data.keys.map((k) => (
                <div className="pf-row" key={k.id}>
                  <div className="pf-row-copy">
                    <strong>{k.name}</strong>
                    <span className="pf-mono">
                      {k.prefix}… · created {fmtDate(k.created_at)} · {k.last_used_at ? `used ${timeAgo(k.last_used_at)}` : "never used"}
                    </span>
                  </div>
                  <div className="pf-row-end">
                    {k.revoked_at ? <Badge tone="muted">revoked</Badge> : <Button variant="danger" onClick={() => revoke(k.id)}>Revoke</Button>}
                  </div>
                </div>
              ))
            )}
          </div>
        </Panel>
        <Panel title="How the API works">
          <div className="pf-section pf-small api-notes">
            <p>Same engine and same pricing as the app. Start a run, poll it, then download results. Polling a running run also keeps it moving, so no worker of your own is needed.</p>
            <p>Add a webhook to get a POST with the counts and download links when the run completes (Zapier, Make, n8n, Slack).</p>
            <p>Running on Apify? The same engine ships as an Apify Actor for very large lists and scheduled runs.</p>
          </div>
        </Panel>
      </div>

      <Panel title="Quickstart">
        <div className="pf-section">
          <span className="pf-field">1 · Start a run</span>
          <pre className="pf-pre">{`curl -X POST ${origin}/api/runs \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Dentists Berlin","urls":["acme-dental.de","smile-berlin.de"],
       "options":{"includePhones":true,"aiSummary":false},
       "webhookUrl":"https://hooks.zapier.com/hooks/catch/..."}'`}</pre>
          <span className="pf-field">2 · Poll status (every few seconds)</span>
          <pre className="pf-pre">{`curl ${origin}/api/runs/RUN_ID -H "Authorization: Bearer ${key}"
# => { "run": { "status": "running", "processed": 41, "total": 120, "found": 23, "charged": 23 } }`}</pre>
          <span className="pf-field">3 · Get results</span>
          <pre className="pf-pre">{`curl "${origin}/api/runs/RUN_ID/results?status=found&limit=100" -H "Authorization: Bearer ${key}"
curl -L "${origin}/api/runs/RUN_ID/export?format=csv" -H "Authorization: Bearer ${key}" -o contacts.csv   # or xlsx, json`}</pre>
        </div>
      </Panel>
    </>
  );
}
