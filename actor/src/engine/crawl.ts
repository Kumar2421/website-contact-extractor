import { registrable, mergeEmails } from "./emails";
import { fetchPage, type FetchDeps, type FetchResult } from "./http";
import { annotateMx } from "./mx";
import { loadRobots } from "./robots";
import { summarizeCompany } from "./summarize";
import { extractPage, type EmailCandidate, type PageFacts, type RankedLink } from "./page";
import { mergePhones, type PhoneCandidate } from "./phones";
import type { SocialNetwork } from "./social";
import { DEFAULT_OPTIONS, type ExtractOptions, type FailureReason, type SiteResult, type SocialFinding, type WhatsappFinding } from "./types";

/**
 * Crawl one website for contact details. Homepage first, then the highest-ranked same-site pages
 * (contact, legal notice, about, team...), then guessed paths and the sitemap when the homepage links
 * to nothing useful. Never throws: every outcome is a SiteResult with a plain-language statusNote.
 */

const GUESS_PATHS = ["/contact", "/contact-us", "/kontakt", "/impressum", "/about", "/about-us"];
const SITEMAP_CONTACT = /contact|kontakt|contacto|contato|contatti|impressum|imprint|about|legal|uber-uns|ueber-uns/i;
const PAGE_CONCURRENCY = 3;
/** Hard ceiling per site so one slow site cannot stall a batch. */
const SITE_DEADLINE_MS = 40_000;

export function normalizeInput(raw: string): string | null {
  let t = raw.trim().replace(/^["'<(]+|[>"')]+$/g, "").replace(/\s+/g, "");
  if (!t || t.length > 2048) return null;
  if (/^[a-z0-9.-]+@[a-z0-9.-]+$/i.test(t)) t = t.slice(t.indexOf("@") + 1); // an email: use its domain
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

const NOTES: Record<FailureReason, string> = {
  invalid_url: "This is not a valid website address.",
  ssrf_blocked: "This address points to a private network, so it was not fetched.",
  dns: "The domain does not resolve. The site may be offline or the domain expired.",
  timeout: "The site did not respond in time.",
  tls: "The site's HTTPS certificate is broken and plain HTTP did not work either.",
  network: "The connection to the site failed.",
  http_403: "The site refused the request (HTTP 403).",
  http_404: "The page was not found (HTTP 404).",
  http_4xx: "The site returned an error.",
  http_5xx: "The site's server returned an error (HTTP 5xx).",
  bot_protection: "The site is behind a bot-protection wall (for example a Cloudflare challenge).",
  not_html: "The address does not serve a web page.",
  redirect_offsite: "The site redirects to a different domain.",
  too_many_redirects: "The site redirects in a loop.",
  robots: "The site's robots.txt asks crawlers not to visit it, so we did not.",
};

function emptyResult(input: string): SiteResult {
  return {
    input,
    url: null,
    finalUrl: null,
    domain: null,
    status: "invalid",
    statusNote: NOTES.invalid_url,
    failure: "invalid_url",
    company: { name: null, description: null, country: null, language: null, summary: null, industry: null },
    emails: [],
    phones: [],
    whatsapp: [],
    socials: {},
    contactPageUrl: null,
    pagesCrawled: [],
    flags: { jsHeavy: false, cloudflareEmail: false, usedSitemap: false, parked: false },
    durationMs: 0,
  };
}

/** Try https, then www., then plain http, so a broken certificate or a bare-domain DNS gap is not a dead end. */
async function fetchHome(url: string, opts: ExtractOptions, deps: FetchDeps): Promise<FetchResult> {
  const u = new URL(url);
  const variants = [u.toString()];
  if (!u.hostname.startsWith("www.")) variants.push(Object.assign(new URL(u), { hostname: `www.${u.hostname}` }).toString());
  if (u.protocol === "https:") variants.push(Object.assign(new URL(u), { protocol: "http:" }).toString());
  let last: FetchResult = { kind: "error", reason: "network" };
  for (const v of variants) {
    const r = await fetchPage(v, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxPageBytes, userAgent: opts.userAgent, allowOffsite: true }, deps);
    if (r.kind === "ok") return r;
    // One retry for transient failures before moving to the next variant.
    if (r.reason === "timeout") return r; // a tarpit will not answer on another variant either
    if (r.reason === "network") {
      const again = await fetchPage(v, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxPageBytes, userAgent: opts.userAgent, allowOffsite: true }, deps);
      if (again.kind === "ok") return again;
    }
    last = r;
    // These will not get better on another variant.
    if (["ssrf_blocked", "bot_protection", "http_403", "redirect_offsite"].includes(r.reason)) break;
    if (r.reason === "http_404" && u.pathname !== "/") {
      // A deep link that died: fall back to the homepage.
      return fetchHome(`${u.protocol}//${u.host}/`, opts, deps);
    }
  }
  return last;
}

async function sitemapLinks(origin: string, opts: ExtractOptions, deps: FetchDeps): Promise<RankedLink[]> {
  const r = await fetchPage(`${origin}/sitemap.xml`, { timeoutMs: Math.min(opts.timeoutMs, 8000), maxBytes: 600_000, userAgent: opts.userAgent, accept: "xml" }, deps);
  if (r.kind !== "ok") return [];
  const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, 5000);
  const site = registrable(new URL(origin).hostname);
  return locs
    .filter((l) => {
      try {
        return registrable(new URL(l).hostname) === site && SITEMAP_CONTACT.test(new URL(l).pathname) && !/\.xml(\?|$)/i.test(l);
      } catch {
        return false;
      }
    })
    .map((url) => ({ url, score: /contact|kontakt|contacto|contato|contatti/i.test(url) ? 95 : /impressum|imprint|legal/i.test(url) ? 85 : 55, reason: "sitemap" }))
    .sort((a, b) => b.score - a.score || a.url.length - b.url.length)
    .slice(0, 4);
}

