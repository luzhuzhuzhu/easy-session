<p align="right">
  <a href="README.md">English</a> | <strong>简体中文</strong>
</p>

<p align="center">
  <img src="resources/logo-easy-session.png" alt="EasySession Logo" width="128" />
</p>

<h1 align="center">EasySession</h1>

<p align="center">原生终端，统一管理</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-0.1.1-blue" alt="Version" />
  <img src="https://img.shields.io/badge/license-CC%20BY--NC--SA%204.0-green" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows-lightgrey" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-33-47848F?logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/Vue-3.5-4FC08D?logo=vue.js" alt="Vue" />
</p>

---

## 项目简介

EasySession 是一款轻量级桌面应用，为 AI CLI 工具（Claude CLI、Codex CLI、Gemini CLI 等）提供统一的图形化会话管理。

CLI 恢复会话本身很简单（`--resume`），但当你有多个项目、每个项目多个会话时，每次都要打开终端、切目录、敲命令——这很繁琐。EasySession 把所有项目和会话集中在一个界面，点一下就能启动或切换。

## 功能截图

<p align="center">
  <img src="resources/pic/1.png" alt="EasySession 截图" width="800" />
</p>

## 为什么选择 EasySession

| | 传统方式 | EasySession |
|---|---|---|
| **启动会话** | 打开终端 → cd 目录 → 敲命令 | 点一下启动 |
| **多项目切换** | 多个终端窗口来回切 | 统一界面，即点即切 |
| **CLI 体验** | 原生完整 | 同样原生完整（嵌入式终端） |
| **会话恢复** | 手动 `--resume` | 自动记录，一键恢复 |

> 我们不重新造轮子——各家 CLI 本身已经足够强大。EasySession 直接嵌入原生终端渲染 CLI，而不是解析输出做成类 ChatGPT 的聊天界面，让你完整使用 CLI 的所有原生功能。

## 核心特性

- 🖥️ **会话管理** — 创建、恢复、分组管理 CLI 会话，一键回到之前的工作上下文
- ⚡ **原生终端嵌入** — 基于 xterm.js + node-pty，完整保留 CLI 原生交互体验
- 🔌 **多 CLI 支持** — 已支持 Claude CLI、Codex CLI，计划支持 Gemini CLI 等更多工具
- 📁 **项目管理** — 按项目组织会话，绑定工作目录，快速切换
- 📊 **仪表盘总览** — 一目了然查看所有会话状态和项目概况
- ⚙️ **配置编辑** — 图形化编辑 CLI 配置，实时监听变更
- 🧩 **技能浏览** — 浏览和预览CLI全局/项目级Skill
- 🌐 **多语言** — 支持 English / 简体中文

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 18
- 至少安装一个支持的 AI CLI 工具：
  - [Claude CLI](https://platform.claude.com/docs/en/home)
  - [Codex CLI](https://github.com/openai/codex)
  - 更多 CLI 支持计划中（Gemini CLI 等）

### 方式一：下载安装包

前往 [Releases](../../releases) 页面下载最新版本的安装程序。

### 方式二：从源码构建

```bash
git clone https://github.com/luzhuzhuzhu/easy-session.git
cd easy-session
npm install
npm run dev
```

## 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Electron | 33 | 桌面应用框架 |
| Vue | 3.5 | UI 框架 |
| TypeScript | 5.9 | 类型安全 |
| Pinia | 2.3 | 状态管理 |
| xterm.js | 6.0 | 终端模拟 |
| node-pty | 1.1 | 伪终端进程 |
| SCSS | — | 样式 |
| electron-vite | 2.3 | 构建工具 |

## Roadmap

- [x] Claude CLI 支持
- [x] Codex CLI 支持
- [x] 会话分组与项目管理
- [x] 多语言（English / 简体中文）
- [ ] Gemini CLI 支持
- [ ] macOS / Linux 支持
- [ ] 会话历史搜索

## 开发

```
src/
├── main/           # 主进程（服务、IPC）
├── preload/        # 预加载脚本
└── renderer/src/   # 渲染进程（Vue 3 + Pinia）
```

```bash
npm run dev          # 启动开发服务器（热重载）
npm run build:win    # 构建 Windows 安装程序
npm run test         # 单元测试（vitest）
npm run test:e2e     # 端到端测试（Playwright）
```

## 许可证

本项目采用 [CC BY-NC-SA 4.0](LICENSE) 许可证。

**仅供非商业用途。** 你可以自由分享和修改本项目，但必须注明出处、不得用于商业目的，且衍生作品须以相同许可证发布。
