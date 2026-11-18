# Website Contact Scraper: Emails, Phones, WhatsApp, Socials

Give it a list of business websites. You get one clean row per website: emails, phone numbers, WhatsApp and social profiles. **Every value links to the page it was found on**, and **you pay only for websites where a contact is found.**

## What you get

```json
{
  "domain": "acme-dental.de",
  "status": "found",
  "primary_email": "praxis@acme-dental.de",
  "emails": "praxis@acme-dental.de; termin@acme-dental.de",
  "email_sources": "praxis@acme-dental.de <- https://acme-dental.de/impressum",
  "primary_phone": "+49 30 901820",
  "whatsapp": "+4915112345678",
  "instagram": "https://www.instagram.com/acmedental",
  "contact_page": "https://acme-dental.de/kontakt",
  "status_note": "Found 2 emails, 1 phone across 3 pages."
}
```

Each row also has a `details` object with per-email confidence, role or personal type, MX status, and every source URL.

## What you pay

| Event | When | Price |
|---|---|---|
| Website with contact | at least one email, phone or WhatsApp found | from $0.002 |
| AI summary (optional) | one-line company description and industry | small add-on |

**Empty websites, parked domains, sites that block crawlers and unreachable sites are free.** They still get a row explaining why, so you can clean your list. Set a maximum charge per run in the run options; the Actor stops at your cap.

## Why it finds more

- Reads contact, legal-notice (Impressum, mentions légales, aviso legal), about and team pages in 20+ languages, not random links.
- Decodes Cloudflare-protected emails, the common reason other scrapers "find no email" when it sits right on the page.
- Reads schema.org data (JSON-LD and microdata), the sitemap when there is no contact link, and follows sites that moved domain.
- Validates phones with Google's libphonenumber; numbers are E.164-formatted and typed (mobile or fixed line).
- Filters junk: image names, tracking hashes, placeholders and vendor addresses. In our benchmark of 119 real sites: 0% junk emails against 26-31% for a plain regex parser.

## Input

| Field | Default | |
|---|---|---|
| Websites | — | domains or URLs; upload a text or CSV file |
| Pages per website | 8 | 1 to 15 |
| Phones / Socials / MX check | on | |
| AI company summary | off | |
| Only output websites with contacts | off | |

## Good to know

- Polite crawler: it identifies itself and honours robots.txt. It does not log in, submit forms or bypass bot protection.
- Collects only contact details businesses publish on their own websites. You are responsible for using them lawfully (for example GDPR and CAN-SPAM).
- Needs no extra account permissions.
- Questions or a site it should have found? Open an issue. We reply within 24 hours.
