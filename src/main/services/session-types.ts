import type { CliType, ClaudeSessionOptions, CodexSessionOptions } from './types'

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
}

// Codex 专属会话类型
export interface CodexSession extends SessionBase {
  type: 'codex'
  options: CodexSessionOptions
  codexSessionId: string | null
}

// 判别联合 - 通过 session.type 自动收窄类型
export type Session = ClaudeSession | CodexSession

export interface CreateSessionParams {
  name?: string
  icon?: string
  type: CliType
  projectPath: string
  options?: ClaudeSessionOptions | CodexSessionOptions
  parentId?: string
  startPaused?: boolean
}

export interface SessionFilter {
  type?: CliType
  projectPath?: string
  status?: SessionStatus
  parentId?: string
}
