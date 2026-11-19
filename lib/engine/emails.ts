import { parse as parseDomain } from "tldts";
import { isDisposableEmailDomain } from "disposable-email-domains-js";
import type { Confidence, EmailFinding, SourceKind } from "./types";

// Token-anchored so an over-long local part is never cut down to a shorter fake one (from Marlo).
export const EMAIL_RE = /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})*\.[A-Za-z]{2,24}(?![A-Za-z0-9-])/g;

const JUNK_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|woff2?|ttf|eot|mp4|webm|pdf|zip)$/i;
const JUNK_DOMAIN =
  /(^|\.)(intercom-mail\.com|intercom\.io|sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|sentry\.wixpress\.com|ingest\.sentry\.io|example\.(com|org|net)|domain\.(com|tld)|yourdomain\.[a-z]+|yoursite\.[a-z]+|yourcompany\.[a-z]+|company\.com|email\.com|test\.com|website\.com|mysite\.com|sitename\.com|placeholder\.[a-z]+|godaddy\.com|wordpress\.(com|org)|w3\.org|schema\.org|sentry\.[a-z]+)$/i;
const JUNK_LOCAL = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounce[s]?|abuse|webmaster@?|hostmaster|your-?(name|email)?|name|email|user(name)?|someone|john\.?doe|jane\.?doe|first\.?last|firstname\.?lastname|test|example)$/i;
const HASH_LOCAL = /^[a-f0-9]{16,}$/i;

const ROLE_LOCALS = new Set([
  "info", "information", "contact", "contacts", "contactus", "contact-us", "hello", "hi", "hey", "sales", "sale", "support",
  "help", "helpdesk", "office", "admin", "administration", "enquiries", "enquiry", "inquiries", "inquiry", "mail", "email",
  "team", "service", "services", "customerservice", "customer.service", "care", "customercare", "booking", "bookings",
  "reservations", "reservation", "orders", "order", "shop", "store", "billing", "accounts", "accounting", "finance",
  "hr", "jobs", "careers", "recruiting", "recruitment", "press", "media", "pr", "marketing", "partners", "partnerships",
  "business", "general", "reception", "frontdesk", "kontakt", "anfrage", "buero", "büro", "contato", "contacto",
  "info.de", "privacy", "dataprotection", "datenschutz", "dpo", "gdpr", "legal", "compliance", "feedback", "events",
  "studio", "welcome", "ask", "questions", "newbusiness", "projects", "invoices", "management", "director", "ceo",
]);

const FREE_PROVIDERS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "yahoo.co.in", "yahoo.fr", "yahoo.de", "yahoo.es", "ymail.com",
  "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it", "outlook.com", "outlook.de", "live.com", "live.co.uk",
  "msn.com", "aol.com", "icloud.com", "me.com", "mac.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "gmx.net",
  "web.de", "mail.ru", "yandex.ru", "yandex.com", "qq.com", "163.com", "126.com", "zoho.com", "zohomail.com", "rediffmail.com",
  "libero.it", "virgilio.it", "orange.fr", "free.fr", "laposte.net", "t-online.de", "btinternet.com", "comcast.net",
  "verizon.net", "att.net", "sbcglobal.net", "bigpond.com", "optusnet.com.au", "shaw.ca", "rogers.com", "seznam.cz",
  "wp.pl", "o2.pl", "interia.pl", "bol.com.br", "uol.com.br", "terra.com.br", "naver.com", "hanmail.net", "rocketmail.com",
]);

/** Registrable domain (example.co.uk), or the lowercased host when it has none. */
export function registrable(host: string): string {
  const h = host.toLowerCase().replace(/^www\./, "");
  return parseDomain(h).domain ?? h;
}

/** Same brand on another TLD or a short suffix (igus.de and igus.net, zotter.at and zotterusa.com). */
export function sameBrand(a: string, b: string): boolean {
  const la = (parseDomain(a).domainWithoutSuffix ?? "").toLowerCase();
  const lb = (parseDomain(b).domainWithoutSuffix ?? "").toLowerCase();
  if (!la || !lb) return false;
  if (la === lb) return true;
  return Math.min(la.length, lb.length) >= 4 && (la.startsWith(lb) || lb.startsWith(la));
}

