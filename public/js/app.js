/* ══════════════════════════════════════════════════════════
   Stage — Agent Terminal  |  Frontend
   ══════════════════════════════════════════════════════════ */

// ── Markdown setup ───────────────────────────────────────
marked.setOptions({ breaks: true, gfm: true });

const renderer = new marked.Renderer();
renderer.code = (code, lang) => {
  const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
  const highlighted = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  return `
    <div class="code-block">
      <div class="code-header">
        <span class="code-lang">${language}</span>
        <button class="copy-btn" onclick="copyCode(this)">Copy</button>
      </div>
      <pre><code class="hljs language-${language}">${highlighted}</code></pre>
    </div>`;
};
marked.use({ renderer });

function copyCode(btn) {
  const code = btn.closest(".code-block").querySelector("code").innerText;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = "Copied!";
    btn.classList.add("copied");
    setTimeout(() => { btn.textContent = "Copy"; btn.classList.remove("copied"); }, 1800);
  });
}

// ── Slash commands (individual XGAIR phases + SDLC skills) ──────
// Typing "/" in the input shows this command palette.
const SLASH_COMMANDS = [
  { cmd: "/status",      icon: "📊", label: "Status",      desc: "Project overview & current phase progress",
    prompt: "Show me the current project status — what phase are we in, what's been completed, and what's next?" },
  { cmd: "/connect",     icon: "🔗", label: "Connect",     desc: "Register a repository to work on",
    prompt: "I want to connect a repository to work on. Ask me for the GitHub URL or owner/repo, then detect the tech stack." },
  { cmd: "/discover",    icon: "🔍", label: "Discover",    desc: "Run 5-phase codebase discovery",
    prompt: "Run a 5-phase discovery on the connected repo: 1) Repo Scan, 2) Architecture, 3) Conventions, 4) CONTEXT.md (< 2000 tokens), 5) Readiness Report." },
  { cmd: "/intake",      icon: "📋", label: "Intake",      desc: "Parse a feature into structured requirements",
    prompt: "I want to start a new feature. Ask me for the name and description, then produce a structured intake doc: functional + non-functional requirements, scope IN/OUT, affected areas." },
  { cmd: "/investigate", icon: "🔬", label: "Investigate", desc: "Read-only analysis — NO code yet",
    prompt: "Run a read-only investigation. Steps: 1) Search git history for prior art, 2) Build vocabulary map, 3) Load codebase context, 4) Identify affected files with justification, 5) Propose exactly 2 implementation approaches with trade-offs, 6) Derive a FORBIDDEN list. Output a YAML investigation report. No code written." },
  { cmd: "/plan",        icon: "📐", label: "Plan",        desc: "Implementation plan + INVEST scoring → awaits approval",
    prompt: "Create a detailed implementation plan: files to change, files to create, constraint block (SCOPE + CEILING + FORBIDDEN), INVEST score per task, branch name, PR title, test strategy. Then STOP and wait for my approval before implementation." },
  { cmd: "/decompose",   icon: "🃏", label: "Decompose",   desc: "Break approved plan into atomic T-X.Y tasks",
    prompt: "Break the approved plan into T-X.Y atomic tasks (e.g. T-1.1, T-1.2). Each task: INVEST validated, ≤3 files, explicit dependencies declared, validation commands included. Show the list and ask which task to start." },
  { cmd: "/implement",   icon: "💻", label: "Implement",   desc: "Task-by-task code implementation",
    prompt: "Implement the next task. Declare SCOPE/CEILING/FORBIDDEN constraint block, write production-quality code following conventions, run validation (type check + lint + tests). Ask me which task (T-X.Y) if not set." },
  { cmd: "/qa",          icon: "🧪", label: "QA",          desc: "3-gate testing: unit → integration → E2E",
    prompt: "Run the 3-gate QA pipeline. Gate 1: unit tests (must pass). Gate 2: integration tests (must pass). Gate 3: Playwright E2E — data-testid selectors only, no hardcoded URLs, no waitForTimeout(), tests in qa/ directory. Block on failures." },
  { cmd: "/ship",        icon: "🚀", label: "Ship",        desc: "Build + validate + commit + PR",
    prompt: "Prepare to ship: 1) Full build (stop if fails), 2) All tests (stop if fails), 3) Anti-pattern scan (no console.log, no TODO, no secrets, no unused imports), 4) Stage specific files only — never git add -A, 5) Conventional commit, 6) Push to feature branch, 7) Create PR with summary + test checklist. Print the PR URL." },
  { cmd: "/sprint",      icon: "📅", label: "Sprint",      desc: "Sprint planning & backlog grooming",
    prompt: "Let's run a sprint planning session. Ask me about team capacity, velocity, sprint goal, and current backlog. Help produce DoD, DoR, and story breakdowns with Fibonacci estimates." },
  { cmd: "/devops",      icon: "⚙️", label: "DevOps",      desc: "CI/CD pipelines · Docker · Cloud",
    prompt: "Help me set up CI/CD or DevOps infrastructure. Ask me about my tech stack, deployment target, and requirements." },
  { cmd: "/docs",        icon: "📚", label: "Docs",        desc: "README · API docs · ADRs · runbooks",
    prompt: "Help me write technical documentation. Ask me what needs to be documented and in what format." },
];

