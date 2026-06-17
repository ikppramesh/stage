<p align="center">
  <img src="public/stage.png" alt="Stage Logo" width="120" />
</p>

<h1 align="center">Stage — Multi-Agent AI Terminal</h1>

<p align="center">
  A browser-based AI terminal with <strong>16 specialised software engineering agents</strong>, real-time streaming, and a free-tier model cascade — no subscription required.
</p>

<p align="center">
  <a href="https://github.com/ikppramesh/stage"><img alt="GitHub repo" src="https://img.shields.io/badge/GitHub-ikppramesh%2Fstage-181717?logo=github"/></a>
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white"/>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.3-3178C6?logo=typescript&logoColor=white"/>
  <img alt="OpenRouter" src="https://img.shields.io/badge/OpenRouter-free%20tier-6C47FF"/>
  <img alt="Claude" src="https://img.shields.io/badge/Anthropic-Claude%20Opus%204.6-C96442"/>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green"/>
</p>

---

## Overview

**Stage** is a lightweight, self-hosted AI agent terminal that puts a team of 16 specialised engineering roles right in your browser. Each agent comes with pre-built phase workflows (PRD → ship), slash commands, and token tracking. Run it locally with a WebSocket backend or deploy the `public/` folder anywhere as a static site — it works either way.

```
Browser ──WebSocket──► Node.js / Express backend ──► Anthropic Claude (primary)
                                                  └──► OpenRouter (12 free models — fallback)

GitHub Pages ──direct fetch──► OpenRouter API cascade (no backend needed)
```

---

## Features

| Feature | Details |
|---|---|
| **16 AI Agents** | Engineering, Product, Design, Architecture & Leadership roles |
| **Phase workflows** | 5–10 guided phases per agent (Intake → Investigate → Plan → Implement → QA → Ship) |
| **Dual-mode** | WebSocket (local) with automatic fallback to direct OpenRouter API (GitHub Pages / static) |
| **Model cascade** | 12 free OpenRouter models tried best-first; skips on 429 / 401 automatically |
| **Claude primary** | Uses Claude Opus 4.6 with adaptive thinking when `ANTHROPIC_API_KEY` is set |
| **Streaming** | Token-by-token streaming with live markdown rendering |
| **Token tracking** | Per-call and session-total input/output token counters |
| **Slash commands** | 12 built-in slash commands (`/status`, `/plan`, `/implement`, `/ship`, …) |
| **API Key modal** | Users can supply their own OpenRouter key; falls back to the shared default |
| **Collapsible sidebar** | Agents grouped under collapsible categories with phase hints |
| **No framework** | Vanilla HTML + CSS + JS frontend — zero build step for the UI |

---

## Agent Team

All 16 agents live under the **Software Development** sidebar category.

### Engineering

| # | Agent | Emoji | Phases | Speciality |
|---|---|---|---|---|
| 1 | Software Development | 🧑‍💻 | 10 | Full SDLC — PRD → production |
| 2 | Frontend Engineer | 🎨 | 5 | UI components, CSS, a11y, performance |
| 3 | Backend Engineer | ⚙️ | 5 | APIs, databases, auth, microservices |
| 4 | Full Stack Engineer | 🔄 | 5 | End-to-end feature delivery |
| 5 | DevOps / Platform | 🚀 | 6 | CI/CD, Docker, Kubernetes, IaC |
| 6 | QA / Test Engineer | 🧪 | 6 | Unit → Integration → E2E gate testing |
| 7 | Security Engineer | 🔒 | 5 | OWASP, threat modeling, SAST, audits |
| 8 | Mobile Engineer | 📱 | 5 | React Native / Flutter, offline-first |
| 9 | Data Engineer | 📊 | 5 | ETL pipelines, data modeling, SQL |
| 10 | ML / AI Engineer | 🤖 | 5 | RAG, fine-tuning, LLM integration |

### Product & Design

