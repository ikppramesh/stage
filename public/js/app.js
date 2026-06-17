/* ══════════════════════════════════════════════════════════
   Stage — Agent Terminal  |  Frontend
   Dual-mode: WebSocket (local) + Direct API (GitHub Pages)
   ══════════════════════════════════════════════════════════ */

// ── Markdown setup ───────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });
const renderer = new marked.Renderer();
renderer.code = (code, lang) => {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  return `<div class="code-block"><div class="code-header"><span class="code-lang">${language}</span><button class="copy-btn" onclick="copyCode(this)">Copy</button></div><pre><code class="hljs language-${language}">${highlighted}</code></pre></div>`;
};
marked.use({ renderer });

function copyCode(btn) {
  const code = btn.closest(".code-block").querySelector("code").innerText;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = "Copied!"; btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1800);
  });
}

// ── Slash commands ────────────────────────────────────────
const SLASH_COMMANDS = [
  { cmd: "/status",      icon: "📊", label: "Status",      desc: "Project overview & current phase progress",
    prompt: "Show me the current project status — what phase are we in, what has been completed, and what is next?" },
  { cmd: "/connect",     icon: "🔗", label: "Connect",     desc: "Register a repository to work on",
    prompt: "I want to connect a repository to work on. Ask me for the GitHub URL or owner/repo, then detect the tech stack." },
  { cmd: "/discover",    icon: "🔍", label: "Discover",    desc: "Run 5-phase codebase discovery",
    prompt: "Run a 5-phase discovery on the connected repo: 1) Repo Scan, 2) Architecture, 3) Conventions, 4) CONTEXT.md (under 2000 tokens), 5) Readiness Report." },
  { cmd: "/intake",      icon: "📋", label: "Intake",      desc: "Parse a feature into structured requirements",
    prompt: "I want to start a new feature. Ask me for the name and description, then produce a structured intake doc: functional and non-functional requirements, scope IN/OUT, affected areas." },
  { cmd: "/investigate", icon: "🔬", label: "Investigate", desc: "Read-only analysis — NO code yet",
    prompt: "Run a read-only investigation. Steps: 1) Search git history for prior art, 2) Build vocabulary map, 3) Load codebase context, 4) Identify affected files with justification, 5) Propose exactly 2 implementation approaches with trade-offs, 6) Derive a FORBIDDEN list. Output a YAML investigation report. No code written." },
  { cmd: "/plan",        icon: "📐", label: "Plan",        desc: "Implementation plan + INVEST scoring → awaits approval",
    prompt: "Create a detailed implementation plan: files to change, files to create, constraint block (SCOPE + CEILING + FORBIDDEN), INVEST score per task, branch name, PR title, test strategy. Then STOP and wait for my approval before implementation." },
  { cmd: "/decompose",   icon: "🃏", label: "Decompose",   desc: "Break approved plan into atomic T-X.Y tasks",
    prompt: "Break the approved plan into T-X.Y atomic tasks (e.g. T-1.1, T-1.2). Each task: INVEST validated, 3 files max, explicit dependencies declared, validation commands included. Show the list and ask which task to start." },
  { cmd: "/implement",   icon: "💻", label: "Implement",   desc: "Task-by-task code implementation",
    prompt: "Implement the next task. Declare SCOPE/CEILING/FORBIDDEN constraint block, write production-quality code following conventions, run validation (type check + lint + tests). Ask me which task (T-X.Y) if not set." },
  { cmd: "/qa",          icon: "🧪", label: "QA",          desc: "3-gate testing: unit → integration → E2E",
    prompt: "Run the 3-gate QA pipeline. Gate 1: unit tests (must pass). Gate 2: integration tests (must pass). Gate 3: Playwright E2E with data-testid selectors only, no hardcoded URLs, no waitForTimeout(), tests in qa/ directory. Block on failures." },
  { cmd: "/ship",        icon: "🚀", label: "Ship",        desc: "Build + validate + commit + PR",
    prompt: "Prepare to ship: 1) Full build (stop if fails), 2) All tests (stop if fails), 3) Anti-pattern scan (no console.log, no TODO, no secrets, no unused imports), 4) Stage specific files only — never git add -A, 5) Conventional commit, 6) Push to feature branch, 7) Create PR with summary + test checklist. Print the PR URL." },
  { cmd: "/sprint",      icon: "📅", label: "Sprint",      desc: "Sprint planning and backlog grooming",
    prompt: "Let's run a sprint planning session. Ask me about team capacity, velocity, sprint goal, and current backlog. Help produce DoD, DoR, and story breakdowns with Fibonacci estimates." },
  { cmd: "/devops",      icon: "⚙️", label: "DevOps",      desc: "CI/CD pipelines, Docker, Cloud",
    prompt: "Help me set up CI/CD or DevOps infrastructure. Ask me about my tech stack, deployment target, and requirements." },
  { cmd: "/docs",        icon: "📚", label: "Docs",        desc: "README, API docs, ADRs, runbooks",
    prompt: "Help me write technical documentation. Ask me what needs to be documented and in what format." },
];

