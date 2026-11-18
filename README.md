# Contact Extractor

Paste business websites or upload a CSV. You get one row per site with checked emails, validated phone numbers, WhatsApp and social profiles. Each value links to the page it came from. You pay only for sites where a contact is found.

The repository has three parts, all built on one engine:

| Part | Path | Runs on |
|---|---|---|
| Extraction engine | `lib/engine/` | anywhere Node 22 runs |
| Web app (dashboard, API, credits) | `app/`, `components/`, `lib/server/` | Vercel and Supabase |
| Apify Actor | `actor/` | Apify platform (pay per event) |

Benchmark, package evidence and the competitor analysis are in [docs/DECISIONS.md](docs/DECISIONS.md). The business plan is in [PROJECT.md](PROJECT.md).

## Sample output (one site)

```json
{
  "domain": "acme-dental.de",
  "status": "found",
  "statusNote": "Found 2 emails, 1 phone across 3 pages.",
  "emails": [{ "value": "praxis@acme-dental.de", "kind": "role", "confidence": "high", "mx": "valid",
               "sources": ["https://acme-dental.de/impressum"], "via": ["mailto"] }],
  "phones": [{ "e164": "+4930901820", "type": "fixed_line", "confidence": "high",
               "sources": ["https://acme-dental.de/kontakt"] }],
  "whatsapp": [{ "number": "+4915112345678", "link": "https://wa.me/4915112345678" }],
  "socials": { "instagram": [{ "url": "https://www.instagram.com/acmedental" }] },
  "company": { "name": "Acme Dental", "summary": "Dental practice in Berlin…", "industry": "Dental clinic" }
}
```

## Local development

Requirements: Node 22, Docker, and the Supabase CLI.

```bash
npm install
supabase start                       # local Postgres, Auth and API (ports 55421-55429, see supabase/config.toml)
cp .env.example .env.local           # fill in the keys printed by `supabase start`
npm run dev                          # http://localhost:3000
```

Checks:

```bash
npm test                             # engine unit tests (fixtures, no network)
npm run typecheck && npm run lint
npm run build
npm run bench                        # live benchmark vs baselines on scripts/bench-sites.txt
node --env-file=.env.local --import tsx scripts/e2e.mts   # full API flow against a running app
```

## Deploy (Vercel + Supabase)

1. **Database.** `supabase link --project-ref <ref>`, then `supabase db push`. This applies `supabase/migrations/`.
2. **Supabase Auth.** Set the Site URL to your Vercel URL. Add `https://<app>/auth/callback` to the redirect URLs.
3. **Vercel env vars** (Production and Preview):

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` |
   | `SUPABASE_SECRET_KEY` | `sb_secret_...` (server only) |
   | `NEXT_PUBLIC_APP_URL` | `https://<app>.vercel.app` |
   | `CRON_SECRET` | a long random string |
   | `GEMINI_API_KEY`, `GEMINI_MODEL` | optional AI summaries |

4. Import the repo in Vercel (framework: Next.js) and deploy. `vercel.json` adds a daily cron safety net. On the Pro plan you can change it to `* * * * *`.

How runs execute on serverless: a run is a queue in `run_sites`. Each `POST /api/runs/:id/tick` claims a batch with `FOR UPDATE SKIP LOCKED`, crawls it within the function's time limit, charges `charge_site()` atomically, and finishes the run when nothing is left. Ticks come from four places: the open run page, API status polls, `after()` self-chaining (which needs `CRON_SECRET`), and the cron.

## API

Create a key under **API** in the app, then:

```bash
curl -X POST https://<app>/api/runs -H "Authorization: Bearer ce_live_..." -H "Content-Type: application/json" \
  -d '{"name":"Dentists","urls":["acme-dental.de","smile.de"],"options":{"aiSummary":true},"webhookUrl":"https://hooks.zapier.com/..."}'
curl https://<app>/api/runs/RUN_ID -H "Authorization: Bearer ce_live_..."
curl "https://<app>/api/runs/RUN_ID/export?format=csv" -H "Authorization: Bearer ce_live_..." -o contacts.csv
```

| Endpoint | |
|---|---|
| `POST /api/runs` | start a run (`urls` as an array or a newline string, `options`, `webhookUrl`, `maxCharge`) |
| `GET /api/runs`, `GET /api/runs/:id` | list, status (polling also advances the run) |
| `GET /api/runs/:id/results?status=found\|empty\|failed\|skipped&q=&offset=&limit=` | paged results |
| `GET /api/runs/:id/export?format=csv\|xlsx\|json` | download |
| `POST /api/runs/:id/rerun` `{scope:"all"\|"failed"\|"skipped"}` | re-check, retry, or unlock |
| `POST /api/runs/:id/cancel` | stop |
| `GET /api/contacts?q=&format=csv` | contact book |

## Apify Actor

```bash
cd actor
npm install
npm run build          # syncs ../lib/engine into src/engine and bundles it
apify login && apify push
```

In the Apify Console, open Monetization, choose pay per event, and add the events `contact-site` (about $0.003 on the free tier, $0.002 on Gold) and `ai-summary`. Set the default memory to 512 MB (already set in `actor.json`). Store copy is in `actor/README.md`.

## Security notes

- Every outbound fetch (crawling and webhooks) goes through the SSRF guard, with DNS resolution on each redirect hop.
- The crawler identifies itself (`ContactExtractor/1.0`), honours robots.txt and does not bypass bot protection.
- RLS is on for every table. Clients can only read their own rows. All writes go through server routes using the secret key. The worker functions can be executed only by `service_role`.
- API keys are stored as SHA-256 hashes and shown once.
- CSV and Excel exports neutralise formula injection.
