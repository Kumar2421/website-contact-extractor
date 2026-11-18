import { getCaller, jsonError } from "@/lib/server/auth";
import { csvFor, xlsxFor, type ExportSite } from "@/lib/server/export";
import { admin } from "@/utils/supabase/admin";

export const maxDuration = 60;

/** ?format=csv|xlsx|json&status=found|all */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const { id } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "csv";
  const onlyFound = url.searchParams.get("status") === "found";
  const db = admin();
  const { data: run } = await db.from("runs").select("id, name").eq("id", id).eq("user_id", caller.userId).maybeSingle();
  if (!run) return jsonError(404, "Run not found.");

  const sites: ExportSite[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from("run_sites").select("input, status, status_note, result").eq("run_id", id).order("position").range(from, from + 999);
    if (onlyFound) q = q.eq("status", "found");
    const { data, error } = await q;
    if (error) return jsonError(500, error.message);
    sites.push(...((data ?? []) as unknown as ExportSite[]));
    if (!data || data.length < 1000) break;
  }
  const base = run.name.replace(/[^\w.-]+/g, "_").slice(0, 60) || "contacts";
  if (format === "json") {
    return new Response(JSON.stringify(sites.map((s) => s.result ?? { input: s.input, status: s.status, statusNote: s.status_note }), null, 2), {
      headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${base}.json"` },
    });
  }
  if (format === "xlsx") {
    const buf = await xlsxFor(sites);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${base}.xlsx"` },
    });
  }
  return new Response(csvFor(sites), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${base}.csv"` } });
}