const SDLC_SKILLS = [
  { icon: "📋", label: "PRD & Requirements",  desc: "Intake → Investigate → Plan",        cmd: "/intake" },
  { icon: "🔗", label: "Explore Repository",  desc: "Connect → 5-phase Discovery",        cmd: "/connect" },
  { icon: "💻", label: "Develop Feature",      desc: "Investigate → Plan → Implement",     cmd: "/investigate" },
  { icon: "🧪", label: "QA & Testing",         desc: "Unit → Integration → E2E",          cmd: "/qa" },
  { icon: "🚀", label: "Ship & PR",            desc: "Build → Validate → Commit → PR",    cmd: "/ship" },
  { icon: "📅", label: "Sprint Planning",      desc: "Scrum · backlog · estimates",        cmd: "/sprint" },
  { icon: "⚙️", label: "CI/CD & DevOps",      desc: "Pipelines · Docker · Cloud",         cmd: "/devops" },
  { icon: "📚", label: "Documentation",        desc: "README · ADRs · runbooks",           cmd: "/docs" },
];

// ── State ────────────────────────────────────────────────
const S = {
  mode:          null,   // 'ws' | 'direct'
  ws:            null,
  clientId:      localStorage.getItem("stage_cid") || null,
  activeAgentId: "software-development",
  isStreaming:   false,
  tree:          AGENT_REGISTRY,
  agentSessions: {},     // agentId → { history: [], messages: [], tokens: {} }
  currentModel:  null,
  sessionTokens: { inputTotal: 0, outputTotal: 0, callCount: 0 },
  cmdSelected:   -1,
  cmdFiltered:   [],
};

// ── DOM ──────────────────────────────────────────────────
const $    = id => document.getElementById(id);
const chat = $("chat");
const input = $("user-input");

// ── Session helpers ───────────────────────────────────────
function getSession(agentId) {
  if (!S.agentSessions[agentId]) {
    S.agentSessions[agentId] = { history: [], messages: [], tokens: { inputTotal: 0, outputTotal: 0, callCount: 0 } };
  }
  return S.agentSessions[agentId];
}

function findAgent(id) {
  for (const g of S.tree) {
    const a = g.agents.find(a => a.id === id);
    if (a) return a;
  }
  return null;
}

