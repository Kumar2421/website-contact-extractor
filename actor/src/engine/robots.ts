import robotsParser from "robots-parser";
import { fetchPage, type FetchDeps } from "./http";

/**
 * robots.txt support via robots-parser (MIT, ~8M weekly downloads, used by Crawlee itself).
 * We honour Disallow rules for our own token and for "*". A missing or unreadable robots.txt allows all.
 */

export const BOT_TOKEN = "ContactExtractor";

export type RobotsCheck = (url: string) => boolean;

export async function loadRobots(origin: string, opts: { timeoutMs: number; userAgent?: string }, deps: FetchDeps = {}): Promise<RobotsCheck> {
  const url = `${origin}/robots.txt`;
  const r = await fetchPage(url, { timeoutMs: Math.min(opts.timeoutMs, 6000), maxBytes: 250_000, userAgent: opts.userAgent, accept: "xml" }, deps);
  if (r.kind !== "ok" || !/text\/plain|^$/i.test(r.contentType.split(";")[0].trim())) return () => true;
  const robots = robotsParser(url, r.body);
  return (target: string) => {
    try {
      return robots.isAllowed(target, BOT_TOKEN) !== false;
    } catch {
      return true;
    }
  };
}
