import "dotenv/config";
import express from "express";
import http from "http";
import path from "path";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import Anthropic from "@anthropic-ai/sdk";
import {
  getAnthropicClient,
  getOpenRouterClient,
  ANTHROPIC_MODEL,
  OPENROUTER_MODELS,
  isAuthError,
  isProviderError,
} from "./anthropic/client";
import { getAgent, Agent, DEFAULT_AGENT_ID, getAgentsByCategory } from "./agents/index";

const execAsync = promisify(exec);
const MEMORY_ROOT = path.join(__dirname, "../memory");

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, "../public")));
app.use(express.json());

// ── REST: agent tree ──────────────────────────────────────────────
app.get("/api/agents", (_req, res) => {
  const tree = getAgentsByCategory().map(group => ({
    category: group.category,
    agents: group.agents.map(({ id, name, description, emoji, color, phases }) => ({
      id, name, description, emoji, color,
      phases: phases.map(({ id, name, icon, description }) => ({ id, name, icon, description }))
    }))
  }));
  res.json(tree);
});

// ── REST: memory list ─────────────────────────────────────────────
app.get("/api/memory/:agentId", (req, res) => {
  const dir = path.join(MEMORY_ROOT, req.params.agentId);
  if (!existsSync(dir)) { res.json({ files: [], count: 0 }); return; }
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith(".md"))
      .map(f => ({
        name: f,
        path: `memory/${req.params.agentId}/${f}`,
        mtime: statSync(path.join(dir, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtime - a.mtime);
    res.json({ files, count: files.length });
  } catch { res.json({ files: [], count: 0 }); }
});

// ═══════════════════════════════════════════════════════════════════
//  Memory helpers
// ═══════════════════════════════════════════════════════════════════

function getMemoryFileCount(agentId: string): number {
  const dir = path.join(MEMORY_ROOT, agentId);
  if (!existsSync(dir)) return 0;
  try { return readdirSync(dir).filter(f => f.endsWith(".md")).length; }
  catch { return 0; }
}

function updateMemoryIndex(): void {
  try {
    if (!existsSync(MEMORY_ROOT)) return;
    const lines: string[] = [
      "# Stage Memory Index",
      "",
      "> Auto-generated — every saved agent session appears here.",
      "",
      "| Agent | File | Saved |",
      "|-------|------|-------|",
    ];
    for (const agentId of readdirSync(MEMORY_ROOT).sort()) {
      const agentDir = path.join(MEMORY_ROOT, agentId);
      try { if (!statSync(agentDir).isDirectory()) continue; } catch { continue; }
      for (const file of readdirSync(agentDir).filter(f => f.endsWith(".md")).sort().reverse()) {
        const ts = file.replace(/\.md$/, "").split("-").slice(1).join("-");
        lines.push(`| \`${agentId}\` | [${file}](${agentId}/${file}) | ${ts} |`);
      }
    }
    writeFileSync(path.join(MEMORY_ROOT, "INDEX.md"), lines.join("\n"), "utf8");
  } catch { /* ignore index failures */ }
}

function buildSystemPromptWithMemory(agent: Agent, agentId: string): string {
  const dir = path.join(MEMORY_ROOT, agentId);
  if (!existsSync(dir)) return agent.systemPrompt;
  try {
    const files = readdirSync(dir)
      .filter(f => f.endsWith(".md"))
      .map(f => ({ name: f, mtime: statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3);
    if (!files.length) return agent.systemPrompt;

    const blocks = files.map(({ name }) => {
      let raw = readFileSync(path.join(dir, name), "utf8");
      // Strip YAML frontmatter
      raw = raw.replace(/^---[\s\S]*?---\n?/, "").trim();
      if (raw.length > 2000) raw = raw.slice(0, 2000) + "\n…[truncated]";
      return `### ${name}\n${raw}`;
    });

    return [
      "## 📚 MEMORY CONTEXT (last 3 saved sessions — most recent first)",
      "Use this for continuity. Do not repeat verbatim. Build on previous context.",
      "",
      ...blocks,
      "",
      "---",
      "",
      agent.systemPrompt,
    ].join("\n");
  } catch { return agent.systemPrompt; }
}

async function saveMemoryFile(
  agentId: string,
  agentName: string,
  command: string,
  content: string,
  sessionId: string
): Promise<{ filename: string; relPath: string; pushed: boolean }> {
  if (!existsSync(MEMORY_ROOT)) mkdirSync(MEMORY_ROOT, { recursive: true });
  const dir = path.join(MEMORY_ROOT, agentId);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const now    = new Date();
  const ts     = now.toISOString().replace("T", "-").replace(/:/g, "").slice(0, 17);
  const safe   = command.replace(/\//g, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = `${safe}-${ts}.md`;
  const filepath = path.join(dir, filename);

  const md = [
    "---",
    `agent: "${agentName}"`,
    `agentId: ${agentId}`,
    `command: ${command}`,
    `date: "${now.toISOString()}"`,
    `session: "${sessionId}"`,
    "---",
    "",
    `# ${command} — ${agentName}`,
    `> **Date:** ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`,
    `> **Agent:** ${agentName}`,
    "",
    "---",
    "",
    content,
  ].join("\n");

  writeFileSync(filepath, md, "utf8");
  updateMemoryIndex();

  const relPath = `memory/${agentId}/${filename}`;
  const cwd     = path.join(__dirname, "..");
  let pushed    = false;

  try {
    await execAsync(
      `git -C "${cwd}" add memory/ && ` +
      `git -C "${cwd}" commit -m "mem: [${agentId}] ${command} ${ts}" && ` +
      `git -C "${cwd}" push origin main`
    );
    pushed = true;
  } catch { /* not in a repo or no remote — silently skip */ }

  return { filename, relPath, pushed };
}

// ── Session model ─────────────────────────────────────────────────
type MsgParam = Anthropic.MessageParam;

interface TokenUsage {
  inputTotal: number;
  outputTotal: number;
  callCount: number;
}

interface AgentSession {
  history: MsgParam[];
  tokens: TokenUsage;
}

// clientId → agentId → AgentSession
const clientData = new Map<string, Map<string, AgentSession>>();

function getOrCreateAgentSession(clientId: string, agentId: string): AgentSession {
  if (!clientData.has(clientId)) clientData.set(clientId, new Map());
  const agentMap = clientData.get(clientId)!;
  if (!agentMap.has(agentId)) {
    agentMap.set(agentId, {
      history: [],
      tokens: { inputTotal: 0, outputTotal: 0, callCount: 0 }
    });
  }
  return agentMap.get(agentId)!;
}

// ── WebSocket types ───────────────────────────────────────────────
interface ClientMsg {
  type: "init" | "chat" | "clear" | "switch_agent" | "phase" | "get_history" | "save_memory";
  clientId?:  string;
  agentId?:   string;
  phaseId?:   string;
  message?:   string;
  // memory fields
  command?:   string;
  content?:   string;
  agentName?: string;
}

interface StreamResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

function send(ws: WebSocket, data: object) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function sendStatusChunk(ws: WebSocket, text: string) {
  send(ws, { type: "stream_chunk", chunk: `\n\n> _${text}_\n\n` });
}

// ── Provider cascade ──────────────────────────────────────────────
async function streamResponse(
  ws: WebSocket,
  history: MsgParam[],
  agent: Agent
): Promise<StreamResult> {
  const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
  if (anthropicKey && anthropicKey !== "your_api_key_here") {
    try {
      return await streamAnthropic(ws, history, agent);
    } catch (err) {
      if (isAuthError(err)) {
        sendStatusChunk(ws, "⚠ Claude access issue — switching to backup model…");
      } else {
        throw err;
      }
    }
  }

  for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
    const model = OPENROUTER_MODELS[i];
    try {
      if (i > 0) sendStatusChunk(ws, `Trying ${model.label}…`);
      return await streamOpenRouter(ws, history, agent, model.id, model.label);
    } catch (err) {
      const isLast = i === OPENROUTER_MODELS.length - 1;
      if ((isAuthError(err) || isProviderError(err)) && !isLast) {
        sendStatusChunk(ws, `⚠ ${model.label} unavailable — trying next…`);
      } else if (isLast) {
        throw new Error(`All models exhausted. Last: ${err instanceof Error ? err.message : String(err)}`);
      } else {
        throw err;
      }
    }
  }
  throw new Error("No models available");
}

async function streamAnthropic(
  ws: WebSocket,
  history: MsgParam[],
  agent: Agent
): Promise<StreamResult> {
  const client = getAnthropicClient();
  let full = "";

  const stream = client.messages.stream({
    model: ANTHROPIC_MODEL,
    max_tokens: 8096,
    thinking: { type: "adaptive" } as any,
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
    model: `claude / ${ANTHROPIC_MODEL}`,
    inputTokens: final.usage.input_tokens,
    outputTokens: final.usage.output_tokens,
  };
}

async function streamOpenRouter(
  ws: WebSocket,
  history: MsgParam[],
  agent: Agent,
  modelId: string,
  modelLabel: string
): Promise<StreamResult> {
  const client = getOpenRouterClient();
  let full = "";
  let inputTokens  = 0;
  let outputTokens = 0;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: agent.systemPrompt },
    ...history.map(m => ({
      role: m.role as "user" | "assistant",
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
    if (chunk.usage) {
      inputTokens  = (chunk.usage as any).prompt_tokens     ?? 0;
      outputTokens = (chunk.usage as any).completion_tokens ?? 0;
    }
  }

  return { text: full, model: modelLabel, inputTokens, outputTokens };
}

// ── WebSocket connection handler ──────────────────────────────────
wss.on("connection", (ws) => {
  let clientId    = uuidv4();
  let activeAgentId = DEFAULT_AGENT_ID;

  send(ws, { type: "connected", clientId });

  ws.on("message", async (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw.toString()); }
    catch { send(ws, { type: "error", message: "Invalid message" }); return; }

    if (msg.clientId) clientId = msg.clientId;

    // ── init / switch_agent ──────────────────────────────────────
    if (msg.type === "init" || msg.type === "switch_agent") {
      const agentId = msg.agentId ?? DEFAULT_AGENT_ID;
      const agent   = getAgent(agentId);
      if (!agent) { send(ws, { type: "error", message: `Unknown agent: ${agentId}` }); return; }

      activeAgentId = agentId;
      const session = getOrCreateAgentSession(clientId, agentId);

      send(ws, {
        type: "agent_ready",
        agentId,
        agent: { id: agent.id, name: agent.name, emoji: agent.emoji, color: agent.color },
        tokens: session.tokens,
        historyLength: session.history.length,
        memoryCount: getMemoryFileCount(agentId),
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
      session.tokens  = { inputTotal: 0, outputTotal: 0, callCount: 0 };
      send(ws, { type: "cleared", tokens: session.tokens });
      return;
    }

    // ── save_memory ──────────────────────────────────────────────
    if (msg.type === "save_memory") {
      const agentId   = msg.agentId ?? activeAgentId;
      const command   = msg.command  ?? "session";
      const content   = msg.content  ?? "";
      const agentObj  = getAgent(agentId);
      const agentName = msg.agentName ?? agentObj?.name ?? agentId;

      const result = await saveMemoryFile(agentId, agentName, command, content, clientId);

      send(ws, {
        type:    "memory_saved",
        agentId,
        path:    result.relPath,
        pushed:  result.pushed,
        count:   getMemoryFileCount(agentId),
      });
      return;
    }

    // ── phase → resolve to chat ──────────────────────────────────
    if (msg.type === "phase") {
      const agent = getAgent(activeAgentId);
      const phase = agent?.phases.find(p => p.id === msg.phaseId);
      if (!phase) { send(ws, { type: "error", message: `Unknown phase: ${msg.phaseId}` }); return; }
      msg = { ...msg, type: "chat", message: phase.prompt };
    }

    // ── chat ─────────────────────────────────────────────────────
    if (msg.type === "chat") {
      const userMessage = (msg.message ?? "").trim();
      if (!userMessage) return;

      const agent = getAgent(activeAgentId);
      if (!agent) { send(ws, { type: "error", message: "No agent active" }); return; }

      const session = getOrCreateAgentSession(clientId, activeAgentId);
      session.history.push({ role: "user", content: userMessage });

      const anthropicKey = process.env.ANTHROPIC_API_KEY || "";
      const pendingModel = anthropicKey && anthropicKey !== "your_api_key_here"
        ? `claude / ${ANTHROPIC_MODEL}`
        : OPENROUTER_MODELS[0].label;

      send(ws, { type: "stream_start", pendingModel });

      try {
        // Inject memory context into the system prompt transparently
        const agentWithMemory: Agent = {
          ...agent,
          systemPrompt: buildSystemPromptWithMemory(agent, activeAgentId),
        };
        const result = await streamResponse(ws, session.history, agentWithMemory);
        session.history.push({ role: "assistant", content: result.text });

        session.tokens.inputTotal  += result.inputTokens;
        session.tokens.outputTotal += result.outputTokens;
        session.tokens.callCount   += 1;

        send(ws, {
          type:  "stream_end",
          model: result.model,
          usage: {
            inputThisCall:  result.inputTokens,
            outputThisCall: result.outputTokens,
            inputTotal:     session.tokens.inputTotal,
            outputTotal:    session.tokens.outputTotal,
            callCount:      session.tokens.callCount,
          }
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        send(ws, { type: "error", message });
      }
    }
  });

  ws.on("close", () => {
    setTimeout(() => clientData.delete(clientId), 2 * 60 * 60 * 1000);
  });
});

// ── Start ─────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? "3000", 10);
server.listen(PORT, () => {
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== "your_api_key_here";
  console.log(`\n🚀 Stage → http://localhost:${PORT}`);
  console.log(`   Claude     : ${hasAnthropic ? "✓ configured" : "✗ not set → OpenRouter fallback"}`);
  console.log(`   OpenRouter : ✓ ${OPENROUTER_MODELS.length} free models in cascade`);
  console.log(`   Memory     : ${MEMORY_ROOT}\n`);
});
