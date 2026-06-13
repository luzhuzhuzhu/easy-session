# EasySession 终端 / Agent 间通信架构设计

> 状态：设计草案（待实现）
> 目标读者：EasySession 维护者
> 关联代码：`src/main/services/{cli-manager,session-manager,session-output}.ts`、`src/main/ipc/session-handlers.ts`、`src/main/remote/`

---

## 1. 背景与目标

EasySession 已经在主进程里集中托管了所有会话的 PTY（`SessionManager` + `CliManager`），具备 `sendInput` / `writeRaw` 注入能力和输出历史缓冲。本设计要在此之上，让**不同终端会话里运行的 agent（Claude Code / Codex / OpenCode 等）能够互相通信、派发任务、回传结果**，把"一人盯一个终端"升级为"一人指挥一队 agent"。

要解决两个层次的需求：

- **终端间通信**：人或 App 触发，把文本送进另一个会话（纯 UI/投递问题）。
- **Agent 间协作**：会话里的 agent 主动发消息、领任务、回结果、等待回复（工具 + 协议 + 状态机问题）。

设计核心目标：

1. **零侵入兼容**：对任意 CLI、任意版本生效，不要求 agent 改造。
2. **长任务不超时**：大任务派发后双方都不能阻塞挂死。
3. **复用现成能力**：投递最终都落到 `SessionManager.sendInput/writeRaw`，不另起一套 PTY 管理。
4. **可演进**：先做人能用的，再做 agent 能用的，最后接远程实例。

> 本设计大量借鉴了同类开源项目 golutra（Tauri + Rust）的工程经验，但把其 Rust/Tauri 实现映射到 EasySession 的 TS/Electron 架构，并在通信语义上做了关键取舍（见 §10）。

---

## 2. 设计原则

- **分层**：底层是"投递通道"（谁都能用、零配置），上层是"协作语义"（任务、状态机、唤醒）。两层解耦，上层换实现不动底层。
- **结构化优先、读屏兜底**：agent 通信默认走结构化通道（`es` CLI / 后续 MCP，agent 主动收发）。"读屏抓回复"作为对不肯配合的纯交互 CLI 的**可选 fallback**，不作为主路径（理由见 §10）。
- **派发与等待分离**：提交任务立即返回 `requestId`，等待结果是另一次可重试的调用——任何一端都不长时间阻塞。
- **就绪门控**：往一个忙碌 agent 注入消息要排队，等它处理完上一条再发下一条，避免污染输入。
- **唤醒驱动**：靠"往目标 PTY 注入一行通知"把空闲 agent 当作收到用户输入唤醒，而不是让它轮询。

---

## 3. 总体架构

```
┌─ 主进程 (Electron main) ─────────────────────────────────────┐
│                                                              │
│  MessageBroker ── 路由 / mailbox / 任务状态机 / 唤醒          │
│     │                                                        │
│     ├─ SessionManager.sendInput / writeRaw ──► 注入目标 PTY  │
│     ├─ CliManager.onOutput ──► 空闲检测 (idle gate)          │
│     ├─ CliManager.onExit   ──► 会话死亡 → 任务兜底失败        │
│     └─ DispatchGate ── 单 inflight 队列 + 就绪放行            │
│                                                              │
│  AgentBusServer (named pipe)  ◄──── es CLI 连入               │
│                                                              │
└──────────────────────┬───────────────────────────────────────┘
                        │  \\.\pipe\easysession-bus-<token>
        ┌───────────────┴───────────────┐
        │ 会话A: es task create 实现者 …  │ 会话B: (被注入唤醒) es task show
        │  (agent 用 Bash 工具调用)       │
        └────────────────────────────────┘

UI 入口（渲染进程）── IPC session:sendTo / 右键菜单 ── 也走 MessageBroker
```

**数据流（agent A 给 agent B 派任务）**：

1. A 在自己终端里跑 `es task create 实现者 "重构 xxx"`（agent 用 Bash 工具）。
2. `es` 通过 named pipe 把请求发给 `AgentBusServer` → `MessageBroker`。
3. Broker 创建一条 task（状态 `created`），**立即返回 `taskId`**，A 不阻塞。
4. Broker 经 `DispatchGate` 往 B 的 PTY 注入唤醒：`[easysession] 📋 新任务 t-3 来自「架构师」— 运行 es task show t-3`。
5. B 被当作收到用户输入唤醒，干活；干完跑 `es task done t-3 --result "…"`。
6. Broker 把 task 置 `done`，往 A 的 PTY 注入唤醒，A 像收到用户消息一样继续。

