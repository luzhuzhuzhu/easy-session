import type { CliType, ClaudeSessionOptions, CodexSessionOptions, OpenCodeSessionOptions } from './types'

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

export interface OpenCodeSession extends SessionBase {
  type: 'opencode'
  options: OpenCodeSessionOptions
  opencodeSessionId: string | null
  opencodeSessionIdSource?: 'user' | 'output' | 'list' | null
}

export type Session = ClaudeSession | CodexSession | OpenCodeSession

export interface CreateSessionParams {
  name?: string
  icon?: string
  type: CliType
  projectPath: string
  options?: ClaudeSessionOptions | CodexSessionOptions | OpenCodeSessionOptions
  parentId?: string
  startPaused?: boolean
}

export interface SessionFilter {
  type?: CliType
  projectPath?: string
  status?: SessionStatus
  parentId?: string
}