// ══════════════════════════════════════════════════════════
//  MODE A — WebSocket (local dev with Node.js backend)
// ══════════════════════════════════════════════════════════
function tryWebSocket() {
  setConnStatus("connecting", "Connecting…");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}`);

  // If no backend within 2 seconds, switch to direct mode
  const timeout = setTimeout(() => {
    ws.close();
    switchToDirectMode();
  }, 2000);

  ws.onopen = () => {
    clearTimeout(timeout);
    S.mode = "ws";
    S.ws   = ws;
    setConnStatus("connected", "Connected");
    ws.send(JSON.stringify({ type: "init", clientId: S.clientId, agentId: S.activeAgentId }));
  };

  ws.onerror = () => {
    clearTimeout(timeout);
    switchToDirectMode();
  };

  ws.onclose = () => {
    if (S.mode === "ws") {
      setConnStatus("disconnected", "Reconnecting…");
      setTimeout(tryWebSocket, 2000);
    }
  };

  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    handleWsMessage(m);
  };
}

let wsStreamEl = null, wsStreamBuf = "";

function handleWsMessage(m) {
  switch (m.type) {
    case "connected":
      if (!S.clientId) { S.clientId = m.clientId; localStorage.setItem("stage_cid", S.clientId); }
      break;
    case "agent_ready":
      S.activeAgentId = m.agentId;
      applyAgent(findAgent(m.agentId) || m.agent);
      if (m.tokens) updateTokenDisplay(m.tokens, null);
      renderAgentHistory(m.agentId);
      enableInput(`Type a message or "/" for skill commands…`);
      break;
    case "stream_start":
      S.isStreaming = true; disableInput(); hideCommandPalette(); removeThinking(); showThinking();
      wsStreamBuf = ""; wsStreamEl = null;
      if (m.pendingModel) setModelDisplay(m.pendingModel);
      break;
    case "stream_chunk":
      removeThinking();
      if (!wsStreamEl) wsStreamEl = appendAgentBubble();
      wsStreamBuf += m.chunk;
      wsStreamEl.querySelector(".msg-content").innerHTML = marked.parse(wsStreamBuf) + '<span class="cur"></span>';
      scrollBottom();
      break;
    case "stream_end":
      S.isStreaming = false; removeThinking();
      if (wsStreamEl) {
        wsStreamEl.querySelector(".msg-content").innerHTML = marked.parse(wsStreamBuf);
        if (m.usage && m.model) attachUsageBadge(wsStreamEl, m.model, m.usage);
        saveMsg(S.activeAgentId, { role:"assistant", content:wsStreamBuf, model:m.model, usage:m.usage, time:new Date().toISOString() });
        wsStreamEl = null; wsStreamBuf = "";
      }
      if (m.usage) updateTokenDisplay(m.usage, m.model);
      if (m.model) setModelDisplay(m.model);
      enableInput(); scrollBottom();
      break;
    case "cleared":
      getSession(S.activeAgentId).messages = [];
      getSession(S.activeAgentId).history  = [];
      S.sessionTokens = { inputTotal:0, outputTotal:0, callCount:0 };
      updateTokenDisplay(S.sessionTokens, null);
      renderAgentHistory(S.activeAgentId);
      break;
    case "error":
      removeThinking(); S.isStreaming = false;
      appendErrorBubble(m.message); enableInput();
      break;
  }
}

function wsSend(data) {
  if (S.ws?.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(data));
}

// ══════════════════════════════════════════════════════════
//  MODE B — Direct OpenRouter API (GitHub Pages / static)
// ══════════════════════════════════════════════════════════
function switchToDirectMode() {
  S.mode = "direct";
  setConnStatus("connected", "Direct API");
  // Show agent immediately
  const agent = findAgent(S.activeAgentId);
  if (agent) applyAgent(agent);
  renderAgentHistory(S.activeAgentId);
  enableInput(`Type a message or "/" for skill commands…`);
}

async function directSend(userMessage) {
  if (S.isStreaming) return;
  S.isStreaming = true;
  disableInput(); hideCommandPalette(); removeThinking(); showThinking();

  const session = getSession(S.activeAgentId);
  const agent   = findAgent(S.activeAgentId);
  session.history.push({ role: "user", content: userMessage });

  let streamEl  = null;
  let streamBuf = "";

  function onChunk(text) {
    removeThinking();
    if (!streamEl) streamEl = appendAgentBubble();
    streamBuf += text;
    streamEl.querySelector(".msg-content").innerHTML = marked.parse(streamBuf) + '<span class="cur"></span>';
    scrollBottom();
  }

  function onStatus(text) {
    removeThinking();
    if (!streamEl) streamEl = appendAgentBubble();
    streamBuf += `\n\n> _${text}_\n\n`;
    streamEl.querySelector(".msg-content").innerHTML = marked.parse(streamBuf) + '<span class="cur"></span>';
    scrollBottom();
  }

  let succeeded = false;
  for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
    const model = OPENROUTER_MODELS[i];
    try {
      if (i > 0) onStatus(`Switching to ${model.label}…`);
      setModelDisplay(model.label);

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "Content-Type":  "application/json",
          "HTTP-Referer":  window.location.href,
          "X-Title":       "Stage AI Agent Terminal",
        },
        body: JSON.stringify({
          model:    model.id,
          max_tokens: 4096,
          stream:   true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: agent.systemPrompt },
            ...session.history.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(`${resp.status} — ${txt.slice(0, 200)}`);
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let usage = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value, { stream: true });
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const text = json.choices?.[0]?.delta?.content;
            if (text) onChunk(text);
            if (json.usage) usage = json.usage;
          } catch {}
        }
      }

      // Finalise bubble
      if (streamEl) {
        streamEl.querySelector(".msg-content").innerHTML = marked.parse(streamBuf);
        const usageObj = usage ? {
          inputThisCall:  usage.prompt_tokens    || 0,
          outputThisCall: usage.completion_tokens || 0,
          inputTotal:     (session.tokens.inputTotal  || 0) + (usage.prompt_tokens    || 0),
          outputTotal:    (session.tokens.outputTotal || 0) + (usage.completion_tokens || 0),
          callCount:      (session.tokens.callCount   || 0) + 1,
        } : null;

        if (usageObj) {
          attachUsageBadge(streamEl, model.label, usageObj);
          session.tokens = { inputTotal: usageObj.inputTotal, outputTotal: usageObj.outputTotal, callCount: usageObj.callCount };
          updateTokenDisplay(usageObj, model.label);
        }
        setModelDisplay(model.label);
        saveMsg(S.activeAgentId, { role:"assistant", content:streamBuf, model:model.label, usage:usageObj, time:new Date().toISOString() });
      }

      session.history.push({ role: "assistant", content: streamBuf });
      succeeded = true;
      break;

    } catch (err) {
      if (i === OPENROUTER_MODELS.length - 1) {
        removeThinking();
        appendErrorBubble(`All models failed. Last error: ${err.message}`);
      } else {
        onStatus(`⚠ ${model.label} unavailable — trying next…`);
      }
    }
  }

  S.isStreaming = false;
  enableInput();
  scrollBottom();
}

// ── Universal send ────────────────────────────────────────
function sendMessage(userMessage) {
  userMessage = userMessage.trim();
  if (!userMessage || S.isStreaming) return;

  // Resolve slash command to full prompt
  const slashCmd = SLASH_COMMANDS.find(c => c.cmd === userMessage);
  const actualMsg = slashCmd ? slashCmd.prompt : userMessage;
  const displayMsg = userMessage;  // always show what the user typed

  $("welcome")?.remove();
  clearSkillBadge();
  hideCommandPalette();
  appendUserBubble(displayMsg);
  if (slashCmd) setSkillBadge(`${slashCmd.icon} ${slashCmd.label}`);
  input.value = ""; resize();

  saveMsg(S.activeAgentId, { role:"user", content:displayMsg, time:new Date().toISOString() });

  if (S.mode === "ws") {
    disableInput();
    wsSend({ type: "chat", clientId: S.clientId, message: actualMsg });
  } else {
    // Replace display message with actual prompt in history for API
    const session = getSession(S.activeAgentId);
    // Pop the saveMsg push (it pushed displayMsg), push actualMsg to history
    if (slashCmd) {
      session.history.push({ role: "user", content: actualMsg });
      // directSend will push again — prevent double push by using a flag
      directSendRaw(actualMsg);
    } else {
      directSend(actualMsg);
    }
  }
}

// directSend but skip the history.push (caller already pushed)
async function directSendRaw(userMessage) {
  if (S.isStreaming) return;
  S.isStreaming = true;
  disableInput(); hideCommandPalette(); removeThinking(); showThinking();

  const session = getSession(S.activeAgentId);
  const agent   = findAgent(S.activeAgentId);
  // history already has the user message from caller

  let streamEl  = null;
  let streamBuf = "";

  function onChunk(text) {
    removeThinking();
    if (!streamEl) streamEl = appendAgentBubble();
    streamBuf += text;
    streamEl.querySelector(".msg-content").innerHTML = marked.parse(streamBuf) + '<span class="cur"></span>';
    scrollBottom();
  }

  function onStatus(text) {
    removeThinking();
    if (!streamEl) streamEl = appendAgentBubble();
    streamBuf += `\n\n> _${text}_\n\n`;
    streamEl.querySelector(".msg-content").innerHTML = marked.parse(streamBuf) + '<span class="cur"></span>';
    scrollBottom();
  }

  for (let i = 0; i < OPENROUTER_MODELS.length; i++) {
    const model = OPENROUTER_MODELS[i];
    try {
      if (i > 0) onStatus(`Switching to ${model.label}…`);
      setModelDisplay(model.label);

      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_KEY}`,
          "Content-Type":  "application/json",
          "HTTP-Referer":  window.location.href,
          "X-Title":       "Stage AI Agent Terminal",
        },
        body: JSON.stringify({
          model:    model.id,
          max_tokens: 4096,
          stream:   true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: agent.systemPrompt },
            ...session.history.map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });

      if (!resp.ok) { const t = await resp.text(); throw new Error(`${resp.status} ${t.slice(0,200)}`); }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let usage = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value, { stream: true });
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const json = JSON.parse(data);
            const text = json.choices?.[0]?.delta?.content;
            if (text) onChunk(text);
            if (json.usage) usage = json.usage;
          } catch {}
        }
      }

      if (streamEl) {
        streamEl.querySelector(".msg-content").innerHTML = marked.parse(streamBuf);
        const usageObj = usage ? {
          inputThisCall: usage.prompt_tokens||0, outputThisCall: usage.completion_tokens||0,
          inputTotal:  (session.tokens.inputTotal||0)  + (usage.prompt_tokens||0),
          outputTotal: (session.tokens.outputTotal||0) + (usage.completion_tokens||0),
          callCount:   (session.tokens.callCount||0)   + 1,
        } : null;
        if (usageObj) {
          attachUsageBadge(streamEl, model.label, usageObj);
          session.tokens = { inputTotal:usageObj.inputTotal, outputTotal:usageObj.outputTotal, callCount:usageObj.callCount };
          updateTokenDisplay(usageObj, model.label);
        }
        setModelDisplay(model.label);
        saveMsg(S.activeAgentId, { role:"assistant", content:streamBuf, model:model.label, usage:usageObj, time:new Date().toISOString() });
      }

      session.history.push({ role:"assistant", content:streamBuf });
      break;

    } catch (err) {
      if (i === OPENROUTER_MODELS.length - 1) {
        removeThinking();
        appendErrorBubble(`All models failed. Last error: ${err.message}`);
      } else {
        onStatus(`⚠ ${model.label} unavailable — trying next…`);
      }
    }
  }

  S.isStreaming = false;
  enableInput();
  scrollBottom();
}