// ── SDLC Skill cards shown on the welcome screen ─────────
// These are the 8 top-level SDLC skills. Each groups XGAIR phases internally.
const SDLC_SKILLS = [
  { icon: "📋", label: "PRD & Requirements",   desc: "Intake → Investigate → Plan",         cmd: "/intake" },
  { icon: "🔗", label: "Explore Repository",   desc: "Connect → 5-phase Discovery",         cmd: "/connect" },
  { icon: "💻", label: "Develop Feature",       desc: "Investigate → Plan → Implement",      cmd: "/investigate" },
  { icon: "🧪", label: "QA & Testing",          desc: "Unit → Integration → E2E",           cmd: "/qa" },
  { icon: "🚀", label: "Ship & PR",             desc: "Build → Validate → Commit → PR",     cmd: "/ship" },
  { icon: "📅", label: "Sprint Planning",       desc: "Scrum · backlog · estimates",         cmd: "/sprint" },
  { icon: "⚙️", label: "CI/CD & DevOps",       desc: "Pipelines · Docker · Cloud",          cmd: "/devops" },
  { icon: "📚", label: "Documentation",         desc: "README · ADRs · runbooks",            cmd: "/docs" },
];

// ── State ────────────────────────────────────────────────
const S = {
  ws:            null,
  clientId:      localStorage.getItem("stage_cid") || null,
  activeAgentId: null,
  isStreaming:   false,
  reconnDelay:   1500,
  reconnTimer:   null,
  tree:          [],
  agentMessages: {},   // agentId → [{role,content,model,usage,time}]
  currentModel:  null,
  sessionTokens: { inputTotal:0, outputTotal:0, callCount:0 },
  // Command palette state
  cmdSelected:   -1,
  cmdFiltered:   [],
};

// ── DOM ──────────────────────────────────────────────────
const $     = id => document.getElementById(id);
const chat  = $("chat");
const input = $("user-input");

// ── WebSocket ─────────────────────────────────────────────
function connect() {
  setConnStatus("connecting", "Connecting…");
  const proto = location.protocol === "https:" ? "wss" : "ws";
  S.ws = new WebSocket(`${proto}://${location.host}`);

  S.ws.onopen = () => {
    clearTimeout(S.reconnTimer);
    S.reconnDelay = 1500;
    setConnStatus("connected", "Connected");
    wsend({ type: "init", clientId: S.clientId, agentId: S.activeAgentId || "software-engineer" });
  };
  S.ws.onclose = () => {
    setConnStatus("disconnected", "Reconnecting…");
    S.reconnTimer = setTimeout(() => {
      connect();
      S.reconnDelay = Math.min(S.reconnDelay * 2, 15000);
    }, S.reconnDelay);
  };
  S.ws.onerror = () => setConnStatus("disconnected", "Error");
  S.ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    onMsg(m);
  };
}

