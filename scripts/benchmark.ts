/**
 * Live benchmark on real websites: our engine vs two baselines on the same list, same network.
 *   1. marlo   - the extractor this project started from (homepage + 2 pages, emails/WhatsApp only).
 *   2. crawlee - Crawlee's open-source parseHandlesFromHtml (the toolkit Apify's own contact scrapers
 *                are built on), crawling the homepage plus same-site links in page order with the same
 *                page budget as ours. This approximates the leader's method; it is not the paid actor.
 *   3. ours    - lib/engine.
 * Usage: npm run bench -- [sites-file] [--limit N] [--only ours]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { social } from "@crawlee/utils";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";
import { extractSite } from "../lib/engine/crawl.ts";
import { fetchPage } from "../lib/engine/http.ts";
import { cleanEmail, registrable } from "../lib/engine/emails.ts";
import { enrichBusiness } from "./baselines/marlo.ts";

type Row = { site: string; emails: string[]; phones: string[]; badPhones: number; whatsapp: number; socials: number; pages: number; ms: number; status: string };

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--") && !/^\d+$/.test(a)) ?? "scripts/bench-sites.txt";
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
const onlyIdx = args.indexOf("--only");
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null;
const sites = readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).slice(0, limit);
const PAGE_BUDGET = 8;

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }));
  return out;
}

async function runOurs(site: string): Promise<Row> {
  const t = Date.now();
  const r = await extractSite(site, { maxPagesPerSite: PAGE_BUDGET });
  return {
    site,
    emails: r.emails.filter((e) => e.mx !== "invalid").map((e) => e.value),
    phones: r.phones.map((p) => p.e164),
    badPhones: 0,
    whatsapp: r.whatsapp.length,
    socials: Object.values(r.socials).reduce((n, l) => n + (l?.length ?? 0), 0),
    pages: r.pagesCrawled.length,
    ms: Date.now() - t,
    status: r.status === "found" || r.status === "empty" ? "ok" : `${r.status}:${r.failure}`,
  };
}

async function runMarlo(site: string): Promise<Row> {
  const t = Date.now();
  const r = await enrichBusiness(site, { timeoutMs: 12_000 });
  return { site, emails: r.emails, phones: [], badPhones: 0, whatsapp: r.whatsapp ? 1 : 0, socials: 0, pages: r.status === "ok" ? 3 : 0, ms: Date.now() - t, status: r.status };
}

async function runCrawlee(site: string): Promise<Row> {
  const t = Date.now();
  const opts = { timeoutMs: 12_000, maxBytes: 1_500_000 };
  const home = await fetchPage(`https://${site}/`, { ...opts, allowOffsite: true });
  if (home.kind !== "ok") return { site, emails: [], phones: [], badPhones: 0, whatsapp: 0, socials: 0, pages: 0, ms: Date.now() - t, status: `failed:${home.reason}` };
  const emails = new Set<string>();
  const phones = new Set<string>();
  const socials = new Set<string>();
  const handle = (html: string) => {
    const h = social.parseHandlesFromHtml(html);
    h.emails.forEach((e) => emails.add(e.toLowerCase()));
    [...h.phones, ...h.phonesUncertain].forEach((p) => phones.add(p));
    [...h.linkedIns, ...h.twitters, ...h.instagrams, ...h.facebooks, ...h.youtubes, ...h.tiktoks].forEach((s) => socials.add(s.toLowerCase()));
  };
  handle(home.body);
  const site0 = registrable(new URL(home.url).hostname);
  const links = [...home.body.matchAll(/href=["']([^"'#]+)["']/gi)]
    .map((m) => { try { return new URL(m[1], home.url).toString(); } catch { return null; } })
    .filter((u): u is string => !!u && /^https?:/.test(u) && registrable(new URL(u).hostname) === site0 && !/\.(css|js|png|jpe?g|svg|ico|pdf|xml|json|woff2?)(\?|$)/i.test(u));
  const uniq = [...new Set(links)].filter((u) => u.replace(/\/$/, "") !== home.url.replace(/\/$/, "")).slice(0, PAGE_BUDGET - 1);
  let pages = 1;
  await pool(uniq, 3, async (u) => {
    const r = await fetchPage(u, opts);
    if (r.kind === "ok") { pages++; handle(r.body); }
  });
  const phoneList = [...phones];
  const badPhones = phoneList.filter((p) => !(parsePhoneNumberFromString(p.replace(/^(tel|callto):/i, ""), "US")?.isValid() || parsePhoneNumberFromString(p.replace(/^00/, "+"))?.isValid())).length;
  return { site, emails: [...emails], phones: phoneList, badPhones, whatsapp: 0, socials: socials.size, pages, ms: Date.now() - t, status: "ok" };
}

function summarize(name: string, rows: Row[]) {
  const n = rows.length;
  const reached = rows.filter((r) => r.status === "ok").length;
  const withEmail = rows.filter((r) => r.emails.length).length;
  const withPhone = rows.filter((r) => r.phones.length - r.badPhones > 0).length;
  const withAny = rows.filter((r) => r.emails.length || r.phones.length - r.badPhones > 0 || r.whatsapp).length;
  const allEmails = rows.flatMap((r) => r.emails);
  const junkEmails = allEmails.filter((e) => !cleanEmail(e)).length;
  const phones = rows.reduce((a, r) => a + r.phones.length, 0);
  const bad = rows.reduce((a, r) => a + r.badPhones, 0);
  return {
    extractor: name,
    sites: n,
    reached,
    "site has email": `${withEmail} (${Math.round((withEmail / n) * 100)}%)`,
    "site has valid phone": `${withPhone} (${Math.round((withPhone / n) * 100)}%)`,
    "site has any contact": `${withAny} (${Math.round((withAny / n) * 100)}%)`,
    "with WhatsApp": rows.filter((r) => r.whatsapp).length,
    "with socials": rows.filter((r) => r.socials).length,
    "emails total": allEmails.length,
    "junk emails": `${junkEmails} (${allEmails.length ? Math.round((junkEmails / allEmails.length) * 100) : 0}%)`,
    "phones total": phones,
    "invalid phones": `${bad} (${phones ? Math.round((bad / phones) * 100) : 0}%)`,
    "avg pages": (rows.reduce((a, r) => a + r.pages, 0) / n).toFixed(1),
    "avg seconds": (rows.reduce((a, r) => a + r.ms, 0) / n / 1000).toFixed(1),
  };
}

const runners: Record<string, (s: string) => Promise<Row>> = { ours: runOurs, crawlee: runCrawlee, marlo: runMarlo };
async function main() {
const results: Record<string, Row[]> = {};
console.log(`Benchmarking ${sites.length} sites...`);
for (const [name, fn] of Object.entries(runners)) {
  if (only && name !== only) continue;
  const t = Date.now();
  results[name] = await pool(sites, 10, (s) => fn(s).catch((e) => ({ site: s, emails: [], phones: [], badPhones: 0, whatsapp: 0, socials: 0, pages: 0, ms: 0, status: `crash:${e}` })));
  console.log(`  ${name}: ${((Date.now() - t) / 1000).toFixed(0)}s`);
}
const table = Object.entries(results).map(([k, v]) => summarize(k, v));
console.table(table);
mkdirSync("scripts/out", { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
writeFileSync(`scripts/out/bench-${stamp}.json`, JSON.stringify({ sites, table, results }, null, 2));
console.log(`Saved scripts/out/bench-${stamp}.json`);
}

void main();
