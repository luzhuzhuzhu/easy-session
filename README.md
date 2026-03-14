<p align="right">
  <strong>English</strong> | <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <img src="resources/logo-easy-session.png" alt="EasySession Logo" width="128" />
</p>

<h1 align="center">EasySession</h1>

<p align="center">Native Terminal, Unified Management, Remote Ready</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.3.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-33-47848F?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue" />
  <img src="https://img.shields.io/badge/remote-web%20%26%20desktop-ready-0F766E" alt="Remote Ready" />
</p>

---

## About

EasySession is a lightweight desktop app that provides unified graphical session management for AI CLI tools (Claude CLI, Codex CLI, OpenCode CLI, etc.), with a browser-friendly remote web entry for mobile and remote access.

Resuming a CLI session is easy (`--resume`), but when you have multiple projects with multiple sessions each, opening terminals, switching directories, and typing commands every time gets tedious. EasySession puts local and remote projects and sessions in one interface — just click to launch, switch, mount, or continue from the browser.

## Screenshot

<p align="center">
  <img src="resources/pic/1.png" alt="EasySession Screenshot" width="800" />
</p>

## Highlights

- 🚀 **0.3.0 brings EasySession beyond a local launcher** — remote web access, desktop remote mount, and unified local/remote resources now live in the same product
- 🖥️ **Keep the CLI native** — terminal passthrough stays terminal-first, so prompts, shortcuts, resume flows, and real CLI behavior are preserved
- 🌍 **Use it where you are** — desktop app for daily work, browser/mobile remote web for quick control, and remote instance mount for multi-machine setups
- 🔐 **Built for practical remote use** — token auth, realtime socket bridge, reverse proxy friendly routing, and Cloudflare Tunnel compatible access

## Why EasySession

| | Traditional | EasySession |
|---|---|---|
| **Start session** | Open terminal → cd directory → type command | One click to launch |
| **Switch projects** | Juggle multiple terminal windows | Unified interface, instant switch |
| **CLI experience** | Full native | Still full native (embedded terminal) |
| **Resume session** | Manual `--resume` | Auto-tracked, one-click resume |
| **Remote access** | Manually expose ports / SSH into another machine | Built-in remote web entry with desktop mount support |

> We don't reinvent the wheel — CLI tools are already powerful enough. EasySession embeds the native terminal to render CLI directly, rather than parsing output into a ChatGPT-style chat UI, so you get full access to all native CLI features.

## Features

- 🖥️ **Session Management** — Create, resume, pause, restart, and group CLI sessions with one-click context recovery
- ⚡ **Native Terminal Embedding** — Built on xterm.js + node-pty, fully preserving real CLI prompts, streaming, and shortcuts
- 🤖 **Multi-CLI Support** - Claude CLI, Codex CLI, and OpenCode CLI supported, with more adapters planned
- 🪟 **In-App Split Workspace** - Multi-pane workspace with split, close, even split, and layout reset
- 🌉 **Desktop Remote Mount** - Mount multiple EasySession instances back into one desktop workspace with unified session/project views
- 📱 **Remote Web Access** - Dedicated browser/mobile remote web with live terminal passthrough, project tree, and responsive controls
- 🔐 **Remote Service & Tunnel Support** - Built-in local remote service, token auth, reverse proxy support, and Cloudflare Tunnel friendly access
- 🌲 **Project-Centric Session Tree** - Organize sessions by project, keep project paths bound, and switch faster with less terminal juggling
- 📊 **Dashboard** — Overview of all session states and project status at a glance
- ⚙️ **Config Editor** — GUI-based CLI config editing with live change detection
- 🧩 **Skill Browser** — Browse and preview global/project-level CLI Skills
- 🧠 **Smart Priority Sorting** - Sort project cards/session tree by startup & usage activity with toggleable strategy
- 🌐 **i18n** — English / 简体中文

## Local + Remote Modes

| Mode | What it is for | What you get |
|---|---|---|
| **Local Desktop** | Daily single-machine use | Native terminal, split panes, dashboard, config editing, project/session management |
| **Desktop + Remote Mount** | Multi-machine unified control | Remote instances mounted into the same desktop workspace with shared project/session views |
| **Remote Web** | Browser/mobile fallback and remote control | Lightweight remote UI, live terminal passthrough, project tree, responsive layout, quick session actions |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- At least one supported AI CLI tool:
  - [Claude CLI](https://platform.claude.com/docs/en/home)
  - [Codex CLI](https://github.com/openai/codex)
  - OpenCode CLI
  - More coming soon (Gemini CLI, etc.)

### Option 1: Download Release

Go to the [Releases](../../releases) page to download the latest installer.

### Option 2: Build from Source

```bash
git clone https://github.com/luzhuzhuzhu/easy-session.git
cd easy-session
npm install
npm run dev
```

### Option 3: Use Remote Web

1. Start EasySession on the target Windows machine
2. Enable the local remote service in Settings
3. Open the generated remote address in a browser, or expose it through your preferred reverse proxy / Cloudflare Tunnel setup
4. Sign in with the remote token and continue using sessions from desktop or mobile

## Tech Stack

| Tech | Version | Purpose |
|------|---------|---------|
| Electron | 33 | Desktop framework |
| Vue | 3.5 | UI framework |
| TypeScript | 5.9 | Type safety |
| Pinia | 2.3 | State management |
| xterm.js | 6.0 | Terminal emulation |
| node-pty | 1.1 | Pseudo-terminal |
| Express + Socket.IO | 4.21 / 4.8 | Remote service, web access, realtime sync |
| SCSS | — | Styling |
| electron-vite | 2.3 | Build tool |

## Roadmap

- [x] Claude CLI support
- [x] Codex CLI support
- [x] OpenCode CLI support
- [x] In-app split workspace (multi-pane)
- [x] Desktop remote mount & unified local/remote gateway
- [x] Browser/mobile remote web access
- [x] Smart project/session priority sorting
- [x] Session grouping & project management
- [x] i18n (English / 简体中文)
- [ ] Gemini CLI support
- [ ] macOS / Linux support
- [ ] Session history search

## Development

```
src/
├── main/           # Main process (services, IPC, remote service)
├── preload/        # Preload scripts
└── renderer/src/   # Renderer (Vue 3 + Pinia)
```

```bash
npm run dev          # Dev server (hot reload)
npm run build:win    # Build Windows installer
npm run test         # Unit tests (vitest)
npm run test:e2e     # E2E tests (Playwright)
```

## License

This project is licensed under [CC BY-NC-SA 4.0](LICENSE).

**Non-commercial use only.** You are free to share and adapt this project, but you must give credit, may not use it for commercial purposes, and derivative works must use the same license.
