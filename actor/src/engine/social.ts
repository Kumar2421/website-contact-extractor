/**
 * Social profile URL patterns.
 *
 * The LinkedIn, Instagram, X/Twitter, Facebook, YouTube, TikTok and Pinterest patterns are vendored
 * from Crawlee's `@crawlee/utils` (internals/social.js, v3.18.2, Apache-2.0, (c) Apify Technologies),
 * the same toolkit Apify's own contact scrapers are built on. We vendor the strings instead of
 * depending on the package because @crawlee/utils pulls in got-scraping and friends, which would
 * bloat every serverless function. See THIRD_PARTY_NOTICES.md.
 *
 * Differences from Crawlee: we match only link targets (href and JSON-LD sameAs), never raw HTML,
 * so share buttons, tracking pixels and inline scripts do not leak in as "profiles"; and we add
 * Telegram, which Crawlee does not cover.
 */

export type SocialNetwork = "linkedin" | "facebook" | "instagram" | "x" | "youtube" | "tiktok" | "pinterest" | "telegram";

const LINKEDIN = "(?<!\\w)(?:(?:http(?:s)?:\\/\\/)?(?:(?:(?:[a-z]+\\.)?linkedin\\.com\\/(?:in|company|school)\\/)([a-z0-9\\-_%=]{2,60})(?![a-z0-9\\-_%=])))(?:\\/)?";
const INSTAGRAM = "(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:www\\.)?(?:instagram\\.com|instagr\\.am)\\/)(?!explore|_n|_u|p\\/|reel\\/|accounts|direct|stories)([a-z0-9_.]{2,30})(?![a-z0-9_.])(?:/)?";
const TWITTER_RESERVED = "oauth|account|tos|privacy|signup|home|hashtag|search|login|widgets|i|settings|start|share|intent|oct|messages|explore|notifications|jobs|compose\\/post";
const X_SUBDOMAINS = "business|help|about|blog|careers|developer|ads";
const TWITTER = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.)?(?<!(?:${X_SUBDOMAINS})\\.)(?:x|twitter)(?:.com)\\/(?!(?:${TWITTER_RESERVED})(?:[\\'\\"\\?\\.\\/]|$))(?:@)?([a-z0-9_]{1,15})(?![a-z0-9_])(?:/)?`;
const FACEBOOK_RESERVED = "rsrc\\.php|apps|groups|events|l\\.php|friends|images|photo.php|chat|ajax|dyi|common|policies|login|recover|reg|help|security|messages|marketplace|pages\\/(?:create|merge|search)|live|bookmarks|games|fundraisers|saved|gaming|salesgroups|jobs|people|ads|ad_campaign|weather|offers|recommendations|crisisresponse|onthisday|developers|settings|connect|business|plugins|intern|sharer|share|dialog|tr|watch|hashtag";
const FACEBOOK = `(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:www.|m.|web.)?(?:facebook.com|fb.com)\\/(?!(?:${FACEBOOK_RESERVED})(?:[\\'\\"\\?\\.\\/]|$))(profile\\.php\\?id\\=[0-9]{3,20}|pages\\/[a-z0-9-_][a-z0-9-_\\.\\/]{0,150}|(?!pages|profile\\.php)[a-z0-9-\\.]{5,51}(?![a-z0-9\\.]))(?:\\/)?`;
const YOUTUBE = "(?<!\\w)(?:https?:\\/\\/)?(?:(?:www\\.|m\\.)?youtube\\.com(?:\\/(?:user|c(?:hannel)?)\\/|\\/@))([a-zA-Z0-9\\-_.]{2,100})";
const TIKTOK = "(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:www|m)\\.)?(?:tiktok\\.com)\\/@([a-z0-9\\-_\\.]{2,40})(?![a-z0-9\\-_\\.])";
const PINTEREST = "(?<!\\w)(?:http(?:s)?:\\/\\/)?(?:(?:(?:(?:www\\.)?pinterest(?:\\.com|(?:\\.[a-z]{2}){1,2}))|(?:[a-z]{2})\\.pinterest\\.com)(?:\\/))(?!pin\\/|search|ideas|today|_)([a-z0-9\\-_]{3,40})(?:\\/)?(?=$|[?#\"'])";
const TELEGRAM = "(?<!\\w)(?:https?:\\/\\/)?(?:t\\.me|telegram\\.me)\\/(?!share|joinchat\\/?$|addstickers|s\\/)(\\+?[a-z0-9_]{4,32})(?![a-z0-9_])";

const PATTERNS: [SocialNetwork, RegExp][] = [
  ["linkedin", new RegExp(`^${LINKEDIN}`, "i")],
  ["facebook", new RegExp(`^${FACEBOOK}`, "i")],
  ["instagram", new RegExp(`^${INSTAGRAM}`, "i")],
  ["x", new RegExp(`^${TWITTER}`, "i")],
  ["youtube", new RegExp(`^${YOUTUBE}`, "i")],
  ["tiktok", new RegExp(`^${TIKTOK}`, "i")],
  ["pinterest", new RegExp(`^${PINTEREST}`, "i")],
  ["telegram", new RegExp(`^${TELEGRAM}`, "i")],
];

const CANONICAL_HOST: Record<SocialNetwork, (handle: string, raw: string) => string> = {
  linkedin: (_h, raw) => {
    const m = /linkedin\.com\/(in|company|school)\/([^/?#]+)/i.exec(raw);
    return m ? `https://www.linkedin.com/${m[1].toLowerCase()}/${m[2]}` : raw;
  },
  facebook: (h) => `https://www.facebook.com/${h}`,
  instagram: (h) => `https://www.instagram.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  youtube: (h, raw) => {
    const m = /youtube\.com\/(user\/|c\/|channel\/|@)/i.exec(raw);
    const prefix = m ? (m[1] === "@" ? "@" : m[1]) : "@";
    return `https://www.youtube.com/${prefix}${h}`;
  },
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  pinterest: (h) => `https://www.pinterest.com/${h}`,
  telegram: (h) => `https://t.me/${h}`,
};

/** Classify one link target. Returns the network and a canonical profile URL, or null. */
export function matchSocial(href: string): { network: SocialNetwork; url: string; handle: string } | null {
  const raw = href.trim();
  if (!raw || raw.length > 400) return null;
  for (const [network, re] of PATTERNS) {
    const m = re.exec(raw);
    if (!m) continue;
    const handle = (m[1] ?? "").replace(/\/+$/, "");
    if (!handle) continue;
    return { network, handle, url: CANONICAL_HOST[network](handle, raw) };
  }
  return null;
}
