// AgentBus：把 broker / gate / task-store / bus-server 装配起来，并桥接 SessionManager 与 CliManager。
// 对外只暴露 start / stop / sendFromUI 与给 CliManager 的环境变量 provider。

import { randomUUID } from 'crypto'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { SessionManager } from '../session-manager'
import type { CliManager } from '../cli-manager'
import { DataStore } from '../data-store'
import { createLogger } from '../logger'
import type { AgentCollabMode, AgentIdentity, AgentTask, AgentBusMessage, SessionBridge } from './types'
import { DispatchGate } from './dispatch-gate'
import { AgentBroker } from './broker'
import { AgentBusServer } from './bus-server'
import { installEsSkill, type EsSkillInstallSummary } from './skill'
import { tailVisibleLines } from './peek-clean'

const IDLE_MS = 8000
const PERSIST_DEBOUNCE_MS = 600
const PUSH_THROTTLE_MS = 250

const log = createLogger('agent-bus')

interface BusPersistShape {
  tasks: AgentTask[]
  messages: AgentBusMessage[]
  collabModes?: Record<string, AgentCollabMode>
}

export interface AgentBusEnvBundle {
  vars: Record<string, string>
  shimDir: string
}

export class AgentBus {
  private gate: DispatchGate
  private broker: AgentBroker | null = null
  private server: AgentBusServer | null = null
  private bridge: SessionBridge
  private disposers: Array<() => void> = []
  private ready = false
  private store: DataStore<BusPersistShape> | null = null
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private lastPushAt = 0
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private startError: string | null = null
  private skillInstall: EsSkillInstallSummary | null = null
  private collabModes = new Map<string, AgentCollabMode>()
  // 服务端绑定身份（P0#2）：每个 PTY 进程注入一枚不可猜测的会话凭据，
  // 服务端据此把 es 请求绑定到真实 sessionId，杜绝客户端自报 processId 冒充他人。
  // credential -> processId。凭据从不经由任何 es 命令输出泄露，仅存在于各自 PTY 的 env。
  private agentCredentials = new Map<string, string>()

  constructor(
    private sessionManager: SessionManager,
    private cliManager: CliManager
  ) {
    this.bridge = this.buildBridge()
    this.gate = new DispatchGate(this.bridge)
  }

  async start(opts: { userDataDir: string; electronPath: string }): Promise<void> {
    const token = randomUUID()
    const isIdle = (sessionId: string): boolean =>
      Date.now() - this.gate.getLastOutputAt(sessionId) > IDLE_MS

    this.broker = new AgentBroker(this.bridge, this.gate, token, isIdle, () => this.handleChange())
    this.server = new AgentBusServer(this.broker, { ...opts, token })
    try {
      await this.server.init()
    } catch (err) {
      // 监听/落盘失败：终端间通信不可用。记录原因供 UI 提示，但不抛出，避免拖垮整个 app 初始化。
      this.startError = err instanceof Error ? err.message : String(err)
      log.error({ err }, '[agent-bus] 启动失败，终端间通信本次不可用')
      return
    }

    // 持久化：启动时恢复任务与消息日志。
    this.store = new DataStore<BusPersistShape>(join(opts.userDataDir, 'agent-bus-state.json'))
    try {
      const loaded = await this.store.load()
      if (loaded.data) {
        this.hydrateCollabModes(loaded.data.collabModes)
        this.broker.hydrate(loaded.data)
      }
    } catch (err) {
      log.warn({ err }, '[agent-bus] 状态恢复失败')
    }

    this.gate.start()
    this.broker.start()

    // 订阅 PTY 输出：刷新空闲基准（门控与守护共用），并传入输出以扣除注入回显。
    const offOutput = this.cliManager.onOutput((processId, data) => {
      const sessionId = this.sessionManager.getSessionIdByProcessId(processId)
      if (sessionId) this.gate.noteOutput(sessionId, data)
    })
    this.disposers.push(offOutput)

    // 订阅退出：撤销该进程的会话凭据（防泄漏/复用）+ 任务兜底失败 + 清空门控队列。
    const offExit = this.cliManager.onExit((processId) => {
      this.revokeCredentialsFor(processId)
      const sessionId = this.sessionManager.getSessionIdByProcessId(processId)
      if (sessionId && this.broker) this.broker.handleSessionExit(sessionId)
    })
    this.disposers.push(offExit)

    this.ready = true
    void installEsSkill().then((summary) => {
      this.skillInstall = summary
      this.pushChanged()
    })
  }

