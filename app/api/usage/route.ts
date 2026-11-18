import { NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { getProfile, PLAN_LIMITS } from "@/lib/server/runs";
import { admin } from "@/utils/supabase/admin";

export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const profile = await getProfile(caller.userId);
  const { data: ledger } = await admin().from("credit_ledger").select("id, delta, reason, run_id, note, created_at").eq("user_id", caller.userId).order("created_at", { ascending: false }).limit(100);
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { count: usedThisMonth } = await admin().from("credit_ledger").select("id", { count: "exact", head: true }).eq("user_id", caller.userId).eq("reason", "contact_site").gte("created_at", monthStart.toISOString());
  return NextResponse.json({ profile, limits: PLAN_LIMITS[profile.plan] ?? PLAN_LIMITS.free, usedThisMonth: usedThisMonth ?? 0, ledger: ledger ?? [], email: caller.email });
}
