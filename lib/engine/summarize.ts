/**
 * Optional AI company summary through the Gemini REST API (no SDK, one fetch).
 * The model only describes the business from text we already fetched. It never sees or produces
 * contact details, so it cannot invent an email or phone; those always come from the deterministic
 * extractor with a source URL.
 */

export type AiSummary = { summary: string; industry: string; audience: "B2B" | "B2C" | "Both" | "Unknown" };

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function summarizeCompany(
  input: { domain: string; name: string | null; title: string | null; description: string | null; text: string },
  opts: { apiKey?: string; model?: string; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<AiSummary | null> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
  const text = input.text.replace(/\s+/g, " ").slice(0, 3500);
  if (text.length < 80 && !input.description) return null;
  const prompt = [
    "You describe a business from its own website text. Reply with JSON only.",
    "summary: one plain sentence, max 25 words, saying what the business does and for whom. No marketing adjectives.",
    "industry: 1-3 words, e.g. 'Dental clinic', 'Web design agency', 'Industrial pumps'.",
    "audience: B2B, B2C, Both or Unknown.",
    "If the text is a parked domain, an error page or too thin, use summary 'Not enough information.' and industry 'Unknown'.",
    "Never include emails, phone numbers or personal names.",
    "",
    `Domain: ${input.domain}`,
    `Name: ${input.name ?? ""}`,
    `Title: ${input.title ?? ""}`,
    `Meta description: ${input.description ?? ""}`,
    `Page text: ${text}`,
  ].join("\n");
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 512,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              summary: { type: "STRING" },
              industry: { type: "STRING" },
              audience: { type: "STRING", enum: ["B2B", "B2C", "Both", "Unknown"] },
            },
            required: ["summary", "industry", "audience"],
          },
        },
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    const parsed = JSON.parse(raw) as Partial<AiSummary>;
    if (!parsed.summary || !parsed.industry) return null;
    // Belt and braces: strip anything that looks like contact data.
    const scrub = (s: string) => s.replace(/\S+@\S+/g, "").replace(/\+?\d[\d\s().-]{6,}\d/g, "").trim();
    return {
      summary: scrub(String(parsed.summary)).slice(0, 220),
      industry: scrub(String(parsed.industry)).slice(0, 60),
      audience: (["B2B", "B2C", "Both"].includes(String(parsed.audience)) ? parsed.audience : "Unknown") as AiSummary["audience"],
    };
  } catch {
    return null;
  }
}
