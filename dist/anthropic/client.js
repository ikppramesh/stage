"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OPENROUTER_KEY = exports.OPENROUTER_MODELS = exports.ANTHROPIC_MODEL = void 0;
exports.getAnthropicClient = getAnthropicClient;
exports.getOpenRouterClient = getOpenRouterClient;
exports.isAuthError = isAuthError;
exports.isProviderError = isProviderError;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const openai_1 = __importDefault(require("openai"));
exports.ANTHROPIC_MODEL = "claude-opus-4-6";
// OpenRouter free-model cascade — best first
exports.OPENROUTER_MODELS = [
    { id: "openai/gpt-oss-120b:free", label: "OpenAI OSS 120B" },
    { id: "google/gemma-4-31b-it:free", label: "Google Gemma 4 31B" },
    { id: "google/gemma-4-26b-a4b-it:free", label: "Google Gemma 4 26B" },
];
exports.OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ||
    "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";
let _anthropic = null;
let _openrouter = null;
function getAnthropicClient() {
    if (!_anthropic) {
        const apiKey = process.env.ANTHROPIC_API_KEY || "";
        _anthropic = new sdk_1.default({ apiKey });
    }
    return _anthropic;
}
function getOpenRouterClient() {
    if (!_openrouter) {
        _openrouter = new openai_1.default({
            apiKey: exports.OPENROUTER_KEY,
            baseURL: "https://openrouter.ai/api/v1",
        });
    }
    return _openrouter;
}
function isAuthError(err) {
    if (err instanceof sdk_1.default.AuthenticationError)
        return true;
    if (err instanceof openai_1.default.AuthenticationError)
        return true;
    if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        return msg.includes("401") || msg.includes("authentication") || msg.includes("invalid x-api-key");
    }
    return false;
}
function isProviderError(err) {
    if (err instanceof openai_1.default.APIError && (err.status === 503 || err.status === 502))
        return true;
    if (err instanceof Error && (err.message.includes("Provider returned error") || err.message.includes("overloaded")))
        return true;
    return false;
}
