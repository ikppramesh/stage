#!/usr/bin/env ts-node
/**
 * Stage CLI — use any agent directly from your terminal.
 *
 * Usage
 * ─────
 *   npm run stage                              # interactive REPL
 *   npm run stage -- @devops /intake           # switch agent + command, then REPL
 *   npm run stage -- "@pm what is an OKR?"    # one-shot question, then REPL
 *
 * Inside the REPL
 * ───────────────
 *   @devops /intake describe CI/CD for this project
 *   @pm what should our Q3 OKRs be?
 *   /plan
 *   /agents      — list all agents and their aliases
 *   /memory      — show saved memory files for current agent
 *   /clear       — reset conversation history
 *   /exit        — quit
 */

import "dotenv/config";
import * as readline from "readline";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import Anthropic from "@anthropic-ai/sdk";
import {
  getAgent,
  getAgentsByCategory,
} from "./agents/index";
import {
  getAnthropicClient,
  getOpenRouterClient,
  ANTHROPIC_MODEL,
  OPENROUTER_MODELS,
  isAuthError,
  isProviderError,
} from "./anthropic/client";

const execAsync = promisify(exec);

// ── ANSI colour helpers ────────────────────────────────────────────
const TTY = process.stdout.isTTY;
const c = {
  bold:   (s: string) => TTY ? `\x1b[1m${s}\x1b[0m`           : s,
  dim:    (s: string) => TTY ? `\x1b[2m${s}\x1b[0m`           : s,
  reset:  (s: string) => TTY ? `\x1b[0m${s}`                  : s,
  cyan:   (s: string) => TTY ? `\x1b[36m${s}\x1b[0m`          : s,
  green:  (s: string) => TTY ? `\x1b[32m${s}\x1b[0m`          : s,
  yellow: (s: string) => TTY ? `\x1b[33m${s}\x1b[0m`          : s,
  orange: (s: string) => TTY ? `\x1b[38;5;208m${s}\x1b[0m`    : s,
  red:    (s: string) => TTY ? `\x1b[31m${s}\x1b[0m`          : s,
};

// ── Agent mention aliases ──────────────────────────────────────────
const AGENT_MENTIONS: Record<string, string> = {
  "@softwaredevelopment": "software-development",
  "@swdev":               "software-development",
  "@sd":                  "software-development",
  "@dev":                 "software-development",
  "@frontend":            "frontend-engineer",
  "@fe":                  "frontend-engineer",
  "@ui":                  "frontend-engineer",
  "@backend":             "backend-engineer",
  "@be":                  "backend-engineer",
  "@api":                 "backend-engineer",
  "@fullstack":           "fullstack-engineer",
  "@fs":                  "fullstack-engineer",
  "@devops":              "devops",
  "@ops":                 "devops",
  "@cicd":                "devops",
  "@qa":                  "qa-engineer",
  "@test":                "qa-engineer",
  "@security":            "security-engineer",
  "@sec":                 "security-engineer",
  "@mobile":              "mobile-engineer",
  "@data":                "data-engineer",
  "@ml":                  "ml-engineer",
  "@ai":                  "ml-engineer",
  "@pm":                  "product-manager",
  "@product":             "product-manager",
  "@ux":                  "ux-designer",
  "@design":              "ux-designer",
  "@writer":              "technical-writer",
  "@docs":                "technical-writer",
  "@arch":                "software-architect",
  "@architect":           "software-architect",
  "@em":                  "engineering-manager",
  "@manager":             "engineering-manager",
  "@techlead":            "tech-lead",
  "@lead":                "tech-lead",
  "@review":              "tech-lead",
};

// ── Memory helpers ─────────────────────────────────────────────────
const MEMORY_ROOT = path.join(__dirname, "../memory");

function getMemoryContext(agentId: string): string {
  const dir = path.join(MEMORY_ROOT, agentId);
  if (!fs.existsSync(dir)) return "";
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith(".md"))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 3);
    if (!files.length) return "";

    const blocks = files.map(({ name }) => {
      let raw = fs.readFileSync(path.join(dir, name), "utf8");
      raw = raw.replace(/^---[\s\S]*?---\n?/, "").trim();
      if (raw.length > 2000) raw = raw.slice(0, 2000) + "\n…[truncated]";
      return `### ${name}\n${raw}`;
    });

    return [
      "## 📚 MEMORY CONTEXT (last 3 sessions — most recent first)",
      "Use for continuity. Build on previous context.",
      "",
      ...blocks,
      "",
      "---",
      "",
    ].join("\n");
  } catch { return ""; }
}

