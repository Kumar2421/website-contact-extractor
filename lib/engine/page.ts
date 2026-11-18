import * as cheerio from "cheerio";
import type { CountryCode } from "libphonenumber-js/max";
import { decodeCfEmail, findEmails, registrable } from "./emails";
import { guessCountry, parsePhoneValue, phonesFromText, type PhoneCandidate } from "./phones";
import { matchSocial, type SocialNetwork } from "./social";
import type { SourceKind, SocialFinding, WhatsappFinding } from "./types";

/**
 * Pure: everything we learn from one HTML page. Never throws, never fetches.
 * Builds on Marlo's websiteContact.ts (mailto, deobfuscation, block-aware text, WhatsApp links) and adds
 * Cloudflare email-protection decoding, JSON-LD and microdata, labelled phone parsing, social profiles,
 * multilingual contact-page ranking and a JavaScript-shell detector.
 */

export type EmailCandidate = { email: string; source: string; via: SourceKind };

export type RankedLink = { url: string; score: number; reason: string };

export type PageFacts = {
  url: string;
  emails: EmailCandidate[];
  phones: PhoneCandidate[];
  whatsapp: WhatsappFinding[];
  socials: Partial<Record<SocialNetwork, SocialFinding[]>>;
  links: RankedLink[];
  meta: { title: string | null; siteName: string | null; description: string | null; lang: string | null; country: string | null; orgName: string | null };
  text: string;
  jsHeavy: boolean;
  cloudflareEmail: boolean;
  parked: boolean;
};

