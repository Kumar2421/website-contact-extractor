import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

function safeNext(raw: FormDataEntryValue | string | null | undefined) {
  const next = String(raw ?? "/app");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/app";
}

async function signIn(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=1&next=${encodeURIComponent(safeNext(formData.get("next")))}`);
  redirect(safeNext(formData.get("next")));
}

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; checkEmail?: string }> }) {
  const params = await searchParams;
  return (
    <main className="auth">
      <section className="auth-card">
        <div className="eyebrow">CONTACT EXTRACTOR / SIGN IN</div>
        <h1>Sign in</h1>
        <p>Find emails, phones, WhatsApp and social profiles on any list of business websites.</p>
        {params.checkEmail && <div className="auth-ok">Check your inbox to confirm your email, then sign in.</div>}
        {params.error && <div className="auth-error">Invalid email or password.</div>}
        <form action={signIn}>
          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <input name="next" type="hidden" value={params.next ?? "/app"} />
          <button type="submit">Sign in</button>
        </form>
        <div className="auth-note">
          No account? <Link href="/signup">Create one free</Link>. 200 credits every month, and sites with no contact found are never charged.
        </div>
      </section>
    </main>
  );
}
