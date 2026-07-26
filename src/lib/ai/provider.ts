// The ONE place the app talks to an AI provider (PHASE2 Step 5b).
//
// Nothing else imports an AI SDK — swapping Gemini for Groq, OpenRouter or
// Mistral is a change to this file alone. That is also why this uses plain
// `fetch` against the REST API rather than a vendor SDK: no dependency to
// remove later, and the request shape is visible right here.
//
// SERVER ONLY. GEMINI_API_KEY has no NEXT_PUBLIC_ prefix, so Next.js will not
// inline it into the browser bundle. Unlike the NEXT_PUBLIC_FIREBASE_* values —
// which are public web config by design — this one is a real secret: anyone who
// reads it out of DevTools can spend the quota. If this module is ever imported
// from a client component the build will fail to find the key, which is the
// correct outcome.
//
// COST: Google AI Studio's free tier, no credit card, no billing account. It is
// rate-limited (a few tens of requests per minute, hundreds per day) and Google
// has changed those numbers before — read the current ones in AI Studio rather
// than trusting a figure written here. Nothing in this app can exceed them:
// one request per "Add with AI" tap, by a family of ten.
//
// PRIVACY: free-tier prompts MAY be used to improve Google's models. Venue
// notes are low-stakes, but callers must never put a contact's phone number or
// email into a prompt.

import "server-only";

/** Model id. Overridable because Google renames and retires these; the default
 *  is a flash-lite-class model, which is the cheapest tier and more than enough
 *  for reading a paragraph of notes. Check the live list in AI Studio. */
const MODEL = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/** Vercel Hobby caps a route handler's execution; one non-streaming call to a
 *  flash-class model lands well inside this. */
const TIMEOUT_MS = 20_000;

/** True when a key is configured. The client asks the route handler for this so
 *  the "Add with AI" button can be hidden entirely rather than failing on tap —
 *  local dev and preview deploys often have no key, and the app must work
 *  identically without one. */
export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export class AiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Safe to show a non-technical user. */
    readonly userMessage: string,
  ) {
    super(message);
  }
}

/**
 * Ask the model for JSON matching `responseSchema`, and return the parsed
 * object — unvalidated against app rules. The CALLER validates with zod before
 * anything reaches the client; a schema in the request is a strong hint, not a
 * guarantee.
 *
 * Retries once on a malformed response (per PHASE2), and not at all on an auth
 * or quota error, where retrying just burns the same quota again.
 */
export async function generateJSON(
  prompt: string,
  responseSchema: Record<string, unknown>,
): Promise<unknown> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new AiError("GEMINI_API_KEY is not set", 503, "AI suggestions aren't set up yet.");
  }

  let lastParseError: unknown = null;

  // Two attempts: a flash-class model occasionally emits JSON with a stray
  // trailing comma. A third attempt has never been the thing that helps.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const text = await callGemini(key, prompt, responseSchema);
    try {
      return JSON.parse(text);
    } catch (err) {
      lastParseError = err;
    }
  }

  console.error("[ai] unparseable response after retry:", lastParseError);
  throw new AiError(
    "Model returned unparseable JSON twice",
    502,
    "The AI returned something we couldn't read. Please try again.",
  );
}

async function callGemini(
  key: string,
  prompt: string,
  responseSchema: Record<string, unknown>,
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${ENDPOINT}/${MODEL}:generateContent`, {
      method: "POST",
      // The key goes in a header, not the query string: query strings end up in
      // proxy and CDN logs.
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          // Structured output, so we parse JSON rather than prose.
          responseMimeType: "application/json",
          responseSchema,
          // Extraction, not creative writing — near-deterministic is what we
          // want, and it makes a wrong answer reproducible enough to debug.
          temperature: 0.1,
          maxOutputTokens: 2048,
        },
      }),
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      throw new AiError("Gemini timed out", 504, "The AI took too long. Please try again.");
    }
    throw new AiError(`Gemini request failed: ${String(err)}`, 502, "Couldn't reach the AI.");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429) {
    // Free-tier rate limit. A plain retry here would spend the same quota, so
    // tell the person to come back rather than hammering it.
    throw new AiError(
      "Gemini rate limited",
      429,
      "Too many AI requests just now — try again in a minute.",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[ai] ${MODEL} responded ${response.status}: ${detail.slice(0, 400)}`);
    throw new AiError(
      `Gemini responded ${response.status}`,
      502,
      response.status === 404
        ? `The AI model "${MODEL}" isn't available. Check the model name in AI Studio.`
        : "The AI service had a problem. Please try again.",
    );
  }

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    // Usually a safety block or an empty candidate.
    throw new AiError("Gemini returned no content", 502, "The AI didn't return anything usable.");
  }
  return text;
}
