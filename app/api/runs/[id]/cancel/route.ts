import { NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { admin } from "@/utils/supabase/admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const { id } = await params;
  const db = admin();
  const { data: run } = await db
    .from("runs")
    .update({ status: "cancelled", finished_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", caller.userId)
    .in("status", ["queued", "running"])
    .select("*")
    .maybeSingle();
  if (!run) return jsonError(409, "Only queued or running runs can be cancelled.");
  await db.from("run_sites").update({ status: "skipped", status_note: "Run cancelled before this site was processed." }).eq("run_id", id).eq("status", "pending");
  const { data } = await db.rpc("refresh_run", { p_run: id });
  return NextResponse.json({ run: data });
}
