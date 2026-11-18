# Contact Extractor: an Apify actor for bulk business-contact extraction

Status: plan, nothing built yet. Written 2026-11-18.
Owner goal: earn money by building a product on an existing marketplace (not freelancing), starting from code already written for Marlo.

> Honest expectation: this is a slow build. Case studies show first revenue in cents to dollars, about $30/month for a 70-user actor, and months to the first $100. Keep a job search running in parallel. Nothing below is a guaranteed income.

---

## 1. The product in one paragraph

You give it a list of business websites (a few or tens of thousands, pasted or as CSV). For each site it crawls the pages that hold contact details (contact, about, team, impressum), and returns one clean row: emails (checked, with role addresses flagged), phone numbers, WhatsApp number, social profile links, and the page URL each fact came from. You pay only for sites where it actually found a contact. Output downloads as CSV, Excel or JSON, or is read through the API.

**Buyers:** agencies, freelancers, recruiters, sales and outreach teams, lead-list builders, and AI agents that call Apify actors.

---

## 2. Evidence this is worth building (from the Apify Store data pulled 2026-11-18)

| Fact | Number |
|---|---|
| Contact and lead-finder family on the Store | 663 actors, about 34,900 users in the last 30 days |
| Actors in that family with 100 or more users (30 days) | 52 (12 with 500 or more) |
| Share held by the top 5 | 35% (not winner-take-all) |
| Closest competitor, `vdrmota/contact-info-scraper` | 4,128 users in 30 days, 69K lifetime, rating 4.2 (93 reviews), "Maintained by Apify" |
| Second, `lukaskrivka/google-maps-with-contact-details` | 2,129 users in 30 days, rating 4.6 (221 reviews) |

Caveat: the Store API returns about 13,300 of roughly 121,000 actors, so these are the visible ones, and user counts are not revenue.

---

## 3. Competitor comparison

| | **vdrmota Contact Details Scraper** | **datagleaner Website Contact Scraper** | **lukaskrivka Google Maps + contacts** | **"Apollo-alternative" lead finders** | **Ours (planned)** |
|---|---|---|---|---|---|
| Input | list of URLs | list of URLs | search term plus place | filters (job, industry) | list of URLs or CSV |
| Users (30 days) | 4,128 | 98 (published 2026-10-07, 0 reviews) | 2,129 | 400 to 1,800 each | 0 |
| Pricing basis | per page crawled, about $0.002 per page at the free tier, $0.00105 at the top tier | per website with an email, $0.005 at the free tier | per place plus add-ons | per lead, about $1 to $2 per 1,000 | per site with a contact found |
| Charged when nothing found? | yes (pages are billed) | no | partly | per lead | no |
| Phones | yes | unclear | yes | often missing (a top complaint) | yes |
| WhatsApp | no | no | no | no | **yes** |
| Source URL per contact | no | unclear | no | no | **yes** |
| Email validation | paid add-on | no | paid add-on | weak (one user reported a 70% bounce rate) | **MX check included** |
| JavaScript-rendered sites | browser add-on | unknown | unknown | not applicable | fallback, surcharged |
| Default memory | 4 GB | 1 GB | 1 GB | 256 to 512 MB | 512 MB |

### What competitor users complain about (real review text)
1. **Finds no emails,** even when they sit on the homepage (7 of 11 written low-star reviews on the leader).
2. **Charged for empty results** ("$900 bill, under $600 of emails").
3. **Too complex** for non-technical users.
4. **Same email repeated** across rows, or irrelevant rows.
5. **Missing phone numbers** and bad emails.
6. **Asks for full account permissions** without explaining why.

### Honest corrections to the first pitch
- **"Pay only when found" is not unique.** `datagleaner` already does it, but it is six weeks old with 98 users. That tells us the idea is valid and the gap is execution quality, not the pricing model.
- **WhatsApp is a bonus field, not the product.** It is common in India, the Middle East, Latin America and Southeast Asia, and rare in the US and Europe. The hit rate is unmeasured. Core value is emails and phones.
- **ChatGPT can do one site.** It cannot do 5,000 sites per run, on a schedule, through an API, without inventing emails. The actor wins on bulk, cost, determinism and source URLs.
- **The leader is Apify-maintained** with 69K lifetime users. We win only with a measurably higher hit rate or a clearly better price per found contact.

---

## 4. Our differentiators (what must be true)

1. **Higher hit rate** through deeper, smarter crawling: contact, about, team, impressum, privacy and imprint pages, up to about 8 pages per site, plus a JavaScript fallback. *This is the main bet and is proven or killed by the benchmark in section 9.*
2. **Pay per site with a contact found.** Empty sites are free.
3. **Phones, WhatsApp and social links** in the same row.
4. **Every value carries its source page URL.** No guessing, no invented values.
5. **Email quality built in:** MX-record check, role-address flag (`info@`, `sales@`), and dedupe across the whole run.
6. **Simple input,** three fields and a prefilled example.
7. **Bulk first:** CSV or large URL lists, concurrency, retries.
8. **Limited permissions,** stated in the README.

