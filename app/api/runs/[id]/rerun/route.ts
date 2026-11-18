import { after, NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { chainTick, createRun, UserError } from "@/lib/server/runs";
import { admin } from "@/utils/supabase/admin";

/** Re-run: scope "all" (check for changes), "failed" (retry unreachable sites) or "skipped" (unlock after a top-up). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { scope?: "all" | "failed" | "skipped" };
  const scope = body.scope === "failed" || body.scope === "skipped" ? body.scope : "all";
  const db = admin();
  const { data: parent } = await db.from("runs").select("*").eq("id", id).eq("user_id", caller.userId).maybeSingle();
  if (!parent) return jsonError(404, "Run not found.");
  let q = db.from("run_sites").select("input").eq("run_id", id).order("position").limit(100_000);
  if (scope === "failed") q = q.eq("status", "failed");
  if (scope === "skipped") q = q.eq("status", "skipped");
  const { data: sites } = await q;
  if (!sites?.length) return jsonError(400, "Nothing to re-run for that selection.");
  try {
    const label = scope === "all" ? "re-run" : scope === "failed" ? "retry failed" : "unlock skipped";
    const { run } = await createRun({
      userId: caller.userId,
      urls: sites.map((s) => s.input),
      name: `${parent.name} (${label})`.slice(0, 120),
      options: parent.options,
      webhookUrl: parent.webhook_url,
      source: "rerun",
      parentRunId: parent.id,
    });
    const origin = new URL(req.url).origin;
    after(() => chainTick(origin, run.id));
    return NextResponse.json({ run }, { status: 201 });
  } catch (err) {
    return jsonError(err instanceof UserError ? 400 : 500, err instanceof Error ? err.message : "Could not re-run.");
  }
}