// ── Tree sidebar ──────────────────────────────────────────
function renderTree(tree) {
  const nav = $("agent-tree");
  nav.innerHTML = "";
  tree.forEach((group, gi) => {
    // Collapsible category header
    const catBtn = document.createElement("button");
    catBtn.className = "tree-category";
    catBtn.innerHTML = `<span class="cat-arrow">▾</span><span class="cat-name">${group.category}</span><span class="cat-count">${group.agents.length}</span>`;
    nav.appendChild(catBtn);

    // Collapsible agent list container — expanded by default
    const listEl = document.createElement("div");
    listEl.className = "tree-agent-list open";
    nav.appendChild(listEl);

    catBtn.addEventListener("click", () => {
      const open = listEl.classList.toggle("open");
      catBtn.querySelector(".cat-arrow").textContent = open ? "▾" : "▸";
    });

    group.agents.forEach(agent => {
      const btn = document.createElement("button");
      btn.className = "tree-agent";
      btn.dataset.id = agent.id;
      btn.innerHTML = `<span class="ag-emoji">${agent.emoji}</span><span class="ag-label"><span class="ag-name">${agent.name}</span><span class="ag-desc">${agent.description}</span></span>`;
      btn.addEventListener("click", () => selectAgent(agent.id));
      listEl.appendChild(btn);

      const hintsEl = document.createElement("div");
      hintsEl.className = "agent-skill-hints";
      const hintPhases = agent.phases || [];
      hintsEl.innerHTML = hintPhases.slice(0, 4).map(p => `<span class="skill-hint">${p.icon} ${p.name}</span>`).join("")
        + (hintPhases.length > 4 ? `<span class="skill-hint-more">+${hintPhases.length - 4} more</span>` : "");
      listEl.appendChild(hintsEl);
    });
  });
}