function saveMemory(agentId: string, agentName: string, command: string, content: string): string {
  if (!fs.existsSync(MEMORY_ROOT)) fs.mkdirSync(MEMORY_ROOT, { recursive: true });
  const dir = path.join(MEMORY_ROOT, agentId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const now      = new Date();
  const ts       = now.toISOString().replace("T", "-").replace(/:/g, "").slice(0, 17);
  const safe     = command.replace(/\//g, "").replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = `${safe}-${ts}.md`;
  const filepath = path.join(dir, filename);

  const md = [
    "---",
    `agent: "${agentName}"`,
    `agentId: ${agentId}`,
    `command: "${command}"`,
    `date: "${now.toISOString()}"`,
    `source: cli`,
    "---",
    "",
    `# ${command} — ${agentName}`,
    `> **Date:** ${now.toLocaleString()}`,
    `> **Source:** CLI`,
    "",
    "---",
    "",
    content,
  ].join("\n");

  fs.writeFileSync(filepath, md, "utf8");

  // Update INDEX.md
  try {
    const lines = [
      "# Stage Memory Index",
      "",
      "> Auto-generated. Every saved agent session appears here.",
      "",
      "| Agent | File | Saved |",
      "|-------|------|-------|",
    ];
    for (const aid of fs.readdirSync(MEMORY_ROOT).sort()) {
      const adir = path.join(MEMORY_ROOT, aid);
      try { if (!fs.statSync(adir).isDirectory()) continue; } catch { continue; }
      for (const f of fs.readdirSync(adir).filter(x => x.endsWith(".md")).sort().reverse()) {
        lines.push(`| \`${aid}\` | [${f}](${aid}/${f}) | ${f.split("-").slice(1).join("-").replace(".md", "")} |`);
      }
    }
    fs.writeFileSync(path.join(MEMORY_ROOT, "INDEX.md"), lines.join("\n"), "utf8");
  } catch { /* ignore */ }

  return `memory/${agentId}/${filename}`;
}

async function tryGitPush(relPath: string): Promise<void> {
  const cwd = path.join(__dirname, "..");
  try {
    await execAsync(
      `git -C "${cwd}" add memory/ && ` +
      `git -C "${cwd}" commit -m "mem(cli): ${relPath}" && ` +
      `git -C "${cwd}" push origin main`
    );
  } catch { /* no git / no remote — silently skip */ }
}

// ── AI streaming ───────────────────────────────────────────────────
type MsgParam = Anthropic.MessageParam;

async function streamToTerminal(
  history: MsgParam[],
  agentId: string,
): Promise<string> {
  const agent = getAgent(agentId);
  if (!agent) throw new Error(`Unknown agent: ${agentId}`);

  const memCtx    = getMemoryContext(agentId);
  const sysPrompt = memCtx ? memCtx + agent.systemPrompt : agent.systemPrompt;

  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? "";
  const useAnthropic = anthropicKey && anthropicKey !== "your_api_key_here";

  let full = "";

  if (useAnthropic) {
    const client = getAnthropicClient();
    const stream = client.messages.stream({
      model: ANTHROPIC_MODEL,
      max_tokens: 8096,
      thinking: { type: "adaptive" } as any,
      system: sysPrompt,
      messages: history,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        process.stdout.write(event.delta.text);
        full += event.delta.text;
      }
    }
  } else {
    const client = getOpenRouterClient();
    for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
      const model = OPENROUTER_MODELS[i];
      try {
        if (i > 0) process.stderr.write(c.yellow(`\n⚠  Trying ${model.label}…\n`));
        const msgs: { role: "system" | "user" | "assistant"; content: string }[] = [
          { role: "system", content: sysPrompt },
          ...history.map(m => ({
            role:    m.role as "user" | "assistant",
            content: typeof m.content === "string" ? m.content : "",
          })),
        ];
        const stream = await client.chat.completions.create({
          model:      model.id,
          max_tokens: 4096,
          stream:     true,
          messages:   msgs,
        });
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
          if (text) { process.stdout.write(text); full += text; }
        }
        break;
      } catch (err) {
        if ((isAuthError(err) || isProviderError(err)) && i < OPENROUTER_MODELS.length - 1) continue;
        throw err;
      }
    }
  }

  process.stdout.write("\n");
  return full;
}

// ── REPL ──────────────────────────────────────────────────────────
interface Session {
  agentId:     string;
  history:     MsgParam[];
  lastCommand: string;
}

function resolveAlias(input: string): { agentId: string | null; rest: string } {
  const parts   = input.trim().split(/\s+/);
  const mention = parts[0].toLowerCase();
  if (mention.startsWith("@")) {
    const agentId = AGENT_MENTIONS[mention] ?? null;
    return { agentId, rest: parts.slice(1).join(" ") };
  }
  return { agentId: null, rest: input };
}

