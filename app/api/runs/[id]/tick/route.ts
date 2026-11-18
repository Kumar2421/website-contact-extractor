import { after, NextResponse } from "next/server";
import { getCaller, isInternal, jsonError } from "@/lib/server/auth";
import { chainTick, tickRun } from "@/lib/server/runs";
import { admin } from "@/utils/supabase/admin";

export const maxDuration = 60;

/** Process a batch of a run. Called by the open run page, by after() chaining and by the cron fallback. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const internal = isInternal(req);
  if (!internal) {
    const caller = await getCaller(req);
    if (!caller) return jsonError(401, "Unauthorized");
    const { data } = await admin().from("runs").select("id").eq("id", id).eq("user_id", caller.userId).maybeSingle();
    if (!data) return jsonError(404, "Run not found.");
  }
  try {
    const run = await tickRun(id);
    if (internal && req.headers.get("x-chain") === "1" && run && (run.status === "queued" || run.status === "running")) {
      const origin = new URL(req.url).origin;
      after(() => chainTick(origin, id));
    }
    return NextResponse.json({ run });
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : "Tick failed.");
  }
}
