import { after, NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { chainTick } from "@/lib/server/runs";
import { admin } from "@/utils/supabase/admin";

/** Run status. Polling an active run also nudges processing, so API users need no extra call. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const { id } = await params;
  const { data: run } = await admin().from("runs").select("*").eq("id", id).eq("user_id", caller.userId).maybeSingle();
  if (!run) return jsonError(404, "Run not found.");
  if (run.status === "queued" || run.status === "running") {
    const origin = new URL(req.url).origin;
    after(() => chainTick(origin, run.id));
  }
  return NextResponse.json({ run });
}