| # | Agent | Emoji | Phases | Speciality |
|---|---|---|---|---|
| 11 | Product Manager | 📋 | 6 | PRDs, roadmaps, OKRs, user stories |
| 12 | UX / Product Designer | 🎭 | 5 | User flows, wireframes, design systems |
| 13 | Technical Writer | ✍️ | 5 | API docs, READMEs, runbooks, changelogs |

### Architecture & Leadership

| # | Agent | Emoji | Phases | Speciality |
|---|---|---|---|---|
| 14 | Software Architect | 🏗️ | 5 | System design, ADRs, tech spikes |
| 15 | Engineering Manager | 👔 | 5 | Sprint planning, retros, team health |
| 16 | Tech Lead / Code Reviewer | 🔍 | 5 | PR reviews, coding standards, refactoring |

---

## Model Cascade

When an Anthropic API key is not configured, Stage automatically cycles through 12 free OpenRouter models, best-first:

| Priority | Model | Parameters |
|---|---|---|
| 1 | Qwen3 Coder | 480B |
| 2 | Nemotron 3 Ultra | 550B |
| 3 | Hermes 3 | 405B |
| 4 | Nemotron 3 Super | 120B |
| 5 | GPT-oss | 120B |
| 6 | Qwen3 Next | 80B |
| 7 | Llama 3.3 | 70B |
| 8 | Nemotron Nano | 12B |
| 9 | Gemma 4 | 31B |
| 10 | Nemotron Nano | 9B |
| 11 | GPT-oss | 20B |
| 12 | Llama 3.2 *(last resort)* | 3B |

