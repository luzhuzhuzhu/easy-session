import type {
  CliType,
  ClaudeSessionOptions,
  CodexSessionOptions,
  OpenCodeSessionOptions,
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

export type Session = ClaudeSession | CodexSession | OpenCodeSession | TerminalSession

export interface CreateSessionParams {
  name?: string
  icon?: string
  type: CliType
  projectPath: string
  options?: ClaudeSessionOptions | CodexSessionOptions | OpenCodeSessionOptions | TerminalSessionOptions
  parentId?: string
  startPaused?: boolean
}

export interface SessionFilter {
  type?: CliType
  projectPath?: string
  status?: SessionStatus
  parentId?: string
}
