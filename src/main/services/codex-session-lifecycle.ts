import type { CodexAdapter } from './codex-adapter'
import type { SessionOutputManager } from './session-output'
import type { ISessionLifecycle } from './session-lifecycle'
import type { Session, CodexSession, CreateSessionParams } from './session-types'
import type { CodexSessionOptions } from './types'

const CODEX_RESUME_HINT_PATTERN = /codex\s+resume\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/ig
const CODEX_DISCOVERY_BASE_SKEW_MS = 45_000
const CODEX_DISCOVERY_MAX_SKEW_MS = 180_000
const CODEX_DISCOVERY_RETRY_INTERVAL_MS = 500
const CODEX_DISCOVERY_MAX_ATTEMPTS = 30

export class CodexSessionLifecycle implements ISessionLifecycle {
  private resumeHintBuffers = new Map<string, string>()
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private persistFn: (() => void) | null = null

  constructor(
    private codexAdapter: CodexAdapter,
    private outputManager: SessionOutputManager
  ) {}

  setPersistCallback(fn: () => void): void {
    this.persistFn = fn
  }

  create(id: string, name: string, params: CreateSessionParams): CodexSession {
    const now = Date.now()
    const options = (params.options || {}) as CodexSessionOptions

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'

    try {
      processId = this.codexAdapter.startSession(params.projectPath, options)
    } catch (err) {
      status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      const hint = errMsg.includes('ENOENT') ? ' (CLI not found: codex)' : ''
      this.outputManager.appendOutput(id, `Error: ${errMsg}${hint}\n`, 'stderr')
    }

    return {
      id, name, icon: params.icon || null, type: 'codex',
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
      codexSessionId: null
    }
  }

  startProcess(session: Session, startAt: number): void {
    if (session.type !== 'codex') throw new Error(`CodexSessionLifecycle 收到非 codex 会话: ${session.type}`)
    const s = session

    const resolvedId =
      s.codexSessionId ??
      this.findCodexSessionIdInHistory(s.id) ??
      this.codexAdapter.findSessionIdByProjectPath(
        s.projectPath,
        s.lastStartAt || s.createdAt,
        CODEX_DISCOVERY_MAX_SKEW_MS
      )

    if (resolvedId) {
      s.codexSessionId = resolvedId
      s.processId = this.codexAdapter.resumeSession(s.projectPath, s.options, resolvedId)
    } else {
      s.processId = this.codexAdapter.startSession(s.projectPath, s.options)
      this.outputManager.appendOutput(
        s.id,
        'Info: No trusted resume ID found, starting a new conversation.\n',
        'stdout'
      )
    }

    s.status = 'running'
    s.lastStartAt = startAt
    s.lastActiveAt = startAt
  }

  handleOutput(session: Session, data: string): void {
    if (session.type !== 'codex') return
    this.updateCodexSessionIdFromOutput(session, data)
  }

  cleanup(session: Session): void {
    this.resumeHintBuffers.delete(session.id)

    const timer = this.pendingTimers.get(session.id)
    if (timer) {
      clearTimeout(timer)
      this.pendingTimers.delete(session.id)
    }
  }

  migrateOnLoad(session: Session): boolean {
    if (session.type !== 'codex') return false
    return this.migrateLegacyCodexOptions(session)
  }

  hydrateSessionId(session: Session): boolean {
    if (session.type !== 'codex') return false
    const s = session
    if (s.codexSessionId) return false

    const discovered =
      this.findCodexSessionIdInHistory(s.id) ??
      this.codexAdapter.findSessionIdByProjectPath(
        s.projectPath,
        s.lastStartAt || s.createdAt,
        CODEX_DISCOVERY_MAX_SKEW_MS
      )

    if (!discovered) return false
    s.codexSessionId = discovered
    return true
  }

  ensureCodexSessionIdAsync(
    sessionId: string,
    projectPath: string,
    targetStartMs: number,
    expectedProcessId: string,
    getSession: () => CodexSession | undefined
  ): void {
    let attempts = 0

    const tryHydrate = (): void => {
      this.pendingTimers.delete(sessionId)

      const session = getSession()
      if (!session || session.type !== 'codex') return
      if (session.processId !== expectedProcessId) return
      if (session.codexSessionId) return

      const skewMs = Math.min(
        CODEX_DISCOVERY_MAX_SKEW_MS,
        CODEX_DISCOVERY_BASE_SKEW_MS + attempts * 5_000
      )
      const discovered =
        this.findCodexSessionIdInHistory(sessionId) ??
        this.codexAdapter.findSessionIdByProjectPath(
          projectPath,
          targetStartMs,
          skewMs
        )

      if (discovered) {
        session.codexSessionId = discovered
        this.persistFn?.()
        return
      }

      attempts += 1
      if (attempts >= CODEX_DISCOVERY_MAX_ATTEMPTS) {
        return
      }

      this.pendingTimers.set(
        sessionId,
        setTimeout(tryHydrate, CODEX_DISCOVERY_RETRY_INTERVAL_MS)
      )
    }

    this.pendingTimers.set(sessionId, setTimeout(tryHydrate, 3000))
  }

  private stripAnsi(input: string): string {
    return input
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u009b[0-?]*[ -/]*[@-~]/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
  }

  private updateCodexSessionIdFromOutput(session: CodexSession, data: string): void {
    const currentBuffer = this.resumeHintBuffers.get(session.id) ?? ''
    const merged = (currentBuffer + this.stripAnsi(data)).slice(-4096)
    this.resumeHintBuffers.set(session.id, merged)

    const found = this.extractLatestResumeHintId(merged)
    if (found && session.codexSessionId !== found) {
      session.codexSessionId = found
      this.persistFn?.()
    }
  }

  private findCodexSessionIdInHistory(sessionId: string): string | null {
    const history = this.outputManager.getHistory(sessionId, 2000)
    if (history.length === 0) return null

    const merged = this.stripAnsi(history.map((line) => line.text).join('')).slice(-12000)
    return this.extractLatestResumeHintId(merged)
  }

  private extractLatestResumeHintId(input: string): string | null {
    const pattern = new RegExp(CODEX_RESUME_HINT_PATTERN)
    let match: RegExpExecArray | null = null
    let found: string | null = null

    while ((match = pattern.exec(input)) !== null) {
      found = match[1]
    }

    return found
  }

  private migrateLegacyCodexOptions(session: CodexSession): boolean {
    const options = session.options
    if (!options || options.permissionsMode || options.sandboxMode) return false

    const legacy = options.approvalMode
    if (legacy === 'suggest') {
      options.permissionsMode = 'read-only'
      delete (options as any).approvalMode
      return true
    }
    if (legacy === 'full-auto') {
      options.permissionsMode = 'full-access'
      delete (options as any).approvalMode
      return true
    }
    if (legacy === 'auto-edit') {
      options.permissionsMode = 'default'
      delete (options as any).approvalMode
      return true
    }
    return false
  }
}