---

## 5. Scope

### v1 (build this)
- Input: `startUrls` (list), `maxPagesPerSite` (default 8), `includePhones`, `includeSocials`, `validateEmails` (all default on), `useBrowserFallback` (default on, surcharged).
- Crawl: Crawlee `CheerioCrawler`, same-site links only, ranked toward contact, about, team, impressum, imprint. Respect timeouts and byte caps.
- Extraction: emails (including `[at]`/`(dot)` forms and `mailto:`), phone numbers normalised to E.164, WhatsApp (`wa.me` and `api.whatsapp.com` links), social profile links (LinkedIn, Facebook, Instagram, X, YouTube, Telegram).
- Quality: MX check, role flag, dedupe, per-value source URL, a confidence note.
- Output: one dataset row per site, with an `Overview` view in the Apify Console.
- Billing: pay-per-event (section 6).
- Listing: README, example run, SEO title and description, icon, category Lead generation.

### v2 (only if v1 gets users)
- Keyword plus city mode (find sites first), reusing a search source.
- Deeper contact-person extraction (names and titles from team pages).
- Webhook and Google Sheets integration docs.
- A second actor in the same niche: email verifier (check SMTP reachability from Apify first), or AI-search visibility checker.

### Out of scope
- Scraping social platforms, logged-in pages, or personal profiles.
- Selling a contact database.
- Any outreach, messaging or sending.
- Residential proxies by default (cost).

---

## 6. Pricing and economics

### How Apify pays you (verified against Apify docs)
- **Pay per event (PPE):** you define billable events; users pay per event.
- **Commission:** Apify keeps 20% of revenue. Platform usage costs for your runs are deducted from your share. A "PPE + usage" option can pass compute costs to users.
- **Payout:** monthly. A third-party guide gives minimums of $100 by bank transfer or $20 by PayPal; confirm in the Console.
- **Tiered prices:** competitors set a different price for each Apify subscription tier (FREE, BRONZE, SILVER, GOLD, PLATINUM). Do the same.
- Rentals were retired on 1 October 2026, so PPE is the only practical model.

### Our events (starting guess, adjust after the benchmark)

| Event | Charged when | Free tier | Gold tier (illustrative) |
|---|---|---|---|
| `contact-site` | a site returns at least one email, phone or WhatsApp | $0.003 | $0.002 |
| `browser-fallback` | a site needed the JavaScript browser to find a contact | +$0.004 | +$0.003 |
| `apify-actor-start` (synthetic) | per run | tiny, set low | tiny |

Reference prices today (from the Apify API): leader is about $2 per 1,000 **pages** at the free tier (a 5-page crawl is about $10 per 1,000 sites); `datagleaner` is $5 per 1,000 sites with an email. At $3 per 1,000 sites we are cheaper than both on a per-found-contact basis.

### Unit economics (estimates, benchmark before relying on them)
- Revenue per 1,000 contact sites: $3.00. Apify commission 20%: $0.60. Net before compute: $2.40.
- Compute: 1 compute unit (1 GB-hour) is about $0.20. At 512 MB and even 1 site per second, 1,000 sites is about $0.03. The Cheerio path leaves a healthy margin.
- Browser fallback costs far more per site (about 1 to 2 GB and slower), which is why it has its own surcharge.
- Danger case from a real post-mortem: default memory 4096 MB on a simple fetcher turned a $0.015 sale into a $0.0161 cost. Set memory to 512 MB and check run costs through the API.

### Revenue scenarios (illustrative only)
Based on one anecdote of about $30 per month for 70 monthly users (about $0.40 per user), plus an Apify blog claim that the top independent creators make $4,000 to $10,000 or more.

| Scenario | Monthly users | Rough monthly revenue |
|---|---|---|
| Quiet | 100 | $40 |
| Healthy | 500 | $200 |
| Strong | 2,000 | $800 |

These are assumptions, not forecasts. Real revenue per user varies hugely with run size.

---

## 7. Apify checklist

**Account and tooling**
- Free account, `npm i -g apify-cli`, `apify login`.
- Template: `apify create contact-extractor`, TypeScript Crawlee (Cheerio) template.

