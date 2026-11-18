import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { admin } from "@/utils/supabase/admin";

export type Caller = { userId: string; email: string | null; via: "session" | "api_key" };

export const KEY_PREFIX = "ce_live_";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function newApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${KEY_PREFIX}${randomBytes(24).toString("base64url")}`;
  return { key, prefix: key.slice(0, KEY_PREFIX.length + 6), hash: hashKey(key) };
}

/** Session cookie (web app) or `Authorization: Bearer ce_live_...` (API, agents, Zapier). */
export async function getCaller(req?: Request): Promise<Caller | null> {
  const auth = req?.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(\S+)$/i.exec(auth)?.[1];
  if (bearer?.startsWith(KEY_PREFIX)) {
    const { data } = await admin().from("api_keys").select("id, user_id, revoked_at").eq("key_hash", hashKey(bearer)).maybeSingle();
    const row = data as { id: string; user_id: string; revoked_at: string | null } | null;
    if (!row || row.revoked_at) return null;
    // Query builders are lazy: .then() is what actually sends the request.
    void admin().from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", row.id).then(() => undefined, () => undefined);
    return { userId: row.user_id, email: null, via: "api_key" };
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  return { userId: data.user.id, email: data.user.email ?? null, via: "session" };
}

export function jsonError(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export function isInternal(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}` || req.headers.get("x-internal-secret") === secret;
}
