# EasySession Agent 通信协作升级方案

> 状态：审查稿
> 目标读者：EasySession 维护者、产品设计与主进程/渲染进程开发者
> 关联设计：`docs/AGENT_COMMUNICATION_DESIGN.zh-CN.md`
> 关联代码：`src/main/services/agent-bus/`、`src/main/services/{cli-manager,session-manager,session-output}.ts`、`src/main/index.ts`、`src/renderer/src/views/CollaborationView.vue`

---

## 1. 目标与边界

EasySession 当前已经具备本地 Agent Bus 雏形：会话启动时注入 `es` 命令与身份变量，agent 可通过 `es send / recv / task / peek` 与其他会话通信；主进程已有 mailbox、任务状态机、DispatchGate、提醒注入与协作看板。

本升级方案的目标不是把系统变成重量级聊天平台，而是把现有能力打磨成一个轻量、稳定、可玩性高的多 agent 指挥台：

- 人可以从 UI 直接派任务、发消息、观察进度、答复阻塞、收取结果。
- agent 可以在终端内用 `es` 自主协作，长任务不阻塞，失败有兜底。
- 未知 agent 也能以 terminal 类型运行，并通过“兼容协作模式”参与，而不是被完全排除。
- 不引入 SQLite，不把系统复杂度推高；持久化继续使用轻量 JSON/DataStore 或 append-only JSONL。

明确不做：

- 不引入 SQLite。
- 不默认向 terminal 类型注入文本。
- 不把读屏解析作为主路径。
- 不要求所有 agent 改造或接入 MCP 才能使用基础能力。

---

## 2. 产品定位

EasySession 的 agent 协作应定位为：

> 一个轻量的本地/远程多 agent 指挥台。用户可以把 Claude、Codex、OpenCode、Gemini、Qwen、Shell 中运行的未知 agent 等视为协作成员，通过任务、消息、观察、提醒、结果回收完成并行工作。

与 golutra 相比，EasySession 的路线更轻：

- golutra 偏“聊天系统 + 终端派发 + 读屏回写”。
- EasySession 偏“结构化总线 + 任务状态机 + 轻量观察面板”。

这条路线的核心优势：

- 语义稳定：任务状态、消息、事件是结构化数据。
- 兼容广：只要终端里能执行 `es`，未知 agent 也可参与。
- 风险低：不把任意文本默认注入裸 shell。
- 成本低：不用引入数据库与复杂迁移。

---

## 3. 总体架构

升级后的架构保持现有分层：

```text
┌─ Renderer ───────────────────────────────────────────────┐
│  CollaborationView / Session UI                          │
│  - Agent 列表 / 任务看板 / 消息流 / 任务详情抽屉           │
│  - 发消息 / 派任务 / 答复阻塞 / 查看输出 / 复制结果         │
└───────────────┬──────────────────────────────────────────┘
                │ IPC
┌───────────────▼──────────────────────────────────────────┐
│  Electron Main                                            │
│                                                           │
│  AgentBus                                                 │
│    ├─ AgentBroker: mailbox / 消息路由 / 命令分发           │
│    ├─ TaskStore: 任务状态机 / 守护 / 事件历史              │
│    ├─ DispatchGate: 注入门控 / 合并 / 静默判定             │
│    ├─ AgentBusServer: named pipe / unix socket             │
│    └─ LightweightStore: JSON 快照 + 可选 JSONL 事件日志     │
│                                                           │
│  SessionManager / CliManager / SessionOutputManager        │
│    ├─ PTY 托管                                            │
│    ├─ env + PATH shim 注入                                 │
│    ├─ 输出历史                                             │
│    └─ 远程会话桥接预留                                     │
└───────────────┬──────────────────────────────────────────┘
                │ PTY / pipe
┌───────────────▼──────────────────────────────────────────┐
│  Sessions                                                  │
│  Claude / Codex / OpenCode / Terminal(Gemini/Qwen/unknown) │
│  - 已知 agent：提示词/技能增强，自发现 es                  │
│  - 未知 agent：通过 terminal 兼容协作模式使用 es            │
└───────────────────────────────────────────────────────────┘
```

---

## 4. 核心业务闭环

### 4.1 人指挥 agent

