"use client";

import { useApi, fmtDate } from "../api";
import { Badge, Button, Empty, Loading, Panel, statusTone } from "../ui";
import { go, pct, type Run } from "../types";
import { RunDetail } from "./RunDetail";

export function RunsView({ sub }: { sub: string }) {
  if (sub) return <RunDetail id={sub} />;
  return <RunList />;
}

function RunList() {
  const { data, error, loading } = useApi<{ runs: Run[] }>("/api/runs?limit=100");
  if (!data) return <Loading error={error} loading={loading} />;
  return (
    <Panel title={`Runs (${data.runs.length})`} right={<Button variant="primary" onClick={() => go("new")}>New extraction</Button>} flush>
      {data.runs.length === 0 ? (
        <Empty>No runs yet. Start one from New extraction.</Empty>
      ) : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Progress</th>
                <th>With contact</th>
                <th>Hit rate</th>
                <th>Credits</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id} onClick={() => go(`runs/${r.id}`)} style={{ cursor: "pointer" }}>
                  <td>
                    <strong>{r.name}</strong>
                    <small>{r.source === "api" ? "via API" : r.source === "rerun" ? "re-run" : "web app"}</small>
                  </td>
                  <td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </td>
                  <td>
                    <div className="progress-cell">
                      <div className="pf-bar">
                        <i style={{ width: `${pct(r.processed, r.total)}%` }} />
                      </div>
                      <span className="pf-mono pf-small">
                        {r.processed}/{r.total}
                      </span>
                    </div>
                  </td>
                  <td className="pf-mono">{r.found}</td>
                  <td className="pf-mono">{pct(r.found, r.processed)}%</td>
                  <td className="pf-mono">{r.charged}</td>
                  <td className="pf-muted">{fmtDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
