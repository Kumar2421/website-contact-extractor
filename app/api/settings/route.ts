import { NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { sanitizeOptions, validateWebhook } from "@/lib/server/runs";
import { aiConfigured } from "@/lib/engine/summarize";
import { admin } from "@/utils/supabase/admin";
import type { Json } from "@/lib/database.types";

export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const { data } = await admin().from("profiles").select("default_options, webhook_url").eq("user_id", caller.userId).maybeSingle();
  return NextResponse.json({ defaults: sanitizeOptions(data?.default_options), webhookUrl: data?.webhook_url ?? null, aiAvailable: aiConfigured() });
}

export async function POST(req: Request) {
  const caller = await getCaller(req);
  if (!caller || caller.via !== "session") return jsonError(401, "Unauthorized");
  const body = (await req.json().catch(() => ({}))) as { defaults?: unknown; webhookUrl?: string | null };
  let webhook: string | null = null;
  try {
    webhook = await validateWebhook(body.webhookUrl || null);
  } catch {
    return jsonError(400, "The webhook URL must be a public https address.");
  }
  const defaults = sanitizeOptions(body.defaults);
  const { error } = await admin().from("profiles").update({ default_options: defaults as unknown as Json, webhook_url: webhook }).eq("user_id", caller.userId);
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ ok: true, defaults, webhookUrl: webhook });
}