1. 用户在协作面板看到所有运行中会话。
2. 用户选择目标 agent，输入任务描述、上下文、验收标准。
3. UI 调用 `bus:createTask`，主进程创建任务并投递事件。
4. 对可注入 agent，DispatchGate 注入一条纯提醒。
5. 对 terminal/未知 agent，不默认注入；只增加未读与 UI 待处理提示。
6. 目标 agent 用 `es recv` 或 `es task show` 读取任务。
7. agent 接单、开始、汇报、阻塞或完成。
8. 用户在任务详情里查看过程与结果，可继续追问、答复阻塞、转派、归档。

### 4.2 agent 互相协作

1. agent A 执行 `es sessions` 查看成员。
2. agent A 执行 `es task create B "..."` 派发任务。
3. Broker 立即返回 task id，agent A 不长时间阻塞。
4. agent B 收到提醒或主动 `es recv` 读取。
5. agent B `accept/start/progress/done`。
6. agent A `es recv --wait` 收到完成事件，继续原任务。

### 4.3 terminal 兼容协作模式

terminal 类型不能默认注入，因为它可能是裸 shell，注入文本等于执行命令。

但 terminal 类型也可能运行 Gemini、Qwen、自研 agent 或未知 CLI。为兼容这些场景，设计三档能力：

| 模式 | 行为 | 适用场景 |
|---|---|---|
| 只读 mailbox | 不注入，只能 `es recv` 主动读取 | 默认 terminal 安全模式 |
| 提醒可注入 | 只注入纯提醒，不注入任务正文或用户消息 | 用户确认该 terminal 内是 agent |
| 完全可注入 | 允许像已知 agent 一样注入提醒或文本 | 用户显式信任该会话 |

这体现 EasySession 的高可玩性：未知 agent 不需要被官方支持，只要用户把 terminal 标记为“agent-like”，就能加入协作网络。

---

## 5. 前端交互设计

### 5.1 协作指挥台

当前 `CollaborationView` 是观察面板，升级后应成为操作入口。

页面布局：

- 顶部：Bus 状态、在线 agent 数、活跃任务数、未读总数。
- 左侧：Agent 列表。
- 中间：任务看板。
- 右侧：任务详情抽屉。
- 底部或浮层：快速发消息/派任务输入器。

Agent 列表展示：

- 会话名、类型、项目路径摘要。
- 运行状态：在线、忙碌、空闲、停止、不可达。
- 协作模式：已知 agent、terminal 只读、terminal 可提醒、terminal 可注入。
- 未读消息数、相关任务数。
- 快捷动作：发消息、派任务、查看输出、设置协作模式。

任务看板列：

- 待接单
- 已接单
- 进行中
- 阻塞
- 待确认
- 已完成
- 失败/取消

任务卡展示：

- task id
- 标题
- 派发方 -> 接单方
- 当前状态
- 最近事件
- 更新时间
- 是否超时/搁浅/阻塞

任务详情抽屉展示：

- 任务描述与验收标准
- 参与者
- 状态历史
- progress 记录
- block/unblock 对话
- 最终结果
- 相关消息
- 目标会话最近输出片段

### 5.2 快速派发入口

入口一：协作页顶部按钮

- `发消息`
- `派任务`

入口二：会话列表/终端右键菜单

- `发送到此会话`
- `派任务给此会话`
- `附带最近 40 行输出派任务`
- `只读查看输出`

入口三：选中文本右键

- `发送选中文本到...`
- `把选中文本作为任务派给...`
- `让另一个 agent 审查选中文本`

入口四：任务结果动作

- `继续追问`
- `转派给...`
- `发送结果到当前会话`
- `复制结果`
- `标记确认完成`

### 5.3 输入器设计

统一输入器支持两种模式：

- 消息模式：短通知，不要求对方停下。
- 任务模式：长事务，有状态机与兜底。

字段：

- 目标会话
- 模式
- 内容
- 验收标准
- 是否附带上下文
- 是否等待结果
- 优先级

交互细节：

- 目标选择支持模糊搜索与唯一前缀。
- 对 terminal 目标显示安全提示：默认不注入，只投递 mailbox。
- 输入框保留草稿。
- 发送后显示 toast，并跳转/定位到对应任务卡。

---

## 6. 后端能力升级

### 6.1 IPC 能力补齐