Failed models are skipped silently; a status note is shown in the chat bubble when the cascade advances.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [npm](https://www.npmjs.com/) (bundled with Node)
- An [OpenRouter](https://openrouter.ai/) account (free tier is enough) **or** an [Anthropic API key](https://console.anthropic.com/)

### 1 — Clone & install

```bash
git clone https://github.com/ikppramesh/stage.git
cd stage
npm install
```

### 2 — Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Primary AI provider (optional — falls back to OpenRouter if not set)
ANTHROPIC_API_KEY=sk-ant-...

# OpenRouter fallback key (required if ANTHROPIC_API_KEY is not set)
OPENROUTER_API_KEY=sk-or-v1-...

# Server port (default: 3000)
PORT=3000
```

> **Tip:** You can leave `ANTHROPIC_API_KEY` blank. Stage will use the free OpenRouter cascade automatically.

### 3 — Build & run

```bash
# Build TypeScript → dist/
npm run build

# Start the server
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

**For development (live reload via ts-node):**

```bash
npm run dev
```

---

## Deploying to GitHub Pages (static mode)

The entire `public/` folder is a self-contained static site. When there is no WebSocket backend reachable, the frontend automatically switches to direct OpenRouter API calls from the browser.

1. Push the repo to GitHub.
2. Go to **Settings → Pages → Source** and choose **GitHub Actions** (or deploy `public/` as the root).
3. Open the deployed URL — no server required.

> Users can enter their own OpenRouter key via the **🔑 Key** button in the top-right toolbar. If they don't, the shared default key embedded in `agents-data.js` is used as a fallback.

---

## Project Structure

```
stage/
├── src/                        # TypeScript backend source
│   ├── server.ts               # Express + WebSocket server
│   ├── agents/
│   │   └── index.ts            # Agent registry & category definitions
│   └── anthropic/
│       └── client.ts           # Anthropic + OpenRouter client config
│
├── dist/                       # Compiled JavaScript (git-ignored)
│
├── public/                     # Frontend (served as static files)
│   ├── index.html              # App shell
│   ├── stage.png               # Logo
│   ├── favicon.svg
│   ├── css/
│   │   └── style.css           # All styles (dark theme, sidebar, modals)
│   └── js/
│       ├── agents-data.js      # Agent registry + model list (frontend copy)
│       └── app.js              # UI logic, WebSocket + direct API dual-mode
│
├── .env                        # Local secrets (not committed)
├── .env.example                # Template for environment variables
├── package.json
└── tsconfig.json
```

---

## Slash Commands

Type `/` in the chat input to open the command palette.

| Command | Description |
|---|---|
| `/status` | Project overview & current phase progress |
| `/connect` | Register a repository to work on |
| `/discover` | Run 5-phase codebase discovery |
| `/intake` | Parse a feature into structured requirements |
| `/investigate` | Read-only analysis — no code written yet |
| `/plan` | Implementation plan + INVEST scoring (awaits approval) |
| `/decompose` | Break approved plan into atomic T-X.Y tasks |
| `/implement` | Task-by-task code implementation |
| `/qa` | 3-gate testing: unit → integration → E2E |
| `/ship` | Build + validate + commit + open PR |
| `/sprint` | Sprint planning and backlog grooming |
| `/devops` | CI/CD pipelines, Docker, Cloud setup |

---

## API Key Management

Stage ships with a shared OpenRouter key for demo purposes. Any visitor can supply their own key for higher rate limits:

1. Click the **🔑 Key** button in the top-right toolbar.
2. Paste your `sk-or-v1-…` key and click **Save & Use**.
3. The key is stored only in your browser's `localStorage` — it is never sent to the Stage server.
4. Click **Use Default** at any time to revert to the shared key.

When a custom key is active, the button gains an orange highlight so you always know which key is in use.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                                                       │
│                                                                │
│  ┌──────────┐   WebSocket   ┌─────────────────────────────┐  │
│  │  app.js  │◄─────────────►│  server.ts (Express + ws)   │  │
│  │          │               │                              │  │
│  │ Direct   │               │  ┌──────────────────────┐   │  │
│  │ fetch ──►│───────────────┼─►│  Anthropic Claude    │   │  │
│  │ (static) │               │  │  Opus 4.6 (primary)  │   │  │
│  └──────────┘               │  └──────────────────────┘   │  │
│                              │                              │  │
│                              │  ┌──────────────────────┐   │  │
│                              │  │  OpenRouter cascade  │   │  │
│                              │  │  12 free models      │   │  │
│                              │  └──────────────────────┘   │  │
│                              └─────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

**Session model:** Each browser client gets a UUID stored in `localStorage`. The server maintains separate conversation histories per `clientId × agentId` pair, retained for 2 hours after disconnect.

**Dual-mode:** On load, the frontend tries a WebSocket connection. If it doesn't succeed within 2 seconds (e.g., on GitHub Pages), it switches to direct OpenRouter API calls. This means the same codebase works both locally (with streaming via WebSocket) and as a fully static site.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 20, TypeScript 5.3, Express 4, ws (WebSocket) |
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES2022) |
| AI (primary) | [Anthropic Claude Opus 4.6](https://www.anthropic.com/claude) |
| AI (fallback) | [OpenRouter](https://openrouter.ai/) — 12 free models |
| Markdown | [marked.js v9](https://marked.js.org/) |
| Syntax highlight | [highlight.js v11](https://highlightjs.org/) |
| Deployment | Any Node.js host (local, Railway, Render, Fly.io) or GitHub Pages (static) |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | No | — | Anthropic key for Claude Opus 4.6 (primary model) |
| `OPENROUTER_API_KEY` | No* | built-in | OpenRouter key for free model cascade |
| `PORT` | No | `3000` | HTTP / WebSocket server port |

\* A shared fallback key is embedded in `public/js/agents-data.js` so the app works out-of-the-box on GitHub Pages without any configuration.

---

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

```bash
# Fork and clone
git clone https://github.com/<your-username>/stage.git
cd stage
npm install

# Create a feature branch
git checkout -b feature/your-idea

# Make changes, then build and test
npm run build && npm start

# Commit and push
git add -p
git commit -m "feat: describe your change"
git push origin feature/your-idea
```

Then open a pull request against `main` on [github.com/ikppramesh/stage](https://github.com/ikppramesh/stage).

---

## License

[MIT](https://choosealicense.com/licenses/mit/) © 2025 Stage Contributors