function wsend(data) {
  if (S.ws?.readyState === WebSocket.OPEN) S.ws.send(JSON.stringify(data));
}

// ── Server message handler ────────────────────────────────
let streamEl  = null;
let streamBuf = "";

function onMsg(m) {
  switch (m.type) {

    case "connected":
      if (!S.clientId) {
        S.clientId = m.clientId;
        localStorage.setItem("stage_cid", S.clientId);
      }
      break;

    case "agent_ready":
      S.activeAgentId = m.agentId;
      applyAgent(m.agent);
      if (m.tokens) updateTokenDisplay(m.tokens, null);
      renderAgentHistory(m.agentId);
      enableInput(`Type a message or "/" for skill commands…`);
      break;

    case "stream_start":
      S.isStreaming = true;
      disableInput();
      hideCommandPalette();
      removeThinking();
      showThinking();
      streamBuf = ""; streamEl = null;
      if (m.pendingModel) setModelDisplay(m.pendingModel);
      break;

    case "stream_chunk":
      removeThinking();
      if (!streamEl) streamEl = appendAgentBubble();
      streamBuf += m.chunk;
      streamEl.querySelector(".msg-content").innerHTML =
        marked.parse(streamBuf) + '<span class="cur"></span>';
      scrollBottom();
      break;

    case "stream_end":
      S.isStreaming = false;
      removeThinking();
      if (streamEl) {
        const body = streamEl.querySelector(".msg-content");
        body.innerHTML = marked.parse(streamBuf);
        if (m.usage && m.model) {
          const badge = document.createElement("div");
          badge.className = "msg-usage";
          badge.innerHTML = `
            <span class="u-model">${m.model}</span>
            <span>·</span>
            <span>${fmt(m.usage.inputThisCall)}↑ ${fmt(m.usage.outputThisCall)}↓</span>
          `;
          streamEl.querySelector(".msg-body-wrap").appendChild(badge);
        }
        saveToAgentHistory(S.activeAgentId, {
          role: "assistant", content: streamBuf,
          model: m.model, usage: m.usage,
          time: new Date().toISOString(),
        });
        streamEl = null; streamBuf = "";
      }
      if (m.usage) updateTokenDisplay(m.usage, m.model);
      if (m.model) setModelDisplay(m.model);
      enableInput();
      scrollBottom();
      break;

    case "cleared":
      S.agentMessages[S.activeAgentId] = [];
      S.sessionTokens = { inputTotal:0, outputTotal:0, callCount:0 };
      updateTokenDisplay(S.sessionTokens, null);
      renderAgentHistory(S.activeAgentId);
      break;

    case "error":
      removeThinking();
      S.isStreaming = false;
      appendErrorBubble(m.message);
      enableInput();
      break;
  }
}

// ── Tree sidebar ──────────────────────────────────────────
async function loadTree() {
  try {
    const res = await fetch("/api/agents");
    S.tree = await res.json();
    renderTree(S.tree);
    const first = S.tree[0]?.agents[0];
    if (first) selectAgent(first.id);
  } catch(e) { console.error("Tree load error:", e); }
}

function renderTree(tree) {
  const nav = $("agent-tree");
  nav.innerHTML = "";

  tree.forEach(group => {
    const catEl = document.createElement("div");
    catEl.className = "tree-category";
    catEl.textContent = group.category;
    nav.appendChild(catEl);

    // Agent buttons — phases are internal XGAIR methodology, not sidebar tabs
    group.agents.forEach(agent => {
      const btn = document.createElement("button");
      btn.className = "tree-agent";
      btn.dataset.id = agent.id;
      btn.innerHTML = `
        <span class="ag-emoji">${agent.emoji}</span>
        <span class="ag-label">
          <span class="ag-name">${agent.name}</span>
          <span class="ag-desc">${agent.description}</span>
        </span>
      `;
      btn.addEventListener("click", () => selectAgent(agent.id));
      nav.appendChild(btn);

      // Show skill hints under the agent (non-clickable, just informational)
      const hintsEl = document.createElement("div");
      hintsEl.className = "agent-skill-hints";
      hintsEl.innerHTML = SDLC_SKILLS.slice(0, 5).map(s =>
        `<span class="skill-hint">${s.icon} ${s.label}</span>`
      ).join("") + `<span class="skill-hint-more">+ more</span>`;
      nav.appendChild(hintsEl);
    });
  });
}

