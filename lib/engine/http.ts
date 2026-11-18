import { assertPublicHttpUrlResolved, type LookupFn } from "./ssrf";
import { registrable } from "./emails";
import type { FailureReason } from "./types";

/**
 * One guarded GET, extended from Marlo's fetchPage: every redirect hop is SSRF-checked with DNS
 * resolution, no cookies are sent, bodies are byte-capped, the charset is honoured, and failures come
 * back as a typed reason (so a user sees "blocked by bot protection", not just "no results").
 */

/** Identifiable on purpose: site owners can see who we are and block us in robots.txt. */
export const DEFAULT_UA = `Mozilla/5.0 (compatible; ContactExtractor/1.0; +${process.env.NEXT_PUBLIC_APP_URL ?? "https://contact-extractor.vercel.app"}/bot)`;
const MAX_REDIRECTS = 5;

export type FetchDeps = { fetchImpl?: typeof fetch; lookup?: LookupFn };

export type FetchResult =
  | { kind: "ok"; url: string; status: number; body: string; contentType: string }
  | { kind: "error"; reason: FailureReason; status?: number };

export type FetchOptions = {
  timeoutMs: number;
  maxBytes: number;
  userAgent?: string;
  /** Allow the first redirect chain to leave the site (a homepage that moved to a new domain). */
  allowOffsite?: boolean;
  accept?: "html" | "xml";
};

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer()).subarray(0, maxBytes);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  try {
    await reader.cancel();
  } catch {
    // already closed
  }
  const all = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const c of chunks) {
    const piece = c.subarray(0, Math.max(0, all.length - offset));
    all.set(piece, offset);
    offset += piece.length;
  }
  return all;
}

function decode(bytes: Uint8Array, contentType: string): string {
  let charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  if (!charset) {
    const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
    charset = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder((charset ?? "utf-8").toLowerCase()).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

async function cancelBody(res: Response) {
  try {
    await res.body?.cancel();
  } catch {
    // ignore
  }
}

function classifyError(err: unknown): FailureReason {
  const e = err as { name?: string; cause?: { code?: string; name?: string }; code?: string; message?: string };
  const code = e?.cause?.code ?? e?.code ?? "";
  if (e?.name === "TimeoutError" || e?.name === "AbortError" || /timeout/i.test(code)) return "timeout";
  if (/ENOTFOUND|EAI_AGAIN|ENODATA/.test(code)) return "dns";
  if (/CERT|SSL|TLS|ERR_TLS|UNABLE_TO_VERIFY|SELF_SIGNED|HANDSHAKE/i.test(code) || /certificate|ssl|tls/i.test(e?.message ?? "")) return "tls";
  return "network";
}

export async function fetchPage(start: string, opts: FetchOptions, deps: FetchDeps = {}): Promise<FetchResult> {
  const doFetch = deps.fetchImpl ?? fetch;
  const startSite = (() => {
    try {
      return registrable(new URL(start).hostname);
    } catch {
      return "";
    }
  })();
  let current = start;
  // A homepage may move domains at most twice (brand.de -> group.com -> group.com/brand).
  let offsiteMoves = opts.allowOffsite ? 2 : 0;
  let lastSite = startSite;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    try {
      await assertPublicHttpUrlResolved(current, deps.lookup);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      // The guard reports unresolvable names with the same generic text, so re-check DNS to tell them apart.
      return { kind: "error", reason: /can't be used/.test(msg) ? await dnsOrBlocked(current) : "ssrf_blocked" };
    }
    let res: Response;
    try {
      res = await doFetch(current, {
        method: "GET",
        redirect: "manual",
        headers: {
          Accept: opts.accept === "xml" ? "application/xml,text/xml;q=0.9,*/*;q=0.5" : "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "Accept-Language": "en-US,en;q=0.9,*;q=0.5",
          "User-Agent": opts.userAgent ?? DEFAULT_UA,
        },
        signal: AbortSignal.timeout(opts.timeoutMs),
      });
    } catch (err) {
      return { kind: "error", reason: classifyError(err) };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await cancelBody(res);
      if (!location) return { kind: "error", reason: "network", status: res.status };
      let next: string;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { kind: "error", reason: "network", status: res.status };
      }
      const nextSite = registrable(new URL(next).hostname);
      if (nextSite !== lastSite) {
        if (offsiteMoves <= 0) return { kind: "error", reason: "redirect_offsite", status: res.status };
        offsiteMoves -= 1;
        lastSite = nextSite;
      }
      current = next;
      continue;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      const challenge = res.headers.get("cf-mitigated") === "challenge" || (res.status === 403 || res.status === 503 || res.status === 429) && /cloudflare|ddos-guard|sucuri|akamai|incapsula/i.test(res.headers.get("server") ?? "");
      await cancelBody(res);
      const reason: FailureReason = challenge ? "bot_protection" : res.status === 403 ? "http_403" : res.status === 404 ? "http_404" : res.status >= 500 ? "http_5xx" : "http_4xx";
      return { kind: "error", reason, status: res.status };
    }
    const okType = opts.accept === "xml" ? /xml|text\/plain/i : /text\/html|application\/xhtml\+xml/i;
    if (contentType && !okType.test(contentType)) {
      await cancelBody(res);
      return { kind: "error", reason: "not_html", status: res.status };
    }
    const body = decode(await readCapped(res, opts.maxBytes), contentType);
    if (/<title>\s*(Just a moment|Attention Required|Access denied|DDoS-Guard|Checking your browser)/i.test(body.slice(0, 5000))) {
      return { kind: "error", reason: "bot_protection", status: res.status };
    }
    return { kind: "ok", url: current, status: res.status, body, contentType };
  }
  return { kind: "error", reason: "too_many_redirects" };
}

async function dnsOrBlocked(url: string): Promise<FailureReason> {
  try {
    const { default: dns } = await import("node:dns/promises");
    await dns.lookup(new URL(url).hostname);
    return "ssrf_blocked"; // it resolves, so the guard refused a private address
  } catch {
    return "dns";
  }
}
