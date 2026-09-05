import type { GeminiAdapter } from './gemini-adapter'
import type { SessionOutputManager } from './session-output'
import type { ISessionLifecycle } from './session-lifecycle'
import type { Session, GeminiSession, CreateSessionParams } from './session-types'
import type { GeminiSessionOptions } from './types'

// FEAT-3：Gemini 会话生命周期。resume 复用 --resume <id>；输出扫描
// 「No conversation found / session not found」以标记 resume 失效（对齐 Claude 模式）。
const GEMINI_INVALID_SESSION_PATTERN = /(No conversation found|session not found)/i

export class GeminiSessionLifecycle implements ISessionLifecycle {
  constructor(
    private geminiAdapter: GeminiAdapter,
    private outputManager: SessionOutputManager
  ) {}

  setPersistCallback(_fn: () => void): void {
    // 与 Claude 相同：暂不需要输出阶段持久化，保留注入口以兼容调用方。
  }

  create(id: string, name: string, params: CreateSessionParams): GeminiSession {
    const options = (params.options || {}) as GeminiSessionOptions
    const now = Date.now()

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'
    try {
      processId = this.geminiAdapter.startSession(params.projectPath, options)
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
      geminiSessionId: null
    }
  }

  startProcess(session: Session, startAt: number): void {
    if (session.type !== 'gemini') {
      throw new Error(`GeminiSessionLifecycle received non-gemini session: ${session.type}`)
    }
    const s = session
    s.processId = this.geminiAdapter.startSession(s.projectPath, s.options, s.geminiSessionId ?? undefined)
    s.status = 'running'
    s.lastStartAt = startAt
    s.lastActiveAt = startAt
  }

  handleOutput(session: Session, data: string): void {
    if (session.type !== 'gemini') return
    const s = session as GeminiSession
    if (s.geminiSessionId && GEMINI_INVALID_SESSION_PATTERN.test(data) && !s.invalidSessionId) {
      s.invalidSessionId = true
      this.outputManager.appendOutput(
        s.id,
        'Warning: Gemini reported session not found. Will start a new conversation after this process exits.\n',
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
