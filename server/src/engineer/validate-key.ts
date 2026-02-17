import { GoogleGenAI } from "@google/genai";

/** Validate a Gemini API key by listing models (free, no cost). */
export async function validateGeminiKey(
  apiKey: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, error: "API key is empty" };
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    // List models is a free API call — no tokens consumed
    const pager = await ai.models.list({ config: { pageSize: 1 } });
    // If we get here without throwing, the key is valid
    // Consume the first page to ensure the request completes
    for await (const _model of pager) {
      break;
    }
    return { valid: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("API_KEY_INVALID") || message.includes("401")) {
      return { valid: false, error: "Invalid API key — check that you copied it correctly" };
    }
    if (message.includes("403") || message.includes("PERMISSION_DENIED")) {
      return { valid: false, error: "API key doesn't have access to Gemini — enable the Generative Language API in your Google Cloud project" };
    }
    if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
      return { valid: false, error: "Rate limited — you've hit the free tier quota. Wait a bit or upgrade to a paid plan" };
    }
    if (message.includes("ENOTFOUND") || message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return { valid: false, error: "Can't reach Google's API — check your internet connection" };
    }
    return { valid: false, error: `Validation failed: ${message}` };
  }
}
