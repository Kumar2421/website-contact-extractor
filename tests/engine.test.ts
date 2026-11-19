import { test } from "node:test";
import assert from "node:assert/strict";
import { extractPage } from "../lib/engine/page.ts";
import { cleanEmail, decodeCfEmail, deobfuscate, emailKind, mergeEmails, sameBrand } from "../lib/engine/emails.ts";
import { phonesFromText } from "../lib/engine/phones.ts";
import { matchSocial } from "../lib/engine/social.ts";
import { extractSite, normalizeInput } from "../lib/engine/crawl.ts";
import { checkMx } from "../lib/engine/mx.ts";
import { toCsv, flattenResult } from "../lib/engine/flatten.ts";

function cfEncode(email: string, key = 0x42): string {
  return [key, ...[...email].map((c) => c.charCodeAt(0) ^ key)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

test("decodes Cloudflare email protection in both forms", () => {
  const hex = cfEncode("hello@acme-dental.de");
  assert.equal(decodeCfEmail(hex), "hello@acme-dental.de");
  const html = `<a href="/cdn-cgi/l/email-protection#${hex}">[email&#160;protected]</a><span class="__cf_email__" data-cfemail="${cfEncode("info@acme-dental.de")}"></span>`;
  const f = extractPage(html, "https://acme-dental.de/");
  assert.deepEqual(f.emails.map((e) => e.email).sort(), ["hello@acme-dental.de", "info@acme-dental.de"]);
  assert.equal(f.cloudflareEmail, true);
});

test("reads JSON-LD Organization contact data and sameAs profiles", () => {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [{ "@type": "Dentist", name: "Acme Dental", email: "mailto:praxis@acme.de", telephone: "+49 30 901820", sameAs: ["https://www.instagram.com/acmedental", "https://www.linkedin.com/company/acme-dental/"], address: { addressCountry: "DE" } }],
  };
  const f = extractPage(`<html lang="de"><script type="application/ld+json">${JSON.stringify(ld)}</script><body>Hi</body></html>`, "https://acme.de/");
  assert.equal(f.emails[0].email, "praxis@acme.de");
  assert.equal(f.emails[0].via, "jsonld");
  assert.equal(f.phones[0].phone.number, "+4930901820");
  assert.equal(f.meta.orgName, "Acme Dental");
  assert.equal(f.meta.country, "DE");
  assert.ok(f.socials.instagram?.[0].url.endsWith("/acmedental"));
  assert.equal(f.socials.linkedin?.[0].url, "https://www.linkedin.com/company/acme-dental");
});

test("unobfuscates [at]/(dot) forms and labelled spelled-out forms only", () => {
  assert.match(deobfuscate("write to sales [at] acme [dot] com"), /sales@acme\.com/);
  assert.match(deobfuscate("Email: jane at acme dot io"), /jane@acme\.io/);
  assert.doesNotMatch(deobfuscate("ask Jane at Acme dot com about it"), /@/);
});

test("rejects junk addresses", () => {
  for (const junk of ["logo@2x.png", "a1b2c3d4e5f6a7b8c9d0@o123.ingest.sentry.io", "your@email.com", "name@domain.com", "noreply@acme.com", "user@example.com", "x@y.invalidtld"]) {
    assert.equal(cleanEmail(junk), null, junk);
  }
  assert.equal(cleanEmail("Info@Acme.co.uk."), "info@acme.co.uk");
  assert.equal(cleanEmail("u003einfo@acme.com"), "info@acme.com");
});

test("classifies role and personal addresses", () => {
  assert.equal(emailKind("info@acme.com"), "role");
  assert.equal(emailKind("sales2@acme.com"), "role");
  assert.equal(emailKind("jane.doe@acme.com"), "personal");
  assert.equal(emailKind("xk92@acme.com"), "generic");
  assert.equal(emailKind("de-info@igus.net"), "role");
  assert.equal(emailKind("sales.uk@acme.com"), "role");
});

test("ranks own-domain first and drops off-domain addresses found only in scripts", () => {
  const merged = mergeEmails(
    [
      { email: "studio@webagency.com", source: "https://acme.com/", via: "text" },
      { email: "info@acme.com", source: "https://acme.com/contact", via: "mailto" },
      { email: "tracker@vendor.io", source: "https://acme.com/", via: "script" },
      { email: "info@acme.com", source: "https://acme.com/", via: "text" },
    ],
    "www.acme.com",
  );
  assert.deepEqual(merged.map((e) => e.value), ["info@acme.com", "studio@webagency.com"]);
  assert.equal(merged[0].confidence, "high");
  assert.deepEqual(merged[0].sources, ["https://acme.com/contact", "https://acme.com/"]);
  assert.equal(merged[1].confidence, "low");
});

test("phones: labelled or international only, never dates or fax", () => {
  const text = "Tel: (030) 901820\nFax: 030 9018 2111\nOrder 2019-11-10 #4930901821\nCall +44 20 7946 0958";
  const found = phonesFromText(text, "DE").map((p) => p.phone.number);
  assert.deepEqual(found, ["+4930901820", "+442079460958"]);
});

test("WhatsApp from links and from a labelled number", () => {
  const html = `<a href="https://wa.me/971501234567">Chat</a><a href="https://api.whatsapp.com/send?phone=919812345678&text=hi">WA</a><p>WhatsApp: +55 11 91234-5678</p>`;
  const f = extractPage(html, "https://acme.ae/");
  const nums = f.whatsapp.map((w) => w.number);
  assert.ok(nums.includes("+971501234567"));
  assert.ok(nums.includes("+919812345678"));
  assert.ok(nums.includes("+5511912345678"));
});

test("social matching ignores share and intent links", () => {
  assert.equal(matchSocial("https://www.facebook.com/sharer/sharer.php?u=x"), null);
  assert.equal(matchSocial("https://twitter.com/intent/tweet?text=x"), null);
  assert.equal(matchSocial("https://x.com/acmehq")?.url, "https://x.com/acmehq");
  assert.equal(matchSocial("https://t.me/acme_support")?.network, "telegram");
  assert.equal(matchSocial("https://www.youtube.com/@AcmeTV")?.url, "https://www.youtube.com/@AcmeTV");
});

test("ranks contact and legal-notice links above about and blog links", () => {
  const html = `<a href="/blog/2024/01/post">Blog</a><a href="/ueber-uns">Über uns</a><a href="/impressum">Impressum</a><a href="/kontakt">Kontakt</a><a href="/wp-login.php">x</a><a href="/files/a.pdf">pdf</a>`;
  const f = extractPage(html, "https://acme.de/");
  assert.deepEqual(f.links.filter((l) => l.reason !== "nav").map((l) => l.reason), ["contact", "legal notice", "about"]);
});

test("normalizes messy input", () => {
  assert.equal(normalizeInput("acme.com"), "https://acme.com/");
  assert.equal(normalizeInput(" <https://acme.com/about> "), "https://acme.com/about");
  assert.equal(normalizeInput("info@acme.com"), "https://acme.com/");
  assert.equal(normalizeInput("not a url"), null);
  assert.equal(normalizeInput("ftp://acme.com"), null);
});

test("crawls a site end to end with a fake network and explains the result", async () => {
  const pages: Record<string, string> = {
    "https://acme.de/": `<html lang="de"><title>Acme GmbH | Pumpen</title><a href="/kontakt">Kontakt</a><a href="/impressum">Impressum</a><a href="https://www.linkedin.com/company/acme-gmbh">in</a></html>`,
    "https://acme.de/kontakt": `<p>Schreiben Sie uns: <a href="mailto:vertrieb@acme.de">vertrieb@acme.de</a></p><p>Telefon: 030 901820</p>`,
    "https://acme.de/impressum": `<p>Geschäftsführer: Max Muster, E-Mail: max.muster@acme.de</p>`,
  };
  const fetchImpl = (async (url: string) => {
    const body = pages[url];
    return body ? new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("nope", { status: 404, headers: { "content-type": "text/html" } });
  }) as typeof fetch;
  const lookup = async () => [{ address: "93.184.216.34" }];
  const r = await extractSite("acme.de", { validateEmails: false }, { fetchImpl, lookup });
  assert.equal(r.status, "found");
  assert.deepEqual(r.emails.map((e) => e.value).sort(), ["max.muster@acme.de", "vertrieb@acme.de"]);
  assert.equal(r.phones[0].e164, "+4930901820");
  assert.equal(r.contactPageUrl, "https://acme.de/kontakt");
  assert.equal(r.company.name, "Acme GmbH");
  assert.ok(r.socials.linkedin?.length);
  const csv = toCsv([flattenResult(r)]);
  assert.match(csv, /vertrieb@acme\.de <- https:\/\/acme\.de\/kontakt/);
});

test("private addresses are refused and reported as blocked", async () => {
  const r = await extractSite("http://127.0.0.1/", {}, { lookup: async () => [{ address: "127.0.0.1" }] });
  assert.equal(r.status, "blocked");
  assert.match(r.statusNote, /private network/);
});

test("MX: null MX is invalid, missing MX with A record is risky", async () => {
  const resolver = {
    resolveMx: async (d: string) => {
      if (d === "nullmx.test") return [{ exchange: "" }];
      if (d === "amx.test") throw Object.assign(new Error("x"), { code: "ENODATA" });
      return [{ exchange: "mx.example.net" }];
    },
    resolve4: async () => ["1.2.3.4"],
  };
  assert.equal(await checkMx("nullmx.test", resolver), "invalid");
  assert.equal(await checkMx("amx.test", resolver), "risky");
  assert.equal(await checkMx("good.test", resolver), "valid");
});

test("CSV export neutralises formula injection", () => {
  const csv = toCsv([0].map(() => ({ input: "=cmd", domain: "", status: "", status_note: "", company_name: "+1", ai_summary: "", industry: "", country: "", primary_email: "", emails: "", other_emails: "", email_sources: "", role_emails: "", personal_emails: "", primary_phone: "", phones: "", phone_sources: "", whatsapp: "", linkedin: "", facebook: "", instagram: "", x: "", youtube: "", tiktok: "", telegram: "", contact_page: "", pages_crawled: 0, final_url: "" })));
  assert.match(csv, /\n'=cmd,/);
});

// ---- regressions found in a real Apify run (zotter.at, dishoom.com, igus.de) ----

test("bare function words are generic, only first.last looks personal", () => {
  for (const e of ["tickets@zotter.at", "edition@zotter.at", "feasting@dishoom.com", "haendlerportal@zotter.at"]) assert.equal(emailKind(e), "generic", e);
  assert.equal(emailKind("yvonne.quella@zotter.at"), "personal");
  assert.equal(emailKind("j.smith@acme.com"), "personal");
});

test("helpdesk relay addresses are junk", () => {
  assert.equal(cleanEmail("nh6i0hld@zotter-schokoladen-manufaktur-test.intercom-mail.com"), null);
});

test("same-brand domains count as the company's own (igus.net on igus.de, zotterusa.com on zotter.at)", () => {
  assert.equal(sameBrand("igus.net", "www.igus.de"), true);
  assert.equal(sameBrand("zotterusa.com", "zotter.at"), true);
  assert.equal(sameBrand("developer.at", "zotter.at"), false);
  assert.equal(sameBrand("dm.com", "dm.de"), true);
  const merged = mergeEmails([{ email: "de-info@igus.net", source: "https://www.igus.de/", via: "mailto" }], "www.igus.de");
  assert.equal(merged[0].ownDomain, true);
  assert.equal(merged[0].confidence, "high");
});

test("press and careers addresses rank below general contact addresses", () => {
  const merged = mergeEmails(
    [
      { email: "press@dishoom.com", source: "https://dishoom.com/say-hello/", via: "mailto" },
      { email: "press@dishoom.com", source: "https://dishoom.com/", via: "text" },
      { email: "store@dishoom.com", source: "https://dishoom.com/store/", via: "mailto" },
    ],
    "dishoom.com",
  );
  assert.equal(merged[0].value, "store@dishoom.com");
});

test("other-language copies of a page rank below same-language pages", () => {
  const html = `<html lang="de"><a href="/kontakt">Kontakt</a><a href="/en/contact">Contact</a><a href="/impressum">Impressum</a></html>`;
  const f = extractPage(html, "https://zotter.at/");
  const en = f.links.find((l) => l.url.endsWith("/en/contact"))!;
  const de = f.links.find((l) => l.url.endsWith("/kontakt"))!;
  assert.ok(en.score < de.score - 20);
  // a language root that matches the page language is not penalised
  const g = extractPage(`<html lang="de-DE"><a href="/de-de/kontakt">Kontakt</a></html>`, "https://fischer.de/de-de");
  assert.ok(g.links[0].score >= 100);
});

test("flat export keeps own-domain emails in `emails` and moves low-confidence third parties to `other_emails`", () => {
  const e = (value: string, ownDomain: boolean, confidence: "high" | "low") => ({ value, kind: "role" as const, ownDomain, freeProvider: false, disposable: false, mx: "valid" as const, confidence, sources: ["https://acme.de/"], via: ["mailto" as const] });
  const site = { input: "acme.de", domain: "acme.de", status: "found", statusNote: "", company: { name: null, summary: null, industry: null, country: null, description: null, language: null }, emails: [e("info@acme.de", true, "high"), e("office@agency.at", false, "low")], phones: [], whatsapp: [], socials: {}, contactPageUrl: null, pagesCrawled: [], finalUrl: null } as never;
  const row = flattenResult(site);
  assert.equal(row.emails, "info@acme.de");
  assert.equal(row.other_emails, "office@agency.at");
  assert.equal(row.primary_email, "info@acme.de");
});

test("exact-domain addresses outrank sister-brand domains", () => {
  const merged = mergeEmails(
    [
      { email: "info@zotterusa.com", source: "https://zotter.at/kontakt", via: "mailto" },
      { email: "online-shop@zotter.at", source: "https://zotter.at/kontakt", via: "mailto" },
    ],
    "zotter.at",
  );
  assert.equal(merged[0].value, "online-shop@zotter.at");
  assert.equal(merged[1].ownDomain, true);
});