**Files**
- `.actor/actor.json`: name, version, `storages.dataset` view definitions, default memory 512 MB.
- `.actor/input_schema.json`: the fields in section 5, with a prefilled example that succeeds (Apify's daily test runs the default input; two failures in three days adds the "Under maintenance" badge).
- `.actor/dataset_schema.json`: output fields and an `Overview` view.
- `Dockerfile` from the template, Playwright image only if the fallback is bundled.
- `src/main.ts`: read input, build the request queue, run the crawler, `Actor.pushData(row, 'contact-site')` for found contacts (verify the exact charge call in the current SDK docs), push nothing and charge nothing for empty sites.
- Never push an empty dataset. If nothing is found, push a status row (and do not charge it) so the actor is not flagged and the user understands why.

**Monetization**
- Console, Monetization: choose pay per event, add events and tiered prices, optionally enable PPE plus usage.
- Set the max-charge guard so users cannot overspend by accident.

**Store listing**
- Title: keyword-rich, e.g. "Website Contact Scraper: Emails, Phones, WhatsApp, Socials".
- SEO title and SEO description fields are weighted heavily by Store search.
- README order: one-line use case, sample JSON output, what you pay and when, then configuration, then technical notes. Never start with a spec.
- Categories: Lead generation.
- Request "Limited permissions" and say so.

**After publishing**
- Reply to every issue within 24 hours (the leader's response time is 2.9 days).
- Ask the first users for honest reviews; 1 to 3 star reviews are the roadmap.
- Watch success rate and failures in the Console. Sites change; a 92% to 61% decay happened to another developer in 30 days.
- Do not rely on external ads: the Store has no promoted placement, so search ranking is the channel.

---

## 8. Reuse from Marlo

| From the Marlo repo | Use |
|---|---|
| `lib/domain/leads/local/websiteContact.ts` | email extraction, deobfuscation, ranking, WhatsApp, contact-page picker, page fetching limits |
| `lib/domain/net/ssrf.ts` | SSRF guard (keep it, 163 lines, no dependencies) |
| `cheerio` | already the HTML parser |
| Drop | `buyingSignals`, the `OkaraLeadBot` user agent (rename it), the Marlo-specific `Enrichment` type |

Keep the new project in its own repository. Do not copy scraped contact data or secrets from Marlo.

Gaps in the current code that must be built: multi-page crawling beyond 3 pages, JavaScript rendering, phone extraction, social-link extraction, MX validation, concurrency, Apify wrapper, billing.

---

## 9. Build order and go/no-go gates

| Day | Work | Gate |
|---|---|---|
| 0 | **Benchmark.** 100 random business sites across 3 or more countries. Run the current extractor, the leader, and `datagleaner` on the same list. Count sites with an email, a phone, and a WhatsApp number. | **Go only if our hit rate is at least 10 points above the leader, or equal with a cost per found contact that is clearly lower.** Otherwise stop and pick another niche. |
| 1 | New repo, copy the extraction and SSRF code, add phone and social extraction, unit tests | tests pass |
| 2 | Crawler: link ranking, page cap, concurrency, JavaScript fallback | benchmark rerun improves |
| 3 | Apify wrapper, input and dataset schemas, pay-per-event, local run on 500 sites | no empty datasets, cost per 1,000 sites measured |
| 4 | README, listing, publish, test run on Apify | default-input run succeeds |
| 5 and after | Answer issues, collect reviews, tune prices | see KPIs |

---

## 10. KPIs and kill criteria

- **Week 1:** published, default run green.
- **Week 4:** 50 or more users in 30 days. If not, change title, SEO fields and README before changing code.
- **Week 8:** if under 20 users, stop and move to the next idea (email verifier or AI-search visibility checker).
- **Always:** success rate at 95% or more; first response to issues under 24 hours; margin per 1,000 sites measured monthly.

---

## 11. Risks

| Risk | Mitigation |
|---|---|
| Hit rate is not better than the leader's | Day-0 benchmark is a hard gate |
| Apify-maintained leader outprices us | Compete on found-contact cost and quality, not page cost |
| Sites change or block cloud IPs | Daily test input, status rows, fast fixes, optional proxy add-on |
| Negative margin from defaults | 512 MB memory, measure cost per run |
| Platform and pricing changes (rental model retired, token rotation 11 Nov 2026) | Keep the code portable, avoid lock-in to one monetization model |
| Low discoverability for a new developer | Search-optimised title, a real README, early reviews |
| Legal and privacy | Extract only contact details businesses publish on their own sites; say so in the README; avoid personal emails of individuals, especially in the EU; no logged-in scraping |
| Time to first revenue is long | Keep a job search running; treat this as a side income that may reach $200 to $800 a month at best within months |

---

## 12. Sources
- Apify: [how actor monetization works](https://help.apify.com/en/articles/8684010-how-does-actor-monetization-work), [monetize docs](https://docs.apify.com/platform/actors/publishing/monetize), [developer payouts](https://help.apify.com/en/articles/10057167-how-developer-payouts-work), [actor maintenance](https://help.apify.com/en/articles/9716923-what-to-do-when-your-actor-comes-under-maintenance)
- Case studies: [98 actors in 6 months](https://blog.apify.com/building-98-actors-on-apify-store/), [10 paid scrapers, one losing money](https://dev.to/0xgollum/i-shipped-10-paid-data-scrapers-in-one-week-what-actually-worked-and-what-quietly-lost-money-3k1k), [92% to 61% success decay](https://dev.to/perufitlife/why-my-reddit-scraper-went-from-92-to-61-success-rate-in-30-days-and-the-one-line-fix-3013), [Store API size gap](https://dev.to/cryptopunk_dz2_bd054446a6/their-api-says-121467-actors-and-serves-exactly-13706-415n)
- Store data and competitor pricing and reviews: pulled from Apify's public API on 2026-11-18.
