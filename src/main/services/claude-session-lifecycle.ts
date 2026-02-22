import { randomUUID } from 'crypto'
import type { ClaudeAdapter } from './claude-adapter'
import type { SessionOutputManager } from './session-output'
import type { ISessionLifecycle } from './session-lifecycle'
import type { Session, ClaudeSession, CreateSessionParams } from './session-types'
import type { ClaudeSessionOptions } from './types'

const CLAUDE_INVALID_SESSION_PATTERN = /No conversation found(?: with session ID)?/i

export class ClaudeSessionLifecycle implements ISessionLifecycle {
  private persistFn: (() => void) | null = null

  constructor(
    private claudeAdapter: ClaudeAdapter,
    private outputManager: SessionOutputManager
  ) {}

  setPersistCallback(fn: () => void): void {
    this.persistFn = fn
  }

  create(id: string, name: string, params: CreateSessionParams): ClaudeSession {
    const claudeSessionId = randomUUID()
    const now = Date.now()
    const options = (params.options || {}) as ClaudeSessionOptions

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'

    try {
      processId = this.claudeAdapter.startSession(params.projectPath, options, claudeSessionId)
    } catch (err) {
      status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      const hint = errMsg.includes('ENOENT') ? ' (CLI not found: claude)' : ''
      this.outputManager.appendOutput(id, `Error: ${errMsg}${hint}\n`, 'stderr')
    }

    return {
      id,
      name,
      icon: params.icon || null,
      type: 'claude',
      projectPath: params.projectPath,
      status,
      createdAt: now,
      lastStartAt: now,
      totalRunMs: 0,
      lastRunMs: 0,
      lastActiveAt: now,
      processId,
      options,
      parentId: params.parentId || null,
      claudeSessionId
    }
  }

  startProcess(session: Session, startAt: number): void {
    if (session.type !== 'claude') {
      throw new Error(`ClaudeSessionLifecycle received non-claude session: ${session.type}`)
    }

    const s = session
    if (!s.claudeSessionId) {
      throw new Error('Claude session ID is missing, cannot resume')
    }
    s.processId = this.claudeAdapter.resumeSession(s.projectPath, s.options, s.claudeSessionId)
    s.status = 'running'
    s.lastStartAt = startAt
    s.lastActiveAt = startAt
  }

  handleOutput(session: Session, data: string): void {
    if (session.type !== 'claude') return

    if (session.claudeSessionId && CLAUDE_INVALID_SESSION_PATTERN.test(data)) {
      // 不清除 claudeSessionId，保留原始 ID 以便下次仍用 --resume 恢复正确会话
      this.outputManager.appendOutput(
        session.id,
        'Warning: Claude reported session not found, will retry with same ID on next resume.\n',
        'stdout'
      )
    }
  }

  cleanup(_session: Session): void {}

  migrateOnLoad(_session: Session): boolean {
    return false
  }

  hydrateSessionId(_session: Session): boolean {
    return false
  }
}
