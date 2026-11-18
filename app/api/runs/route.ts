import { after, NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { chainTick, createRun, UserError } from "@/lib/server/runs";
import { admin } from "@/utils/supabase/admin";

export const maxDuration = 60;

/** Create a run. Body: { urls: string[] | string, name?, options?, webhookUrl?, maxCharge? } */
export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Sign in or send an API key (Authorization: Bearer ce_live_...).");
  const body = (await req.json().catch(() => null)) as { urls?: unknown; name?: string; options?: unknown; webhookUrl?: string; maxCharge?: number } | null;
  if (!body) return jsonError(400, "Send a JSON body.");
  const urls = Array.isArray(body.urls) ? body.urls.map(String) : typeof body.urls === "string" ? body.urls.split(/[\r\n,]+/) : [];
  if (urls.length > 100_000) return jsonError(413, "At most 100,000 lines per request.");
  try {
    const { run, invalid, duplicates } = await createRun({
      userId: caller.userId,
      urls,
      name: body.name,
      options: body.options,
      webhookUrl: body.webhookUrl,
      maxCharge: body.maxCharge,
      source: caller.via === "api_key" ? "api" : "app",
    });
    const origin = new URL(req.url).origin;
    after(() => chainTick(origin, run.id));
    return NextResponse.json({ run, skipped: { invalid, duplicates } }, { status: 201 });
  } catch (err) {
    if (err instanceof UserError) return jsonError(400, err.message);
    return jsonError(500, err instanceof Error ? err.message : "Could not create the run.");
  }
}

export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const url = new URL(req.url);
  const limit = Math.min(100, Number(url.searchParams.get("limit")) || 50);
  const { data, error } = await admin().from("runs").select("*").eq("user_id", caller.userId).order("created_at", { ascending: false }).limit(limit);
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ runs: data });
}
