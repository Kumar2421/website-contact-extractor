import type { SiteResult } from "@/lib/engine/types";

export type Run = {
  id: string;
  name: string;
  status: "queued" | "running" | "completed" | "cancelled" | "failed";
  source: string;
  options: Record<string, unknown>;
  total: number;
  processed: number;
  found: number;
  empty: number;
  failed: number;
  charged: number;
  max_charge: number | null;
  parent_run_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type RunSite = {
  id: number;
  position: number;
  input: string;
  domain: string | null;
  status: "pending" | "processing" | "found" | "empty" | "failed" | "blocked" | "invalid" | "skipped";
  status_note: string | null;
  result: SiteResult | null;
  new_values: { emails: string[]; phones: string[]; whatsapp: string[]; firstTime: boolean } | null;
  charged: boolean;
  finished_at: string | null;
};

export type Profile = { plan: string; credits: number; monthly_grant: number; credits_reset_at: string };

export const CREDITS_EVENT = "credits:refresh";

export function refreshCredits() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CREDITS_EVENT));
}

export function go(hash: string) {
  window.location.hash = hash;
}

export function isActive(run: Pick<Run, "status">) {
  return run.status === "queued" || run.status === "running";
}

export function pct(n: number, d: number) {
  return d ? Math.round((n / d) * 100) : 0;
}

export const FAILURE_LABELS: Record<string, string> = {
  bot_protection: "Bot-protection wall",
  http_403: "Refused (403)",
  http_404: "Page not found",
  http_4xx: "Client error (4xx)",
  http_5xx: "Server error (5xx)",
  dns: "Domain does not resolve",
  timeout: "Timed out",
  tls: "Broken HTTPS",
  network: "Connection failed",
  robots: "Blocked by robots.txt",
  ssrf_blocked: "Private address",
  redirect_offsite: "Redirects elsewhere",
  invalid_url: "Not a website",
  not_html: "Not a web page",
  too_many_redirects: "Redirect loop",
  unknown: "Other",
};
