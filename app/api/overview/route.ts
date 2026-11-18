import { NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { getProfile } from "@/lib/server/runs";
import { admin } from "@/utils/supabase/admin";

const DAYS = 14;

export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const db = admin();
  // Window ends today (inclusive): 13 previous days + today.
  const since = new Date(Date.now() - (DAYS - 1) * 86_400_000);
  since.setUTCHours(0, 0, 0, 0);
  const [profile, runsRes, sitesRes, contactsRes, failRes] = await Promise.all([
    getProfile(caller.userId),
    db.from("runs").select("id, name, status, total, processed, found, charged, created_at").eq("user_id", caller.userId).order("created_at", { ascending: false }).limit(6),
    db.from("run_sites").select("status, finished_at, charged").eq("user_id", caller.userId).gte("finished_at", since.toISOString()).limit(50_000),
    db.from("contacts").select("domain", { count: "exact", head: true }).eq("user_id", caller.userId),
    db.from("run_sites").select("result->failure").eq("user_id", caller.userId).in("status", ["failed", "blocked"]).gte("finished_at", since.toISOString()).limit(20_000),
  ]);
  const sites = sitesRes.data ?? [];
  const days = Array.from({ length: DAYS }, (_, i) => new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10));
  const idx = new Map(days.map((d, i) => [d, i]));
  const processed = new Array(DAYS).fill(0);
  const found = new Array(DAYS).fill(0);
  const charged = new Array(DAYS).fill(0);
  const outcome: Record<string, number> = { found: 0, empty: 0, failed: 0, skipped: 0 };
  for (const s of sites) {
    const i = idx.get((s.finished_at ?? "").slice(0, 10));
    const key = s.status === "blocked" || s.status === "invalid" ? "failed" : s.status;
    if (key in outcome) outcome[key] += 1;
    if (i === undefined) continue;
    processed[i] += 1;
    if (s.status === "found") found[i] += 1;
    if (s.charged) charged[i] += 1;
  }
  const reasons: Record<string, number> = {};
  for (const r of (failRes.data ?? []) as { failure: string | null }[]) {
    const k = r.failure ?? "unknown";
    reasons[k] = (reasons[k] ?? 0) + 1;
  }
  const total = processed.reduce((a, b) => a + b, 0);
  const totalFound = found.reduce((a, b) => a + b, 0);
  return NextResponse.json({
    profile,
    stats: { sites14d: total, found14d: totalFound, hitRate: total ? Math.round((totalFound / total) * 100) : 0, contacts: contactsRes.count ?? 0 },
    trends: { days, processed, found, charged },
    outcome,
    failureReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 6),
    recentRuns: runsRes.data ?? [],
  });
}