function selectAgent(agentId) {
  if (S.isStreaming) return;

  document.querySelectorAll(".tree-agent").forEach(b => b.classList.remove("active"));
  document.querySelector(`.tree-agent[data-id="${agentId}"]`)?.classList.add("active");

  // Show/hide skill hints for the active agent
  document.querySelectorAll(".agent-skill-hints").forEach(h => h.classList.remove("visible"));
  document.querySelector(`.tree-agent[data-id="${agentId}"]`)
    ?.nextElementSibling?.classList.add("visible");

  S.activeAgentId = agentId;
  clearSkillBadge();
  wsend({ type: "switch_agent", clientId: S.clientId, agentId });
}

// ── Skill card trigger (from welcome screen) ──────────────
function triggerSkill(cmdStr) {
  if (S.isStreaming) return;
  const cmd = SLASH_COMMANDS.find(c => c.cmd === cmdStr);
  if (!cmd) return;
  $("welcome")?.remove();
  setSkillBadge(`${cmd.icon} ${cmd.label}`);
  appendUserBubble(cmd.cmd);                     // show the /command as user msg
  disableInput();
  wsend({ type: "chat", clientId: S.clientId, message: cmd.prompt });
}

// ── Command palette ───────────────────────────────────────
function showCommandPalette(query) {
  const palette = $("cmd-palette");
  const filter  = query.toLowerCase();

  S.cmdFiltered = SLASH_COMMANDS.filter(c =>
    c.cmd.includes(filter) || c.label.toLowerCase().includes(filter) || c.desc.toLowerCase().includes(filter)
  );
  S.cmdSelected = S.cmdFiltered.length > 0 ? 0 : -1;

  if (S.cmdFiltered.length === 0) { hideCommandPalette(); return; }

  palette.innerHTML = S.cmdFiltered.map((c, i) => `
    <div class="cmd-item${i === S.cmdSelected ? " selected" : ""}" data-index="${i}" onclick="pickCommand(${i})">
      <span class="cmd-icon">${c.icon}</span>
      <span class="cmd-name">${c.cmd}</span>
      <span class="cmd-desc">${c.desc}</span>
    </div>`).join("");

  palette.hidden = false;
}

function hideCommandPalette() {
  $("cmd-palette").hidden = true;
  S.cmdSelected = -1;
  S.cmdFiltered = [];
}

function updatePaletteSelection() {
  const items = $("cmd-palette").querySelectorAll(".cmd-item");
  items.forEach((el, i) => el.classList.toggle("selected", i === S.cmdSelected));
  items[S.cmdSelected]?.scrollIntoView({ block: "nearest" });
}

function pickCommand(index) {
  const cmd = S.cmdFiltered[index];
  if (!cmd) return;
  hideCommandPalette();
  input.value = "";
  $("welcome")?.remove();
  setSkillBadge(`${cmd.icon} ${cmd.label}`);
  appendUserBubble(cmd.cmd);
  disableInput();
  wsend({ type: "chat", clientId: S.clientId, message: cmd.prompt });
}

// ── Local message history ─────────────────────────────────
function saveToAgentHistory(agentId, msg) {
  if (!S.agentMessages[agentId]) S.agentMessages[agentId] = [];
  S.agentMessages[agentId].push(msg);
}

