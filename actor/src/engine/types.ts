import type { SocialNetwork } from "./social";

/** Where a value was found, so every fact can be checked by a human. */
export type SourceKind = "mailto" | "tel" | "link" | "text" | "jsonld" | "microdata" | "cloudflare" | "script" | "meta";

export type Confidence = "high" | "medium" | "low";

export type EmailFinding = {
  value: string;
  /** role = info@/sales@ style; personal = looks like a person; generic = anything else. */
  kind: "role" | "personal" | "generic";
  ownDomain: boolean;
  freeProvider: boolean;
  disposable: boolean;
  /** valid = domain has MX; risky = no MX but has A record; invalid = domain does not receive mail; unknown = not checked or lookup failed. */
  mx: "valid" | "risky" | "invalid" | "unknown";
  confidence: Confidence;
  sources: string[];
  via: SourceKind[];
};

export type PhoneFinding = {
  e164: string;
  national: string;
  international: string;
  country: string | null;
  type: string | null;
  confidence: Confidence;
  sources: string[];
  via: SourceKind[];
};

export type WhatsappFinding = { number: string | null; link: string; source: string };

export type SocialFinding = { url: string; handle: string; source: string };

export type SiteStatus = "found" | "empty" | "failed" | "blocked" | "invalid";

export type FailureReason =
  | "invalid_url"
  | "ssrf_blocked"
  | "dns"
  | "timeout"
  | "tls"
  | "network"
  | "http_403"
  | "http_404"
  | "http_4xx"
  | "http_5xx"
  | "bot_protection"
  | "not_html"
  | "redirect_offsite"
  | "robots"
  | "too_many_redirects";

export type SiteResult = {
  input: string;
  url: string | null;
  finalUrl: string | null;
  domain: string | null;
  status: SiteStatus;
  /** Plain-language reason, always set, so empty and failed rows explain themselves. */
  statusNote: string;
  failure: FailureReason | null;
  company: {
    name: string | null;
    description: string | null;
    country: string | null;
    language: string | null;
    summary: string | null;
    industry: string | null;
  };
  emails: EmailFinding[];
  phones: PhoneFinding[];
  whatsapp: WhatsappFinding[];
  socials: Partial<Record<SocialNetwork, SocialFinding[]>>;
  contactPageUrl: string | null;
  pagesCrawled: string[];
  flags: { jsHeavy: boolean; cloudflareEmail: boolean; usedSitemap: boolean; parked: boolean };
  durationMs: number;
};

export type ExtractOptions = {
  maxPagesPerSite: number;
  includePhones: boolean;
  includeSocials: boolean;
  validateEmails: boolean;
  /** Stop crawling a site early once the contact/legal pages are read and an email and phone are known. */
  smartStop: boolean;
  timeoutMs: number;
  maxPageBytes: number;
  /** Honour robots.txt Disallow rules (default on). */
  respectRobots: boolean;
  /** Add a one-line AI description and industry (Gemini). Only runs for sites with a contact found. */
  aiSummary: boolean;
  userAgent?: string;
};

export const DEFAULT_OPTIONS: ExtractOptions = {
  maxPagesPerSite: 8,
  includePhones: true,
  includeSocials: true,
  validateEmails: true,
  smartStop: true,
  timeoutMs: 12_000,
  maxPageBytes: 1_500_000,
  respectRobots: true,
  aiSummary: false,
};
