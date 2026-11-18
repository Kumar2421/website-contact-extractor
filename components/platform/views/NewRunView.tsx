"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, Play, Sparkles } from "lucide-react";
import { apiPost, useApi } from "../api";
import { parseCsv } from "../csv";
import { Button, Loading, Notice, Panel } from "../ui";
import { go, refreshCredits, type Profile, type Run } from "../types";

const SAMPLE = ["igus.de", "dishoom.com", "freshworks.com", "laduree.fr", "zotter.at", "kingarthurbaking.com", "patagonia.com", "haldirams.com", "careem.com", "basecamp.com"];

type Settings = { defaults: { maxPagesPerSite: number; includePhones: boolean; includeSocials: boolean; validateEmails: boolean; aiSummary: boolean }; webhookUrl: string | null; aiAvailable: boolean };

/** Client-side preview of what the server will accept (the server re-validates everything). */
function preview(text: string) {
  const seen = new Set<string>();
  let valid = 0;
  let dupes = 0;
  let invalid = 0;
  for (const raw of text.split(/[\r\n,]+/)) {
    let t = raw.trim().replace(/^["'<(]+|[>"')]+$/g, "");
    if (!t || t.startsWith("#")) continue;
    if (/^[^@\s]+@[^@\s]+$/.test(t)) t = t.slice(t.indexOf("@") + 1);
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
      if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) throw new Error();
      const key = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
      if (seen.has(key)) dupes++;
      else {
        seen.add(key);
        valid++;
      }
    } catch {
      invalid++;
    }
  }
  return { valid, dupes, invalid };
}

/** Pick the column that looks like websites: by header name first, then by content. */
function websitesFromCsv(text: string): string[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  let col = header.findIndex((h) => /^(website|url|domain|site|web|homepage|company website|website url)$/.test(h));
  let body = rows.slice(1);
  if (col < 0) {
    const score = (i: number) => rows.slice(0, 50).filter((r) => /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test((r[i] ?? "").trim())).length;
    const width = Math.max(...rows.slice(0, 50).map((r) => r.length));
    col = Array.from({ length: width }, (_, i) => i).sort((a, b) => score(b) - score(a))[0] ?? 0;
    if (!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(rows[0][col] ?? "")) body = rows.slice(1);
    else body = rows;
  }
  return body.map((r) => (r[col] ?? "").trim()).filter(Boolean);
}

export function NewRunView({ sub }: { sub: string }) {
  const { data: settings, error, loading } = useApi<Settings>("/api/settings");
  if (!settings) return <Loading error={error} loading={loading} />;
  return <NewRunForm sample={sub === "sample"} settings={settings} />;
}