export async function extractSite(input: string, partial: Partial<ExtractOptions> = {}, deps: FetchDeps = {}): Promise<SiteResult> {
  const started = Date.now();
  const opts: ExtractOptions = { ...DEFAULT_OPTIONS, ...partial };
  const result = emptyResult(input);
  const done = () => {
    result.durationMs = Date.now() - started;
    return result;
  };
  try {
    const url = normalizeInput(input);
    if (!url) return done();
    result.url = url;
    result.domain = registrable(new URL(url).hostname);

    const home = await fetchHome(url, opts, deps);
    if (home.kind === "error") {
      result.status = home.reason === "ssrf_blocked" ? "blocked" : "failed";
      result.failure = home.reason;
      result.statusNote = NOTES[home.reason];
      return done();
    }
    result.finalUrl = home.url;
    result.domain = registrable(new URL(home.url).hostname);
    const origin = new URL(home.url).origin;

    const allowed = opts.respectRobots ? await loadRobots(origin, opts, deps) : () => true;
    if (!allowed(home.url)) {
      result.status = "blocked";
      result.failure = "robots";
      result.statusNote = NOTES.robots;
      return done();
    }

    const pages: PageFacts[] = [];
    const visited = new Set<string>([stripSlash(home.url), stripSlash(url)]);
    const homeFacts = extractPage(home.body, home.url);
    pages.push(homeFacts);

    // Queue: ranked links from the homepage, then guesses and the sitemap if nothing contact-like was linked.
    if (homeFacts.parked) {
      result.flags.parked = true;
      result.pagesCrawled = [home.url];
      result.status = "empty";
      result.statusNote = "This domain is parked or for sale; there is no business website on it.";
      return done();
    }
    const ranked = homeFacts.links.filter((l) => l.reason !== "nav");
    // Navigation hops only for splash or language-chooser homepages with nothing better to follow.
    const nav = ranked.some((l) => l.score >= 50) ? [] : homeFacts.links.filter((l) => l.reason === "nav").sort((a, b) => b.score - a.score).slice(0, 2);
    const queue: RankedLink[] = [...ranked, ...nav];
    if (!queue.some((l) => l.score >= 90)) {
      const fromSitemap = await sitemapLinks(origin, opts, deps);
      if (fromSitemap.length) result.flags.usedSitemap = true;
      queue.push(...fromSitemap);
      if (!queue.some((l) => l.score >= 90)) {
        for (const p of GUESS_PATHS) queue.push({ url: `${origin}${p}`, score: 40, reason: "guess" });
      }
    }

    const budget = Math.max(1, opts.maxPagesPerSite);
    const haveEnough = () => {
      const emails = pages.some((p) => p.emails.length > 0);
      const phones = !opts.includePhones || pages.some((p) => p.phones.length > 0);
      return emails && phones;
    };
    const deadline = started + SITE_DEADLINE_MS;
    while (pages.length < budget && queue.length && Date.now() < deadline) {
      queue.sort((a, b) => b.score - a.score);
      // Smart stop: once every contact/legal page has been read and we have an email and phone, stop paying for more pages.
      if (opts.smartStop && haveEnough() && !queue.some((l) => l.score >= 85)) break;
      const batch: RankedLink[] = [];
      while (queue.length && batch.length < Math.min(PAGE_CONCURRENCY, budget - pages.length)) {
        const next = queue.shift()!;
        const key = stripSlash(next.url);
        if (visited.has(key) || !allowed(next.url)) continue;
        visited.add(key);
        batch.push(next);
      }
      if (!batch.length) break;
      const fetched = await Promise.all(
        batch.map((l) => fetchPage(l.url, { timeoutMs: opts.timeoutMs, maxBytes: opts.maxPageBytes, userAgent: opts.userAgent }, deps).then((r) => ({ l, r }))),
      );
      for (const { l, r } of fetched) {
        if (r.kind !== "ok") continue;
        const facts = extractPage(r.body, r.url);
        // Soft 404: catch-all sites answer every guessed path with the homepage. Skip it and stop guessing.
        if (l.reason === "guess" && sameContent(facts.text, homeFacts.text)) {
          for (let i = queue.length - 1; i >= 0; i--) if (queue[i].reason === "guess") queue.splice(i, 1);
          continue;
        }
        pages.push(facts);
        if (!result.contactPageUrl && (l.reason === "contact" || (l.reason === "sitemap" && l.score >= 95) || (l.reason === "guess" && /contact|kontakt/.test(l.url)))) result.contactPageUrl = r.url;
        // Second-level links (a contact page linking to an imprint) join the queue at a discount.
        const hop = l.reason === "nav" ? 0 : 15; // links found behind a language root are as good as homepage links
        for (const sub of facts.links) if (!visited.has(stripSlash(sub.url)) && sub.reason !== "nav" && sub.score >= 55) queue.push({ ...sub, score: sub.score - hop });
      }
    }

    // --- merge
    result.pagesCrawled = pages.map((p) => p.url);
    const emailCands: EmailCandidate[] = pages.flatMap((p) => p.emails);
    result.emails = mergeEmails(emailCands, new URL(home.url).hostname).slice(0, 25);
    if (opts.validateEmails && result.emails.length) await annotateMx(result.emails);
    // Invalid-domain addresses sink to the bottom rather than vanish, so users can see why.
    result.emails.sort((a, b) => Number(a.mx === "invalid") - Number(b.mx === "invalid"));

    if (opts.includePhones) {
      const phoneCands: PhoneCandidate[] = pages.flatMap((p) => p.phones);
      result.phones = mergePhones(phoneCands).slice(0, 15);
    }
    result.whatsapp = dedupeWhatsapp(pages.flatMap((p) => p.whatsapp));
    if (opts.includeSocials) result.socials = mergeSocials(pages);

    result.flags.jsHeavy = homeFacts.jsHeavy;
    result.flags.cloudflareEmail = pages.some((p) => p.cloudflareEmail);
    const meta = homeFacts.meta;
    result.company = {
      name: meta.orgName ?? meta.siteName ?? cleanTitle(meta.title, result.domain),
      description: meta.description,
      country: meta.country ?? result.phones[0]?.country ?? null,
      language: meta.lang,
      summary: null,
      industry: null,
    };

    if (opts.aiSummary && (result.emails.length || result.phones.length)) {
      const about = pages.find((p) => /about|uber|ueber|qui-sommes|sobre|chi-siamo|company|unternehmen/i.test(p.url));
      const ai = await summarizeCompany({
        domain: result.domain ?? "",
        name: result.company.name,
        title: meta.title,
        description: meta.description,
        text: `${homeFacts.text.slice(0, 2500)}
${about?.text.slice(0, 1500) ?? ""}`,
      });
      if (ai) {
        result.company.summary = ai.summary;
        result.company.industry = ai.industry;
      }
    }

    const usable = result.emails.some((e) => e.mx !== "invalid") || result.phones.length > 0 || result.whatsapp.length > 0;
    if (usable) {
      result.status = "found";
      result.failure = null;
      const parts = [
        result.emails.length && `${result.emails.length} email${result.emails.length > 1 ? "s" : ""}`,
        result.phones.length && `${result.phones.length} phone${result.phones.length > 1 ? "s" : ""}`,
        result.whatsapp.length && "WhatsApp",
      ].filter(Boolean);
      result.statusNote = `Found ${parts.join(", ")} across ${pages.length} page${pages.length > 1 ? "s" : ""}.`;
    } else {
      result.status = "empty";
      result.failure = null;
      result.statusNote = homeFacts.jsHeavy
        ? "The site renders its content with JavaScript and publishes no contact details in its HTML."
        : result.emails.length
          ? "Only addresses on domains that cannot receive mail were found."
          : `No public email, phone or WhatsApp on the ${pages.length} page${pages.length > 1 ? "s" : ""} checked${result.contactPageUrl ? "" : " (no contact page found)"}.`;
    }
    return done();
  } catch (err) {
    result.status = "failed";
    result.failure = "network";
    result.statusNote = `Unexpected error: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`;
    return done();
  }
}

