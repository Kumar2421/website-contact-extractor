import { NextResponse } from "next/server";
import { getCaller, jsonError } from "@/lib/server/auth";
import { admin } from "@/utils/supabase/admin";

/** The contact book: one row per domain across all runs. ?q=&offset=&limit=&format=csv */
export async function GET(req: Request) {
  const caller = await getCaller(req);
  if (!caller) return jsonError(401, "Unauthorized");
  const url = new URL(req.url);
  const format = url.searchParams.get("format");
  const limit = format === "csv" ? 50_000 : Math.min(200, Number(url.searchParams.get("limit")) || 50);
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  let q = admin().from("contacts").select("*", { count: "exact" }).eq("user_id", caller.userId).order("last_seen_at", { ascending: false }).range(offset, offset + limit - 1);
  const search = (url.searchParams.get("q") ?? "").trim().toLowerCase().replace(/[%_,()]/g, "");
  if (search) q = q.or(`domain.ilike.%${search}%,company_name.ilike.%${search}%,industry.ilike.%${search}%`);
  const { data, count, error } = await q;
  if (error) return jsonError(500, error.message);
  if (format === "csv") {
    const cell = (v: unknown) => {
      let s = Array.isArray(v) ? v.join("; ") : String(v ?? "");
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols = ["domain", "company_name", "industry", "summary", "country", "emails", "phones", "whatsapp", "contact_page", "first_seen_at", "last_seen_at", "times_seen"] as const;
    const body = (data ?? []).map((r) => cols.map((c) => cell((r as Record<string, unknown>)[c])).join(","));
    return new Response("﻿" + [cols.join(","), ...body].join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="contact-book.csv"' } });
  }
  return NextResponse.json({ contacts: data, total: count ?? 0, offset, limit });
}
