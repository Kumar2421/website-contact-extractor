import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

let cached: ReturnType<typeof createClient<Database>> | null = null;

/** Service-role client. Server only: bypasses RLS, so every caller must check ownership itself. */
export function admin() {
  if (cached) return cached;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY is not configured");
  cached = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}