function sameContent(a: string, b: string): boolean {
  const norm = (t: string) => t.replace(/s+/g, " ").trim();
  const x = norm(a);
  const y = norm(b);
  if (x === y) return true;
  return Math.abs(x.length - y.length) < 40 && x.slice(0, 2000) === y.slice(0, 2000);
}

function stripSlash(u: string): string {
  return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "").toLowerCase();
}

function cleanTitle(title: string | null, domain: string | null): string | null {
  if (!title) return null;
  const parts = title.split(/\s[|–—:-]\s|\s·\s/).map((s) => s.trim()).filter(Boolean);
  const label = (domain ?? "").split(".")[0].replace(/[^a-z0-9]/g, "");
  const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pick = parts.find((p) => label.length >= 3 && (squash(p).includes(label) || label.includes(squash(p)))) ?? parts[parts.length > 1 && /^(home|homepage|startseite|accueil|inicio|welcome)$/i.test(parts[0]) ? 1 : 0];
  return pick?.slice(0, 120) ?? null;
}

function dedupeWhatsapp(list: WhatsappFinding[]): WhatsappFinding[] {
  const seen = new Set<string>();
  const out: WhatsappFinding[] = [];
  for (const w of list) {
    const key = w.number ?? w.link.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out.slice(0, 5);
}

function mergeSocials(pages: PageFacts[]): Partial<Record<SocialNetwork, SocialFinding[]>> {
  const out: Partial<Record<SocialNetwork, SocialFinding[]>> = {};
  for (const p of pages) {
    for (const [network, list] of Object.entries(p.socials) as [SocialNetwork, SocialFinding[]][]) {
      const target = (out[network] ??= []);
      for (const s of list) if (!target.some((t) => t.url.toLowerCase() === s.url.toLowerCase())) target.push(s);
    }
  }
  for (const k of Object.keys(out) as SocialNetwork[]) out[k] = out[k]!.slice(0, 3);
  return out;
}
