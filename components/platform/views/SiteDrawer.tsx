"use client";

import { useEffect } from "react";
import { Copy, ExternalLink, Facebook, Instagram, Linkedin, Send, Twitter, X as Close, Youtube } from "lucide-react";
import { Badge, Button, Notice } from "../ui";
import type { RunSite } from "../types";
import type { SiteResult } from "@/lib/engine/types";
import { siteLabel, siteTone } from "./RunDetail";

const ICONS: Record<string, typeof Linkedin> = { linkedin: Linkedin, facebook: Facebook, instagram: Instagram, x: Twitter, youtube: Youtube, telegram: Send };

export function SocialIcons({ socials }: { socials: SiteResult["socials"] }) {
  const entries = Object.entries(socials).filter(([, v]) => v?.length);
  if (!entries.length) return <span className="pf-muted">—</span>;
  return (
    <span className="social-icons">
      {entries.map(([k, v]) => {
        const Icon = ICONS[k];
        return (
          <a key={k} href={v![0].url} target="_blank" rel="noopener noreferrer nofollow" title={v![0].url} onClick={(e) => e.stopPropagation()}>
            {Icon ? <Icon size={13} /> : <span className="pf-mono pf-small">{k.slice(0, 2)}</span>}
          </a>
        );
      })}
    </span>
  );
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function Source({ url }: { url?: string }) {
  if (!url) return null;
  let path = url;
  try {
    const u = new URL(url);
    path = u.pathname === "/" ? u.hostname : u.pathname;
  } catch {
    // keep raw
  }
  return (
    <a className="source" href={url} target="_blank" rel="noopener noreferrer nofollow" title={url}>
      {path} <ExternalLink size={9} />
    </a>
  );
}

/** Full detail for one site, every value with the page it came from. */
export function SiteDrawer({ site, onClose }: { site: RunSite; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const r = site.result;
  const fresh = site.new_values && !site.new_values.firstTime ? site.new_values : null;

  return (
    <div className="pf-modal-back" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Details for ${site.domain ?? site.input}`}>
        <div className="drawer-head">
          <div>
            <div className="eyebrow">SITE DETAIL</div>
            <h3>{r?.company.name ?? site.domain ?? site.input}</h3>
            <a className="source" href={r?.finalUrl ?? site.input} target="_blank" rel="noopener noreferrer nofollow">
              {r?.finalUrl ?? site.input} <ExternalLink size={9} />
            </a>
          </div>
          <button className="collapse" onClick={onClose} aria-label="Close">
            <Close size={16} />
          </button>
        </div>

        <div className="drawer-body">
          <div className="drawer-status">
            <Badge tone={siteTone(site.status)}>{siteLabel(site.status)}</Badge>
            {site.charged && <Badge tone="info">1 credit</Badge>}
            {r?.flags.cloudflareEmail && <Badge tone="muted">decoded Cloudflare-hidden email</Badge>}
            {r?.flags.usedSitemap && <Badge tone="muted">found via sitemap</Badge>}
          </div>
          <p className="drawer-note">{site.status_note ?? r?.statusNote}</p>

          {r?.company.summary && (
            <div className="drawer-ai">
              <span className="eyebrow">AI SUMMARY · {r.company.industry ?? ""}</span>
              <p>{r.company.summary}</p>
            </div>
          )}

          {fresh && (fresh.emails.length > 0 || fresh.phones.length > 0) && (
            <Notice tone="ok">New since your last run: {[...fresh.emails, ...fresh.phones].join(", ")}</Notice>
          )}

          {r && r.emails.length > 0 && (
            <section>
              <h4>Emails</h4>
              {r.emails.map((e) => (
                <div className="fact" key={e.value}>
                  <div className="fact-main">
                    <span className="pf-mono">{e.value}</span>
                    <button className="icon-btn" onClick={() => copy(e.value)} aria-label="Copy">
                      <Copy size={11} />
                    </button>
                  </div>
                  <div className="fact-tags">
                    <Badge tone={e.confidence === "high" ? "ok" : e.confidence === "medium" ? "info" : "warn"}>{e.confidence}</Badge>
                    <Badge tone="muted">{e.kind}</Badge>
                    {e.mx === "valid" && <Badge tone="ok">mx ok</Badge>}
                    {e.mx === "risky" && <Badge tone="warn">no mx record</Badge>}
                    {e.mx === "invalid" && <Badge tone="bad">domain takes no mail</Badge>}
                    {!e.ownDomain && <Badge tone="muted">{e.freeProvider ? "free provider" : "other domain"}</Badge>}
                    <Source url={e.sources[0]} />
                  </div>
                </div>
              ))}
            </section>
          )}

          {r && r.phones.length > 0 && (
            <section>
              <h4>Phones</h4>
              {r.phones.map((p) => (
                <div className="fact" key={p.e164}>
                  <div className="fact-main">
                    <span className="pf-mono">{p.international}</span>
                    <button className="icon-btn" onClick={() => copy(p.e164)} aria-label="Copy">
                      <Copy size={11} />
                    </button>
                  </div>
                  <div className="fact-tags">
                    <Badge tone={p.confidence === "high" ? "ok" : "info"}>{p.confidence}</Badge>
                    {p.type && <Badge tone="muted">{p.type.replace(/_/g, " ")}</Badge>}
                    {p.country && <Badge tone="muted">{p.country}</Badge>}
                    <Source url={p.sources[0]} />
                  </div>
                </div>
              ))}
            </section>
          )}

          {r && r.whatsapp.length > 0 && (
            <section>
              <h4>WhatsApp</h4>
              {r.whatsapp.map((w) => (
                <div className="fact" key={w.link}>
                  <div className="fact-main">
                    <a className="pf-mono" href={w.link} target="_blank" rel="noopener noreferrer nofollow">
                      {w.number ?? w.link}
                    </a>
                  </div>
                  <div className="fact-tags">
                    <Source url={w.source} />
                  </div>
                </div>
              ))}
            </section>
          )}

          {r && Object.keys(r.socials).length > 0 && (
            <section>
              <h4>Social profiles</h4>
              {Object.entries(r.socials).flatMap(([k, list]) =>
                (list ?? []).map((s) => (
                  <div className="fact" key={s.url}>
                    <div className="fact-main">
                      <Badge tone="muted">{k}</Badge>
                      <a className="pf-mono" href={s.url} target="_blank" rel="noopener noreferrer nofollow">
                        {s.handle}
                      </a>
                    </div>
                    <div className="fact-tags">
                      <Source url={s.source} />
                    </div>
                  </div>
                )),
              )}
            </section>
          )}

          {r && r.pagesCrawled.length > 0 && (
            <section>
              <h4>Pages checked ({r.pagesCrawled.length})</h4>
              <ul className="pages">
                {r.pagesCrawled.map((p) => (
                  <li key={p}>
                    <Source url={p} />
                  </li>
                ))}
              </ul>
              <small className="pf-muted">{(r.durationMs / 1000).toFixed(1)} s</small>
            </section>
          )}
        </div>
        <div className="drawer-foot">
          <Button onClick={() => copy(JSON.stringify(r ?? site, null, 2))}>Copy JSON</Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </aside>
    </div>
  );
}
