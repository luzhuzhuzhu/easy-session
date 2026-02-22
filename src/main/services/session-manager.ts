import { randomUUID } from 'crypto'
import { BrowserWindow } from 'electron'
import { CliManager } from './cli-manager'
import { SessionOutputManager } from './session-output'
import { DataStore } from './data-store'
import type { ClaudeSessionLifecycle } from './claude-session-lifecycle'
import type { CodexSessionLifecycle } from './codex-session-lifecycle'
import type { ISessionLifecycle } from './session-lifecycle'
import type { CliType } from './types'
import type { Session, CodexSession, CreateSessionParams, SessionFilter } from './session-types'

export class SessionManager {
  private static readonly PERSIST_DEBOUNCE_MS = 200

  private sessions = new Map<string, Session>()
  private sessionCounter = new Map<string, number>()
  private processIndex = new Map<string, string>()
  readonly outputManager: SessionOutputManager
  private store: DataStore<Session[]> | null = null
  private persistTail: Promise<void> = Promise.resolve()
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private persistDirty = false
  private lifecycles: Record<CliType, ISessionLifecycle>

  constructor(
    private cliManager: CliManager,
    claudeLifecycle: ClaudeSessionLifecycle,
    private codexLifecycle: CodexSessionLifecycle,
    outputManager: SessionOutputManager
  ) {
    this.outputManager = outputManager
    this.lifecycles = { claude: claudeLifecycle, codex: codexLifecycle }
    claudeLifecycle.setPersistCallback(() => this.persist())
    codexLifecycle.setPersistCallback(() => this.persist())

    this.cliManager.onOutput((processId, data, stream) => {
      const sessionId = this.processIndex.get(processId)
      if (!sessionId) return
      const session = this.sessions.get(sessionId)
      if (!session || session.processId !== processId) return

      this.outputManager.appendOutput(session.id, data, stream)
      this.lifecycles[session.type].handleOutput(session, data)
    })

    this.cliManager.onExit((processId, code) => {
      // 延迟处理 exit，给 ConPTY 下可能迟到的最后一批 onData 机会先到达
      setTimeout(() => this.handleProcessExit(processId, code), 0)
    })
  }

  setStore(store: DataStore<Session[]>): void {
    this.store = store
  }

  async loadSessions(): Promise<void> {
    if (!this.store) return
    const result = await this.store.load()
    if (!result.data) {
      if (result.error === 'corrupted') {
        console.error('[SessionManager] session data is corrupted, starting from empty state')
      } else if (result.error === 'read_error') {
        console.error('[SessionManager] failed to read session data, starting from empty state')
      }
      return
    }

    let migrated = !!result.restoredFromBackup
    if (migrated) console.warn('[SessionManager] 会话数据从备份恢复')
    const now = Date.now()

    for (const session of result.data) {
      const wasRunning = session.status === 'running'
      session.processId = null
      if (wasRunning) session.status = 'stopped'

      if (!session.lastStartAt) {
        session.lastStartAt = session.createdAt
        migrated = true
      }
      if (session.icon === undefined) {
        session.icon = null
        migrated = true
      }
      if (!Number.isFinite(session.totalRunMs)) {
        session.totalRunMs = 0
        migrated = true
      }
      if (!Number.isFinite(session.lastRunMs)) {
        session.lastRunMs = 0
        migrated = true
      }

      if (wasRunning) {
        const runMs = Math.max(0, now - session.lastStartAt)
        const cappedRunMs = Math.min(runMs, 24 * 60 * 60_000)
        session.lastRunMs = cappedRunMs
        session.totalRunMs += cappedRunMs
        migrated = true
      }

      const lifecycle = this.lifecycles[session.type as CliType]
      if (!lifecycle) {
        console.warn(
          `[SessionManager] skip unknown session type: ${session.id} (type=${session.type})`
        )
        migrated = true
        continue
      }

      if (lifecycle.migrateOnLoad(session)) migrated = true
      if (lifecycle.hydrateSessionId(session)) migrated = true

      this.sessions.set(session.id, session)
    }

    for (const session of this.sessions.values()) {
      const current = this.sessionCounter.get(session.type) || 0
      const match = session.name.match(/^(?:Claude|Codex)-(\d+)$/)
      if (match) {
        const num = parseInt(match[1], 10)
        if (num > current) this.sessionCounter.set(session.type, num)
      }
    }

    if (migrated) this.persist()
  }

  getValidSessionIds(): Set<string> {
    return new Set(this.sessions.keys())
  }