function selectAgent(agentId) {
  if (S.isStreaming) return;
  document.querySelectorAll(".tree-agent").forEach(b => b.classList.remove("active"));
  document.querySelector(`.tree-agent[data-id="${agentId}"]`)?.classList.add("active");
  document.querySelectorAll(".agent-skill-hints").forEach(h => h.classList.remove("visible"));
  document.querySelector(`.tree-agent[data-id="${agentId}"]`)?.nextElementSibling?.classList.add("visible");
  S.activeAgentId = agentId;
  clearSkillBadge();

  if (S.mode === "ws") {
    wsSend({ type:"switch_agent", clientId:S.clientId, agentId });
  } else {
    applyAgent(findAgent(agentId));
    renderAgentHistory(agentId);
    enableInput(`Type a message or "/" for skill commands…`);
  }
}

// ── Skill card + slash trigger ────────────────────────────
function triggerSkill(cmdStr) {
  if (S.isStreaming) return;
  input.value = "";
  sendMessage(cmdStr);
}

// Agent phase card click — sends the phase's full prompt directly
function triggerPhase(agentId, phaseId) {
  if (S.isStreaming) return;
  const agent = findAgent(agentId);
  const phase = agent?.phases?.find(p => p.id === phaseId);
  if (phase) sendMessage(phase.prompt);
}

