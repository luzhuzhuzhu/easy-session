import type { SessionOutputManager } from './session-output'
import type { ISessionLifecycle } from './session-lifecycle'
import type { Session, CreateSessionParams } from './session-types'
import type { PiSessionOptions, GrokSessionOptions, HermesSessionOptions } from './types'

// 通用「ID 型」CLI 生命周期（pi / omp / grok / hermes 共用）：
// 行为对齐 GeminiSessionLifecycle——
// - 启动时把绑定的原生会话 ID 交给 adapter（--session/--resume/--resume latest）；
// - 输出扫描「session not found」类错误 → 标记 invalidSessionId（一次性守卫），
//   进程退出后由 shouldAutoRestartAfterExit 清 ID 自动重启一次，防循环；
// - ID 由各 CLI 的退出横幅/会话列表人工绑定（见 session:setNativeId IPC）。
export type IdSessionOptions = PiSessionOptions | GrokSessionOptions | HermesSessionOptions

interface IdSessionMeta {
  idField: 'piSessionId' | 'ompSessionId' | 'grokSessionId' | 'hermesSessionId'
}

const META: Record<string, IdSessionMeta> = {
  pi: { idField: 'piSessionId' },
  omp: { idField: 'ompSessionId' },
  grok: { idField: 'grokSessionId' },
  hermes: { idField: 'hermesSessionId' }
}

// 各 CLI resume 失效时输出中的典型报错（宽松匹配，命中即清 ID 降级新会话）
const INVALID_SESSION_PATTERN =
  /(session not found|no session found|conversation not found|could not find session|failed to resume|unable to resume|invalid session|cannot resume|no conversation found|not a valid session)/i

export class GenericIdSessionLifecycle implements ISessionLifecycle {
  constructor(
    private adapter: { startSession(projectPath: string, options?: unknown, resumeId?: string): string },
    private outputManager: SessionOutputManager,
    private cliType: 'pi' | 'omp' | 'grok' | 'hermes',
    private idPrefix: string
  ) {}

  setPersistCallback(_fn: () => void): void {
    // 与 Gemini 相同：暂不需要输出阶段持久化，保留注入口以兼容调用方。
  }

  create(id: string, name: string, params: CreateSessionParams): Session {
    const options = (params.options || {}) as IdSessionOptions
    const now = Date.now()

    let processId: string | null = null
    let status: 'running' | 'error' = 'running'
    try {
      processId = this.adapter.startSession(params.projectPath, options)
    } catch (err) {
      status = 'error'
      const errMsg = err instanceof Error ? err.message : String(err)
      const hint = errMsg.includes('ENOENT') ? ` (CLI not found: ${this.idPrefix})` : ''
      this.outputManager.appendOutput(id, `Error: ${errMsg}${hint}\n`, 'stderr')
    }

    return {
      id,
      name,
      icon: params.icon || null,
      type: this.cliType,
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
      [META[this.cliType].idField]: null
    } as unknown as Session
  }

  startProcess(session: Session, startAt: number): void {
    if (session.type !== this.cliType) {
      throw new Error(`${this.cliType} lifecycle received non-${this.cliType} session: ${session.type}`)
    }
    const s = session as unknown as { options: IdSessionOptions; [key: string]: unknown }
    const resumeId = (s[META[this.cliType].idField] as string | null) ?? undefined
    s.processId = this.adapter.startSession(s.projectPath as string, s.options, resumeId)
    s.status = 'running'
    session.lastStartAt = startAt
    session.lastActiveAt = startAt
  }

  handleOutput(session: Session, data: string): void {
    if (session.type !== this.cliType) return
    const s = session as unknown as { id: string; [key: string]: unknown } & Session
    const currentId = s[META[this.cliType].idField]
    if (currentId && INVALID_SESSION_PATTERN.test(data) && !s.invalidSessionId) {
      s.invalidSessionId = true
      this.outputManager.appendOutput(
        s.id,
        `Warning: ${this.idPrefix} reported the stored session was not found. A new session will start after this process exits.\n`,
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

  // 对齐 Claude/Gemini：invalidSessionId 本身就是一次性守卫——只有本运行周期
  // 检测到失效才重启；重启前清掉死 ID，让 startProcess 走全新会话。
  shouldAutoRestartAfterExit(session: Session, exitCode: number | null): boolean {
    if (session.type !== this.cliType) return false
    if (exitCode === 0) return false
    const s = session as unknown as { invalidSessionId?: boolean; [key: string]: unknown }
    if (!s.invalidSessionId) return false
    s[META[this.cliType].idField] = null
    s.invalidSessionId = false
    return true
  }
}
