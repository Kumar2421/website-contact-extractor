/**
 * End-to-end check against a running app (default http://localhost:3000) and its Supabase:
 * creates a throwaway user + API key, starts a run over the API, polls it to completion, checks
 * credits were charged only for found sites, exports CSV/XLSX/JSON, and tests the guards.
 * Usage: node --env-file=.env.local --import tsx scripts/e2e.mts [sites-file] [count]
 */
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const file = process.argv[2] ?? "scripts/bench-sites.txt";
const count = Number(process.argv[3] ?? 25);
const sites = readFileSync(file, "utf8").split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#")).slice(0, count);
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });

function check(cond: unknown, msg: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) process.exitCode = 1;
}

const email = `e2e-${Date.now()}@example.test`;
const { data: created, error } = await db.auth.admin.createUser({ email, password: randomBytes(12).toString("hex"), email_confirm: true });
if (error || !created.user) throw error;
const userId = created.user.id;
const key = `ce_live_${randomBytes(24).toString("base64url")}`;
await db.from("api_keys").insert({ user_id: userId, name: "e2e", prefix: key.slice(0, 14), key_hash: createHash("sha256").update(key).digest("hex") });
const H = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

const { data: prof } = await db.from("profiles").select("credits").eq("user_id", userId).single();
check(prof?.credits === 200, "signup trigger grants 200 credits");

check((await fetch(`${BASE}/api/runs`)).status === 401, "no key -> 401");
check((await fetch(`${BASE}/api/runs`, { headers: { Authorization: "Bearer ce_live_wrong" } })).status === 401, "bad key -> 401");
const priv = await fetch(`${BASE}/api/runs`, { method: "POST", headers: H, body: JSON.stringify({ urls: ["x"], webhookUrl: "https://127.0.0.1/hook" }) });
check(priv.status === 400, "private webhook or junk input rejected");

const t0 = Date.now();
const res = await fetch(`${BASE}/api/runs`, { method: "POST", headers: H, body: JSON.stringify({ name: "e2e", urls: [...sites, sites[0], "not a url", "http://localhost/"], options: { aiSummary: true } }) });
const created2 = (await res.json()) as { run: { id: string; total: number }; skipped: { invalid: string[]; duplicates: number } };
check(res.status === 201, `run created (${created2.run?.total} sites, ${created2.skipped?.duplicates} dupes, ${created2.skipped?.invalid.length} invalid)`);
const id = created2.run.id;

let run: Record<string, number | string> = {};
for (let i = 0; i < 200; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  run = ((await (await fetch(`${BASE}/api/runs/${id}`, { headers: H })).json()) as { run: typeof run }).run;
  process.stdout.write(`\r  ${run.status} ${run.processed}/${run.total} found=${run.found} charged=${run.charged}   `);
  if (run.status === "completed") break;
}
console.log(`\n  took ${((Date.now() - t0) / 1000).toFixed(0)}s with no browser open`);
check(run.status === "completed", "run completes via API polling + chaining alone");
check(run.charged === run.found, `charged (${run.charged}) == sites found (${run.found})`);
const { data: after } = await db.from("profiles").select("credits").eq("user_id", userId).single();
check(after?.credits === 200 - Number(run.charged), `credits ${after?.credits} = 200 - ${run.charged}`);

const results = (await (await fetch(`${BASE}/api/runs/${id}/results?status=found&limit=100`, { headers: H })).json()) as { sites: { result: { emails: { sources: string[] }[]; company: { summary: string | null } } }[] };
check(results.sites.every((s) => s.result.emails.every((e) => e.sources.length > 0)), "every email carries a source URL");
check(results.sites.some((s) => s.result.company.summary), "AI summaries present on found sites");
const csv = await fetch(`${BASE}/api/runs/${id}/export?format=csv`, { headers: H });
check(csv.ok && (await csv.text()).split("\n").length >= Number(run.total), "CSV export has a row per site");
const xlsx = await fetch(`${BASE}/api/runs/${id}/export?format=xlsx`, { headers: H });
check(xlsx.ok && (await xlsx.arrayBuffer()).byteLength > 2000, "XLSX export");
const json = await fetch(`${BASE}/api/runs/${id}/export?format=json`, { headers: H });
check(json.ok, "JSON export");

// Another user cannot see this run.
const other = `ce_live_${randomBytes(24).toString("base64url")}`;
const { data: u2 } = await db.auth.admin.createUser({ email: `e2e-b-${Date.now()}@example.test`, password: randomBytes(12).toString("hex"), email_confirm: true });
await db.from("api_keys").insert({ user_id: u2!.user!.id, name: "e2e", prefix: other.slice(0, 14), key_hash: createHash("sha256").update(other).digest("hex") });
check((await fetch(`${BASE}/api/runs/${id}`, { headers: { Authorization: `Bearer ${other}` } })).status === 404, "other user gets 404 for this run");

const rerun = await fetch(`${BASE}/api/runs/${id}/rerun`, { method: "POST", headers: H, body: JSON.stringify({ scope: "failed" }) });
check(rerun.status === 201 || rerun.status === 400, `retry-failed endpoint responds (${rerun.status})`);
if (rerun.status === 201) {
  const rid = ((await rerun.json()) as { run: { id: string } }).run.id;
  await fetch(`${BASE}/api/runs/${rid}/cancel`, { method: "POST", headers: H });
}

const counts: Record<string, number> = {};
const { data: rows } = await db.from("run_sites").select("status, result->failure").eq("run_id", id);
for (const r of rows ?? []) counts[`${r.status}${(r as { failure?: string }).failure ? `:${(r as { failure?: string }).failure}` : ""}`] = (counts[`${r.status}${(r as { failure?: string }).failure ? `:${(r as { failure?: string }).failure}` : ""}`] ?? 0) + 1;
console.log("  outcomes:", counts);

await db.auth.admin.deleteUser(userId);
await db.auth.admin.deleteUser(u2!.user!.id);
console.log(process.exitCode ? "E2E FAILED" : "E2E PASSED");
