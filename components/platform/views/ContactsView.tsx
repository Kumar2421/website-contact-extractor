"use client";

import { useState } from "react";
import { Download, Search } from "lucide-react";
import { useApi, timeAgo } from "../api";
import { Button, Empty, Loading, Panel } from "../ui";
import { go } from "../types";

type Contact = {
  domain: string;
  company_name: string | null;
  summary: string | null;
  industry: string | null;
  country: string | null;
  emails: string[];
  phones: string[];
  whatsapp: string[];
  contact_page: string | null;
  last_seen_at: string;
  last_run_id: string | null;
  times_seen: number;
};

const PAGE = 50;

export function ContactsView() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const qs = new URLSearchParams({ offset: String(offset), limit: String(PAGE) });
  if (q.trim()) qs.set("q", q.trim());
  const { data, error, loading } = useApi<{ contacts: Contact[]; total: number }>(`/api/contacts?${qs}`);

  return (
    <Panel
      title={`Contact book${data ? ` (${data.total.toLocaleString()})` : ""}`}
      flush
      right={
        <a className="pf-btn" href={`/api/contacts?format=csv${q ? `&q=${encodeURIComponent(q)}` : ""}`}>
          <Download size={10} /> CSV
        </a>
      }
    >
      <div className="results-toolbar">
        <span className="pf-muted pf-small">Every domain with a contact, merged across all your runs and deduplicated.</span>
        <label className="search">
          <Search size={12} />
          <input placeholder="Domain, company or industry" value={q} onChange={(e) => { setQ(e.target.value); setOffset(0); }} />
        </label>
      </div>
      {!data ? (
        <Loading error={error} loading={loading} />
      ) : data.contacts.length === 0 ? (
        <Empty>{q ? "No matches." : "Contacts you extract land here, deduplicated by domain."}</Empty>
      ) : (
        <div className="pf-table-wrap">
          <table className="pf-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Emails</th>
                <th>Phones</th>
                <th>Industry</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {data.contacts.map((c) => (
                <tr key={c.domain} onClick={() => c.last_run_id && go(`runs/${c.last_run_id}`)} style={{ cursor: c.last_run_id ? "pointer" : "default" }}>
                  <td>
                    <strong>{c.company_name ?? c.domain}</strong>
                    <small>{c.domain}</small>
                  </td>
                  <td>
                    <span className="pf-mono">{c.emails[0] ?? "—"}</span>
                    {c.emails.length > 1 && <small>+{c.emails.length - 1} more</small>}
                  </td>
                  <td className="pf-mono">{c.phones[0] ?? "—"}</td>
                  <td className="wrap">
                    {c.industry ?? "—"}
                    {c.summary && <small title={c.summary}>{c.summary}</small>}
                  </td>
                  <td className="pf-muted">
                    {timeAgo(c.last_seen_at)}
                    <small>seen {c.times_seen}×</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.total > PAGE && (
        <div className="pager">
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>
            Prev
          </Button>
          <span className="pf-mono pf-small">
            {offset + 1}–{Math.min(data.total, offset + PAGE)} of {data.total.toLocaleString()}
          </span>
          <Button disabled={offset + PAGE >= data.total} onClick={() => setOffset(offset + PAGE)}>
            Next
          </Button>
        </div>
      )}
    </Panel>
  );
}