  // 提供给 CliManager 注入到每个 PTY 的环境变量（含 PATH 用 shimDir）。
  // EASYSESSION_BUS_AGENT 注入的是服务端签发的「会话凭据」而非可猜测的 processId：
  // 服务端持有 credential->processId 映射，据此绑定真实身份（P0#2），客户端无法冒充他人。
  getEnvBundle(processId: string): AgentBusEnvBundle | null {
    if (!this.ready || !this.server || !this.server.isReady()) return null
    const credential = randomUUID()
    this.agentCredentials.set(credential, processId)
    return {
      vars: { ...this.server.getEnv(), EASYSESSION_BUS_AGENT: credential },
      shimDir: this.server.getShimDir()
    }
  }

  // 进程退出时撤销其会话凭据，避免内存残留与凭据复用。
  private revokeCredentialsFor(processId: string): void {
    for (const [credential, pid] of this.agentCredentials) {
      if (pid === processId) this.agentCredentials.delete(credential)
    }
  }

  // UI 直接发送给某会话。
  sendFromUI(targetId: string, text: string): { ok: boolean; error?: string } {
    if (!this.broker) return { ok: false, error: 'bus 未就绪' }
    return this.broker.sendFromUI(targetId, text)
  }

  createTaskFromUI(targetId: string, title: string): { ok: boolean; taskId?: string; error?: string } {
    if (!this.broker) return { ok: false, error: 'bus 未就绪' }
    return this.broker.createTaskFromUI(targetId, title)
  }

  transitionTaskFromUI(
    taskId: string,
    action: 'confirm' | 'cancel' | 'unblock',
    text?: string
  ): { ok: boolean; error?: string } {
    if (!this.broker) return { ok: false, error: 'bus 未就绪' }
    return this.broker.transitionTaskFromUI(taskId, action, text)
  }

  setTaskStatusFromUI(
    taskId: string,
    status: AgentTask['status'],
    text?: string
  ): { ok: boolean; error?: string } {
    if (!this.broker) return { ok: false, error: 'bus 未就绪' }
    return this.broker.setTaskStatusFromUI(taskId, status, text)
  }

  archiveTaskFromUI(taskId: string): { ok: boolean; error?: string } {
    if (!this.broker) return { ok: false, error: 'bus 未就绪' }
    return this.broker.archiveTaskFromUI(taskId)
  }

  unarchiveTaskFromUI(taskId: string): { ok: boolean; error?: string } {
    if (!this.broker) return { ok: false, error: 'bus 未就绪' }
    return this.broker.unarchiveTaskFromUI(taskId)
  }

  setSessionCollabMode(sessionId: string, mode: AgentCollabMode): { ok: boolean; error?: string } {
    const session = this.sessionManager.getSession(sessionId)
    if (!session) return { ok: false, error: '会话不存在' }
    if (!isCollabMode(mode)) return { ok: false, error: '协作模式无效' }
    const normalized = session.type === 'terminal' ? mode : 'known-agent'
    this.collabModes.set(sessionId, normalized)
    this.handleChange()
    return { ok: true }
  }

  isReady(): boolean {
    return this.ready
  }

  getStartError(): string | null {
    return this.startError
  }

  // 供 IPC 拉取的快照（附带就绪状态，便于 UI 在 bus 未启动时给出可见提示）。
  snapshot(): {
    agents: AgentIdentity[]
    tasks: AgentTask[]
    messages: AgentBusMessage[]
    ready: boolean
    error: string | null
    skillInstall: EsSkillInstallSummary | null
  } {
    if (!this.broker || !this.ready) {
      return {
        agents: [],
        tasks: [],
        messages: [],
        ready: this.ready,
        error: this.startError,
        skillInstall: this.skillInstall
      }
    }
    return { ...this.broker.snapshot(), ready: true, error: null, skillInstall: this.skillInstall }
  }

  // 数据变化：去抖持久化 + 节流推送给渲染层。
  private handleChange(): void {
    if (this.persistTimer) clearTimeout(this.persistTimer)
    this.persistTimer = setTimeout(() => void this.persist(), PERSIST_DEBOUNCE_MS)
    this.persistTimer.unref?.()

    const now = Date.now()
    if (now - this.lastPushAt >= PUSH_THROTTLE_MS) {
      this.lastPushAt = now
      this.pushChanged()
    } else if (!this.pushTimer) {
      const wait = PUSH_THROTTLE_MS - (now - this.lastPushAt)
      this.pushTimer = setTimeout(() => {
        this.pushTimer = null
        this.lastPushAt = Date.now()
        this.pushChanged()
      }, wait)
      this.pushTimer.unref?.()
    }
  }