/** Addresses that are rarely the one you want for a sales approach: sorted below general contact addresses. */
const PURPOSE_LOW = /^(press|media|pr|careers?|jobs?|recruit(?:ing|ment)?|hr|privacy|dpo|dataprotection|datenschutz|gdpr|legal|compliance|billing|accounts?|accounting|invoices?|webmaster|abuse)$/;

/** Cloudflare "email protection":a hex string whose first byte XORs the rest. */
export function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 4 || hex.length % 2) return null;
  const key = parseInt(hex.slice(0, 2), 16);
  let out = "";
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  try {
    out = decodeURIComponent(escape(out));
  } catch {
    // keep raw
  }
  return out.includes("@") ? out : null;
}

// Bracketed forms are explicit obfuscation, so they are unobfuscated anywhere (from Marlo).
const BRACKET_AT_RE = /([A-Za-z0-9._%+-]{1,64})\s{0,4}(?:\[at\]|\(at\)|\{at\}|<at>|\[@\]|\(@\)| @ )\s{0,4}([A-Za-z0-9-]{1,63}(?:\s{0,4}(?:\[dot\]|\(dot\)|\{dot\}|\.)\s{0,4}[A-Za-z0-9-]{1,63}){0,3})\s{0,4}(?:\[dot\]|\(dot\)|\{dot\}|\.)\s{0,4}([A-Za-z]{2,24})(?![A-Za-z])/gi;
// Spelled-out "name at domain dot com" only right after a contact label, since in prose it is ordinary text.
const LABELLED_WORD_AT_RE = /((?:e-?mail|mail|contact|reach us)\s{0,4}:?\s{0,4})([A-Za-z0-9._%+-]{1,64})\s{1,4}at\s{1,4}([A-Za-z0-9-]{1,63})\s{1,4}dot\s{1,4}([A-Za-z]{2,24})/gi;

/** Undo explicit obfuscation and JSON/URL escape noise. Bounded quantifiers only (no ReDoS). */
export function deobfuscate(text: string): string {
  return text
    .replace(/\\u0040/gi, "@")
    .replace(/\\u00(?:3c|3e|22|27)/gi, " ")
    .replace(/%40/g, "@")
    .replace(/&#0*64;|&commat;/gi, "@")
    .replace(BRACKET_AT_RE, (_m, local: string, mid: string, tld: string) => `${local}@${mid.replace(/\s*(?:\[dot\]|\(dot\)|\{dot\})\s*|\s*\.\s*/gi, ".")}.${tld}`)
    .replace(LABELLED_WORD_AT_RE, "$1$2@$3.$4");
}

export function findEmails(text: string): string[] {
  return deobfuscate(text).match(EMAIL_RE) ?? [];
}

/** Normalise one candidate, or null when it is junk (asset names, placeholders, tracking hashes). */
export function cleanEmail(raw: string): string | null {
  let email = raw.trim().toLowerCase().replace(/^mailto:/, "").replace(/^[._%+-]+/, "").replace(/\.+$/, "");
  // URL-encoded leading spaces ("%20info@") survive as a "20" prefix after decoding failed.
  email = email.replace(/^(?:u00[0-9a-f]{2})+/, "");
  if (email.length > 254 || email.length < 6) return null;
  const at = email.lastIndexOf("@");
  if (at < 1 || email.indexOf("@") !== at) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || local.includes("..")) return null;
  if (JUNK_EXTENSION.test(email) || JUNK_DOMAIN.test(domain) || JUNK_LOCAL.test(local) || HASH_LOCAL.test(local)) return null;
  if (/\d+x$/.test(local) && /\.(png|jpe?g|webp)/i.test(raw)) return null; // image@2x.png
  const parsed = parseDomain(domain);
  if (!parsed.isIcann || !parsed.domain) return null; // unknown TLDs are almost always asset names
  return email;
}

