// Agent Bus 共享类型：终端 / agent 间通信的消息、任务与命令协议。
// 边界：纯数据定义，不含运行逻辑。

// 'event' = 任务状态机等系统事件，作为消息进收件箱，使 recv/recv --wait 成为统一收件入口。
export type AgentBusMessageKind = 'message' | 'request' | 'reply' | 'event'

export type AgentCollabMode =
  | 'known-agent'
  | 'terminal-readonly'
  | 'terminal-nudge'
  | 'terminal-inject'

// 通知选项：控制事件如何进收件箱与是否注入提醒。
export interface NotifyOptions {
  from?: string // 归属发送方 sessionId（默认 system）
  fromName?: string
  nudge?: boolean // 默认 true；false = 进收件箱但不注入提醒
  onlyIfWaiting?: boolean // true = 仅当对端有活跃 recv --wait 时才投递（心跳类，避免未读堆积）
}

export interface AgentBusMessage {
  id: string
  from: string // 发送方 sessionId
  fromName: string
  to: string // 接收方 sessionId
  kind: AgentBusMessageKind
  replyTo?: string
  body: string
  createdAt: number
  readAt?: number
}

export type AgentTaskStatus =
  | 'created'
  | 'delivered'
  | 'accepted'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'expired'

export interface AgentTaskEvent {
  at: number
  status: AgentTaskStatus | 'progress' | 'note'
  by: string // sessionId
  text?: string
}

export interface AgentTask {
  id: string
  from: string // 派发方 sessionId
  fromName: string
  to: string // 接单方 sessionId
  toName: string
  title: string
  status: AgentTaskStatus
  result?: string
  createdAt: number
  updatedAt: number
  // 守护用：状态进入时间，用于接单超时 / 搁浅检测
  statusSince: number
  // 归档标记（正交于 status 状态机）：归档时间戳；undefined=未归档。
  // 仅终态任务可归档，可取消归档；不影响 status / allowed 流转表。
  archivedAt?: number
  history: AgentTaskEvent[]
}

// es CLI 与 bus server 之间的线协议（JSON-lines）。
export interface AgentBusRequest {
  token: string
  // 调用方会话凭据：服务端签发、注入到该 PTY 的 env，服务端据此绑定真实身份。
  // 不是可猜测的 processId —— 客户端无法用它冒充其它会话（P0#2）。
  agent: string
  argv: string[]
}

export interface AgentBusResponse {
  ok: boolean
  stdout?: string
  stderr?: string
  exitCode: number
}

// 命令执行上下文：已解析出的调用方会话身份。
export interface AgentIdentity {
  sessionId: string
  name: string
  type: string
  collabMode: AgentCollabMode
  injectable: boolean
  unread?: number
  activeTaskCount?: number
}

// broker 对外依赖的会话能力（由 SessionManager 适配提供）。
export interface SessionBridge {
  // 由调用方会话凭据解析真实身份（服务端绑定，禁止冒充）。
  resolveCaller(credential: string): AgentIdentity | null
  resolveByQuery(query: string): { match?: AgentIdentity; candidates: AgentIdentity[] }
  listAgents(): AgentIdentity[]
  getName(sessionId: string): string | null
  isInjectable(sessionId: string): boolean // terminal 类型不可注入
  isRunning(sessionId: string): boolean
  readHistory(sessionId: string, lines: number): string
  writeRaw(sessionId: string, data: string): boolean
}