当前主进程已有 `session:sendTo` 与 `bus:snapshot`，但前端 API 只暴露 snapshot。

建议新增或补齐：

```ts
bus:snapshot
bus:sendMessage
bus:createTask
bus:taskTransition
bus:taskProgress
bus:taskUnblock
bus:taskCancel
bus:setSessionCollabMode
bus:getSessionOutputPreview
```

说明：

- UI 不应通过模拟终端 `es` 命令来创建任务。
- `es` 是 agent 入口，IPC 是 UI 入口。
- 两者最终都落到同一个 Broker/TaskStore，避免双套业务逻辑。

### 6.2 轻量持久化

不引入 SQLite。保留轻量存储，但建议从“单 JSON 快照”升级为“双层轻量存储”：

```text
agent-bus-state.json       当前快照：tasks/messages/settings
agent-bus-events.jsonl     可选事件日志：append-only，用于调试/恢复/审计
```

策略：

- 正常启动读取 `agent-bus-state.json`。
- 每次变化 debounce 保存快照。
- 重要事件追加到 JSONL：task_created、message_sent、task_done、session_exit 等。
- JSONL 可设置上限，例如保留最近 5000 条或最近 7 天。

收益：

- 不引入数据库。
- 可审计。
- 文件损坏时有恢复余地。
- 调试 agent 协作问题更容易。

### 6.3 轻量 Outbox

不需要 SQLite 版 outbox，但需要轻量队列解决派发可靠性。

内存结构：

```ts
interface OutboxItem {
  id: string
  targetSessionId: string
  kind: 'nudge' | 'message' | 'task-event'
  text: string
  status: 'pending' | 'sent' | 'failed' | 'dead'
  attempts: number
  nextAttemptAt: number
  createdAt: number
  updatedAt: number
  coalesceKey?: string
}
```

规则：

- Broker 投递 mailbox 后创建 outbox nudge。
- DispatchGate 成功写入 PTY 后标记 sent。
- 目标会话停止则 failed，不继续重试。
- terminal 只读模式不创建注入 outbox，只更新 mailbox。
- 同一目标的 nudge 用 `coalesceKey` 合并。

这样可以保留当前轻量架构，同时比“直接 enqueue 后不管”更可观测。

### 6.4 协作模式配置

每个 session 增加协作配置：

```ts
type CollabMode =
  | 'known-agent'
  | 'terminal-readonly'
  | 'terminal-nudge'
  | 'terminal-inject'

interface SessionCollabSettings {
  mode: CollabMode
  trusted: boolean
  autoNudge: boolean
  allowTaskBodyInject: boolean
}
```

默认规则：

- claude/codex/opencode：`known-agent`
- terminal：`terminal-readonly`
- 用户可在 UI 中切换 terminal 为 `terminal-nudge` 或 `terminal-inject`

安全策略：

- `terminal-readonly`：不注入。
- `terminal-nudge`：只注入 `[easysession] 你有 N 条消息，运行 es recv`。
- `terminal-inject`：允许完整注入，但 UI 要明确标记“已信任”。

### 6.5 agent 能力声明

为 UI 和调度做基础能力展示：

```ts
interface AgentCapability {
  sessionId: string
  type: string
  collabMode: CollabMode
  injectable: boolean
  canRunEs: boolean | 'unknown'
  cwd?: string
  projectPath?: string
  lastOutputAt?: number
  unreadCount: number
  activeTaskCount: number
}
```

来源：

- SessionManager 的会话信息。
- CliManager 输出活动。
- `es whoami`/`es recv` 调用刷新。
- 用户手动标记。

---

## 7. 任务状态机升级

当前状态：

```text
created -> accepted -> in_progress -> done/failed
created -> rejected
in_progress -> blocked -> in_progress
```

建议升级为：

```text
created
  -> delivered
  -> accepted
  -> in_progress
  -> blocked
  -> review
  -> done

created/accepted/in_progress/blocked/review
  -> failed
  -> cancelled
  -> expired
```

状态含义：

- `created`：任务已创建。
- `delivered`：提醒已成功投递或目标通过 `recv` 读取。
- `accepted`：接单方接受。
- `in_progress`：接单方开始处理。
- `blocked`：接单方需要澄清。
- `review`：接单方提交结果，等待派发方确认。
- `done`：派发方确认完成，或自动完成。
- `failed`：接单方失败或会话退出。
- `cancelled`：派发方取消。
- `expired`：长时间无人响应自动过期。

