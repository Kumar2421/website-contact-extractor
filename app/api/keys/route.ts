import { NextResponse } from "next/server";
import { getCaller, jsonError, newApiKey } from "@/lib/server/auth";
import { admin } from "@/utils/supabase/admin";

// API keys are managed from the signed-in app only, never with another API key.
async function sessionCaller(req: Request) {
  const c = await getCaller(req);
  return c?.via === "session" ? c : null;
}

export async function GET(req: Request) {
  const caller = await sessionCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const { data } = await admin().from("api_keys").select("id, name, prefix, created_at, last_used_at, revoked_at").eq("user_id", caller.userId).order("created_at", { ascending: false });
  return NextResponse.json({ keys: data ?? [] });
}

/** Create a key. The full key is returned once and only its SHA-256 hash is stored. */
export async function POST(req: Request) {
  const caller = await sessionCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "").trim().slice(0, 60) || "API key";
  const { count } = await admin().from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", caller.userId).is("revoked_at", null);
  if ((count ?? 0) >= 10) return jsonError(400, "You can have at most 10 active keys. Revoke one first.");
  const k = newApiKey();
  const { data, error } = await admin().from("api_keys").insert({ user_id: caller.userId, name, prefix: k.prefix, key_hash: k.hash }).select("id, name, prefix, created_at").single();
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ key: k.key, record: data }, { status: 201 });
}

export async function DELETE(req: Request) {
  const caller = await sessionCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return jsonError(400, "Missing id.");
  const { data } = await admin().from("api_keys").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", caller.userId).is("revoked_at", null).select("id");
  if (!data?.length) return jsonError(404, "Key not found.");
  return NextResponse.json({ ok: true });
}
