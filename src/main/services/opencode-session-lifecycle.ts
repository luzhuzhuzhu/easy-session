import type { OpenCodeAdapter } from './opencode-adapter'
import type { SessionOutputManager } from './session-output'
import type { ISessionLifecycle } from './session-lifecycle'
import type { Session, OpenCodeSession, CreateSessionParams } from './session-types'
import type { OpenCodeSessionOptions } from './types'

const OPENCODE_SESSION_DISCOVERY_RETRY_INTERVAL_MS = 800
const OPENCODE_SESSION_DISCOVERY_MAX_ATTEMPTS = 25

export class OpenCodeSessionLifecycle implements ISessionLifecycle {
  private _persistFn: (() => void) | null = null
  private sessionHintBuffers = new Map<string, string>()
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private openCodeAdapter: OpenCodeAdapter,
    private outputManager: SessionOutputManager
  ) {}

  setPersistCallback(fn: () => void): void {
    this._persistFn = fn
  }

  create(id: string, name: string, params: CreateSessionParams): OpenCodeSession {
    const options = (params.options || {}) as OpenCodeSessionOptions
    const opencodeSessionId = options.sessionId || null
    const opencodeSessionIdSource: OpenCodeSession['opencodeSessionIdSource'] = options.sessionId ? 'user' : null
    const now = Date.now()

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'

    try {
      processId = this.determineStartupStrategy(
        params.projectPath,
        options,
        opencodeSessionId,
        opencodeSessionIdSource,
        true
      )
      this.warnOnConflictingResumeOptions(id, options)
    } catch (err) {
      status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      const hint = errMsg.includes('ENOENT') ? ' (CLI not found: opencode)' : ''
      this.outputManager.appendOutput(id, `Error: ${errMsg}${hint}\n`, 'stderr')
    }

    return {
      id,
      name,
      icon: params.icon || null,
      type: 'opencode',
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
      opencodeSessionId,
      opencodeSessionIdSource
    }
  }

  async startProcess(session: Session, startAt: number): Promise<void> {
    if (session.type !== 'opencode') {
      throw new Error(`OpenCodeSessionLifecycle received non-opencode session: ${session.type}`)
    }

    const s = session as OpenCodeSession
    const options = s.options || {}

    try {
      s.processId = this.determineStartupStrategy(
        s.projectPath,
        options,
        s.opencodeSessionId,
        s.opencodeSessionIdSource,
        false
      )
      this.warnOnConflictingResumeOptions(s.id, options)
      s.status = 'running'
      s.lastStartAt = startAt
      s.lastActiveAt = startAt
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      this.outputManager.appendOutput(
        s.id,
        `Warning: Resume failed (${errMsg}), starting new session.\n`,
        'stdout'
      )
      s.processId = this.openCodeAdapter.startSession(s.projectPath, options)
      s.status = 'running'
      s.lastStartAt = startAt
      s.lastActiveAt = startAt
    }
  }

  handleOutput(session: Session, data: string): void {
    if (session.type !== 'opencode') return
    const s = session as OpenCodeSession
    const currentBuffer = this.sessionHintBuffers.get(s.id) ?? ''
    const merged = (currentBuffer + this.stripAnsi(data)).slice(-8192)
    this.sessionHintBuffers.set(s.id, merged)

    const found = this.openCodeAdapter.extractSessionIdFromOutput(merged)
    if (found && s.opencodeSessionId !== found) {
      s.opencodeSessionId = found
      s.opencodeSessionIdSource = 'output'
      this._persistFn?.()
    }
  }

  cleanup(session: Session): void {
    this.sessionHintBuffers.delete(session.id)
    const timer = this.pendingTimers.get(session.id)
    if (timer) {
      clearTimeout(timer)
      this.pendingTimers.delete(session.id)
    }
  }

  migrateOnLoad(_session: Session): boolean {
    return false
  }

  async hydrateSessionId(session: Session): Promise<boolean> {
    if (session.type !== 'opencode') return false
    const s = session as OpenCodeSession
    if (s.opencodeSessionId) return false

    const targetStart = s.lastStartAt || s.createdAt
    const strictFallback = !this.shouldUseListDiscovery(s)
    const maxSkew = strictFallback ? 60_000 : undefined

    const discovered = await this.openCodeAdapter.findSessionIdByProjectPath(
      s.projectPath,
      s.options?.cliPath,
      80,
      targetStart,
      maxSkew,
      strictFallback
    )
    if (!discovered) return false
    s.opencodeSessionId = discovered
    s.opencodeSessionIdSource = 'list'
    return true
  }

  ensureOpenCodeSessionIdAsync(
    sessionId: string,
    projectPath: string,
    expectedProcessId: string,
    getSession: () => OpenCodeSession | undefined
  ): void {
    let attempts = 0

    const tryHydrate = async (): Promise<void> => {
      this.pendingTimers.delete(sessionId)

      const session = getSession()
      if (!session || session.type !== 'opencode') return
      if (session.processId !== expectedProcessId) return
      if (session.opencodeSessionId) return

      const fromOutput = this.openCodeAdapter.extractSessionIdFromOutput(this.sessionHintBuffers.get(sessionId) || '')
      const strictFallback = !this.shouldUseListDiscovery(session)
      const maxSkew = strictFallback ? 60_000 : undefined
      const discovered = fromOutput
        ? fromOutput
        : await this.openCodeAdapter.findSessionIdByProjectPath(
            projectPath,
            session.options?.cliPath,
            80,
            session.lastStartAt || session.createdAt,
            maxSkew,
            strictFallback
          )

      if (discovered) {
        session.opencodeSessionId = discovered
        session.opencodeSessionIdSource = fromOutput ? 'output' : 'list'
        this._persistFn?.()
        return
      }

      attempts += 1
      if (attempts >= OPENCODE_SESSION_DISCOVERY_MAX_ATTEMPTS) return
      this.pendingTimers.set(
        sessionId,
        setTimeout(tryHydrate, OPENCODE_SESSION_DISCOVERY_RETRY_INTERVAL_MS)
      )
    }

    this.pendingTimers.set(sessionId, setTimeout(tryHydrate, 1200))
  }

  private determineStartupStrategy(
    projectPath: string,
    options: OpenCodeSessionOptions,
    opencodeSessionId: string | null,
    opencodeSessionIdSource: OpenCodeSession['opencodeSessionIdSource'],
    isCreate: boolean
  ): string {
    if (options.attachUrl && options.serverMode === 'attach') {
      this.logStartupStrategy('attach', { url: this.openCodeAdapter.sanitizeUrlForLog(options.attachUrl) })
      return this.openCodeAdapter.attachSession(options.attachUrl, projectPath, options, opencodeSessionId ?? undefined)
    }

    if (options.sessionId) {
      this.logStartupStrategy('session', { sessionId: options.sessionId })
      return this.openCodeAdapter.resumeSession(projectPath, options, options.sessionId, options.fork)
    }

    if (options.continueLast) {
      this.logStartupStrategy('continueLast', {})
      return this.openCodeAdapter.continueLastSession(projectPath, options, options.fork)
    }

    if (opencodeSessionId && this.shouldUseStoredSessionId(options, opencodeSessionIdSource)) {
      this.logStartupStrategy('session', { sessionId: opencodeSessionId })
      return this.openCodeAdapter.resumeSession(projectPath, options, opencodeSessionId, options.fork)
    }

    this.logStartupStrategy('new', { create: isCreate })
    return this.openCodeAdapter.startSession(projectPath, options)
  }

  private warnOnConflictingResumeOptions(sessionId: string, options: OpenCodeSessionOptions): void {
    if (options.sessionId && options.continueLast) {
      this.outputManager.appendOutput(
        sessionId,
        'Warning: both sessionId and continueLast were provided; sessionId takes precedence.\n',
        'stdout'
      )
    }
  }

  private stripAnsi(input: string): string {
    return input
      .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '')
      .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u009b[0-?]*[ -/]*[@-~]/g, '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
  }

  private logStartupStrategy(strategy: string, details: Record<string, unknown>): void {
    console.log(`[OpenCode] Startup strategy: ${strategy}`, details)
  }

  private shouldUseListDiscovery(session: OpenCodeSession): boolean {
    const options = session.options || {}
    if (options.sessionId) return true
    if (options.continueLast) return true
    if (options.serverMode === 'attach' && !!options.attachUrl) return true
    return false
  }

  private shouldUseStoredSessionId(
    options: OpenCodeSessionOptions,
    source: OpenCodeSession['opencodeSessionIdSource']
  ): boolean {
    if (options.sessionId) return true
    if (source === 'user' || source === 'output') return true
    if (source === 'list') return true
    return false
  }
}