  createSession(params: CreateSessionParams): Session {
    if (!params.projectPath) throw new Error('projectPath cannot be empty')

    const id = randomUUID()
    const type = params.type
    const count = (this.sessionCounter.get(type) || 0) + 1
    this.sessionCounter.set(type, count)
    const name =
      params.name || `${type === 'claude' ? 'Claude' : 'Codex'}-${String(count).padStart(3, '0')}`

    const session = this.lifecycles[type].create(id, name, params)
    this.sessions.set(id, session)
    this.indexProcess(session)

    if (session.type === 'codex' && session.processId) {
      this.codexLifecycle.ensureCodexSessionIdAsync(
        id,
        session.projectPath,
        session.createdAt,
        session.processId,
        () => this.sessions.get(id) as CodexSession | undefined
      )
    }

    this.persist()

    if (params.startPaused && session.processId) {
      const expectedProcessId = session.processId
      const pauseDelayMs = type === 'codex' ? 1200 : 500
      setTimeout(() => {
        const current = this.sessions.get(id)
        if (!current || current.status !== 'running' || current.processId !== expectedProcessId) return
        this.pauseSession(id)
      }, pauseDelayMs)
    }

    return session
  }

  startSession(id: string): Session | null {
    const session = this.sessions.get(id)
    if (!session) return null
    if (session.status === 'running' && session.processId) return session

    const startAt = Date.now()
    const oldProcessId = session.processId
    this.unindexProcess(oldProcessId)
    session.processId = null
    if (oldProcessId) this.cliManager.kill(oldProcessId)

    try {
      this.lifecycles[session.type].startProcess(session, startAt)
      this.indexProcess(session)
      this.scheduleCodexIdDiscovery(session, startAt)
    } catch (err) {
      session.processId = null
      session.status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      this.outputManager.appendOutput(id, `Error: ${errMsg}\n`, 'stderr')
    }

    this.persist()
    this.pushStatusChange(id, session.status)
    return session
  }

  pauseSession(id: string): Session | null {
    const session = this.sessions.get(id)
    if (!session) return null
    const oldProcessId = session.processId
    if (!oldProcessId || session.status !== 'running') return session

    this.closeCurrentRun(session)
    this.unindexProcess(oldProcessId)
    session.processId = null
    this.cliManager.kill(oldProcessId)
    session.status = 'stopped'
    session.lastActiveAt = Date.now()
    this.lifecycles[session.type].cleanup(session)

    this.persist()
    this.pushStatusChange(id, session.status)
    return session
  }

  restartSession(id: string): Session | null {
    const session = this.sessions.get(id)
    if (!session) return null

    const restartAt = Date.now()
    const oldProcessId = session.processId

    if (oldProcessId && session.status === 'running') {
      this.closeCurrentRun(session, restartAt)
    }

    this.unindexProcess(oldProcessId)
    session.processId = null
    if (oldProcessId) this.cliManager.kill(oldProcessId)
    this.lifecycles[session.type].cleanup(session)

    try {
      this.lifecycles[session.type].startProcess(session, restartAt)
      this.indexProcess(session)
      this.scheduleCodexIdDiscovery(session, restartAt)
    } catch (err) {
      session.processId = null
      session.status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      this.outputManager.appendOutput(id, `Error: ${errMsg}\n`, 'stderr')
    }

    this.persist()
    this.pushStatusChange(id, session.status)
    return session
  }

  destroySession(id: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false

    this.closeCurrentRun(session)
    if (session.processId) {
      this.cliManager.kill(session.processId)
      this.unindexProcess(session.processId)
    }

    session.processId = null
    session.status = 'stopped'
    this.lifecycles[session.type].cleanup(session)
    this.outputManager.removeSession(id)
    this.sessions.delete(id)
    this.persist()
    return true
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  listSessions(filter?: SessionFilter): Session[] {
    let list = Array.from(this.sessions.values())
    if (filter?.type) list = list.filter((s) => s.type === filter.type)
    if (filter?.projectPath) list = list.filter((s) => s.projectPath === filter.projectPath)
    if (filter?.status) list = list.filter((s) => s.status === filter.status)
    if (filter?.parentId) list = list.filter((s) => s.parentId === filter.parentId)
    return list
  }

  sendInput(id: string, input: string): boolean {
    const session = this.sessions.get(id)
    if (!session?.processId) return false
    session.lastActiveAt = Date.now()
    return this.cliManager.write(session.processId, `${input}\n`)
  }

  writeRaw(id: string, data: string): boolean {
    const session = this.sessions.get(id)
    if (!session?.processId) return false
    return this.cliManager.write(session.processId, data)
  }

  resizeTerminal(id: string, cols: number, rows: number): void {
    const session = this.sessions.get(id)
    if (session?.processId) this.cliManager.resize(session.processId, cols, rows)
  }

  getChildren(parentId: string): Session[] {
    return this.listSessions({ parentId })
  }

  renameSession(id: string, name: string): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.name = name
    this.persist()
    return true
  }

