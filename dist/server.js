"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const ws_1 = require("ws");
const uuid_1 = require("uuid");
const client_1 = require("./anthropic/client");
const index_1 = require("./agents/index");
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const wss = new ws_1.WebSocketServer({ server });
app.use(express_1.default.static(path_1.default.join(__dirname, "../public")));
app.use(express_1.default.json());
// Full tree: categories → agents → phases
app.get("/api/agents", (_req, res) => {
    const tree = (0, index_1.getAgentsByCategory)().map(group => ({
        category: group.category,
        agents: group.agents.map(({ id, name, description, emoji, color, phases }) => ({
            id, name, description, emoji, color,
            phases: phases.map(({ id, name, icon, description }) => ({ id, name, icon, description }))
        }))
    }));
    res.json(tree);
});
// clientId → agentId → AgentSession
// Each browser client maintains a separate history per agent
const clientData = new Map();
function getOrCreateAgentSession(clientId, agentId) {
    if (!clientData.has(clientId))
        clientData.set(clientId, new Map());
    const agentMap = clientData.get(clientId);
    if (!agentMap.has(agentId)) {
        agentMap.set(agentId, {
            history: [],
            tokens: { inputTotal: 0, outputTotal: 0, callCount: 0 }
        });
    }
    return agentMap.get(agentId);
}
function send(ws, data) {
    if (ws.readyState === ws_1.WebSocket.OPEN)
        ws.send(JSON.stringify(data));
}
function sendStatusChunk(ws, text) {
    send(ws, { type: "stream_chunk", chunk: `\n\n> _${text}_\n\n` });
}
// ── Provider cascade ──────────────────────────────────────────────
async function streamResponse(ws, history, agent) {
    const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
    if (anthropicKey && anthropicKey !== "your_api_key_here") {
        try {
            return await streamAnthropic(ws, history, agent);
        }
        catch (err) {
            if ((0, client_1.isAuthError)(err)) {
                sendStatusChunk(ws, "⚠ Claude access issue — switching to backup model…");
            }
            else {
                throw err;
            }
        }
    }
    for (let i = 0; i < client_1.OPENROUTER_MODELS.length; i++) {
        const model = client_1.OPENROUTER_MODELS[i];
        try {
            if (i > 0)
                sendStatusChunk(ws, `Trying ${model.label}…`);
            return await streamOpenRouter(ws, history, agent, model.id, model.label);
        }
        catch (err) {
            const isLast = i === client_1.OPENROUTER_MODELS.length - 1;
            if (((0, client_1.isAuthError)(err) || (0, client_1.isProviderError)(err)) && !isLast) {
                sendStatusChunk(ws, `⚠ ${model.label} unavailable — trying next…`);
            }
            else if (isLast) {
                throw new Error(`All models exhausted. Last: ${err instanceof Error ? err.message : String(err)}`);
            }
            else {
                throw err;
            }
        }
    }
    throw new Error("No models available");
}
async function streamAnthropic(ws, history, agent) {
    const client = (0, client_1.getAnthropicClient)();
    let full = "";
    const stream = client.messages.stream({
        model: client_1.ANTHROPIC_MODEL,
        max_tokens: 8096,
        thinking: { type: "adaptive" },
        system: agent.systemPrompt,
        messages: history,
    });
    for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            send(ws, { type: "stream_chunk", chunk: event.delta.text });
        }
    }
    const final = await stream.finalMessage();
    return {
        text: full,
        model: `claude / ${client_1.ANTHROPIC_MODEL}`,
        inputTokens: final.usage.input_tokens,
        outputTokens: final.usage.output_tokens,
    };
}
async function streamOpenRouter(ws, history, agent, modelId, modelLabel) {
    const client = (0, client_1.getOpenRouterClient)();
    let full = "";
    let inputTokens = 0;
    let outputTokens = 0;
    const messages = [
        { role: "system", content: agent.systemPrompt },
        ...history.map(m => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : "",
        })),
    ];
    const stream = await client.chat.completions.create({
        model: modelId,
        max_tokens: 4096,
        stream: true,
        stream_options: { include_usage: true },
        messages,
    });
    for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
            full += text;
            send(ws, { type: "stream_chunk", chunk: text });
        }
        // Final chunk carries usage
        if (chunk.usage) {
            inputTokens = chunk.usage.prompt_tokens ?? 0;
            outputTokens = chunk.usage.completion_tokens ?? 0;
        }
    }
    return {
        text: full,
        model: modelLabel,
        inputTokens,
        outputTokens,
    };
}
// ── WebSocket connection handler ──────────────────────────────────
wss.on("connection", (ws) => {
    let clientId = (0, uuid_1.v4)(); // replaced if client sends its stored id
    let activeAgentId = index_1.DEFAULT_AGENT_ID;
    send(ws, { type: "connected", clientId });
    ws.on("message", async (raw) => {
        let msg;
        try {
            msg = JSON.parse(raw.toString());
        }
        catch {
            send(ws, { type: "error", message: "Invalid message" });
            return;
        }
        // Restore client id from browser localStorage
        if (msg.clientId)
            clientId = msg.clientId;
        // ── init / switch_agent ──────────────────────────────────────
        if (msg.type === "init" || msg.type === "switch_agent") {
            const agentId = msg.agentId ?? index_1.DEFAULT_AGENT_ID;
            const agent = (0, index_1.getAgent)(agentId);
            if (!agent) {
                send(ws, { type: "error", message: `Unknown agent: ${agentId}` });
                return;
            }
            activeAgentId = agentId;
            const session = getOrCreateAgentSession(clientId, agentId);
            send(ws, {
                type: "agent_ready",
                agentId,
                agent: { id: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color },
                tokens: session.tokens,
                historyLength: session.history.length,
            });
            return;
        }
        // ── get_history ──────────────────────────────────────────────
        if (msg.type === "get_history") {
            const agentId = msg.agentId ?? activeAgentId;
            const session = getOrCreateAgentSession(clientId, agentId);
            send(ws, { type: "history", agentId, messages: session.history, tokens: session.tokens });
            return;
        }
        // ── clear ────────────────────────────────────────────────────
        if (msg.type === "clear") {
            const session = getOrCreateAgentSession(clientId, activeAgentId);
            session.history = [];
            session.tokens = { inputTotal: 0, outputTotal: 0, callCount: 0 };
            send(ws, { type: "cleared", tokens: session.tokens });
            return;
        }
        // ── phase → resolve to chat ──────────────────────────────────
        if (msg.type === "phase") {
            const agent = (0, index_1.getAgent)(activeAgentId);
            const phase = agent?.phases.find(p => p.id === msg.phaseId);
            if (!phase) {
                send(ws, { type: "error", message: `Unknown phase: ${msg.phaseId}` });
                return;
            }
            msg = { ...msg, type: "chat", message: phase.prompt };
        }
        // ── chat ─────────────────────────────────────────────────────
        if (msg.type === "chat") {
            const userMessage = (msg.message ?? "").trim();
            if (!userMessage)
                return;
            const agent = (0, index_1.getAgent)(activeAgentId);
            if (!agent) {
                send(ws, { type: "error", message: "No agent active" });
                return;
            }
            const session = getOrCreateAgentSession(clientId, activeAgentId);
            session.history.push({ role: "user", content: userMessage });
            // Broadcast which model we're about to use
            const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
            const pendingModel = anthropicKey && anthropicKey !== "your_api_key_here"
                ? `claude / ${client_1.ANTHROPIC_MODEL}`
                : client_1.OPENROUTER_MODELS[0].label;
            send(ws, { type: "stream_start", pendingModel });
            try {
                const result = await streamResponse(ws, session.history, agent);
                session.history.push({ role: "assistant", content: result.text });
                // Accumulate token usage
                session.tokens.inputTotal += result.inputTokens;
                session.tokens.outputTotal += result.outputTokens;
                session.tokens.callCount += 1;
                send(ws, {
                    type: "stream_end",
                    model: result.model,
                    usage: {
                        inputThisCall: result.inputTokens,
                        outputThisCall: result.outputTokens,
                        inputTotal: session.tokens.inputTotal,
                        outputTotal: session.tokens.outputTotal,
                        callCount: session.tokens.callCount,
                    }
                });
            }
            catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error";
                send(ws, { type: "error", message });
            }
        }
    });
    ws.on("close", () => {
        // Retain data for 2 hours — user might reconnect
        setTimeout(() => clientData.delete(clientId), 2 * 60 * 60 * 1000);
    });
});
// ── Start ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3000", 10);
server.listen(PORT, () => {
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "your_api_key_here";
    console.log(`\n🚀 Stage → http://localhost:${PORT}`);
    console.log(`   Claude     : ${hasAnthropic ? "✓ configured" : "✗ not set → OpenRouter fallback"}`);
    console.log(`   OpenRouter : ✓ ${client_1.OPENROUTER_MODELS.length} free models in cascade\n`);
});
