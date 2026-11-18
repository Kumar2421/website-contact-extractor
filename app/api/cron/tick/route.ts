import { NextResponse } from "next/server";
import { isInternal, jsonError } from "@/lib/server/auth";
import { tickRun } from "@/lib/server/runs";
import { admin } from "@/utils/supabase/admin";

export const maxDuration = 60;

/** Safety net: advance the oldest active runs in case a chain broke. Vercel Cron sends CRON_SECRET as a Bearer token. */
export async function GET(req: Request) {
  if (!isInternal(req)) return jsonError(401, "Unauthorized");
  const { data: runs } = await admin().from("runs").select("id").in("status", ["queued", "running"]).order("created_at").limit(3);
  const results = [];
  for (const r of runs ?? []) {
    const run = await tickRun(r.id, 12_000);
    results.push({ id: r.id, status: run?.status, processed: run?.processed, total: run?.total });
  }
  return NextResponse.json({ advanced: results });
}
