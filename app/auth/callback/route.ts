import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

/** Email-confirmation and magic-link landing: exchange the code for a session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const nextRaw = url.searchParams.get("next") ?? "/app";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/app";
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=1", url.origin));
}
