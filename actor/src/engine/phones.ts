import { findPhoneNumbersInText, parsePhoneNumberFromString, isSupportedCountry, type CountryCode, type PhoneNumber } from "libphonenumber-js/max";
import { parse as parseDomain } from "tldts";
import type { Confidence, PhoneFinding, SourceKind } from "./types";

/**
 * Phones are parsed and validated with libphonenumber-js (Google's libphonenumber metadata), not with
 * the loose digit-run regexes most scrapers use. A number found in free text is accepted only when a
 * phone label sits right before it ("Tel", "Phone", "Call", "Telefon", "☎"...) or it is written in
 * international form, because valid-looking digit runs (dates, order numbers, VAT ids) are common.
 */

const PHONE_LABEL = /(?:\b(?:tel|tél|tele|telephone|téléphone|telefone?|teléfono|telefono|telefon|phone|ph|call(?: us)?|mobile?|mob|cell|hotline|helpline|landline|direct|office|whats\s?app|wa|contact|kontakt|fon|handy|móvil|movil|celular|cellulare|portable|gsm|t|m|p)\b\.?\s*(?:no\.?|number|nr\.?|#)?\s*[:.\-–]?\s*|[☎📞📱✆]\s*)$/i;
const FAX_LABEL = /\b(?:fax|telefax|facsimile|fx)\b\.?\s*(?:no\.?|number|nr\.?)?\s*[:.\-–]?\s*$/i;
const WHATSAPP_LABEL = /whats\s?app|\bwa\b/i;

const CC_ALIASES: Record<string, string> = { uk: "GB" };

/** Best guess of the site's country, used as the default for national-format numbers. */
export function guessCountry(host: string, lang: string | null, declared: string | null): CountryCode | undefined {
  const tld = (parseDomain(host).publicSuffix ?? "").split(".").pop() ?? "";
  const fromTld = CC_ALIASES[tld] ?? (tld.length === 2 ? tld.toUpperCase() : "");
  const fromDeclared = declared && declared.length === 2 ? declared.toUpperCase() : "";
  const region = lang?.split(/[-_]/)[1]?.toUpperCase() ?? "";
  for (const c of [fromDeclared, fromTld, region]) {
    if (c && isSupportedCountry(c)) return c as CountryCode;
  }
  return undefined;
}

export type PhoneCandidate = { phone: PhoneNumber; source: string; via: SourceKind; whatsapp?: boolean };

/** Parse a tel: href or a structured-data value. */
export function parsePhoneValue(raw: string, country: CountryCode | undefined): PhoneNumber | null {
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep raw
  }
  value = value.replace(/^(?:tel|phone|telephone|callto):\/{0,2}/i, "").split(/[?;,]/)[0];
  if (!/\d{5}/.test(value.replace(/\D/g, ""))) return null;
  const p = parsePhoneNumberFromString(value, country) ?? parsePhoneNumberFromString(value.replace(/^00/, "+"));
  return p && p.isPossible() ? p : null;
}

/** Labelled or international phone numbers from visible text. Fax numbers are skipped. */
export function phonesFromText(text: string, country: CountryCode | undefined): { phone: PhoneNumber; whatsapp: boolean }[] {
  const out: { phone: PhoneNumber; whatsapp: boolean }[] = [];
  let found: ReturnType<typeof findPhoneNumbersInText>;
  try {
    found = findPhoneNumbersInText(text, country ? { defaultCountry: country } : undefined);
  } catch {
    return out;
  }
  for (const m of found) {
    const before = text.slice(Math.max(0, m.startsAt - 40), m.startsAt);
    const raw = text.slice(m.startsAt, m.endsAt);
    if (FAX_LABEL.test(before)) continue;
    const labelled = PHONE_LABEL.test(before);
    const international = /^\s*(?:\+|00[1-9])/.test(raw);
    if (!labelled && !international) continue;
    if (/^\d{4}[-./]\d{1,2}[-./]\d{1,2}$/.test(raw.trim())) continue; // ISO date
    if (!m.number.isValid()) continue;
    // Only a label right before the number counts, so a WhatsApp link nearby does not relabel a landline.
    const near = before.slice(-16);
    out.push({ phone: m.number, whatsapp: WHATSAPP_LABEL.test(near) });
  }
  return out;
}

const VIA_SCORE: Partial<Record<SourceKind, number>> = { tel: 3, jsonld: 3, microdata: 3, link: 3, text: 2 };

export function mergePhones(candidates: PhoneCandidate[]): PhoneFinding[] {
  const map = new Map<string, PhoneFinding & { score: number }>();
  for (const c of candidates) {
    const e164 = c.phone.number;
    let f = map.get(e164);
    if (!f) {
      let type: string | null = null;
      try {
        type = c.phone.getType() ?? null;
      } catch {
        type = null;
      }
      f = {
        e164,
        national: c.phone.formatNational(),
        international: c.phone.formatInternational(),
        country: c.phone.country ?? null,
        type: type ? type.toLowerCase() : null,
        confidence: "low",
        sources: [],
        via: [],
        score: 0,
      };
      map.set(e164, f);
    }
    if (!f.sources.includes(c.source)) f.sources.push(c.source);
    if (!f.via.includes(c.via)) f.via.push(c.via);
    f.score = Math.max(f.score, VIA_SCORE[c.via] ?? 1);
  }
  const list = [...map.values()];
  for (const f of list) {
    const valid = (() => {
      try {
        return parsePhoneNumberFromString(f.e164)?.isValid() ?? false;
      } catch {
        return false;
      }
    })();
    const conf: Confidence = f.score >= 3 && valid ? "high" : valid ? "medium" : "low";
    f.confidence = conf;
  }
  return list
    .sort((a, b) => b.score - a.score || b.sources.length - a.sources.length)
    .map(({ score: _score, ...rest }) => rest);
}