全程没有任何一端长时间阻塞。

---

## 4. 核心组件

### 4.1 MessageBroker（主进程，新增）

`src/main/services/message-broker/`。系统中枢，纯内存对象 + 几个定时器。职责：

- **路由**：按会话名/ID 解析目标（唯一前缀匹配，歧义报错列候选）。
- **mailbox**：`Map<sessionId, Message[]>`，存未读消息/任务。App 重启清空（够用）。
- **任务状态机**（§4.5）。
- **唤醒**：状态变化时，唤醒"在等这个变化的那一方"。
- **守护**：接单超时重发、任务搁浅提醒、会话死亡兜底（§4.5）。

消息模型：

```ts
interface BusMessage {
  id: string
  from: string            // sessionId
  to: string              // sessionId
  kind: 'message' | 'request' | 'reply'
  replyTo?: string
  body: string
  createdAt: number
  readAt?: number
}
```

### 4.2 AgentBusServer（主进程，新增）

`src/main/services/message-broker/bus-server.ts`。本地 IPC 端点，承接 `es` CLI 的连接。

- Windows：named pipe `\\.\pipe\easysession-bus-<token>`；macOS/Linux：`$TMPDIR/easysession-bus-<token>.sock`。用 Node `net.createServer`。
- 协议：**JSON-lines**（一行一个 JSON 请求，一行一个 JSON 响应）。
- 鉴权：pipe 名含随机 `token`，请求体再带 `EASYSESSION_TOKEN` 校验；仅监听本机。
- 每个连接一次性请求-响应（参考 golutra 的 `command_ipc`）。

### 4.3 `es` CLI + shim（新增）

让会话里的 agent / shell 能调用总线。

- **`es` 命令本体**：一段单文件 JS，通过 `ELECTRON_RUN_AS_NODE=1` 用 app 自带的 Electron 运行时执行（用户机器不保证有 node）。它连 named pipe、发 JSON、打印结果、按约定 exit code 退出。
- **shim 目录注入 PATH**：spawn PTY 时，在 `CliManager.buildSpawnEnv` 里把一个 shim 目录追加进 `PATH`，目录内放 `es.cmd`（Win）/ `es`（Unix）转发到上述运行时。
- **会话身份注入**：同样在 `buildSpawnEnv` 注入 `EASYSESSION_SESSION_ID` / `EASYSESSION_PIPE` / `EASYSESSION_TOKEN`，`es` 据此知道"我是谁、连哪、凭什么"。

> `buildSpawnEnv(command)` 是当前代码里唯一的 env 组装点（`cli-manager.ts:90+`），所有注入都收口在这里，改动面最小。

### 4.4 DispatchGate（注入门控，新增）

`src/main/services/message-broker/dispatch-gate.ts`。借鉴 golutra `chat_dispatch_batcher`：

- **每个目标会话同时只有一条消息 inflight**；后续消息进 `pending` 队列。
- 上一条"就绪信号"到达前不放行下一条；多条堆积的消息用 `\n\n` 合并成一条注入。
- **注入工程细节（直接照搬 golutra 的踩坑结论）**：
  - 文本与回车**分离**：先 `writeRaw(id, text)`，隔 ~100ms 再单独 `writeRaw(id, '\r')`，否则 CLI 输入模式会误判。
  - 多行文本走 bracketed paste：`\x1b[200~` + 文本 + `\x1b[201~`，避免被逐行当成多条消息。
  - terminal 类型会话**绝不注入**（往裸 shell 注入文本 = 执行命令，危险）；它只存 mailbox，靠主动 `es recv`。

### 4.5 任务状态机（中枢，新增）

解决"大任务派发，两边都会超时"的核心。任务是一等公民，状态：

```
created ──► accepted ──► in_progress ──► done
   │            │             │     └──► failed
   │            │             └──► blocked ──(unblock)──► in_progress
   │            └──► rejected
   └──(接单超时)──► 重发唤醒 / 通知派发方
```

唤醒规则：**状态变化唤醒"在等这个变化的那一方"**；`progress` 例外（只记录，不打扰派发方）。