function renderAgentHistory(agentId) {
  chat.innerHTML = "";
  const msgs = S.agentMessages[agentId] || [];

  if (msgs.length === 0) {
    const agent = findAgent(agentId) || { emoji: "🧑‍💻", name: "Software Engineer" };
    const skillsHtml = SDLC_SKILLS.map(s => `
      <button class="skill-card" onclick="triggerSkill('${s.cmd}')">
        <span class="sk-icon">${s.icon}</span>
        <div class="sk-body">
          <span class="sk-label">${s.label}</span>
          <span class="sk-desc">${s.desc}</span>
        </div>
      </button>`).join("");

    const cmdsHtml = SLASH_COMMANDS.slice(0, 6).map(c =>
      `<code class="cmd-hint" onclick="fillCommand('${c.cmd}')">${c.cmd}</code>`
    ).join(" ");

    chat.innerHTML = `
      <div class="welcome-agent" id="welcome">
        <div class="w-logo">${agent.emoji}</div>
        <h1 class="w-title">${agent.name}</h1>
        <p class="w-sub">I follow the XGAIR methodology. Pick a skill below or type <kbd>/</kbd> for all commands.</p>
        <div class="skill-grid">${skillsHtml}</div>
        <div class="cmd-hints-row">
          <span class="cmd-hints-label">Quick commands:</span>
          ${cmdsHtml}
          <code class="cmd-hint cmd-hint-more" onclick="fillCommand('/')">more…</code>
        </div>
      </div>`;
    return;
  }

  msgs.forEach(msg => {
    if (msg.role === "user") {
      appendUserBubble(msg.content, msg.time, false);
    } else {
      const el = appendAgentBubble(msg.time, false);
      el.querySelector(".msg-content").innerHTML = marked.parse(msg.content);
      if (msg.usage && msg.model) {
        const badge = document.createElement("div");
        badge.className = "msg-usage";
        badge.innerHTML = `<span class="u-model">${msg.model}</span><span>·</span><span>${fmt(msg.usage.inputThisCall)}↑ ${fmt(msg.usage.outputThisCall)}↓</span>`;
        el.querySelector(".msg-body-wrap").appendChild(badge);
      }
    }
  });
  scrollBottom();
}

// Fill the input with a command (from welcome hints) and focus
function fillCommand(cmd) {
  input.value = cmd;
  input.focus();
  showCommandPalette(cmd);
}

// ── Chat bubble builders ──────────────────────────────────
function nowStr() {
  return new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
}

function appendUserBubble(text, timeStr, save = true) {
  $("welcome")?.remove();
  const el = document.createElement("div");
  el.className = "msg-row user";
  el.innerHTML = `
    <div class="msg-avatar user">You</div>
    <div class="msg-body-wrap">
      <div class="msg-meta">
        <span class="msg-sender">You</span>
        <span class="msg-time">${timeStr || nowStr()}</span>
      </div>
      <div class="msg-content">${escHtml(text)}</div>
    </div>`;
  chat.appendChild(el);
  if (save) saveToAgentHistory(S.activeAgentId, { role:"user", content: text, time: new Date().toISOString() });
  scrollBottom();
  return el;
}

function appendAgentBubble(timeStr, save = true) {
  const agent = findAgent(S.activeAgentId) || { emoji:"🧑‍💻", name:"Software Engineer" };
  const el = document.createElement("div");
  el.className = "msg-row agent";
  el.innerHTML = `
    <div class="msg-avatar agent">${agent.emoji}</div>
    <div class="msg-body-wrap">
      <div class="msg-meta">
        <span class="msg-sender is-agent">${agent.name}</span>
        <span class="msg-time">${timeStr || nowStr()}</span>
        ${S.currentModel ? `<span class="msg-time">· ${S.currentModel}</span>` : ""}
      </div>
      <div class="msg-content"></div>
    </div>`;
  chat.appendChild(el);
  scrollBottom();
  return el;
}

function appendErrorBubble(msg) {
  const el = document.createElement("div");
  el.className = "msg-row error";
  el.innerHTML = `
    <div class="msg-avatar user">⚠</div>
    <div class="msg-body-wrap">
      <div class="msg-meta"><span class="msg-sender">Error</span><span class="msg-time">${nowStr()}</span></div>
      <div class="msg-content">${escHtml(msg)}</div>
    </div>`;
  chat.appendChild(el);
  scrollBottom();
}

