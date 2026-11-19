import type { SiteResult } from "./types";

/** One spreadsheet-friendly row per site. Lists are joined with "; " so they survive CSV and Excel. */
export type FlatRow = Record<(typeof FLAT_COLUMNS)[number], string | number>;

export const FLAT_COLUMNS = [
  "input",
  "domain",
  "status",
  "status_note",
  "company_name",
  "ai_summary",
  "industry",
  "country",
  "primary_email",
  "emails",
  "other_emails",
  "email_sources",
  "role_emails",
  "personal_emails",
  "primary_phone",
  "phones",
  "phone_sources",
  "whatsapp",
  "linkedin",
  "facebook",
  "instagram",
  "x",
  "youtube",
  "tiktok",
  "telegram",
  "contact_page",
  "pages_crawled",
  "final_url",
] as const;

export function flattenResult(r: SiteResult): FlatRow {
  const reachable = r.emails.filter((e) => e.mx !== "invalid");
  // The business's own addresses (and anything we are confident about) go in `emails`. Low-confidence
  // addresses on other domains (web agencies, partners, vendors) go in `other_emails`, so the main
  // column stays clean. If nothing else exists, they stay in the main column rather than vanish.
  const confident = reachable.filter((e) => e.ownDomain || e.confidence !== "low");
  const usable = confident.length ? confident : reachable;
  const other = confident.length ? reachable.filter((e) => !confident.includes(e)) : [];
  const social = (k: keyof SiteResult["socials"]) => (r.socials[k] ?? []).map((s) => s.url).join("; ");
  return {
    input: r.input,
    domain: r.domain ?? "",
    status: r.status,
    status_note: r.statusNote,
    company_name: r.company.name ?? "",
    ai_summary: r.company.summary ?? "",
    industry: r.company.industry ?? "",
    country: r.company.country ?? "",
    primary_email: usable[0]?.value ?? "",
    emails: usable.map((e) => e.value).join("; "),
    other_emails: other.map((e) => e.value).join("; "),
    email_sources: usable.map((e) => `${e.value} <- ${e.sources[0]}`).join("; "),
    role_emails: usable.filter((e) => e.kind === "role").map((e) => e.value).join("; "),
    personal_emails: usable.filter((e) => e.kind === "personal").map((e) => e.value).join("; "),
    primary_phone: r.phones[0]?.international ?? "",
    phones: r.phones.map((p) => p.e164).join("; "),
    phone_sources: r.phones.map((p) => `${p.e164} <- ${p.sources[0]}`).join("; "),
    whatsapp: r.whatsapp.map((w) => w.number ?? w.link).join("; "),
    linkedin: social("linkedin"),
    facebook: social("facebook"),
    instagram: social("instagram"),
    x: social("x"),
    youtube: social("youtube"),
    tiktok: social("tiktok"),
    telegram: social("telegram"),
    contact_page: r.contactPageUrl ?? "",
    pages_crawled: r.pagesCrawled.length,
    final_url: r.finalUrl ?? "",
  };
}

function csvCell(v: string | number): string {
  let s = String(v ?? "");
  // Neutralise spreadsheet formula injection from scraped text.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: FlatRow[]): string {
  const head = FLAT_COLUMNS.join(",");
  const body = rows.map((r) => FLAT_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return "﻿" + [head, ...body].join("\r\n");
}