function fillCommand(cmd) {
  input.value = cmd;
  input.focus();
  showCommandPalette(cmd);
}

// ── Command palette ───────────────────────────────────────
function showCommandPalette(query) {
  const palette = $("cmd-palette");
  const filter  = query.toLowerCase();
  S.cmdFiltered = SLASH_COMMANDS.filter(c =>
    c.cmd.includes(filter) || c.label.toLowerCase().includes(filter) || c.desc.toLowerCase().includes(filter)
  );
  S.cmdSelected = S.cmdFiltered.length > 0 ? 0 : -1;
  if (!S.cmdFiltered.length) { hideCommandPalette(); return; }
  palette.innerHTML = S.cmdFiltered.map((c,i) =>
    `<div class="cmd-item${i===S.cmdSelected?" selected":""}" data-index="${i}" onclick="pickCommand(${i})"><span class="cmd-icon">${c.icon}</span><span class="cmd-name">${c.cmd}</span><span class="cmd-desc">${c.desc}</span></div>`
  ).join("");
  palette.hidden = false;
}

function hideCommandPalette() {
  $("cmd-palette").hidden = true;
  S.cmdSelected = -1; S.cmdFiltered = [];
}

function updatePaletteSelection() {
  const items = $("cmd-palette").querySelectorAll(".cmd-item");
  items.forEach((el,i) => el.classList.toggle("selected", i===S.cmdSelected));
  items[S.cmdSelected]?.scrollIntoView({ block:"nearest" });
}

function pickCommand(index) {
  const cmd = S.cmdFiltered[index];
  if (!cmd) return;
  hideCommandPalette();
  input.value = "";
  sendMessage(cmd.cmd);
}

// ── Local message history ─────────────────────────────────
function saveMsg(agentId, msg) {
  getSession(agentId).messages.push(msg);
}

function renderAgentHistory(agentId) {
  chat.innerHTML = "";
  const msgs = getSession(agentId).messages;
  if (!msgs.length) {
    const agent = findAgent(agentId) || { emoji:"🧑‍💻", name:"Software Development", description:"", phases:[] };
    const phases = agent.phases || [];
    const skillsHtml = phases.map(p => {
      // First sentence of prompt as a short description
      const desc = p.prompt.replace(/^(Help me |Run an? |I want to )/i, "").split(/[.!\n]/)[0].trim().slice(0, 58);
      return `<button class="skill-card" onclick="triggerPhase('${agentId}','${p.id}')">
        <span class="sk-icon">${p.icon}</span>
        <div class="sk-body"><span class="sk-label">${p.name}</span><span class="sk-desc">${desc}</span></div>
      </button>`;
    }).join("");
    const cmdsHtml = phases.slice(0, 6).map(p =>
      `<code class="cmd-hint" onclick="triggerPhase('${agentId}','${p.id}')">${p.icon} ${p.name}</code>`
    ).join(" ");
    chat.innerHTML = `
      <div class="welcome-agent" id="welcome">
        <div class="w-logo">${agent.emoji}</div>
        <h1 class="w-title">${agent.name}</h1>
        <p class="w-sub">${agent.description || "Pick a skill below or type a message to begin."}</p>
        <div class="skill-grid">${skillsHtml}</div>
        ${cmdsHtml ? `<div class="cmd-hints-row"><span class="cmd-hints-label">Quick start:</span>${cmdsHtml}</div>` : ""}
      </div>`;
    return;
  }
  msgs.forEach(msg => {
    if (msg.role === "user") {
      appendUserBubble(msg.content, msg.time, false);
    } else {
      const el = appendAgentBubble(msg.time, false);
      el.querySelector(".msg-content").innerHTML = marked.parse(msg.content);
      if (msg.usage && msg.model) attachUsageBadge(el, msg.model, msg.usage);
    }
  });
  scrollBottom();
}

