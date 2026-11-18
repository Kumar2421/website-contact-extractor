import "server-only";
import ExcelJS from "exceljs";
import { FLAT_COLUMNS, flattenResult, toCsv, type FlatRow } from "@/lib/engine/flatten";
import type { SiteResult } from "@/lib/engine/types";

export type ExportSite = { input: string; status: string; status_note: string | null; result: SiteResult | null };

export function rowsFor(sites: ExportSite[]): FlatRow[] {
  return sites.map((s) => {
    if (s.result) return { ...flattenResult(s.result), status: s.status, status_note: s.status_note ?? s.result.statusNote };
    const blank = Object.fromEntries(FLAT_COLUMNS.map((c) => [c, ""])) as FlatRow;
    return { ...blank, input: s.input, status: s.status, status_note: s.status_note ?? "", pages_crawled: 0 };
  });
}

export function csvFor(sites: ExportSite[]): string {
  return toCsv(rowsFor(sites));
}

/** Two sheets: one row per site, and one row per email with its source page and quality flags. */
export async function xlsxFor(sites: ExportSite[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Contact Extractor";
  const sheet = wb.addWorksheet("Sites", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = FLAT_COLUMNS.map((c) => ({ header: c, key: c, width: /note|summary|sources|emails|phones/.test(c) ? 40 : 22 }));
  for (const r of rowsFor(sites)) sheet.addRow(safeRow(r));
  sheet.getRow(1).font = { bold: true };
  sheet.autoFilter = { from: "A1", to: { row: 1, column: FLAT_COLUMNS.length } };

  const emails = wb.addWorksheet("Emails", { views: [{ state: "frozen", ySplit: 1 }] });
  emails.columns = [
    { header: "domain", key: "domain", width: 26 },
    { header: "email", key: "email", width: 32 },
    { header: "kind", key: "kind", width: 10 },
    { header: "confidence", key: "confidence", width: 11 },
    { header: "mx", key: "mx", width: 9 },
    { header: "own_domain", key: "own", width: 11 },
    { header: "free_provider", key: "free", width: 12 },
    { header: "found_via", key: "via", width: 18 },
    { header: "source_page", key: "source", width: 50 },
  ];
  for (const s of sites) {
    for (const e of s.result?.emails ?? []) {
      emails.addRow(safeRow({ domain: s.result?.domain ?? "", email: e.value, kind: e.kind, confidence: e.confidence, mx: e.mx, own: e.ownDomain ? "yes" : "no", free: e.freeProvider ? "yes" : "no", via: e.via.join(", "), source: e.sources[0] ?? "" }));
    }
  }
  emails.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Scraped text must never become a live formula in Excel. */
function safeRow<T extends Record<string, string | number>>(r: T): T {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r)) out[k] = typeof v === "string" && /^[=+\-@]/.test(v) ? `'${v}` : v;
  return out as T;
}
