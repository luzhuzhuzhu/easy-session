import type { GeminiAdapter } from './gemini-adapter'
import type { SessionOutputManager } from './session-output'
import type { ISessionLifecycle } from './session-lifecycle'
import type { Session, GeminiSession, CreateSessionParams } from './session-types'
import type { GeminiSessionOptions } from './types'

// FEAT-3：Gemini 会话生命周期。resume 复用 --resume <id>；输出扫描
// 「No conversation found / session not found」以标记 resume 失效（对齐 Claude 模式）。
const GEMINI_INVALID_SESSION_PATTERN = /(No conversation found|session not found)/i

export class GeminiSessionLifecycle implements ISessionLifecycle {
  private persistFn: (() => void) | null = null

  constructor(
    private geminiAdapter: GeminiAdapter,
    private outputManager: SessionOutputManager
  ) {}

  setPersistCallback(fn: () => void): void {
    this.persistFn = fn
  }

  create(id: string, name: string, params: CreateSessionParams): GeminiSession {
    const options = (params.options || {}) as GeminiSessionOptions
    const resumeId = typeof options.resumeId === 'string' && options.resumeId.trim() ? options.resumeId.trim() : null
    if (resumeId) options.resumeId = resumeId
    const now = Date.now()

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'
    try {
      processId = this.geminiAdapter.startSession(params.projectPath, options, resumeId ?? undefined)
    } catch (err) {
      status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      const hint = errMsg.includes('ENOENT') ? ' (CLI not found: gemini)' : ''
      this.outputManager.appendOutput(id, `Error: ${errMsg}${hint}\n`, 'stderr')
    }

    return {
      id,
      name,
      icon: params.icon || null,
      type: 'gemini',
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
      geminiSessionId: resumeId
    }
  }

  startProcess(session: Session, startAt: number): void {
    if (session.type !== 'gemini') {
      throw new Error(`GeminiSessionLifecycle received non-gemini session: ${session.type}`)
    }
    const s = session
    const nativeId = s.geminiSessionId?.trim() || undefined
    const optionId = s.options.resumeId?.trim() || undefined
    const resumeId = nativeId ?? optionId
    s.geminiSessionId = resumeId ?? null
    if (resumeId) s.options.resumeId = resumeId
    else delete s.options.resumeId
    s.processId = this.geminiAdapter.startSession(s.projectPath, s.options, resumeId)
    s.status = 'running'
    s.lastStartAt = startAt
    s.lastActiveAt = startAt
  }

  handleOutput(session: Session, data: string): void {
    if (session.type !== 'gemini') return
    const s = session as GeminiSession
    if (s.geminiSessionId && GEMINI_INVALID_SESSION_PATTERN.test(data) && !s.invalidSessionId) {
      s.invalidSessionId = true
      this.persistFn?.()
      this.outputManager.appendOutput(
        s.id,
        'Warning: Gemini reported session not found. Will start a new conversation after this process exits.\n',
        'stdout'
      )
    }
  }

  shouldAutoRestartAfterExit(session: Session, exitCode: number | null): boolean {
    if (session.type !== 'gemini' || exitCode === 0) return false
    const s = session as GeminiSession
    if (!s.invalidSessionId) return false
    s.geminiSessionId = null
    delete s.options.resumeId
    s.invalidSessionId = false
    this.persistFn?.()
    this.outputManager.appendOutput(
      s.id,
      'Info: Starting a fresh Gemini conversation because the previous session could not be resumed.\n',
      'stdout'
    )
    return true
  }

  cleanup(session: Session): void {
    if (session.type === 'gemini') {
      delete session.invalidSessionId
    }
  }

  migrateOnLoad(session: Session): boolean {
    if (session.type !== 'gemini') return false
    const s = session as GeminiSession
    const nativeId = s.geminiSessionId?.trim() || null
    const optionId = s.options.resumeId?.trim() || null
    const resolved = nativeId ?? optionId
    let changed = false
    if (s.geminiSessionId !== resolved) {
      s.geminiSessionId = resolved
      changed = true
    }
    if (resolved && s.options.resumeId !== resolved) {
      s.options.resumeId = resolved
      changed = true
    } else if (!resolved && 'resumeId' in s.options) {
      delete s.options.resumeId
      changed = true
    }
    return changed
  }

  hydrateSessionId(_session: Session): boolean {
    return false
  }
}
