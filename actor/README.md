# Website Contact Scraper: Emails, Phones, WhatsApp & Socials

**Paste a list of business websites. Get one clean row per site with verified emails, validated phone numbers, WhatsApp and social profiles, and the exact page each value came from. You pay only for websites where a contact is found. Empty, blocked and unreachable sites are free.**

From **$2.50 per 1,000 websites with a contact** on high-volume Apify plans, **$5.00 on the Free plan**. No charge per page crawled, so a site with no contact costs you nothing.

## What you get

```json
{
  "domain": "zotter.at",
  "status": "found",
  "company_name": "Zotter Schokolade GmbH",
  "primary_email": "online-shop@zotter.at",
  "emails": "online-shop@zotter.at; sales@zotter.at; support@zotter.at",
  "other_emails": "office@developer.at",
  "email_sources": "online-shop@zotter.at <- https://www.zotter.at/kontakt; sales@zotter.at <- https://www.zotter.at/kontakt",
  "primary_phone": "+43 3152 5554",
  "phones": "+4331525554; +436644647284",
  "whatsapp": "+4915224873633",
  "instagram": "https://www.instagram.com/zotterschokolade",
  "linkedin": "https://www.linkedin.com/company/zotter-schokolade",
  "contact_page": "https://www.zotter.at/kontakt",
  "status_note": "Found 10 emails, 11 phones across 3 pages."
}
```

Every row also explains itself: when a site has no contact, the `status_note` says why (parked domain, bot-protection wall, robots.txt, JavaScript-only site, dead domain).

## Why people switch to this scraper

| Common complaint about contact scrapers | What this Actor does |
|---|---|
| "It finds no emails, even when they are on the page." | Reads contact, legal-notice (Impressum, mentions légales, aviso legal), about and team pages in 15+ languages. Decodes Cloudflare-protected emails. Reads schema.org data and the sitemap. Follows sites that moved domain. |
| "I was charged for empty results." | One charge per website **with** a contact. Nothing for empty, blocked or unreachable sites. Set a maximum charge per run and the Actor stops at your cap. |
| "Same email repeated, irrelevant rows." | One row per site. Emails are deduplicated and ranked: the company's own domain first, agency and partner addresses moved to `other_emails`, junk (image names, tracking hashes, helpdesk relays) removed. |
| "Missing phones, bad emails." | Phones are validated with Google's libphonenumber and written in +E.164 format with the line type. Email domains are checked for MX records. |
| "I can't tell where a value came from." | Every email and phone has the source page URL. |
| "It asks for full account permissions." | It needs no extra permissions. |

## What it extracts

| | | |
|---|---|---|
| 📧 Emails (MX-checked, role or personal flagged) | 📞 Phone numbers (+E.164, mobile or fixed) | 💬 WhatsApp numbers and links |
| 💼 LinkedIn | 📸 Instagram | 📘 Facebook |
| 𝕏 X (Twitter) | ▶️ YouTube | 🎵 TikTok |
| 📌 Pinterest | ✈️ Telegram | 🏢 Company name and country |

Optional: a one-line **AI company summary** and industry for each site. The AI never sees or creates contact data, so it cannot invent an email.

## How to use it

1. Paste websites into **Websites**. Domains (`acme.com`), full URLs, or a text or CSV file all work.
2. Click **Start**. A typical list of 1,000 sites takes a few minutes.
3. Open the **Overview** table or export CSV, Excel, JSON or XML.

Example input:

```json
{
  "startUrls": [{ "url": "https://www.igus.de" }, { "url": "https://www.dishoom.com" }],
  "maxPagesPerSite": 8,
  "includePhones": true,
  "includeSocials": true,
  "validateEmails": true,
  "aiSummary": false
}
```

| Option | Default | What it does |
|---|---|---|
| Websites | none | Domains or URLs to scan |
| Pages per website | 8 | Homepage plus the best contact, legal, about and team pages |
| Phones, Socials, MX check | on | Switch off what you do not need |
| AI company summary | off | One-line description and industry |
| Only output websites with contacts | off | Skip rows for empty and unreachable sites |
| Include full details (JSON) | off | Adds a nested object with confidence, MX status and every source page |

## Output fields

`domain`, `status` (`found`, `empty`, `failed`, `blocked`), `status_note`, `company_name`, `country`, `primary_email`, `emails`, `other_emails`, `email_sources`, `role_emails`, `personal_emails`, `primary_phone`, `phones`, `phone_sources`, `whatsapp`, `linkedin`, `facebook`, `instagram`, `x`, `youtube`, `tiktok`, `telegram`, `contact_page`, `pages_crawled`, `final_url`, plus `ai_summary` and `industry` when enabled.

`emails` holds the business's own addresses and anything we are confident about. Low-confidence addresses on other domains go to `other_emails`.

## How much does it cost?

You pay per **website where we find an email, phone or WhatsApp number**.

| Apify plan | Price per website with a contact | Per 1,000 |
|---|---|---|
| Free | $0.005 | $5.00 |
| Starter | $0.0045 | $4.50 |
| Scale | $0.004 | $4.00 |
| Business | $0.0035 | $3.50 |
| Higher volume plans | $0.003 to $0.0025 | $3.00 to $2.50 |

Optional AI summary: $0.001 per site with a contact. A small start fee applies per run.

**Example:** you scan 1,000 mixed business websites. In our test about half had a public contact, and about 80% of sites that allow crawling did. You are charged for roughly 500 to 800 sites, not 1,000, and nothing for pages crawled.

## Measured, not claimed

We ran the same 119 real business websites (12+ countries) through this Actor and through a plain-regex parser built on Crawlee, with the same page budget:

| | This Actor | Regex baseline |
|---|---|---|
| Sites with an email | 42 to 45% | 32 to 36% |
| Sites with a valid phone | 34 to 37% | 19 to 24% |
| Junk emails | 0% | 26 to 31% |
| Phone values that fail validation | 0% | 71 to 76% |

About 40% of that list was large brands that block all crawlers. Those sites are reported plainly and cost nothing.

## Use it from code, automations and AI agents

```js
import { ApifyClient } from "apify-client";
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor("YOUR_USERNAME/website-contact-extractor").call({
  startUrls: [{ url: "https://example.com" }],
});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

- **Integrations:** Make, Zapier, n8n, Google Sheets, webhooks and the Apify API work out of the box.
- **AI agents:** connect the Apify MCP server (Claude, ChatGPT, Cursor and others) and call this Actor in plain language, for example "Find contact emails for these 50 websites". Use the **maximum charge** option to cap spend.

## Frequently asked questions

**Am I charged when nothing is found?** No. Only websites with at least one email, phone or WhatsApp number are charged.

**Does it work on JavaScript-only sites?** It reads what the server sends, including structured data and inline scripts. A site that shows contacts only after running a browser app is flagged in `status_note` instead of silently skipped.

**Does it bypass bot protection?** No. It identifies itself, honours robots.txt, and stops at a challenge page. Blocked sites are free.

**Does it verify that a mailbox exists?** It checks that the email's domain accepts mail (MX records). It does not probe the mailbox, which cloud IPs cannot do reliably.

**Can I use it on Google Maps results?** Yes. Export the website column from a Google Maps scraper and paste it in.

**Is it legal?** It collects only contact details that businesses publish on their own websites. Results can include named people's addresses, which are personal data under GDPR and similar laws. Have a legitimate reason and follow the rules for your market (for example GDPR and CAN-SPAM).

## Feedback

Found a site that should have worked, or want a field added? Open an issue in the **Issues** tab. We reply within 24 hours.
