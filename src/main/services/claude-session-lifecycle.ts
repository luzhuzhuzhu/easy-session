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
    const options = (params.options || {}) as ClaudeSessionOptions
    const claudeSessionId = options.resumeId?.trim() || randomUUID()
    if (options.resumeId) options.resumeId = claudeSessionId
    const now = Date.now()

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'

    try {
      processId = options.resumeId
        ? this.claudeAdapter.resumeSession(params.projectPath, options, claudeSessionId)
        : this.claudeAdapter.startSession(params.projectPath, options, claudeSessionId)
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
      // 清空绑定后按“全新会话”处理：为下一次启动分配新的原生 ID，
      // 不把空绑定误当成无法恢复而直接置为错误。
      s.claudeSessionId = randomUUID()
      s.processId = this.claudeAdapter.startSession(s.projectPath, s.options, s.claudeSessionId)
      s.status = 'running'
      s.lastStartAt = startAt
      s.lastActiveAt = startAt
      return
    }
    // invalidSessionId 仍为 true：说明 shouldAutoRestartAfterExit 已换上全新 UUID，
    // 但该 UUID 的会话在 Claude 存储里还不存在，必须用 --session-id「创建」而非
    // --resume（直接 resume 一个新 UUID 会再次报 No conversation found 死循环）。
    if (s.invalidSessionId) {
      s.processId = this.claudeAdapter.startSession(s.projectPath, s.options, s.claudeSessionId)
      s.invalidSessionId = false
    } else {
      s.processId = this.claudeAdapter.resumeSession(s.projectPath, s.options, s.claudeSessionId)
    }
    s.status = 'running'
    s.lastStartAt = startAt
    s.lastActiveAt = startAt
  }

  // 运行中输出「No conversation found」说明存储里的会话文件已被删，resume 已无意义。
  // 这里只标记 invalidSessionId，等进程退出后由 shouldAutoRestartAfterExit 统一处理：
  // 清掉死 ID 让 startProcess 走全新会话路径，且重启经 SessionManager 索引（不自起进程）。
  handleOutput(session: Session, data: string): void {
    if (session.type !== 'claude') return

    if (session.claudeSessionId && CLAUDE_INVALID_SESSION_PATTERN.test(data)) {
      const s = session as ClaudeSession
      if (s.invalidSessionId) return
      s.invalidSessionId = true
      this.persistFn?.()
      this.outputManager.appendOutput(
        s.id,
        'Warning: Claude reported session not found. Will start a new conversation after this process exits.\n',
        'stdout'
      )
    }
  }

  // resume 进程非零退出后调用：本次运行中已确认 resume ID 失效时清掉死 ID，
  // 返回 true 让 SessionManager 走标准 startSession（重建 processIndex）。
  // invalidSessionId 本身就是一次性守卫——只有本运行周期检测到失效才重启，防循环。
  shouldAutoRestartAfterExit(session: Session, exitCode: number | null): boolean {
    if (session.type !== 'claude') return false
    if (exitCode === 0) return false
    const s = session as ClaudeSession
    if (!s.invalidSessionId) return false

    // 换全新 UUID，但保持 invalidSessionId = true：新 UUID 在 Claude 存储里还不存在，
    // startProcess 必须走 --session-id「创建」路径（resume 一个不存在的 UUID 会再次
    // 报 No conversation found 死循环）。标志由 startProcess 启动成功后清除。
    s.claudeSessionId = randomUUID()
    this.outputManager.appendOutput(
      s.id,
      'Info: Starting a fresh Claude conversation (the previous session file no longer exists).\n',
      'stdout'
    )
    return true
  }

  cleanup(_session: Session): void {}

  migrateOnLoad(_session: Session): boolean {
    return false
  }

  hydrateSessionId(_session: Session): boolean {
    return false
  }
}
