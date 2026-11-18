import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

async function signUp(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) redirect("/signup?error=short");
  const h = await headers();
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback?next=/app` } });
  if (error) redirect(`/signup?error=${encodeURIComponent(error.message.slice(0, 120))}`);
  // With email confirmation on, there is no session yet.
  if (!data.session) redirect("/login?checkEmail=1");
  redirect("/app#new");
}

export default async function Signup({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const error = params.error === "short" ? "Use at least 8 characters for the password." : params.error;
  return (
    <main className="auth">
      <section className="auth-card">
        <div className="eyebrow">CONTACT EXTRACTOR / CREATE ACCOUNT</div>
        <h1>Start free</h1>
        <p>200 free credits every month. One credit per website where we find a contact. Empty and unreachable sites cost nothing.</p>
        {error && <div className="auth-error">{error}</div>}
        <form action={signUp}>
          <label>
            Work email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="new-password" minLength={8} required />
          </label>
          <button type="submit">Create account</button>
        </form>
        <div className="auth-note">
          Already registered? <Link href="/login">Sign in</Link>. We only read pages businesses publish themselves and honour robots.txt.
        </div>
      </section>
    </main>
  );
}