export function emailKind(email: string): EmailFinding["kind"] {
  const local = email.slice(0, email.indexOf("@"));
  const base = local.replace(/[0-9]+$/, "");
  const parts = local.split(/[._+-]/);
  if (ROLE_LOCALS.has(local) || ROLE_LOCALS.has(base) || parts.some((p) => ROLE_LOCALS.has(p.replace(/[0-9]+$/, "")))) return "role";
  // first.last, f.last, firstlast with a separator: looks like a named person.
  // A bare word (tickets@, edition@, feasting@) is a function, not a person, so it stays "generic".
  if (/^[a-z]{2,20}[._-][a-z]{2,25}$/.test(local) || /^[a-z]\.[a-z]{2,25}$/.test(local)) return "personal";
  return "generic";
}

export function isFreeProvider(domain: string): boolean {
  return FREE_PROVIDERS.has(domain.toLowerCase());
}

type Candidate = { email: string; source: string; via: SourceKind };

const VIA_RANK: Record<SourceKind, number> = { mailto: 3, cloudflare: 3, jsonld: 3, microdata: 3, link: 2, text: 2, meta: 2, tel: 1, script: 1 };

/**
 * Merge candidates from every page of one site into ranked findings: dedupes, keeps every source URL,
 * scores confidence, and orders own-domain role/personal addresses first.
 */
export function mergeEmails(candidates: Candidate[], siteHost: string): EmailFinding[] {
  const site = registrable(siteHost);
  const map = new Map<string, EmailFinding>();
  for (const c of candidates) {
    const email = cleanEmail(c.email);
    if (!email) continue;
    const domain = email.slice(email.indexOf("@") + 1);
    const ownDomain = registrable(domain) === site || (!isFreeProvider(domain) && sameBrand(domain, siteHost));
    // Addresses buried in scripts are only trusted on the site's own domain (kills vendor/tracker noise).
    if (c.via === "script" && !ownDomain) continue;
    let f = map.get(email);
    if (!f) {
      f = {
        value: email,
        kind: emailKind(email),
        ownDomain,
        freeProvider: isFreeProvider(domain),
        disposable: isDisposableEmailDomain(domain),
        mx: "unknown",
        confidence: "low",
        sources: [],
        via: [],
      };
      map.set(email, f);
    }
    if (!f.sources.includes(c.source)) f.sources.push(c.source);
    if (!f.via.includes(c.via)) f.via.push(c.via);
  }
  const findings = [...map.values()].filter((f) => !f.disposable);
  const hasOwn = findings.some((f) => f.ownDomain);
  for (const f of findings) f.confidence = scoreEmail(f, hasOwn);
  const weight = (f: EmailFinding) =>
    // An exact domain match beats a sister brand domain (zotter.at over zotterusa.com).
    (f.ownDomain ? (registrable(f.value.slice(f.value.indexOf("@") + 1)) === site ? 100 : 88) : f.freeProvider ? 40 : 0) +
    (f.confidence === "high" ? 30 : f.confidence === "medium" ? 15 : 0) +
    (f.kind === "role" ? 8 : f.kind === "personal" ? 6 : 0) +
    Math.min(f.sources.length, 5) -
    (PURPOSE_LOW.test(f.value.slice(0, f.value.indexOf("@")).split(/[._+-]/)[0]) ? 20 : 0);
  return findings.sort((a, b) => weight(b) - weight(a) || a.value.localeCompare(b.value));
}

function scoreEmail(f: EmailFinding, siteHasOwn: boolean): Confidence {
  const best = Math.max(...f.via.map((v) => VIA_RANK[v]));
  if (f.ownDomain && best >= 2) return "high";
  if (f.ownDomain) return "medium";
  if (f.freeProvider && best >= 2) return siteHasOwn ? "medium" : "high";
  // Third-party domain on a site that has its own addresses: usually the web agency or a vendor.
  if (siteHasOwn) return "low";
  return best >= 3 ? "medium" : "low";
}
