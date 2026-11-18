"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Search, Square } from "lucide-react";
import { apiGet, apiPost, fmtDate } from "../api";
import { Badge, Button, Empty, Loading, Notice, Panel, StatGrid, statusTone } from "../ui";
import { go, isActive, pct, refreshCredits, type Run, type RunSite } from "../types";
import { SiteDrawer, SocialIcons } from "./SiteDrawer";

const FILTERS = [
  { id: "", label: "All" },
  { id: "found", label: "With contact" },
  { id: "empty", label: "No contact" },
  { id: "failed", label: "Unreachable" },
  { id: "skipped", label: "Locked" },
  { id: "pending", label: "Pending" },
];
const PAGE = 50;

export function RunDetail({ id }: { id: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [sites, setSites] = useState<RunSite[]>([]);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState<RunSite | null>(null);
  const [actionMsg, setActionMsg] = useState("");
  const ticking = useRef(false);

  const loadRun = useCallback(async () => {
    try {
      const r = await apiGet<{ run: Run }>(`/api/runs/${id}`);
      setRun(r.run);
      return r.run;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the run.");
      return null;
    }
  }, [id]);

  const loadSites = useCallback(async () => {
    const qs = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
    if (filter) qs.set("status", filter);
    if (query.trim()) qs.set("q", query.trim());
    const r = await apiGet<{ sites: RunSite[]; total: number }>(`/api/runs/${id}/results?${qs}`);
    setSites(r.sites);
    setTotal(r.total);
  }, [id, filter, query, offset]);

  // While the run is active, this tab drives processing: one tick in flight at a time.
  useEffect(() => {
    let alive = true;
    const loop = async () => {
      while (alive) {
        const r = await loadRun();
        await loadSites().catch(() => undefined);
        if (!r || !isActive(r)) {
          refreshCredits();
          break;
        }
        if (!ticking.current) {
          ticking.current = true;
          apiPost(`/api/runs/${id}/tick`, {})
            .catch(() => undefined)
            .finally(() => {
              ticking.current = false;
              refreshCredits();
            });
        }
        await new Promise((res) => setTimeout(res, 2500));
      }
    };
    void loop();
    return () => {
      alive = false;
    };
  }, [id, loadRun, loadSites]);

  async function cancel() {
    await apiPost(`/api/runs/${id}/cancel`, {}).catch((e) => setActionMsg(String(e.message ?? e)));
    void loadRun();
    void loadSites();
  }

  async function rerun(scope: "all" | "failed" | "skipped") {
    setActionMsg("");
    try {
      const r = await apiPost<{ run: Run }>(`/api/runs/${id}/rerun`, { scope });
      go(`runs/${r.run.id}`);
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : "Could not re-run.");
    }
  }

  if (!run) return <Loading error={error} loading={!error} />;
  const active = isActive(run);
  const locked = sites.length && filter === "skipped" ? total : null;

  return (
    <>
      <div className="detail-head">
        <button className="ov-link" onClick={() => go("runs")}>
          ← All runs
        </button>
        <div className="detail-title">
          <strong>{run.name}</strong>
          <Badge tone={statusTone(run.status)}>{run.status}</Badge>
          <span className="pf-muted pf-small">
            Started {fmtDate(run.created_at)}
            {run.finished_at ? ` · finished ${fmtDate(run.finished_at)}` : ""}
          </span>
        </div>
      </div>

      <StatGrid
        items={[
          { label: "Progress", value: `${pct(run.processed, run.total)}%`, note: `${run.processed.toLocaleString()} of ${run.total.toLocaleString()} sites` },
          { label: "With contact", value: run.found.toLocaleString(), note: `${pct(run.found, run.processed)}% hit rate` },
          { label: "No contact / unreachable", value: `${run.empty} / ${run.failed}`, note: "Never charged" },
          { label: "Credits charged", value: run.charged.toLocaleString(), note: run.max_charge ? `Cap ${run.max_charge}` : "One per site with a contact" },
        ]}
      />

      {active && (
        <div className="panel live-panel">
          <div className="pf-bar">
            <i style={{ width: `${pct(run.processed, run.total)}%` }} />
          </div>
          <div className="live-row">
            <span className="pf-mono pf-small">Crawling… results appear below as each site finishes. You can close this tab; the run keeps going.</span>
            <Button variant="danger" onClick={cancel}>
              <Square size={10} /> Stop
            </Button>
          </div>
        </div>
      )}

      {actionMsg && <Notice tone="bad">{actionMsg}</Notice>}

      <Panel
        title="Results"
        flush
        right={
          <>
            <a className="pf-btn" href={`/api/runs/${id}/export?format=csv`}>
              <Download size={10} /> CSV
            </a>
            <a className="pf-btn" href={`/api/runs/${id}/export?format=xlsx`}>
              Excel
            </a>
            <a className="pf-btn" href={`/api/runs/${id}/export?format=json`}>
              JSON
            </a>
            {!active && (
              <Button onClick={() => rerun("all")} title="Check the same sites again and highlight what changed">
                <RefreshCw size={10} /> Re-run
              </Button>
            )}
          </>
        }
      >
        <div className="results-toolbar">
          <div className="pf-tabs inline">
            {FILTERS.map((f) => (
              <button key={f.id} className={`pf-tab ${filter === f.id ? "active" : ""}`} onClick={() => { setFilter(f.id); setOffset(0); }}>
                {f.label}
              </button>
            ))}
          </div>
          <label className="search">
            <Search size={12} />
            <input placeholder="Filter by domain" value={query} onChange={(e) => { setQuery(e.target.value); setOffset(0); }} />
          </label>
        </div>

        {!active && run.failed > 0 && filter === "failed" && (
          <div className="pf-body">
            <Notice tone="info">
              Unreachable sites are free. Retrying can help with timeouts and temporary errors; bot-protection walls and dead domains usually stay blocked.{" "}
              <button className="ov-link" onClick={() => rerun("failed")}>
                Retry unreachable sites
              </button>
            </Notice>
          </div>
        )}
        {!active && locked !== null && (
          <div className="pf-body">
            <Notice tone="warn">
              {locked} sites had contacts but you ran out of credits. Top up, then{" "}
              <button className="ov-link" onClick={() => rerun("skipped")}>
                unlock them
              </button>
              .
            </Notice>
          </div>
        )}

        {sites.length === 0 ? (
          <Empty>{active ? "Waiting for the first results…" : "No sites match this filter."}</Empty>
        ) : (
          <div className="pf-table-wrap">
            <table className="pf-table results-table">
              <thead>
                <tr>
                  <th>Website</th>
                  <th>Status</th>
                  <th>Emails</th>
                  <th>Phone</th>
                  <th>WhatsApp</th>
                  <th>Socials</th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const r = s.result;
                  const emails = (r?.emails ?? []).filter((e) => e.mx !== "invalid");
                  const fresh = s.new_values && !s.new_values.firstTime ? s.new_values.emails.length + s.new_values.phones.length : 0;
                  return (
                    <tr key={s.id} onClick={() => setOpen(s)} className={open?.id === s.id ? "sel" : ""} style={{ cursor: "pointer" }}>
                      <td>
                        <strong>{s.domain ?? s.input}</strong>
                        <small>{r?.company.name ?? r?.company.summary ?? s.input}</small>
                      </td>
                      <td>
                        <Badge tone={siteTone(s.status)}>{siteLabel(s.status)}</Badge>
                        {fresh > 0 && <span className="new-chip">{fresh} new</span>}
                      </td>
                      <td>
                        {emails[0] ? (
                          <>
                            <span className="pf-mono">{emails[0].value}</span>
                            {emails.length > 1 && <small>+{emails.length - 1} more</small>}
                          </>
                        ) : (
                          <span className="pf-muted">{s.status === "found" || s.status === "empty" ? "—" : s.status_note?.slice(0, 60) ?? "—"}</span>
                        )}
                      </td>
                      <td className="pf-mono">{r?.phones[0]?.international ?? "—"}</td>
                      <td className="pf-mono">{r?.whatsapp[0] ? r.whatsapp[0].number ?? "link" : "—"}</td>
                      <td>{r ? <SocialIcons socials={r.socials} /> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > PAGE && (
          <div className="pager">
            <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
              Prev
            </Button>
            <span className="pf-mono pf-small">
              {offset + 1}–{Math.min(total, offset + PAGE)} of {total.toLocaleString()}
            </span>
            <Button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>
              Next
            </Button>
          </div>
        )}
      </Panel>

      {open && <SiteDrawer site={open} onClose={() => setOpen(null)} />}
    </>
  );
}

export function siteTone(status: RunSite["status"]) {
  if (status === "found") return "ok" as const;
  if (status === "empty" || status === "skipped") return "warn" as const;
  if (status === "pending" || status === "processing") return "muted" as const;
  return "bad" as const;
}

export function siteLabel(status: RunSite["status"]) {
  return { found: "found", empty: "no contact", failed: "unreachable", blocked: "blocked", invalid: "invalid", skipped: "locked", pending: "pending", processing: "crawling" }[status];
}
