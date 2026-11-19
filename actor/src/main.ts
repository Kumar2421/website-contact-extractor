import { Actor, log } from "apify";
import { extractSite } from "./engine/crawl";
import { normalizeInput } from "./engine/crawl";
import { flattenResult } from "./engine/flatten";
import type { SiteResult } from "./engine/types";

/**
 * Website Contact Extractor (Apify Actor).
 * One dataset row per website. Charged per site where an email, phone or WhatsApp was found
 * (event "contact-site"); empty, blocked and unreachable sites are free and still get a row that
 * says why. Optional AI summary is charged separately ("ai-summary").
 */

type Input = {
  startUrls?: { url: string }[];
  websites?: string[];
  maxPagesPerSite?: number;
  includePhones?: boolean;
  includeSocials?: boolean;
  validateEmails?: boolean;
  aiSummary?: boolean;
  onlyWithContacts?: boolean;
  includeDetails?: boolean;
  maxConcurrency?: number;
};

await Actor.init();

const input = ((await Actor.getInput()) ?? {}) as Input;
const raw = [...(input.startUrls ?? []).map((s) => s.url), ...(input.websites ?? [])];
const seen = new Set<string>();
const sites: string[] = [];
for (const line of raw) {
  const url = normalizeInput(String(line ?? ""));
  if (!url) continue;
  const key = new URL(url).hostname.replace(/^www\./, "") + new URL(url).pathname.replace(/\/+$/, "");
  if (seen.has(key)) continue;
  seen.add(key);
  sites.push(url);
}

if (!sites.length) {
  // Never finish with an empty dataset: explain instead.
  await Actor.pushData({ status: "invalid", status_note: "No valid website addresses in the input. Add domains such as example.com or full URLs." });
  await Actor.exit({ statusMessage: "No valid websites in input." });
}

const aiEnabled = Boolean(input.aiSummary && process.env.GEMINI_API_KEY);
if (input.aiSummary && !aiEnabled) log.warning("aiSummary requested but GEMINI_API_KEY is not set on this Actor; skipping summaries.");

const options = {
  maxPagesPerSite: Math.min(15, Math.max(1, input.maxPagesPerSite ?? 8)),
  includePhones: input.includePhones ?? true,
  includeSocials: input.includeSocials ?? true,
  validateEmails: input.validateEmails ?? true,
  aiSummary: aiEnabled,
};
// Each site in flight holds a few parsed pages (tens of MB), so cap parallelism by the run's memory:
// about 82 MB baseline plus ~40 MB per concurrent site.
const memoryMb = Actor.getEnv().memoryMbytes ?? 512;
const memoryCap = Math.max(1, Math.floor((memoryMb - 120) / 40));
const concurrency = Math.min(memoryCap, 50, Math.max(1, input.maxConcurrency ?? 5));
const state = (await Actor.useState<{ done: string[]; found: number; empty: number; failed: number }>("progress", { done: [], found: 0, empty: 0, failed: 0 }))!;
const done = new Set(state.done);
const queue = sites.filter((s) => !done.has(s));
let budgetExhausted = false;

log.info(`Extracting contacts from ${sites.length} websites (${queue.length} left), concurrency ${concurrency}.`);

async function handle(url: string) {
  if (budgetExhausted) return;
  const result: SiteResult = await extractSite(url, options);
  let status: string = result.status;
  let note = result.statusNote;
  let row: SiteResult = result;
  if (result.status === "found") {
    const charge = await Actor.charge({ eventName: "contact-site" });
    if (charge.eventChargeLimitReached && charge.chargedCount === 0) {
      budgetExhausted = true;
      status = "skipped";
      note = "Your maximum charge for this run was reached before this site. Raise the limit and re-run.";
      row = { ...result, emails: [], phones: [], whatsapp: [], socials: {} };
    } else {
      if (options.aiSummary && result.company.summary) await Actor.charge({ eventName: "ai-summary" });
      state.found++;
    }
  } else if (result.status === "empty") state.empty++;
  else state.failed++;

  if (!(input.onlyWithContacts && status !== "found")) {
    await Actor.pushData({ ...flattenResult(row), status, status_note: note, ...(input.includeDetails ? { details: { emails: row.emails, phones: row.phones, whatsapp: row.whatsapp, socials: row.socials, company: row.company, pagesCrawled: row.pagesCrawled, flags: row.flags } } : {}) });
  }
  state.done.push(url);
  const n = state.done.length;
  if (n % 10 === 0 || n === sites.length) await Actor.setStatusMessage(`${n}/${sites.length} sites · ${state.found} with contacts · ${state.empty} empty · ${state.failed} unreachable`);
}

let i = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (i < queue.length && !budgetExhausted) {
      const url = queue[i++];
      try {
        await handle(url);
      } catch (err) {
        log.exception(err as Error, `Site failed: ${url}`);
      }
    }
  }),
);

const summary = `Done: ${state.found} of ${sites.length} websites had contacts (${state.empty} empty, ${state.failed} unreachable; those are free).${budgetExhausted ? " Stopped early: maximum charge reached." : ""}`;
if (input.onlyWithContacts && state.found === 0) await Actor.pushData({ status: "empty", status_note: "No contacts found on any website in this run. Nothing was charged." });
log.info(summary);
await Actor.exit({ statusMessage: summary });