为什么增加 `review`：

- 避免 agent 一句 `done` 就把任务永久关闭。
- 用户可以审查结果，不满意则继续追问或重新打开。

为什么增加 `delivered`：

- 用户能区分“任务创建了”与“目标真的被提醒了”。
- 对 terminal 只读模式，可能永远不会 delivered，UI 要明确显示。

---

## 8. 消息与任务事件逻辑

### 8.1 mailbox

mailbox 继续保留：

- 每个 session 一个未读队列。
- 上限保留，防止无限增长。
- `recv` 读取后标记 readAt。

优化：

- 区分 `message`、`task-event`、`system-event`。
- 支持按任务 id 过滤。
- 支持 UI 标记已读。

### 8.2 nudge

nudge 是“唤醒提醒”，不是正文。

默认文案：

```text
[easysession] 你有 3 条新消息/任务事件，运行 es recv 查看
```

原则：

- 不把消息正文注入目标，避免重复与误触发。
- 多条 nudge 合并。
- terminal-readonly 不注入。
- terminal-nudge 只注入这一类提醒。

### 8.3 `recv --wait`

保留现有设计：

- 默认 100 秒，避免 agent 工具超时。
- 超时 exit code 2。
- 客户端断连取消 waiter。

增强：

- 支持 `--task <id>`。
- 支持 `--once` / `--json` 明确语义。
- 等待期间 UI 可显示“某 agent 正在等待消息”。

---

## 9. 未知 agent / terminal 兼容策略

这是 EasySession 的差异化能力。

### 9.1 默认安全

terminal 类型默认：

- 注入 env 与 PATH shim 仍可保留，让用户/未知 agent 能主动执行 `es`。
- 不自动向 PTY 写提醒。
- UI 显示“只读协作模式”。

这样即便 terminal 是裸 shell，也不会误执行文本。

### 9.2 用户显式升级

用户可在会话设置中选择：

- `作为未知 agent 协作`
- `允许 EasySession 注入提醒`
- `允许 EasySession 注入完整消息`

切换时提示：

```text
此会话类型为 Terminal。若其中运行的是裸 shell，注入文本可能被当作命令执行。
建议仅在你确认其中运行的是 Gemini、Qwen 或其他交互式 agent 时开启。
```

### 9.3 启动未知 agent 的推荐路径

未来创建会话时可提供：

- 类型：Terminal
- 模板：Gemini / Qwen / 自定义 agent
- 协作模式：只读 / 提醒 / 完全注入

这不要求 EasySession 官方完整适配每个 agent，但给用户足够玩法。

---

## 10. agent 自发现

### 10.1 Claude

当前已有：

- `--append-system-prompt`
- `~/.claude/skills/es-session-collab`

保留并继续优化 help 文案。

### 10.2 Codex

建议增加轻量提示注入策略：

- 若 Codex 支持自定义提示/配置，启动时注入一段 `es` 说明。
- 若不稳定，则在创建会话后通过 UI 引导用户手动发送一次“协作说明”。
- 不强制改用户全局配置。

### 10.3 OpenCode

建议类似 Codex：

- 优先使用启动参数 prompt。
- 否则提供会话内一次性提示。

### 10.4 未知 agent

通过 terminal 模板或 UI 按钮提供：

```text
复制协作说明
发送协作说明到当前会话
```

说明内容：

- `es whoami`
- `es sessions`
- `es recv --wait`
- `es task accept/start/done`

---

## 11. 丝滑体验细节

### 11.1 实时刷新

当前 `bus:changed` + snapshot 已可用。

优化：

- 任务卡局部更新，避免整页闪。
- 新事件高亮 2 秒。
- 阻塞任务置顶或强提示。
- 完成任务短暂显示完成动画后进入已完成列。

### 11.2 反馈文案

所有动作要给明确反馈：

- 已发送。
- 已创建任务。
- 已投递提醒。
- 已进入 mailbox，但目标是 terminal，只能主动读取。
- 目标不在线。
- 目标名称歧义。
- bus 未就绪。

### 11.3 错误恢复

常见异常：

