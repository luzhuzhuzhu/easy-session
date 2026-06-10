import type { TerminalAdapter } from './terminal-adapter'
import type { SessionOutputManager } from './session-output'
import type { ISessionLifecycle } from './session-lifecycle'
import type { Session, TerminalSession, CreateSessionParams } from './session-types'
import type { TerminalSessionOptions } from './types'

export class TerminalSessionLifecycle implements ISessionLifecycle {
  constructor(
    private terminalAdapter: TerminalAdapter,
    private outputManager: SessionOutputManager
  ) {}

  setPersistCallback(_fn: () => void): void {
    // 终端会话没有需要异步发现的原生会话 ID
  }

  create(id: string, name: string, params: CreateSessionParams): TerminalSession {
    const now = Date.now()
    const options = (params.options || {}) as TerminalSessionOptions

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'

    try {
      processId = this.terminalAdapter.startSession(params.projectPath, options)
    } catch (err) {
      status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      this.outputManager.appendOutput(id, `Error: ${errMsg}\n`, 'stderr')
    }

    return {
      id, name, icon: params.icon || null, type: 'terminal',
      projectPath: params.projectPath,
      status,
      createdAt: now,
      lastStartAt: now,
      totalRunMs: 0,
      lastRunMs: 0,
      lastActiveAt: now,
      processId,
      options,
      parentId: params.parentId || null
    }
  }

  startProcess(session: Session, startAt: number): void {
    if (session.type !== 'terminal') throw new Error(`TerminalSessionLifecycle 收到非 terminal 会话: ${session.type}`)

    session.processId = this.terminalAdapter.startSession(session.projectPath, session.options)
    session.status = 'running'
    session.lastStartAt = startAt
    session.lastActiveAt = startAt
  }

  handleOutput(_session: Session, _data: string): void {}

  cleanup(_session: Session): void {}

  migrateOnLoad(_session: Session): boolean {
    return false
  }

  hydrateSessionId(_session: Session): boolean {
    return false
  }
}