/** Seeded from saved defaults once; remounted per route so no effect has to copy props into state. */
function NewRunForm({ sample, settings }: { sample: boolean; settings: Settings }) {
  const { data: usage } = useApi<{ profile: Profile }>("/api/usage");
  const d = settings.defaults;
  const [text, setText] = useState(sample ? SAMPLE.join("\n") : "");
  const [name, setName] = useState(sample ? "Sample run" : "");
  const [pages, setPages] = useState(d.maxPagesPerSite);
  const [phones, setPhones] = useState(d.includePhones);
  const [socials, setSocials] = useState(d.includeSocials);
  const [mx, setMx] = useState(d.validateEmails);
  const [ai, setAi] = useState(d.aiSummary && settings.aiAvailable);
  const [webhook, setWebhook] = useState(settings.webhookUrl ?? "");
  const [cap, setCap] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileNote, setFileNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => preview(text), [text]);
  const credits = usage?.profile.credits ?? 0;
  const capNum = Number(cap) > 0 ? Math.floor(Number(cap)) : null;
  const maxCost = Math.min(stats.valid, capNum ?? Infinity);

  async function onFile(file: File) {
    setError("");
    if (file.size > 20_000_000) return setError("That file is over 20 MB. Split it into smaller files.");
    const content = await file.text();
    const list = /\.(csv|tsv)$/i.test(file.name) || content.includes(",") ? websitesFromCsv(content) : content.split(/\r?\n/);
    setText(list.join("\n"));
    if (!name) setName(file.name.replace(/\.[^.]+$/, ""));
    setFileNote(`Loaded ${list.length.toLocaleString()} rows from ${file.name}.`);
  }

  async function start() {
    setBusy(true);
    setError("");
    try {
      const res = await apiPost<{ run: Run }>("/api/runs", {
        urls: text,
        name,
        options: { maxPagesPerSite: pages, includePhones: phones, includeSocials: socials, validateEmails: mx, aiSummary: ai },
        webhookUrl: webhook || null,
        maxCharge: capNum,
      });
      refreshCredits();
      go(`runs/${res.run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the run.");
      setBusy(false);
    }
  }

  return (
    <div className="pf-grid2">
      <Panel
        title="Websites"
        right={
          <>
            <Button onClick={() => { setText(SAMPLE.join("\n")); setName("Sample run"); }}>Sample</Button>
            <Button onClick={() => fileRef.current?.click()}>
              <FileUp size={11} /> CSV
            </Button>
          </>
        }
      >
        <div className="pf-section">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" hidden onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
          <textarea
            className="pf-textarea url-input"
            placeholder={"One website per line, for example:\nacme-dental.com\nhttps://www.example-agency.co.uk\nshop.example.de/kontakt"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
          <div className="input-meta">
            <span>
              <b>{stats.valid.toLocaleString()}</b> websites
            </span>
            {stats.dupes > 0 && <span>{stats.dupes} duplicates removed</span>}
            {stats.invalid > 0 && <span className="bad">{stats.invalid} not recognised</span>}
            {fileNote && <span>{fileNote}</span>}
          </div>
          <Notice tone="muted">
            Domains, full URLs, or even email addresses work (we use the domain). From a CSV we pick the column named website, url or domain, or the one that looks most like websites.
          </Notice>
        </div>
      </Panel>

      <Panel title="Options">
        <div className="pf-section">
          <label className="pf-field">
            Run name
            <input className="pf-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dentists Berlin" maxLength={120} />
          </label>
          <label className="pf-field">
            Pages per site
            <select className="pf-select" value={pages} onChange={(e) => setPages(Number(e.target.value))}>
              <option value={3}>3 · fastest</option>
              <option value={5}>5</option>
              <option value={8}>8 · recommended</option>
              <option value={12}>12 · deepest</option>
            </select>
          </label>
          <Toggle checked={phones} onChange={setPhones} label="Phone numbers" note="Validated with Google's libphonenumber, normalised to +E.164." />
          <Toggle checked={socials} onChange={setSocials} label="Social profiles" note="LinkedIn, Facebook, Instagram, X, YouTube, TikTok, Pinterest, Telegram." />
          <Toggle checked={mx} onChange={setMx} label="Check email domains (MX)" note="Flags addresses whose domain cannot receive mail." />
          <Toggle
            checked={ai}
            onChange={setAi}
            disabled={!settings.aiAvailable}
            label={
              <>
                <Sparkles size={11} /> AI company summary
              </>
            }
            note={settings.aiAvailable ? "One-line description and industry. Never invents contacts." : "Not configured on this server."}
          />
          <details className="advanced">
            <summary>Advanced</summary>
            <label className="pf-field">
              Spending cap (credits)
              <input className="pf-input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/\D/g, ""))} placeholder="No cap" />
            </label>
            <label className="pf-field">
              Webhook when finished (https)
              <input className="pf-input" value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://hooks.zapier.com/..." />
            </label>
          </details>
          <div className="cost-box">
            <div>
              <span>Maximum cost</span>
              <b>{maxCost.toLocaleString()} credits</b>
            </div>
            <small>
              One credit per site where we find an email, phone or WhatsApp. Empty, blocked and unreachable sites are free. You have {credits.toLocaleString()} credits
              {stats.valid > credits ? `; sites found after that are kept but locked until you top up.` : "."}
            </small>
          </div>
          {error && <Notice tone="bad">{error}</Notice>}
          <Button variant="primary" disabled={busy || stats.valid === 0} onClick={start} className="start-btn">
            <Play size={11} /> {busy ? "Starting…" : `Extract contacts from ${stats.valid.toLocaleString()} site${stats.valid === 1 ? "" : "s"}`}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function Toggle({ checked, onChange, label, note, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; note: string; disabled?: boolean }) {
  return (
    <label className={`toggle ${disabled ? "disabled" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden />
      <span className="toggle-copy">
        <strong>{label}</strong>
        <small>{note}</small>
      </span>
    </label>
  );
}
