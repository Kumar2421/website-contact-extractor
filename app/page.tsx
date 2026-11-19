import Link from "next/link";
import { BadgeCheck, Coins, FileSpreadsheet, Link2, ShieldCheck, Zap } from "lucide-react";
import { GhostLoader } from "@/components/platform/GhostLoader";

const SAMPLE = `{
  "domain": "acme-dental.de",
  "status": "found",
  "emails": [{
    "value": "praxis@acme-dental.de",
    "kind": "role", "confidence": "high", "mx": "valid",
    "sources": ["https://acme-dental.de/impressum"]
  }],
  "phones": [{ "e164": "+4930901820", "type": "fixed_line",
    "sources": ["https://acme-dental.de/kontakt"] }],
  "whatsapp": [{ "number": "+4915112345678" }],
  "socials": { "instagram": [{ "url": "https://www.instagram.com/acmedental" }] },
  "company": { "summary": "Dental practice in Berlin offering implants and cosmetic dentistry." }
}`;

const FEATURES = [
  { icon: Coins, title: "Pay only when we find something", text: "One credit per website with an email, phone or WhatsApp. Empty sites, parked domains and sites that block us cost nothing." },
  { icon: Link2, title: "Every value shows its source", text: "Each email and phone links to the exact page it was found on. Nothing is guessed or generated." },
  { icon: Zap, title: "Finds what others miss", text: "Reads contact, imprint, about and team pages in 15+ languages, decodes Cloudflare-hidden emails and schema.org data." },
  { icon: BadgeCheck, title: "Clean, checked data", text: "Email domains checked for MX, role addresses flagged, phones validated and normalised to +E.164, junk filtered." },
  { icon: FileSpreadsheet, title: "Bulk in, spreadsheet out", text: "Paste a list or upload a CSV. Export CSV, Excel (with a per-email sheet) or JSON, or use the API and webhooks." },
  { icon: ShieldCheck, title: "Polite and transparent", text: "Identifiable crawler that honours robots.txt. Every empty or failed row says why, in plain words." },
];

export default function Landing() {
  return (
    <main className="landing">
      <div className="platform-terminal-wrap">
        <header className="platform-terminal">
          <div className="terminal-left">
            <GhostLoader size={22} />
            <span>CONTACT</span>
            <span className="muted">/ EXTRACTOR</span>
          </div>
          <div className="terminal-right" style={{ display: "flex" }}>
            <Link href="/login">SIGN IN</Link>
            <Link href="/signup" className="muted">
              START FREE
            </Link>
          </div>
        </header>
      </div>

      <section className="hero">
        <div>
          <div className="eyebrow">WEBSITE CONTACT EXTRACTOR</div>
          <h1>Emails, phones, WhatsApp and socials from any list of business websites.</h1>
          <p>Paste 10 or 10,000 websites. Get one clean row per business with checked emails, validated phone numbers, WhatsApp and social profiles, each linked to the page it came from. You pay only for sites where we find a contact.</p>
          <div className="cta">
            <Link className="pf-btn primary" href="/signup">
              Start free · 200 credits a month
            </Link>
            <Link className="pf-btn" href="/login">
              Sign in
            </Link>
          </div>
        </div>
        <div className="sample">
          <div className="panelhead">
            <span>ONE ROW PER WEBSITE</span>
          </div>
          <pre>{SAMPLE}</pre>
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">WHY TEAMS SWITCH</div>
        <h2>Built around the complaints people leave on other scrapers</h2>
        <div className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <f.icon size={16} />
              <strong>{f.title}</strong>
              <p>{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="eyebrow">MEASURED, NOT CLAIMED</div>
        <h2>Same 119 real business sites, same network, same page budget</h2>
        <div className="panel" style={{ overflow: "auto" }}>
          <table className="compare">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Contact Extractor</th>
                <th>Open-source baseline (Crawlee social parser)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Sites with an email</td><td className="us">42–45%</td><td>32–36%</td></tr>
              <tr><td>Sites with a valid phone</td><td className="us">34–37%</td><td>19–24%</td></tr>
              <tr><td>Junk emails (assets, trackers, placeholders)</td><td className="us">0%</td><td>26–31%</td></tr>
              <tr><td>Phone numbers that fail validation</td><td className="us">0%</td><td>71–76%</td></tr>
              <tr><td>Source page per value</td><td className="us">Yes</td><td>No</td></tr>
            </tbody>
          </table>
        </div>
        <p className="pf-muted pf-small" style={{ marginTop: 8 }}>Three benchmark runs, November 2026. Many large brands block all crawlers; those rows are free and labelled.</p>
      </section>

      <footer className="footer">
        <span>CONTACT EXTRACTOR · PUBLIC BUSINESS CONTACT DATA ONLY</span>
        <span>
          <Link href="/bot">About our crawler</Link>
        </span>
      </footer>
    </main>
  );
}