// ── Bubble helpers ────────────────────────────────────────
function nowStr() { return new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }); }

function appendUserBubble(text, timeStr, save = true) {
  $("welcome")?.remove();
  const el = document.createElement("div");
  el.className = "msg-row user";
  el.innerHTML = `<div class="msg-avatar user">You</div><div class="msg-body-wrap"><div class="msg-meta"><span class="msg-sender">You</span><span class="msg-time">${timeStr||nowStr()}</span></div><div class="msg-content">${escHtml(text)}</div></div>`;
  chat.appendChild(el);
  scrollBottom(); return el;
}

function appendAgentBubble(timeStr) {
  const agent = findAgent(S.activeAgentId) || { emoji:"🧑‍💻", name:"Software Engineer" };
  const el = document.createElement("div");
  el.className = "msg-row agent";
  el.innerHTML = `<div class="msg-avatar agent">${agent.emoji}</div><div class="msg-body-wrap"><div class="msg-meta"><span class="msg-sender is-agent">${agent.name}</span><span class="msg-time">${timeStr||nowStr()}</span>${S.currentModel?`<span class="msg-time">· ${S.currentModel}</span>`:""}</div><div class="msg-content"></div></div>`;
  chat.appendChild(el); scrollBottom(); return el;
}

function appendErrorBubble(msg) {
  const el = document.createElement("div");
  el.className = "msg-row error";
  el.innerHTML = `<div class="msg-avatar user">⚠</div><div class="msg-body-wrap"><div class="msg-meta"><span class="msg-sender">Error</span><span class="msg-time">${nowStr()}</span></div><div class="msg-content">${escHtml(msg)}</div></div>`;
  chat.appendChild(el); scrollBottom();
}

function attachUsageBadge(el, model, usage) {
  const badge = document.createElement("div");
  badge.className = "msg-usage";
  badge.innerHTML = `<span class="u-model">${model}</span><span>·</span><span>${fmt(usage.inputThisCall)}↑ ${fmt(usage.outputThisCall)}↓</span>`;
  el.querySelector(".msg-body-wrap").appendChild(badge);
}

function showThinking() {
  const agent = findAgent(S.activeAgentId) || { emoji:"🧑‍💻" };
  const el = document.createElement("div");
  el.id = "thinking"; el.className = "thinking-row";
  el.innerHTML = `<div class="thinking-avatar">${agent.emoji}</div><span class="thinking-label">Thinking</span><div class="dots"><span></span><span></span><span></span></div>`;
  chat.appendChild(el); scrollBottom();
}
function removeThinking() { $("thinking")?.remove(); }
function scrollBottom()   { chat.scrollTop = chat.scrollHeight; }

// ── Token & model display ─────────────────────────────────
function updateTokenDisplay(usage, model) {
  if (usage.inputTotal  !== undefined) S.sessionTokens.inputTotal  = usage.inputTotal;
  if (usage.outputTotal !== undefined) S.sessionTokens.outputTotal = usage.outputTotal;
  if (usage.callCount   !== undefined) S.sessionTokens.callCount   = usage.callCount;
  const total = S.sessionTokens.inputTotal + S.sessionTokens.outputTotal;
  $("sb-tok-total").textContent = fmt(total);
  $("sb-ncalls").textContent    = S.sessionTokens.callCount;
  if (usage.inputThisCall !== undefined) {
    $("sb-tok-last").textContent = `${fmt(usage.inputThisCall+usage.outputThisCall)} (↑${fmt(usage.inputThisCall)} ↓${fmt(usage.outputThisCall)})`;
  }
  if (total > 0) {
    $("token-pill").hidden = false;
    $("tok-in").textContent    = `${fmt(S.sessionTokens.inputTotal)}↑`;
    $("tok-out").textContent   = `${fmt(S.sessionTokens.outputTotal)}↓`;
    $("tok-calls").textContent = `${S.sessionTokens.callCount} calls`;
  }
}