  private pushChanged(): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('bus:changed')
    }
  }

  private async persist(): Promise<void> {
    if (!this.store || !this.broker) return
    // 销毁的会话不再保留协作模式，防止 collabModes 随会话增删无限累积并被持久化。
    this.pruneCollabModes()
    try {
      await this.store.save({
        ...this.broker.persistState(),
        collabModes: Object.fromEntries(this.collabModes)
      })
    } catch (err) {
      log.warn({ err }, '[agent-bus] 持久化失败')
    }
  }

  // 丢弃已不存在会话的协作模式条目（会话销毁后兜底清理）。
  private pruneCollabModes(): void {
    const valid = this.sessionManager.getValidSessionIds()
    for (const sessionId of this.collabModes.keys()) {
      if (!valid.has(sessionId)) this.collabModes.delete(sessionId)
    }
  }

  async stop(): Promise<void> {
    this.ready = false
    for (const dispose of this.disposers) dispose()
    this.disposers = []
    if (this.persistTimer) clearTimeout(this.persistTimer)
    if (this.pushTimer) clearTimeout(this.pushTimer)
    this.gate.stop()
    this.broker?.stop()
    await this.persist()
    await this.store?.flush().catch(() => undefined)
    await this.server?.stop()
  }

  private buildBridge(): SessionBridge {
    const sm = this.sessionManager
    const toIdentity = (sessionId: string): AgentIdentity | null => {
      const session = sm.getSession(sessionId)
      if (!session) return null
      const collabMode = this.getCollabMode(session.id, session.type)
      return {
        sessionId: session.id,
        name: session.name,
        type: session.type,
        collabMode,
        injectable: this.isModeInjectable(collabMode)
      }
    }
    return {
      // 服务端绑定身份：入参是注入到 PTY 的会话凭据，经服务端持有的
      // credential->processId 映射解析出真实进程，再定位会话（P0#2）。
      resolveCaller: (credential) => {
        const processId = this.agentCredentials.get(credential)
        if (!processId) return null
        const sessionId = sm.getSessionIdByProcessId(processId)
        return sessionId ? toIdentity(sessionId) : null
      },
      resolveByQuery: (query) => {
        const running = sm.listSessions().filter((s) => s.status === 'running' && s.processId)
        const q = query.trim().toLowerCase()
        // 1) 精确 sessionId
        const byId = running.find((s) => s.id === query)
        if (byId) return { match: toIdentity(byId.id)!, candidates: [] }
        // 2) 精确会话名（忽略大小写）
        const exact = running.filter((s) => s.name.toLowerCase() === q)
        if (exact.length === 1) return { match: toIdentity(exact[0].id)!, candidates: [] }
        // 3) 名称唯一前缀
        const prefix = running.filter((s) => s.name.toLowerCase().startsWith(q))
        if (prefix.length === 1) return { match: toIdentity(prefix[0].id)!, candidates: [] }
        const candidates = (exact.length ? exact : prefix)
          .map((s) => toIdentity(s.id))
          .filter((x): x is AgentIdentity => !!x)
        return { candidates }
      },
      listAgents: () =>
        sm
          .listSessions()
          .filter((s) => s.status === 'running' && s.processId)
          .map((s) => toIdentity(s.id))
          .filter((x): x is AgentIdentity => !!x),
      getName: (sessionId) => sm.getSession(sessionId)?.name ?? null,
      isInjectable: (sessionId) => {
        const session = sm.getSession(sessionId)
        return session ? this.isModeInjectable(this.getCollabMode(session.id, session.type)) : false
      },
      isRunning: (sessionId) => {
        const s = sm.getSession(sessionId)
        return !!s && s.status === 'running' && !!s.processId
      },
      readHistory: (sessionId, lines) =>
        tailVisibleLines(
          sm.outputManager
            .getHistory(sessionId)
            .map((line) => line.text)
            .join(''),
          lines
        ),
      writeRaw: (sessionId, data) => sm.writeRaw(sessionId, data)
    }
  }

  private hydrateCollabModes(raw: Record<string, AgentCollabMode> | undefined): void {
    if (!raw || typeof raw !== 'object') return
    for (const [sessionId, mode] of Object.entries(raw)) {
      if (isCollabMode(mode)) this.collabModes.set(sessionId, mode)
    }
  }

  private getCollabMode(sessionId: string, type: string): AgentCollabMode {
    if (type !== 'terminal') return 'known-agent'
    const configured = this.collabModes.get(sessionId)
    return configured && configured.startsWith('terminal-') ? configured : 'terminal-readonly'
  }

  private isModeInjectable(mode: AgentCollabMode): boolean {
    return mode === 'known-agent' || mode === 'terminal-nudge' || mode === 'terminal-inject'
  }
}

function isCollabMode(value: unknown): value is AgentCollabMode {
  return (
    value === 'known-agent' ||
    value === 'terminal-readonly' ||
    value === 'terminal-nudge' ||
    value === 'terminal-inject'
  )
}
