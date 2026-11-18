import dns from "node:dns/promises";
import type { EmailFinding } from "./types";

/**
 * Domain-level deliverability: does the email's domain accept mail at all? This catches typos,
 * dead domains and placeholder addresses, which is where most bounces on scraped lists come from.
 * It does not prove a mailbox exists (that needs SMTP probing, which cloud IPs cannot do reliably).
 */

export type MxStatus = EmailFinding["mx"];
type Resolver = { resolveMx: (d: string) => Promise<{ exchange: string }[]>; resolve4: (d: string) => Promise<string[]> };

const cache = new Map<string, Promise<MxStatus>>();
const TIMEOUT_MS = 4_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), { code: "ETIMEOUT" })), TIMEOUT_MS))]);
}

export async function checkMx(domain: string, resolver: Resolver = dns): Promise<MxStatus> {
  const key = domain.toLowerCase();
  let hit = cache.get(key);
  if (!hit) {
    hit = (async (): Promise<MxStatus> => {
      try {
        const mx = await withTimeout(resolver.resolveMx(key));
        // "Null MX" (RFC 7505): a single "." exchange means the domain explicitly accepts no mail.
        if (mx.length === 1 && (mx[0].exchange === "" || mx[0].exchange === ".")) return "invalid";
        return mx.length ? "valid" : "invalid";
      } catch (err) {
        const code = (err as { code?: string }).code ?? "";
        if (code === "ENOTFOUND" || code === "ENODATA") {
          try {
            const a = await withTimeout(resolver.resolve4(key));
            return a.length ? "risky" : "invalid";
          } catch {
            return "invalid";
          }
        }
        return "unknown";
      }
    })();
    cache.set(key, hit);
    if (cache.size > 20_000) cache.delete(cache.keys().next().value as string);
  }
  return hit;
}

export async function annotateMx(emails: EmailFinding[], resolver?: Resolver): Promise<void> {
  await Promise.all(
    emails.map(async (e) => {
      e.mx = await checkMx(e.value.slice(e.value.indexOf("@") + 1), resolver);
      if (e.mx === "invalid") e.confidence = "low";
    }),
  );
}
