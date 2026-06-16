import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

export const ANTHROPIC_MODEL = "claude-opus-4-6";

// OpenRouter free-model cascade — best first (updated 2026-06)
export const OPENROUTER_MODELS = [
  { id: "qwen/qwen3-coder:free",                       label: "Qwen3 Coder 480B" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free",      label: "Nemotron 3 Ultra 550B" },
  { id: "nousresearch/hermes-3-llama-3.1-405b:free",   label: "Hermes 3 405B" },
  { id: "nvidia/nemotron-3-super-120b-a12b:free",      label: "Nemotron 3 Super 120B" },
  { id: "openai/gpt-oss-120b:free",                    label: "GPT-oss-120b" },
  { id: "qwen/qwen3-next-80b-a3b-instruct:free",       label: "Qwen3 Next 80B" },
  { id: "meta-llama/llama-3.3-70b-instruct:free",      label: "Llama 3.3 70B" },
  { id: "nvidia/nemotron-nano-12b-v2-vl:free",         label: "Nemotron Nano 12B" },
  { id: "google/gemma-4-31b-it:free",                  label: "Gemma 4 31B" },
  { id: "nvidia/nemotron-nano-9b-v2:free",             label: "Nemotron Nano 9B" },
  { id: "openai/gpt-oss-20b:free",                     label: "GPT-oss-20b" },
  { id: "meta-llama/llama-3.2-3b-instruct:free",       label: "Llama 3.2 3B" },
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