function showThinking() {
  const agent = findAgent(S.activeAgentId) || { emoji:"🧑‍💻" };
  const el = document.createElement("div");
  el.id = "thinking"; el.className = "thinking-row";
  el.innerHTML = `
    <div class="thinking-avatar">${agent.emoji}</div>
    <span class="thinking-label">Thinking</span>
    <div class="dots"><span></span><span></span><span></span></div>`;
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
    const lastTotal = usage.inputThisCall + usage.outputThisCall;
    $("sb-tok-last").textContent = `${fmt(lastTotal)} (↑${fmt(usage.inputThisCall)} ↓${fmt(usage.outputThisCall)})`;
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

function fmt(n) {
  if (!n) return "0";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

// ── Agent badge helpers ───────────────────────────────────
function applyAgent(agent) {
  $("badge-emoji").textContent = agent.emoji;
  $("badge-name").textContent  = agent.name;
  document.querySelectorAll(".tree-agent").forEach(b => {
    b.classList.toggle("active", b.dataset.id === agent.id);
  });
}

function setSkillBadge(label) {
  const el = $("badge-phase");
  el.textContent = label; el.hidden = false;
}
function clearSkillBadge() {
  const el = $("badge-phase");
  el.textContent = ""; el.hidden = true;
}

// ── Input handling ────────────────────────────────────────
function sendMsg(text) {
  text = (text || input.value).trim();
  if (!text || S.isStreaming) return;

  // If it's a known slash command, resolve to its prompt
  const slashCmd = SLASH_COMMANDS.find(c => c.cmd === text);
  if (slashCmd) {
    hideCommandPalette();
    input.value = "";
    $("welcome")?.remove();
    setSkillBadge(`${slashCmd.icon} ${slashCmd.label}`);
    appendUserBubble(text);   // show /command as user message
    disableInput();
    wsend({ type: "chat", clientId: S.clientId, message: slashCmd.prompt });
    return;
  }

  $("welcome")?.remove();
  clearSkillBadge();
  hideCommandPalette();
  appendUserBubble(text);
  input.value = ""; resize();
  disableInput();
  wsend({ type:"chat", clientId: S.clientId, message: text });
}

function enableInput(placeholder) {
  input.disabled = false;
  $("btn-send").disabled = false;
  if (placeholder) input.placeholder = placeholder;
  if (!S.isStreaming) input.focus();
}
function disableInput() {
  input.disabled = true;
  $("btn-send").disabled = true;
}
function resize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}

// ── Input event listeners ─────────────────────────────────
input.addEventListener("input", () => {
  resize();
  const val = input.value;
  if (val.startsWith("/")) {
    showCommandPalette(val);
  } else {
    hideCommandPalette();
  }
});

input.addEventListener("keydown", e => {
  const palette = $("cmd-palette");
  const paletteVisible = !palette.hidden && S.cmdFiltered.length > 0;

  if (paletteVisible) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      S.cmdSelected = Math.min(S.cmdSelected + 1, S.cmdFiltered.length - 1);
      updatePaletteSelection();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      S.cmdSelected = Math.max(S.cmdSelected - 1, 0);
      updatePaletteSelection();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (S.cmdSelected >= 0) pickCommand(S.cmdSelected);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      hideCommandPalette();
      return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
});

$("btn-send").addEventListener("click", () => sendMsg());

$("btn-clear").addEventListener("click", () => {
  if (S.isStreaming) return;
  clearSkillBadge();
  hideCommandPalette();
  wsend({ type:"clear", clientId: S.clientId });
});

// Close palette if clicking outside
document.addEventListener("click", e => {
  if (!$("cmd-palette").contains(e.target) && e.target !== input) {
    hideCommandPalette();
  }
});

// ── Helpers ───────────────────────────────────────────────
function setConnStatus(cls, txt) {
  $("status-dot").className = `sdot ${cls}`;
  $("status-text").textContent = txt;
}

function findAgent(id) {
  for (const g of S.tree) {
    const a = g.agents.find(a => a.id === id);
    if (a) return a;
  }
  return null;
}

function escHtml(t) {
  return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
          .replace(/"/g,"&quot;").replace(/\n/g,"<br>");
}

// ── Boot ──────────────────────────────────────────────────
(async () => {
  await loadTree();
  connect();
})();
