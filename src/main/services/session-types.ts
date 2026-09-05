import type {
  CliType,
  ClaudeSessionOptions,
  CodexSessionOptions,
  OpenCodeSessionOptions,
  GeminiSessionOptions,
  PiSessionOptions,
  GrokSessionOptions,
  HermesSessionOptions,
  TerminalSessionOptions
} from './types'

export type SessionStatus = 'idle' | 'running' | 'stopped' | 'error'

// 两种 CLI 会话共享的基础字段
interface SessionBase {
  id: string
  name: string
  icon: string | null
  type: CliType
  projectPath: string
  status: SessionStatus
  createdAt: number
  lastStartAt: number
  totalRunMs: number
  lastRunMs: number
  lastActiveAt: number
  processId: string | null
  parentId: string | null
}

// Claude 专属会话类型
export interface ClaudeSession extends SessionBase {
  type: 'claude'
  options: ClaudeSessionOptions
  claudeSessionId: string | null
  // 本运行周期内检测到 resume ID 失效（No conversation found），
  // 进程退出后由 SessionManager 清 ID 自动重启一次，防止循环重启
  invalidSessionId?: boolean
}

// Codex 专属会话类型
export interface CodexSession extends SessionBase {
  type: 'codex'
  options: CodexSessionOptions
  codexSessionId: string | null
  // resume 失效自动重启只执行一次，防止循环重启
  noAutoRestart?: boolean
}

export interface OpenCodeSession extends SessionBase {
  type: 'opencode'
  options: OpenCodeSessionOptions
  opencodeSessionId: string | null
  opencodeSessionIdSource?: 'user' | 'output' | 'list' | null
  // resume 失效自动重启只执行一次，防止循环重启
  noAutoRestart?: boolean
}

export interface TerminalSession extends SessionBase {
  type: 'terminal'
  options: TerminalSessionOptions
}

// FEAT-3：Gemini 会话（resume 失效自动重启对齐 Claude：一次性守卫防循环）。
export interface GeminiSession extends SessionBase {
  type: 'gemini'
  options: GeminiSessionOptions
  geminiSessionId: string | null
  invalidSessionId?: boolean
}

// 通用原生会话 ID 结构：所有新 CLI（pi/omp/grok/hermes）与 gemini 对齐——
// ID 字段名 = `${type}SessionId`，resume 失效用一次性 invalidSessionId 守卫。
export interface PiSession extends SessionBase {
  type: 'pi'
  options: PiSessionOptions
  piSessionId: string | null
  invalidSessionId?: boolean
}

export interface OmpSession extends SessionBase {
  type: 'omp'
  options: PiSessionOptions
  ompSessionId: string | null
  invalidSessionId?: boolean
}

export interface GrokSession extends SessionBase {
  type: 'grok'
  options: GrokSessionOptions
  grokSessionId: string | null
  invalidSessionId?: boolean
}

export interface HermesSession extends SessionBase {
  type: 'hermes'
  options: HermesSessionOptions
  hermesSessionId: string | null
  invalidSessionId?: boolean
}

export type Session =
  | ClaudeSession
  | CodexSession
  | OpenCodeSession
  | TerminalSession
  | GeminiSession
  | PiSession
  | OmpSession
  | GrokSession
  | HermesSession

export interface CreateSessionParams {
  name?: string
  icon?: string
  type: CliType
  projectPath: string
  options?:
    | ClaudeSessionOptions
    | CodexSessionOptions
    | OpenCodeSessionOptions
    | TerminalSessionOptions
    | PiSessionOptions
    | GrokSessionOptions
    | HermesSessionOptions
  parentId?: string
  startPaused?: boolean
}

export interface SessionFilter {
  type?: CliType
  projectPath?: string
  status?: SessionStatus
  parentId?: string
}
