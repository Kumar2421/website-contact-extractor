import "server-only";
import { admin } from "@/utils/supabase/admin";
import { extractSite, normalizeInput } from "@/lib/engine/crawl";
import { assertPublicHttpUrlResolved } from "@/lib/engine/ssrf";
import { DEFAULT_OPTIONS, type ExtractOptions, type SiteResult } from "@/lib/engine/types";
import type { Json } from "@/lib/database.types";

/**
 * Run lifecycle on serverless: a run is a Postgres queue of sites. Each "tick" claims a small batch
 * (FOR UPDATE SKIP LOCKED, so parallel ticks never double-process), crawls it inside the function's
 * time budget, stores results, charges one credit per site with a contact, and closes the run when
 * nothing is left. Ticks come from the open browser tab, from API status polls, from self-chaining
 * after() calls and from a cron fallback.
 */

export const PLAN_LIMITS: Record<string, { maxSitesPerRun: number; label: string }> = {
  free: { maxSitesPerRun: 500, label: "Free" },
  starter: { maxSitesPerRun: 5_000, label: "Starter" },
  pro: { maxSitesPerRun: 25_000, label: "Pro" },
  scale: { maxSitesPerRun: 100_000, label: "Scale" },
};

export type RunOptions = Pick<ExtractOptions, "maxPagesPerSite" | "includePhones" | "includeSocials" | "validateEmails" | "aiSummary" | "respectRobots">;

export function sanitizeOptions(raw: unknown): RunOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const bool = (k: string, d: boolean) => (typeof o[k] === "boolean" ? (o[k] as boolean) : d);
  const pages = Number(o.maxPagesPerSite);
  return {
    maxPagesPerSite: Number.isFinite(pages) ? Math.min(15, Math.max(1, Math.round(pages))) : DEFAULT_OPTIONS.maxPagesPerSite,
    includePhones: bool("includePhones", true),
    includeSocials: bool("includeSocials", true),
    validateEmails: bool("validateEmails", true),
    aiSummary: bool("aiSummary", false) && Boolean(process.env.GEMINI_API_KEY),
    respectRobots: true,
  };
}