**守护职责（"中枢"的真正价值，三种实战必现的失败兜底）**：

1. **接单超时**：task 派出 N 分钟仍 `created` → 重发一次唤醒；再超时通知派发方"对方未响应"。
2. **任务搁浅**：`in_progress` 但长时间无 `progress` 且 B 会话已空闲（Broker 经 idle gate 看得到）→ 注入提醒 B："任务仍进行中，请 done/fail/progress"。这是 agent 协作最高频的坑。
3. **会话死亡**：监听 `CliManager.onExit`，B 会话退出/重启时，把它名下所有未完任务标 `failed(会话退出)` 并唤醒派发方，避免派发方永远等不到结果。

### 4.6 空闲检测（idle gate，可选增强）

DispatchGate 放行下一条的"就绪信号"有两种来源，按可靠性递选：

- **首选——主动信号**：被注入的 agent 处理完后自己跑一句（如 `es ack`），或我们在注入命令里串联一个完成标记。最可靠，但需 agent 配合。
- **兜底——输出静默**：挂 `CliManager.onOutput`，某会话连续 `SILENCE_MS`（参考 golutra：3000ms）无新输出 + 1000ms 防抖 → 判定空闲；并设 `FORCE_MS`（30000ms）强制兜底，防进度刷屏永远等不到静默。

### 4.7 读屏 fallback（可选，非主路径）

对完全不肯配合、纯交互式的 CLI，提供 golutra 式的"读屏抓回复"：用 `SessionOutputManager` 的快照，按 TUI 提示符（`›`）和 bullet（`•`/`✦`）边界抠出回复正文写回。**仅作为 fallback**，默认关闭——它绑死 TUI 渲染字符，极脆弱（见 §10）。

---

## 5. `es` 命令集规格

所有命令支持 `--json`（agent 解析用）。Exit code 约定：`0` 成功 / `1` 错误 / `2` 超时。

### 便条型（无状态，短交互）

| 命令 | 作用 | 唤醒 |
|---|---|---|
| `es whoami` | 我是谁：会话名、id、类型、cwd | — |
| `es sessions` | 列所有会话：名字、类型、运行状态、未读数 | — |
| `es send <目标> "<消息>"` | 异步发送，立即返回消息 id | → 目标 |
| `es recv [--wait] [--timeout 秒] [--from 目标]` | 取未读；`--wait` 阻塞到有新消息 | — |
| `es peek <目标> [--lines N]` | 读对方终端输出历史（只读，不打扰） | — |

### 任务型（带状态机，长事务）

| 命令 | 作用 | 唤醒 |
|---|---|---|
| `es task create <目标> "<描述>"` | 派发任务，立即返回 taskId | → 目标 |
| `es task accept / reject <id>` | 接单 / 拒单 | → 派发方 |
| `es task progress <id> "<进展>"` | 汇报进度（兼心跳） | 静默记录 |
| `es task block <id> "<问题>"` | 卡住，要派发方澄清 | → 派发方 |
| `es task unblock <id> "<答复>"` | 派发方答复 | → 接单方 |
| `es task done <id> --result "…"` / `fail <id> "<原因>"` | 交付 / 失败 | → 派发方 |
| `es task list / show <id>` | 看任务板 / 单任务全历史 | — |

`send`+`recv` 覆盖通知协作，`task` 系列覆盖长事务，`peek` 覆盖"不打扰地观察"。三组原语足以组合出主从分工、工人池、审查流水线等模式。

> `es --help` 必须写成**给 agent 看的文档**——这是它唯一的自学入口。

---

## 6. 与现有代码的对接点

| 现有代码 | 改动 |
|---|---|
| `cli-manager.ts` `buildSpawnEnv()` | 注入 `EASYSESSION_SESSION_ID/PIPE/TOKEN` + PATH 追加 shim 目录 |
| `cli-manager.ts` `onOutput()` | idle gate 订阅输出做静默检测 |
| `cli-manager.ts` `onExit()` | 任务死亡兜底监听 |
| `session-manager.ts` `sendInput/writeRaw` | DispatchGate 的注入出口（已具备，复用） |
| `session-output.ts` 历史缓冲 | `es peek` 与读屏 fallback 的数据源（已具备，复用） |
| `ipc/session-handlers.ts` | 新增 `session:sendTo` 给 UI 入口用 |
| `src/main/remote/`（socket） | 未来跨机器：远程实例会话经现有 socket 接入同一 Broker（§11） |