  updateSessionIcon(id: string, icon: string | null): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.icon = icon
    this.persist()
    return true
  }

  destroyAll(): void {
    const ids = Array.from(this.sessions.keys())
    for (const id of ids) {
      const session = this.sessions.get(id)
      if (!session) continue

      this.closeCurrentRun(session)
      if (session.processId) {
        this.cliManager.kill(session.processId)
        this.unindexProcess(session.processId)
      }
      this.lifecycles[session.type].cleanup(session)
      this.outputManager.removeSession(id)
      this.sessions.delete(id)
    }

    if (ids.length > 0) {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('sessions:cleared')
      })
      this.persist()
    }
  }

  shutdownAll(): void {
    let changed = false

    for (const session of this.sessions.values()) {
      if (session.status === 'running') {
        this.closeCurrentRun(session)
        session.status = 'stopped'
        this.pushStatusChange(session.id, session.status)
        changed = true
      }

      if (session.processId) {
        this.cliManager.kill(session.processId)
        this.unindexProcess(session.processId)
        session.processId = null
        changed = true
      }

      this.lifecycles[session.type].cleanup(session)
    }

    if (changed) {
      this.persist()
    }
  }

  private handleProcessExit(processId: string, code: number | null): void {
    const sessionId = this.processIndex.get(processId)
    if (!sessionId) return
    const session = this.sessions.get(sessionId)
    if (!session || session.processId !== processId) return

    this.closeCurrentRun(session)
    this.processIndex.delete(processId)
    session.processId = null

    this.lifecycles[session.type].cleanup(session)

    session.status = code === 0 ? 'stopped' : 'error'
    this.pushStatusChange(session.id, session.status)
    this.persist()
  }

  private indexProcess(session: Session): void {
    if (session.processId) this.processIndex.set(session.processId, session.id)
  }

  private unindexProcess(processId: string | null): void {
    if (processId) this.processIndex.delete(processId)
  }

  private scheduleCodexIdDiscovery(session: Session, startAt: number): void {
    if (session.type === 'codex' && session.processId) {
      this.codexLifecycle.ensureCodexSessionIdAsync(
        session.id,
        session.projectPath,
        startAt,
        session.processId,
        () => this.sessions.get(session.id) as CodexSession | undefined
      )
    }
  }

  private closeCurrentRun(session: Session, endedAt = Date.now()): void {
    if (session.status !== 'running') return
    if (!Number.isFinite(session.lastStartAt)) return
    const runMs = Math.max(0, endedAt - session.lastStartAt)
    session.lastRunMs = runMs
    session.totalRunMs = Math.max(0, (session.totalRunMs || 0) + runMs)
  }

  private cloneSessionValue(session: Session): Session {
    let options: Record<string, unknown>
    try {
      options =
        typeof structuredClone === 'function'
          ? structuredClone(session.options || {})
          : JSON.parse(JSON.stringify(session.options || {}))
    } catch {
      options = { ...(session.options || {}) }
    }

    return {
      ...session,
      options
    }
  }

  private createPersistSnapshot(): Session[] {
    const snapshot: Session[] = []
    for (const session of this.sessions.values()) {
      snapshot.push(this.cloneSessionValue(session))
    }
    return snapshot
  }

  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.enqueuePersist()
    }, SessionManager.PERSIST_DEBOUNCE_MS)
  }

  private enqueuePersist(): void {
    if (!this.store || !this.persistDirty) return

    this.persistDirty = false
    const snapshot = this.createPersistSnapshot()

    this.persistTail = this.persistTail
      .catch((err) => {
        if (err) console.warn('[SessionManager] previous persist chain error:', err)
      })
      .then(() => this.store?.save(snapshot))
      .catch((err) => console.error('[SessionManager] persist failed:', err))
  }

  async flush(): Promise<void> {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer)
      this.persistTimer = null
    }

    this.enqueuePersist()
    let tail = this.persistTail
    while (true) {
      await tail
      if (tail === this.persistTail) return
      tail = this.persistTail
    }
  }

  private persist(): void {
    if (!this.store) return
    this.persistDirty = true
    this.schedulePersist()
  }

  private pushStatusChange(sessionId: string, status: string): void {
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('session:status', { sessionId, status })
    })
  }
}