async function main() {
  const initArgs = process.argv.slice(2).join(" ").trim();

  // ── Banner ───────────────────────────────────────────────────────
  console.log(c.bold(c.orange("\n  ◆  Stage CLI")));
  console.log(c.dim("  Multi-agent AI terminal\n"));
  console.log(c.dim("  @devops /intake …    switch agent + send command"));
  console.log(c.dim("  /agents              list all agents & aliases"));
  console.log(c.dim("  /memory              show saved memory for current agent"));
  console.log(c.dim("  /clear               reset conversation history"));
  console.log(c.dim("  /exit                quit\n"));

  const session: Session = {
    agentId:     "software-development",
    history:     [],
    lastCommand: "chat",
  };

  // ── Handle one line of input ──────────────────────────────────────
  async function handle(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    // ── Built-in commands ─────────────────────────────────────────
    if (trimmed === "/exit" || trimmed === "/quit") {
      console.log(c.dim("bye!\n"));
      process.exit(0);
    }

    if (trimmed === "/clear") {
      session.history = [];
      console.log(c.green("✓ History cleared\n"));
      return;
    }

    if (trimmed === "/agents") {
      const tree = getAgentsByCategory();
      tree.forEach(group => {
        console.log(`\n${c.bold(group.category)}`);
        group.agents.forEach(a => {
          // find matching aliases
          const aliases = Object.entries(AGENT_MENTIONS)
            .filter(([, id]) => id === a.id)
            .map(([alias]) => alias)
            .join("  ");
          console.log(`  ${a.emoji}  ${c.cyan(aliases)}  ${c.dim(a.name)}`);
        });
      });
      console.log("");
      return;
    }

    if (trimmed === "/memory") {
      const dir = path.join(MEMORY_ROOT, session.agentId);
      if (!fs.existsSync(dir)) {
        console.log(c.dim("  No memory files saved yet.\n"));
        return;
      }
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith(".md"))
        .sort()
        .reverse()
        .slice(0, 10);
      if (!files.length) { console.log(c.dim("  No memory files saved yet.\n")); return; }
      const agent = getAgent(session.agentId)!;
      console.log(`\n${c.bold("Memory")} — ${agent.emoji} ${agent.name}`);
      files.forEach(f => console.log(`  📄  ${f}`));
      console.log("");
      return;
    }

    // ── @mention agent switch ─────────────────────────────────────
    let inputLine = trimmed;
    const { agentId: newId, rest } = resolveAlias(trimmed);

    if (newId !== null) {
      const target = getAgent(newId);
      if (!target) {
        console.error(c.red(`  Unknown agent alias: ${trimmed.split(" ")[0]}\n`));
        return;
      }
      if (newId !== session.agentId) {
        session.agentId  = newId;
        session.history  = [];
        console.log(c.green(`  ✓ Switched to ${target.emoji} ${target.name}\n`));
      }
      if (!rest.trim()) return;   // bare @mention with no message — just switched
      inputLine = rest.trim();
    }

    // ── Detect slash command for memory label ─────────────────────
    const slashMatch = inputLine.match(/^(\/[\w-]+)/);
    session.lastCommand = slashMatch ? slashMatch[1] : "chat";

    // ── Stream response ───────────────────────────────────────────
    session.history.push({ role: "user", content: inputLine });
    process.stdout.write("\n");

    let content = "";
    try {
      content = await streamToTerminal(session.history, session.agentId);
      session.history.push({ role: "assistant", content });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(c.red(`\n  Error: ${msg}\n`));
      session.history.pop(); // remove failed user turn
      return;
    }

    // ── Save memory after any slash command ───────────────────────
    if (session.lastCommand !== "chat" && content.trim()) {
      const agent   = getAgent(session.agentId)!;
      const relPath = saveMemory(session.agentId, agent.name, session.lastCommand, content);
      process.stderr.write(c.dim(`\n  📚 Memory saved → ${relPath}\n`));
      tryGitPush(relPath); // fire-and-forget
    }

    process.stdout.write("\n");
  }

  // ── Prompt helper ────────────────────────────────────────────────
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  // ask() returns null when stdin closes (EOF / Ctrl-D) so the loop
  // can exit cleanly *after* any in-flight streaming completes.
  let rlClosed = false;
  rl.on("close", () => { rlClosed = true; });

  const ask = (): Promise<string | null> => {
    if (rlClosed) return Promise.resolve(null);
    const agent  = getAgent(session.agentId);
    const prompt = `${c.cyan(agent?.emoji ?? "◆")} ${c.bold(agent?.name ?? session.agentId)} ${c.dim("›")} `;
    return new Promise(resolve => {
      const onClose = () => resolve(null);
      rl.once("close", onClose);
      rl.question(prompt, answer => {
        rl.removeListener("close", onClose);
        resolve(answer);
      });
    });
  };

  // ── Run initial args if provided ─────────────────────────────────
  if (initArgs) {
    const agent = getAgent(session.agentId)!;
    console.log(`${c.cyan(agent.emoji)} ${c.bold(agent.name)} ${c.dim("›")} ${initArgs}`);
    await handle(initArgs);
  }

  // ── REPL loop ────────────────────────────────────────────────────
  while (true) {
    const line = await ask();
    if (line === null) break;   // stdin closed — exit after current stream finishes
    await handle(line);
  }
  console.log(c.dim("\nbye!\n"));
}

main().catch(err => { console.error(err); process.exit(1); });