新增模块（建议）：`src/main/services/message-broker/{index,bus-server,dispatch-gate,task-store}.ts`、`src/main/cli/es.ts`（CLI 本体）、`resources/shim/`（es.cmd / es）。

---

## 7. UI 入口（渲染进程）

第一阶段就能交付的"终端间通信"（不依赖 agent 配合）：

- 终端选中文本 → 右键"发送到会话…"（子菜单列出其他运行中会话）。
- 会话右键菜单"向此会话发送…"弹输入框。
- 走新增 IPC `session:sendTo(targetId, text)` → `MessageBroker` → DispatchGate 注入。

---

## 8. 安全边界

- pipe 名含随机 token + 请求体 token 双重校验，**仅监听本机**。
- terminal 类型会话只读不注入（§4.4）。
- `es peek` 只读输出缓冲，不能写；写只能走 `send`/`task` 的受控通道。
- 第一版不接远程实例会话（Broker 预留接口，后续走 remote socket 转发）。

---

## 9. 分阶段落地路线

- **P0 — 投递通道 + UI 入口（约半天）**
  `MessageBroker` 骨架（mailbox + 注入）+ DispatchGate 基础（文本/`\r` 分离、`\n\n` 合并、terminal 不注入）+ IPC `session:sendTo` + 右键菜单。
  *交付：人可以把 A 会话的内容选中丢进 B 会话，零 agent 配合。*

- **P1 — 本地总线 + `es` CLI（约一天）**
  `AgentBusServer`（named pipe）+ env/shim/PATH 注入 + `es` 本体（sessions/send/recv/peek）+ 唤醒通知。
  *交付：任意 agent / shell 零配置互发消息。*

- **P2 — 任务状态机 + 守护（约一天）**
  `es task` 系列 + 状态机 + 接单超时/搁浅/死亡三类守护 + idle gate。
  *交付：大任务派发不超时、异常有兜底。*

- **P3 —（可选）读屏 fallback / MCP 增强**
  对不配合的 CLI 上读屏；对支持的 CLI（claude `--mcp-config`、codex `-c`）把总线暴露成 MCP 工具集，提升可发现性。

---

## 10. 已知风险与取舍

- **结构化 vs 读屏（核心分歧）**：golutra 选"零 agent 配合 + 读屏抓回复"，换来万能兼容但**极脆弱**——回复识别绑死 `›`/`•`/`✦` 等 TUI 字符，CLI 改版即崩，其 `prompt_block` 三百行都在和 TUI 布局搏斗。本设计反过来：**主路径走 agent 主动收发（结构化、稳定、可传结构化数据），读屏仅作可选 fallback**。代价是要让 agent 知道 `es` 存在（靠 `--help` 文档、对 claude 用 `--append-system-prompt` 注入一句说明、或项目 CLAUDE.md 约定）。
- **静默判定误伤**：纯靠输出静默判空闲，会把"agent 思考 >3s"误当答完；`FORCE_MS` 兜底又可能截断未写完的回复。所以 idle gate **首选主动信号**，静默仅兜底。
- **唤醒注入的副作用**：往正在跑任务的 agent 注入文本，会进它的输入队列（Claude Code 会排队不丢），但仍可能打断交互。通知要做**节流合并**（同目标 10s 内多条只注入一次"N 条新消息"）。
- **内存态任务丢失**：任务存内存，App 重启即失。若要跨重启，后续可落 SQLite（golutra 即用 SQLite 聊天库 + outbox）。第一版 YAGNI。

---

## 11. 不做 / 未来（YAGNI）

- **不做**：持久化任务库、消息加密、多机鉴权体系、复杂重试/死信队列（golutra 这部分也只是空桩）——按需再加。
- **未来**：
  - **跨机器协作**：远程实例的会话经现有 `src/main/remote/` socket 接入同一 Broker，实现跨机器 agent 协作。
  - **MCP 标准入口**：把总线暴露成 MCP server，claude/codex 启动时自动注入会话级临时配置（不碰用户全局配置），agent 在工具列表直接看到 `send_message`/`create_task`，无需提示词即可发现能力。
  - **编排层**：在 Broker 之上做固定流水线（如 A 写码 → B 审查），监听完成信号自动串联。
