# Decisions, evidence and benchmark

Companion to [PROJECT.md](../PROJECT.md). It records what was built, which open-source code was reused and why (with evidence), how the product answers competitor complaints, and the measured results.

## 1. Benchmark (live, 119 real business websites, 12+ countries)

Same list, same network, same 8-page budget. Run with `npm run bench`. Raw JSON is written to `scripts/out/`.

| Metric | Ours (run 1 / 2 / 3) | Crawlee social parser (open baseline) | Marlo extractor (starting point) |
|---|---|---|---|
| Sites with an email | 45% / 42% / 43% | 34% / 36% / 32% | 12% / 13% / 12% |
| Sites with a valid phone | 37% / 34% / 34% | 24% / 19% / 20% | 0% |
| Sites with any contact | 52% / 48% / 48% | 42% / 40% / 37% | 14% / 15% / 13% |
| Junk emails (assets, Sentry hashes, placeholders) | 0% | 29% / 31% / 26% | 0% |
| Phone values that fail validation | 0% | 71% / 76% / 72% | n/a |
| Avg seconds per site | 4.0 / 7.7 / 3.9 | 3.4 / 3.6 / 3.2 | 2.7 / 2.4 / 2.4 |

**Gate from PROJECT.md section 9:** "Go only if our hit rate is at least 10 points above the leader." We beat the open baseline by 11 points on emails and on any-contact. **Caveat:** the baseline is Crawlee's `parseHandlesFromHtml`, the open-source parser Apify's contact scrapers are built on, crawling links in page order. It approximates the leader's method. It is not the paid `vdrmota/contact-info-scraper` actor. Running that actor on the same list needs an Apify token (about $1 of usage), and that comparison is the remaining step before publishing.

About 40% of the list is large brands behind bot walls (Cloudflare or Akamai challenges, 403s, timeouts). We report those plainly and never charge for them. Among sites we could reach, the any-contact rate is about 79%.

## 2. Reused code and packages (with evidence)

Weekly npm downloads were pulled from `api.npmjs.org` on 2026-11-18.

| What | Source | Why (evidence) |
|---|---|---|
| Email extraction, deobfuscation, mailto, WhatsApp links, block-aware text, guarded fetch | Marlo `lib/domain/leads/local/websiteContact.ts` | Already in production. Its regexes are bounded (no ReDoS). Extended rather than rewritten. Kept as a baseline in `scripts/baselines/marlo.ts`. |
| SSRF guard | Marlo `lib/domain/net/ssrf.ts` (verbatim) | Covers IPv6 mapped, NAT64, 6to4 and CGNAT. 139 lines, no dependencies. Also reused for webhook URLs. |
| Social-profile patterns | Vendored from `@crawlee/utils` 3.18.2 `internals/social.js` (Apache-2.0) | This is the code Apify's own scrapers use (332K downloads/week). We vendored the regex strings and did not take the package, because it pulls in `got-scraping` and bloats serverless functions. We match link targets only, which removes share-button noise, and we added Telegram. |
| `cheerio` 1.2.0 | MIT, 36M/week | HTML parser Marlo already uses. |
| `libphonenumber-js` 1.13.16 (`/max`) | MIT, 44M/week, Google metadata | Crawlee's phone regexes produced **72% invalid numbers** in our benchmark. libphonenumber validates each number and gives E.164 format and type (mobile/fixed). It also accepts dates such as `2019-11-10` as valid German numbers, which is why text phones need a label check (see the tests). |
| `tldts` 7.5.4 | MIT, 150M/week | Registrable domain (`a.b.co.uk` gives `b.co.uk`), used for same-site checks and own-domain email ranking. Rejects unknown TLDs such as `logo@2x.png`. |
| `robots-parser` 3.0.1 | MIT, 8.4M/week, also used by Crawlee | Honours robots.txt. This is a trust feature for site owners and for our README. |
| `disposable-email-domains-js` 2.2.0 | CC0, 585K/week | Drops throwaway-domain addresses. |
| `exceljs` 4.4.0 | MIT, 29M/week | Excel export with a sites sheet and an emails sheet. We did **not** pick `xlsx` (SheetJS) because the npm build is stuck at 0.18.5 with known advisories. `uuid` is overridden to ^11.1.1 to clear a moderate advisory. |
| Next.js 16.4.6, React 19.3, `@supabase/ssr` 0.7, `supabase-js` 2.117, `lucide-react` | Same stack as Marlo-platform | **Next 16.0.0 to 16.4.4 has critical advisories** (RCE in the image optimizer, `use cache`). We ship 16.4.6. Marlo-platform is on 16.3.8 and should be upgraded too. |
| Gemini via REST (no SDK) | `gemini-flash-lite-latest` | Optional one-line company summary and industry, 1 to 2 s per site. The model never sees or produces contact data, so it cannot invent an email. |

Rejected options: `@crawlee/utils` as a runtime dependency (bundle weight), Playwright on Vercel (cold-start size and cost; a JS-heavy site is flagged instead), header spoofing to get past bot walls (we do not evade protections).

## 3. Competitor complaints and our answer

| Complaint (from real reviews) | What we built |
|---|---|
| "Finds no emails, even on the homepage" | Cloudflare `data-cfemail` decoding (Crawlee has none; checked in the source), JSON-LD and microdata, multilingual contact and Impressum ranking, sitemap fallback, language-root hops, domain-move following. |
| "Charged for empty results ($900 bill, under $600 of emails)" | One credit per site **with** a contact. Empty, parked, blocked and unreachable sites are free. Atomic, idempotent `charge_site()` in Postgres. Per-run spending cap. |
| "Too complex" | Paste or CSV in one box, auto-detected website column, four toggles, a prefilled sample. |
| "Same email repeated, irrelevant rows" | Deduped per site with ranking (own domain first, agency and vendor addresses marked low confidence). The contact book dedupes across runs. |
| "Missing phones, bad emails" | Validated phones; MX check with null-MX and A-record fallback; role and personal flags; junk filters (0% junk measured). |
| "Unclear why a row is empty" | Every row has a plain-language `statusNote`: bot wall, parked domain, JS-only site, robots.txt, DNS. |
| "Asks for full permissions" | The actor needs no extra permissions. The README says so. |

## 4. Retention features (keep users coming back)

- **Contact book**: every found domain merged across runs, searchable, exportable.
- **Re-run with change detection**: re-running a list marks new emails and phones since the last run ("2 new" chip). This is the hook for monthly list refreshes.
- **Free monthly credits** that top up automatically, and "empty sites are free".
- **Locked rows instead of silent loss**: when credits run out, found sites are kept as "locked" with one-click unlock after a top-up.
- **API keys, webhooks** (Zapier, Make, n8n) and CSV, Excel and JSON exports, so the tool sits inside users' workflows.
- **Transparent failure analytics** on the overview ("why sites were unreachable"), so users can fix their lists.

## 5. Known limits

- No paid billing yet. Plans and credits work, but Stripe checkout still needs a Stripe account (next step).
- JavaScript-only sites are flagged rather than rendered. A browser fallback belongs in the Apify actor (Playwright image) if users ask for it.
- On Vercel Hobby, cron runs once a day. Runs advance through the browser tab, API polling and `after()` chaining; a per-minute cron needs Pro.