function setModelDisplay(model) {
  S.currentModel = model;
  $("model-name").textContent = model;
  $("model-pill").hidden      = false;
  $("sb-model").textContent   = `◈ ${model}`;
}

function fmt(n) { if (!n) return "0"; if (n>=1000) return (n/1000).toFixed(1)+"k"; return String(n); }

// ── Agent badge ───────────────────────────────────────────
function applyAgent(agent) {
  if (!agent) return;
  $("badge-emoji").textContent = agent.emoji;
  $("badge-name").textContent  = agent.name;
  document.querySelectorAll(".tree-agent").forEach(b => b.classList.toggle("active", b.dataset.id===agent.id));
}

function setSkillBadge(label) { const el=$("badge-phase"); el.textContent=label; el.hidden=false; }
function clearSkillBadge()    { const el=$("badge-phase"); el.textContent="";    el.hidden=true;  }

// ── Input handling ────────────────────────────────────────
function enableInput(placeholder) {
  input.disabled = false; $("btn-send").disabled = false;
  if (placeholder) input.placeholder = placeholder;
  if (!S.isStreaming) input.focus();
}
function disableInput() { input.disabled = true; $("btn-send").disabled = true; }
function resize() { input.style.height="auto"; input.style.height=Math.min(input.scrollHeight,180)+"px"; }

input.addEventListener("input", () => {
  resize();
  if (input.value.startsWith("/")) showCommandPalette(input.value);
  else hideCommandPalette();
});

input.addEventListener("keydown", e => {
  const pal = $("cmd-palette");
  const vis = !pal.hidden && S.cmdFiltered.length > 0;
  if (vis) {
    if (e.key==="ArrowDown") { e.preventDefault(); S.cmdSelected=Math.min(S.cmdSelected+1,S.cmdFiltered.length-1); updatePaletteSelection(); return; }
    if (e.key==="ArrowUp")   { e.preventDefault(); S.cmdSelected=Math.max(S.cmdSelected-1,0); updatePaletteSelection(); return; }
    if (e.key==="Enter")     { e.preventDefault(); if (S.cmdSelected>=0) pickCommand(S.cmdSelected); return; }
    if (e.key==="Escape")    { e.preventDefault(); hideCommandPalette(); return; }
  }
  if (e.key==="Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); }
});

$("btn-send").addEventListener("click", () => sendMessage(input.value));

$("btn-clear").addEventListener("click", () => {
  if (S.isStreaming) return;
  clearSkillBadge(); hideCommandPalette();
  if (S.mode === "ws") {
    wsSend({ type:"clear", clientId:S.clientId });
  } else {
    const session = getSession(S.activeAgentId);
    session.history  = [];
    session.messages = [];
    session.tokens   = { inputTotal:0, outputTotal:0, callCount:0 };
    S.sessionTokens  = { inputTotal:0, outputTotal:0, callCount:0 };
    updateTokenDisplay(S.sessionTokens, null);
    renderAgentHistory(S.activeAgentId);
  }
});

document.addEventListener("click", e => {
  if (!$("cmd-palette").contains(e.target) && e.target!==input) hideCommandPalette();
});

// ── Status dot ────────────────────────────────────────────
function setConnStatus(cls, txt) {
  $("status-dot").className = `sdot ${cls}`;
  $("status-text").textContent = txt;
}

// ── Helpers ───────────────────────────────────────────────
function escHtml(t) {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\n/g,"<br>");
}

// ── Boot ──────────────────────────────────────────────────
(function init() {
  renderTree(AGENT_REGISTRY);
  // Activate first agent in sidebar
  const first = AGENT_REGISTRY[0]?.agents[0];
  if (first) {
    document.querySelector(`.tree-agent[data-id="${first.id}"]`)?.classList.add("active");
    document.querySelector(`.tree-agent[data-id="${first.id}"]`)?.nextElementSibling?.classList.add("visible");
  }
  // Try WebSocket (local dev), fall back to direct API (GitHub Pages)
  tryWebSocket();
})();
