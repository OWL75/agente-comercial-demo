import "server-only";
import OpenAI from "openai";

declare global {
  var __openai: OpenAI | undefined;
}

// Lazy for the same reason as src/lib/db.ts: Next.js imports every route
// module during `next build`'s page-data collection, so a module-level
// `new OpenAI()` would throw on any environment missing OPENAI_API_KEY.
export function getOpenAiClient(): OpenAI {
  if (!globalThis.__openai) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY no está configurada. Revisa .env.local.");
    globalThis.__openai = new OpenAI({ apiKey });
  }
  return globalThis.__openai;
}

export function getAgentModel(): string {
  return process.env.OPENAI_MODEL || "gpt-5.6-luna";
}
