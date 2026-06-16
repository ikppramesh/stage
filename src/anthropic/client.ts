import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export const ANTHROPIC_MODEL = "claude-opus-4-6";

// OpenRouter free-model cascade — best first
export const OPENROUTER_MODELS = [
  { id: "openai/gpt-oss-120b:free",     label: "OpenAI OSS 120B" },
  { id: "google/gemma-4-31b-it:free",   label: "Google Gemma 4 31B" },
  { id: "google/gemma-4-26b-a4b-it:free", label: "Google Gemma 4 26B" },
];

export const OPENROUTER_KEY =
  process.env.OPENROUTER_API_KEY ||
  "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";

let _anthropic: Anthropic | null = null;
let _openrouter: OpenAI | null = null;

export function getAnthropicClient(): Anthropic {
  if (!_anthropic) {
    const apiKey = process.env.ANTHROPIC_API_KEY || "";
    _anthropic = new Anthropic({ apiKey });
  }
  return _anthropic;
}

export function getOpenRouterClient(): OpenAI {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      apiKey: OPENROUTER_KEY,
      baseURL: "https://openrouter.ai/api/v1",
    });
  }
  return _openrouter;
}

export function isAuthError(err: unknown): boolean {
  if (err instanceof Anthropic.AuthenticationError) return true;
  if (err instanceof OpenAI.AuthenticationError) return true;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("401") || msg.includes("authentication") || msg.includes("invalid x-api-key");
  }
  return false;
}

export function isProviderError(err: unknown): boolean {
  if (err instanceof OpenAI.APIError && (err.status === 503 || err.status === 502)) return true;
  if (err instanceof Error && (err.message.includes("Provider returned error") || err.message.includes("overloaded"))) return true;
  return false;
}