- AgentBus 未启动：协作页显示横幅，给出原因。
- pipe 连接失败：`es` 输出可理解错误。
- 目标会话退出：任务自动 failed，唤醒派发方。
- 目标 terminal 不可注入：UI 提醒“已入 mailbox”。
- `recv --wait` 超时：提示可重新等待。

### 11.4 任务结果再利用

结果区域提供：

- 复制结果。
- 发送到会话。
- 作为新任务上下文转派。
- 生成审查任务。
- 追加到项目备注/后续可扩展。

---

## 12. 远程协作预留

远程实例暂不作为第一阶段重点，但架构应预留：

```text
AgentAddress = local:<sessionId> | remote:<instanceId>:<sessionId>
```

UI 显示：

- 本机会话
- 远程实例会话

远程策略：

- passthrough-only 远程实例默认只读/不可注入。
- 可控远程实例可通过 remote socket 转发消息。
- 远程 terminal 同样遵守协作模式。

---

## 13. 分阶段落地

### P0：补齐 UI 产品闭环

目标：用户不进终端也能完成派发与收结果。

任务：

- 前端 `api/agent-bus.ts` 增加 send/create/transition 等方法。
- 协作页新增发消息、派任务入口。
- 任务详情抽屉。
- 阻塞答复 UI。
- 会话右键菜单增加发送/派任务。
- terminal 协作模式展示为只读。

验收：

- 用户可从 UI 给 Claude/Codex/OpenCode 派任务。
- 任务状态变化实时显示。
- terminal 目标默认不注入，只显示 mailbox/未读状态。

### P1：terminal 兼容模式

目标：未知 agent 可参与，但默认安全。

任务：

- 增加 SessionCollabSettings。
- terminal 支持 readonly/nudge/inject 三档。
- UI 可切换并显示风险提示。
- DispatchGate 根据 collabMode 判断是否注入。
- `es sessions` 输出协作模式。

验收：

- terminal 默认不被注入。
- 用户把 terminal 标记为 agent-like 后，可以收到提醒。
- 未知 agent 可主动执行 `es recv` 接任务。

### P2：任务状态机增强

目标：任务更可控。

任务：

- 增加 delivered/review/cancelled/expired。
- 增加任务确认/重新打开/取消。
- task show 展示更清晰历史。
- UI 支持 review 状态确认。

验收：

- agent done 后进入 review。
- 派发方可确认 done 或继续追问。
- 长时间未接单可 expired。

### P3：轻量可靠性

目标：不引入数据库，也提高可观测与恢复能力。

任务：

- 可选 JSONL 事件日志。
- 轻量 Outbox 状态。
- 派发状态可视化。
- bus 调试面板或日志导出。

验收：

- 可看到消息是否已提醒、失败或仅入 mailbox。
- App 重启后任务和最近消息恢复。
- JSONL 可辅助排查。

### P4：agent 自发现增强

目标：不同 agent 都知道 `es`。

任务：

- Codex/OpenCode 启动提示。
- 未知 agent 协作说明模板。
- `es help` 增强 terminal 兼容说明。
- 后续可选 MCP，不作为当前必需。

验收：

- 新启动的 Claude/Codex/OpenCode 都能理解如何协作。
- terminal 中运行未知 agent 时，用户可一键发送协作说明。

---

## 14. 推荐优先级

最高优先级：

1. UI 创建任务与发消息。
2. 任务详情抽屉。
3. terminal 协作模式。
4. 任务 review/确认闭环。
5. Codex/OpenCode/未知 agent 自发现说明。

暂缓：

- 读屏 fallback。
- MCP 标准入口。
- 复杂编排 DAG。
- 远程跨机器任务。
- 数据库化。

---

## 15. 最终形态

完成上述升级后，EasySession 的 agent 协作能力应达到：

- 对普通用户：像使用一个多 agent 工作台，可以点选、派活、看结果。
- 对高级用户：可以用 terminal 运行任意未知 agent，并通过 `es` 纳入协作。
- 对 agent：可以自主发现其他会话，派任务、等待结果、处理阻塞。
- 对系统：保持轻量，不引入重数据库，不牺牲安全边界。

这条路线的关键不是“支持更多官方 agent 类型”，而是建立一个稳定的协作协议和渐进式信任模型。已知 agent 走最佳体验，未知 agent 走兼容体验，裸 terminal 保持安全体验。