// Contact, legal-notice and about pages in the languages our buyers' targets use most.
const LINK_RULES: { re: RegExp; score: number; reason: string }[] = [
  { re: /contact|kontakt|contacto|contato|contatti|contactez|contacter|kontakty|iletisim|yhteystiedot|kapcsolat|lienhe|liên-hệ|hubungi|お問い合わせ|联系|연락|get-?in-?touch|reach-?us|enquir|inquir|write-?to-?us|talk-?to-?us|call-?us|book-?a-?call/i, score: 100, reason: "contact" },
  { re: /impressum|imprint|legal-?notice|mentions-?legales|aviso-?legal|note-?legali|colofon|disclaimer|legal|rechtliches|anbieterkennzeichnung/i, score: 90, reason: "legal notice" },
  { re: /about|uber-?uns|ueber-?uns|über-?uns|qui-?sommes|a-?propos|sobre|quienes-?somos|chi-?siamo|over-?ons|o-?nas|om-?oss|om-?os|who-?we-?are|our-?story|company|unternehmen|firma|empresa/i, score: 60, reason: "about" },
  { re: /team|people|staff|leadership|management|our-?team|mitarbeiter|equipe|equipo|ansprechpartner/i, score: 55, reason: "team" },
  { re: /locations?|offices?|stores?|branches|find-?us|visit-?us|standorte?|anfahrt|directions|where-?to-?find/i, score: 50, reason: "locations" },
  { re: /support|help|service|kundenservice|faq/i, score: 35, reason: "support" },
  { re: /privacy|datenschutz|privacidad|privacite|confidentialite|gdpr|terms|agb|cookie-?policy/i, score: 30, reason: "privacy" },
  { re: /careers?|jobs|karriere|join-?us|work-?with-?us/i, score: 15, reason: "careers" },
];
const SKIP_LINK = /\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|pptx?|mp4|mp3|avi|mov|ics|xml|json|css|js)(\?|$)|\/(wp-admin|wp-login|login|logout|signin|sign-in|register|cart|checkout|account|my-account|basket|feed|tag|tags|category|categories|author|search|cdn-cgi)(\/|$)|[?&](add-to-cart|replytocom|share|print)=/i;
const BLOCKS = "p, div, li, br, td, th, tr, dd, dt, h1, h2, h3, h4, h5, h6, section, article, header, footer, nav, address, ul, ol, table, span, a, label, strong, b";
const WHATSAPP_HREF = /(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?[^#]*?phone=|web\.whatsapp\.com\/send\/?\?[^#]*?phone=|whatsapp:\/\/send\/?\?[^#]*?phone=)\+?(\d{7,15})(?!\d)/i;
const WHATSAPP_SHORT = /^(?:https?:\/\/)?(?:wa\.link\/[a-z0-9]+|wa\.me\/message\/[a-z0-9]+|chat\.whatsapp\.com\/[a-z0-9]+)/i;

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function clean(s: string | undefined | null): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t ? t : null;
}

/** Walk JSON-LD graphs for contact facts. Tolerates arrays, @graph and nested contactPoint/address. */
function walkJsonLd(node: unknown, visit: (key: string, value: unknown, parent: Record<string, unknown>) => void, depth = 0): void {
  if (depth > 8 || node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const n of node) walkJsonLd(n, visit, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  for (const [k, v] of Object.entries(obj)) {
    visit(k, v, obj);
    if (v && typeof v === "object") walkJsonLd(v, visit, depth + 1);
  }
}

function asStrings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export function extractPage(html: string, pageUrl: string, opts: { countryHint?: CountryCode } = {}): PageFacts {
  const facts: PageFacts = {
    url: pageUrl,
    emails: [],
    phones: [],
    whatsapp: [],
    socials: {},
    links: [],
    meta: { title: null, siteName: null, description: null, lang: null, country: null, orgName: null },
    text: "",
    jsHeavy: false,
    cloudflareEmail: false,
    parked: false,
  };
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return facts;
  }
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return facts;
  }
  const site = registrable(base.hostname);
  const addEmail = (email: string, via: SourceKind) => facts.emails.push({ email, source: pageUrl, via });

  // --- meta
  facts.meta.title = clean($("title").first().text())?.slice(0, 200) ?? null;
  facts.meta.siteName = clean($('meta[property="og:site_name"]').attr("content"));
  facts.meta.description = clean($('meta[name="description"]').attr("content") ?? $('meta[property="og:description"]').attr("content"))?.slice(0, 400) ?? null;
  facts.meta.lang = clean($("html").attr("lang"))?.slice(0, 12) ?? null;

  // --- JSON-LD (schema.org Organization / LocalBusiness / ContactPoint)
  const ldPhones: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).text();
    if (!raw || raw.length > 500_000) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    walkJsonLd(data, (key, value, parent) => {
      const k = key.toLowerCase();
      if (k === "email") for (const s of asStrings(value)) for (const e of findEmails(s.replace(/^mailto:/i, ""))) addEmail(e, "jsonld");
      else if (k === "telephone") ldPhones.push(...asStrings(value));
      else if (k === "sameas") for (const s of asStrings(value)) pushSocial(facts, s, pageUrl);
      else if (k === "addresscountry") {
        const c = typeof value === "string" ? value : typeof (value as { name?: unknown })?.name === "string" ? (value as { name: string }).name : null;
        if (c && c.length === 2) facts.meta.country ??= c.toUpperCase();
      } else if (k === "name" && typeof value === "string" && !facts.meta.orgName) {
        const t = String(parent["@type"] ?? "");
        if (/Organization|LocalBusiness|Corporation|Store|Restaurant|Hotel|Dentist|Attorney|Service|Agency|Company|Clinic|Physician/i.test(t)) facts.meta.orgName = value.slice(0, 150);
      }
    });
  });

  const country = guessCountry(base.hostname, facts.meta.lang, facts.meta.country) ?? opts.countryHint;
  for (const p of ldPhones) {
    const phone = parsePhoneValue(p, country);
    if (phone) facts.phones.push({ phone, source: pageUrl, via: "jsonld" });
  }

  // --- microdata
  $('[itemprop="email"]').each((_, el) => {
    for (const e of findEmails(($(el).attr("content") ?? $(el).text()).replace(/^mailto:/i, ""))) addEmail(e, "microdata");
  });
  $('[itemprop="telephone"]').each((_, el) => {
    const phone = parsePhoneValue($(el).attr("content") ?? $(el).text(), country);
    if (phone) facts.phones.push({ phone, source: pageUrl, via: "microdata" });
  });

  // --- Cloudflare email protection (data-cfemail and /cdn-cgi/l/email-protection#hex)
  $("[data-cfemail]").each((_, el) => {
    const e = decodeCfEmail($(el).attr("data-cfemail") ?? "");
    if (e) {
      facts.cloudflareEmail = true;
      addEmail(e, "cloudflare");
    }
  });

  // --- links: mailto, tel, WhatsApp, socials, crawl candidates
  const seenLinks = new Map<string, RankedLink>();
  $("a[href], area[href]").each((_, el) => {
    const hrefRaw = ($(el).attr("href") ?? "").trim();
    if (!hrefRaw) return;
    const href = safeDecode(hrefRaw);
    if (/^mailto:/i.test(href)) {
      for (const part of href.slice(7).split("?")[0].split(/[,;]/)) for (const e of findEmails(part)) addEmail(e, "mailto");
      return;
    }
    const cf = /\/cdn-cgi\/l\/email-protection#([0-9a-f]+)/i.exec(hrefRaw);
    if (cf) {
      const e = decodeCfEmail(cf[1]);
      if (e) {
        facts.cloudflareEmail = true;
        addEmail(e, "cloudflare");
      }
      return;
    }
    if (/^(tel|callto|phone):/i.test(href)) {
      const phone = parsePhoneValue(href, country);
      if (phone) facts.phones.push({ phone, source: pageUrl, via: "tel" });
      return;
    }
    const wa = WHATSAPP_HREF.exec(href);
    if (wa) {
      facts.whatsapp.push({ number: `+${wa[1]}`, link: `https://wa.me/${wa[1]}`, source: pageUrl });
      return;
    }
    if (WHATSAPP_SHORT.test(href)) {
      facts.whatsapp.push({ number: null, link: href.startsWith("http") ? href : `https://${href}`, source: pageUrl });
      return;
    }
    if (/^(javascript:|#|data:|sms:)/i.test(href)) return;
    let u: URL;
    try {
      u = new URL(hrefRaw, base);
    } catch {
      return;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    if (registrable(u.hostname) !== site) {
      pushSocial(facts, u.toString(), pageUrl);
      return;
    }
    u.hash = "";
    const target = u.toString();
    if (SKIP_LINK.test(target) || target === pageUrl) return;
    const text = $(el).text().replace(/\s+/g, " ").trim().slice(0, 80);
    const title = $(el).attr("title") ?? $(el).attr("aria-label") ?? "";
    const path = safeDecode(u.pathname).toLowerCase();
    let best: RankedLink | null = null;
    for (const rule of LINK_RULES) {
      const inPath = rule.re.test(path);
      const inText = rule.re.test(text.replace(/\s+/g, "-")) || rule.re.test(title.replace(/\s+/g, "-"));
      if (!inPath && !inText) continue;
      const depth = path.split("/").filter(Boolean).length;
      const score = rule.score + (inPath ? 5 : 0) + (inText ? 5 : 0) - Math.max(0, depth - 2) * 8 - (u.search ? 10 : 0);
      if (!best || score > best.score) best = { url: target, score, reason: rule.reason };
    }
    if (!best) {
      // Plain top-level navigation (a language root like /en/, a section index): a last-resort hop for
      // homepages that are splash screens or language choosers.
      const segs = path.split("/").filter(Boolean);
      if (segs.length > 1 || u.search) return;
      best = { url: target, score: /^[a-z]{2}(-[a-z]{2})?$/.test(segs[0] ?? "") ? 20 : 10, reason: "nav" };
    }
    const prev = seenLinks.get(target);
    if (!prev || prev.score < best.score) seenLinks.set(target, best);
  });
  facts.links = [...seenLinks.values()].sort((a, b) => b.score - a.score).slice(0, 25);

  // --- inline scripts: last-resort source for JS-rendered sites (own-domain addresses only, enforced in mergeEmails)
  let scriptBytes = 0;
  $("script:not([src])").each((_, el) => {
    const s = $(el).text();
    scriptBytes += s.length;
    if (s.length > 0 && s.length < 400_000 && s.includes("@")) for (const e of findEmails(s.replace(/\\\//g, "/"))) addEmail(e, "script");
  });

  // --- visible text (block-aware so adjacent elements never fuse into one token)
  $("script, style, noscript, template, svg, iframe").remove();
  $(BLOCKS).before(" ").after(" ");
  const text = ($("body").text() || $.root().text()).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n");
  facts.text = text.slice(0, 200_000);
  for (const e of findEmails(facts.text)) addEmail(e, "text");
  for (const { phone, whatsapp } of phonesFromText(facts.text, country)) {
    facts.phones.push({ phone, source: pageUrl, via: "text", whatsapp });
    if (whatsapp) facts.whatsapp.push({ number: phone.number, link: `https://wa.me/${phone.number.replace(/^\+/, "")}`, source: pageUrl });
  }

  // Parked or for-sale domains: say so instead of reporting "no contacts".
  const thin = facts.text.replace(/\s+/g, "").length < 3000;
  facts.parked =
    /this domain (?:name )?(?:is|may be) for sale|buy this domain|domain (?:is )?parked|parked free|domain has expired/i.test(facts.text.slice(0, 5000)) ||
    (thin && /sedoparking|parkingcrew\.net|bodis\.com|park\.above\.com|afternic\.com|dan\.com\/|tierra\.net\/products\/domains|hugedomains\.com|godaddy\.com\/domainsearch/i.test(html.slice(0, 200_000)));

  // A page with almost no text but plenty of script is a client-rendered app shell.
  const visibleLen = facts.text.replace(/\s+/g, "").length;
  facts.jsHeavy = visibleLen < 400 && (scriptBytes > 2_000 || $("script[src]").length >= 3 || $("#root, #__next, #app, [ng-app], #___gatsby").length > 0);
  return facts;
}

function pushSocial(facts: PageFacts, href: string, source: string) {
  const m = matchSocial(href);
  if (!m) return;
  const list = (facts.socials[m.network] ??= []);
  if (!list.some((s) => s.url.toLowerCase() === m.url.toLowerCase())) list.push({ url: m.url, handle: m.handle, source });
}