/** Dedupe by normalised host+path, drop junk lines, keep order. */
export function prepareInputs(lines: string[]): { valid: string[]; invalid: string[]; duplicates: number } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const url = normalizeInput(line);
    if (!url) {
      invalid.push(line.slice(0, 200));
      continue;
    }
    const u = new URL(url);
    const key = `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase();
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    valid.push(url);
  }
  return { valid, invalid, duplicates };
}

export async function getProfile(userId: string) {
  const { data, error } = await admin().rpc("apply_monthly_grant", { p_user: userId });
  if (error) throw new Error(error.message);
  if (data && (data as { user_id?: string }).user_id) return data as Profile;
  // Users created before the trigger existed: create the profile now.
  await admin().from("profiles").upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  const { data: p } = await admin().from("profiles").select("*").eq("user_id", userId).single();
  return p as Profile;
}

export type Profile = {
  user_id: string;
  plan: string;
  credits: number;
  monthly_grant: number;
  credits_reset_at: string;
  default_options: Json;
  webhook_url: string | null;
};

export async function validateWebhook(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  const u = await assertPublicHttpUrlResolved(url.trim());
  if (u.protocol !== "https:") throw new Error("Webhook URL must use https.");
  return u.toString();
}

export async function createRun(args: {
  userId: string;
  urls: string[];
  name?: string;
  options?: unknown;
  webhookUrl?: string | null;
  maxCharge?: number | null;
  source: "app" | "api" | "rerun";
  parentRunId?: string | null;
}) {
  const profile = await getProfile(args.userId);
  const limit = PLAN_LIMITS[profile.plan] ?? PLAN_LIMITS.free;
  const { valid, invalid, duplicates } = prepareInputs(args.urls);
  if (!valid.length) throw new UserError("No valid website addresses in the input.");
  if (valid.length > limit.maxSitesPerRun) throw new UserError(`Your plan allows ${limit.maxSitesPerRun.toLocaleString()} sites per run. Split the list or upgrade.`);
  if (profile.credits <= 0) throw new UserError("You have no credits left. Empty sites are free, but each site with a contact costs one credit.");
  const webhook = await validateWebhook(args.webhookUrl ?? profile.webhook_url).catch(() => {
    throw new UserError("The webhook URL must be a public https address.");
  });
  const maxCharge = args.maxCharge && args.maxCharge > 0 ? Math.floor(args.maxCharge) : null;
  const options = sanitizeOptions(args.options ?? profile.default_options);
  const name = (args.name ?? "").trim().slice(0, 120) || defaultName(valid);

  const db = admin();
  const { data: run, error } = await db
    .from("runs")
    .insert({ user_id: args.userId, name, options: options as unknown as Json, total: valid.length, webhook_url: webhook, max_charge: maxCharge, source: args.source, parent_run_id: args.parentRunId ?? null })
    .select("*")
    .single();
  if (error || !run) throw new Error(error?.message ?? "Could not create the run.");
  for (let i = 0; i < valid.length; i += 1000) {
    const chunk = valid.slice(i, i + 1000).map((input, j) => ({ run_id: run.id, user_id: args.userId, position: i + j, input, domain: hostOf(input) }));
    const { error: e } = await db.from("run_sites").insert(chunk);
    if (e) {
      await db.from("runs").update({ status: "failed" }).eq("id", run.id);
      throw new Error(e.message);
    }
  }
  return { run, invalid, duplicates };
}

export class UserError extends Error {}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function defaultName(urls: string[]): string {
  const first = hostOf(urls[0]) ?? "sites";
  return urls.length === 1 ? first : `${first} + ${urls.length - 1} more`;
}

const BATCH = 6;

/**
 * Process one run until the time budget is spent. Returns the refreshed run row.
 * Budget leaves headroom for the slowest site (40 s deadline) inside a 60 s function.
 */
export async function tickRun(runId: string, budgetMs = 15_000) {
  const db = admin();
  const started = Date.now();
  const { data: run } = await db.from("runs").select("*").eq("id", runId).single();
  if (!run || run.status === "cancelled" || run.status === "completed" || run.status === "failed") return run;
  const options: ExtractOptions = { ...DEFAULT_OPTIONS, ...sanitizeOptions(run.options) };

  while (Date.now() - started < budgetMs) {
    const { data: claimed, error } = await db.rpc("claim_sites", { p_run: runId, p_limit: BATCH });
    if (error) throw new Error(error.message);
    const sites = (claimed ?? []) as { id: number; input: string; user_id: string }[];
    if (!sites.length) break;
    await Promise.all(sites.map((s) => processSite(s, runId, options)));
    await db.rpc("refresh_run", { p_run: runId }); // live counters for pollers between batches
    // Stop early if the run was cancelled meanwhile.
    const { data: now } = await db.from("runs").select("status").eq("id", runId).single();
    if (now?.status === "cancelled") break;
  }
  await giveUpExhausted(runId);
  const { data: refreshed } = await db.rpc("refresh_run", { p_run: runId });
  const r = refreshed as unknown as typeof run;
  if (r?.status === "completed" && !r.webhook_sent_at) await sendWebhook(r);
  return r;
}

/** Sites that crashed a worker three times are closed as failed so the run can finish. */
async function giveUpExhausted(runId: string) {
  await admin()
    .from("run_sites")
    .update({ status: "failed", status_note: "Processing failed repeatedly.", finished_at: new Date().toISOString() })
    .eq("run_id", runId)
    .eq("status", "processing")
    .gte("attempts", 3)
    .lt("claimed_at", new Date(Date.now() - 3 * 60_000).toISOString());
}

async function processSite(site: { id: number; input: string; user_id: string }, runId: string, options: ExtractOptions) {
  const db = admin();
  let result: SiteResult;
  try {
    result = await extractSite(site.input, options);
  } catch (err) {
    await db.from("run_sites").update({ status: "failed", status_note: `Unexpected error: ${String(err).slice(0, 200)}`, finished_at: new Date().toISOString() }).eq("id", site.id);
    return;
  }
  let status: string = result.status;
  let note = result.statusNote;
  let newValues: Json | null = null;
  if (result.status === "found") {
    const { data: charged } = await db.rpc("charge_site", { p_site: site.id });
    if (!charged) {
      // Out of credits or the run's spending cap: keep the row visible but withhold the contact data.
      status = "skipped";
      note = "A contact was found, but you are out of credits (or reached this run's spending cap). Top up and re-run to unlock it.";
      result = { ...result, emails: [], phones: [], whatsapp: [], socials: {} };
    } else {
      newValues = await upsertContact(site.user_id, runId, result);
    }
  }
  await db
    .from("run_sites")
    .update({ status, status_note: note, domain: result.domain, result: result as unknown as Json, new_values: newValues, finished_at: new Date().toISOString() })
    .eq("id", site.id);
}

/** Merge into the user's contact book and return what is new since the last time we saw this domain. */
async function upsertContact(userId: string, runId: string, r: SiteResult): Promise<Json | null> {
  if (!r.domain) return null;
  const db = admin();
  const { data: prev } = await db.from("contacts").select("emails, phones, whatsapp, times_seen").eq("user_id", userId).eq("domain", r.domain).maybeSingle();
  const emails = r.emails.filter((e) => e.mx !== "invalid").map((e) => e.value);
  const phones = r.phones.map((p) => p.e164);
  const wa = r.whatsapp.map((w) => w.number ?? w.link);
  const fresh = prev
    ? { emails: emails.filter((e) => !prev.emails.includes(e)), phones: phones.filter((p) => !prev.phones.includes(p)), whatsapp: wa.filter((w) => !prev.whatsapp.includes(w)), firstTime: false }
    : { emails, phones, whatsapp: wa, firstTime: true };
  const socials = Object.fromEntries(Object.entries(r.socials).map(([k, v]) => [k, (v ?? []).map((s) => s.url)]));
  await db.from("contacts").upsert(
    {
      user_id: userId,
      domain: r.domain,
      company_name: r.company.name,
      summary: r.company.summary,
      industry: r.company.industry,
      country: r.company.country,
      emails: [...new Set([...emails, ...(prev?.emails ?? [])])].slice(0, 50),
      phones: [...new Set([...phones, ...(prev?.phones ?? [])])].slice(0, 30),
      whatsapp: [...new Set([...wa, ...(prev?.whatsapp ?? [])])].slice(0, 10),
      socials: socials as Json,
      contact_page: r.contactPageUrl,
      last_seen_at: new Date().toISOString(),
      last_run_id: runId,
      times_seen: (prev?.times_seen ?? 0) + 1,
    },
    { onConflict: "user_id,domain" },
  );
  return fresh as unknown as Json;
}

async function sendWebhook(run: { id: string; webhook_url: string | null; name: string; status: string; total: number; found: number; empty: number; failed: number; charged: number }) {
  const db = admin();
  // Claim the send first so concurrent ticks deliver it once.
  const { data: claimed } = await db.from("runs").update({ webhook_sent_at: new Date().toISOString() }).eq("id", run.id).is("webhook_sent_at", null).select("id");
  if (!claimed?.length || !run.webhook_url) return;
  try {
    const target = await validateWebhook(run.webhook_url);
    if (!target) return;
    const app = process.env.NEXT_PUBLIC_APP_URL ?? "";
    await fetch(target, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", "User-Agent": "ContactExtractor-Webhook/1.0" },
      body: JSON.stringify({
        event: "run.completed",
        runId: run.id,
        name: run.name,
        status: run.status,
        counts: { total: run.total, found: run.found, empty: run.empty, failed: run.failed, charged: run.charged },
        resultsUrl: `${app}/api/runs/${run.id}/results`,
        exportCsvUrl: `${app}/api/runs/${run.id}/export?format=csv`,
      }),
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Webhooks are best effort; the run itself is complete.
  }
}

/** Fire-and-forget the next tick so runs finish with no browser open. */
export function chainTick(origin: string, runId: string) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Promise.resolve();
  return fetch(`${origin}/api/runs/${runId}/tick`, { method: "POST", headers: { "x-internal-secret": secret, "x-chain": "1" }, signal: AbortSignal.timeout(2_500) })
    .then(() => undefined)
    .catch(() => undefined);
}
