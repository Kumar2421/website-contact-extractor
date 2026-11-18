import { NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { admin } from "@/utils/supabase/admin";

const GROUPS: Record<string, string[]> = {
  found: ["found"],
  empty: ["empty"],
  failed: ["failed", "blocked", "invalid"],
  skipped: ["skipped"],
  pending: ["pending", "processing"],
};

/** Paged site results. ?status=found|empty|failed|skipped|pending&q=domain&offset=0&limit=50 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const { id } = await params;
  const url = new URL(req.url);
  const db = admin();
  const { data: run } = await db.from("runs").select("id").eq("id", id).eq("user_id", caller.userId).maybeSingle();
  if (!run) return jsonError(404, "Run not found.");
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  let q = db
    .from("run_sites")
    .select("id, position, input, domain, status, status_note, result, new_values, charged, finished_at", { count: "exact" })
    .eq("run_id", id)
    .order("position")
    .range(offset, offset + limit - 1);
  const group = GROUPS[url.searchParams.get("status") ?? ""];
  if (group) q = q.in("status", group);
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase().replace(/[%_,()]/g, "");
  if (search) q = q.ilike("domain", `%${search}%`);
  const { data, count, error } = await q;
  if (error) return jsonError(500, error.message);
  return NextResponse.json({ sites: data, total: count ?? 0, offset, limit });
}
