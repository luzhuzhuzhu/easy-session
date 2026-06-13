// AgentBus：把 broker / gate / task-store / bus-server 装配起来，并桥接 SessionManager 与 CliManager。
// 对外只暴露 start / stop / sendFromUI 与给 CliManager 的环境变量 provider。

import { randomUUID } from 'crypto'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import type { SessionManager } from '../session-manager'
import type { CliManager } from '../cli-manager'
import { DataStore } from '../data-store'
import type { AgentIdentity, AgentTask, AgentBusMessage, SessionBridge } from './types'
import { DispatchGate } from './dispatch-gate'
import { AgentBroker } from './broker'
import { AgentBusServer } from './bus-server'
import { installEsSkill } from './skill'

const IDLE_MS = 8000
const PERSIST_DEBOUNCE_MS = 600
const PUSH_THROTTLE_MS = 250

interface BusPersistShape {
  tasks: AgentTask[]
  messages: AgentBusMessage[]
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
      console.error('[agent-bus] 启动失败，终端间通信本次不可用:', err)
      return
    }

    // 持久化：启动时恢复任务与消息日志。
    this.store = new DataStore<BusPersistShape>(join(opts.userDataDir, 'agent-bus-state.json'))
    try {
      const loaded = await this.store.load()
      if (loaded.data) this.broker.hydrate(loaded.data)
    } catch (err) {
      console.warn('[agent-bus] 状态恢复失败:', err)
    }

    this.gate.start()
    this.broker.start()

    // 订阅 PTY 输出：刷新空闲基准（门控与守护共用）。
    const offOutput = this.cliManager.onOutput((processId) => {
      const sessionId = this.sessionManager.getSessionIdByProcessId(processId)
      if (sessionId) this.gate.noteOutput(sessionId)
    })
    this.disposers.push(offOutput)

    // 订阅退出：任务兜底失败 + 清空门控队列。
    const offExit = this.cliManager.onExit((processId) => {
      const sessionId = this.sessionManager.getSessionIdByProcessId(processId)
      if (sessionId && this.broker) this.broker.handleSessionExit(sessionId)
    })
    this.disposers.push(offExit)

    this.ready = true
    void installEsSkill()
  }

  // 提供给 CliManager 注入到每个 PTY 的环境变量（含 PATH 用 shimDir）。
  getEnvBundle(processId: string): AgentBusEnvBundle | null {
    if (!this.ready || !this.server || !this.server.isReady()) return null
    return {
      vars: { ...this.server.getEnv(), EASYSESSION_BUS_AGENT: processId },
      shimDir: this.server.getShimDir()
    }
  }

  // UI 直接发送给某会话。
  sendFromUI(targetId: string, text: string): { ok: boolean; error?: string } {
    if (!this.broker) return { ok: false, error: 'bus 未就绪' }
    return this.broker.sendFromUI(targetId, text)
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
  } {
    if (!this.broker || !this.ready) {
      return { agents: [], tasks: [], messages: [], ready: this.ready, error: this.startError }
    }
    return { ...this.broker.snapshot(), ready: true, error: null }
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
    try {
      await this.store.save(this.broker.persistState())
    } catch (err) {
      console.warn('[agent-bus] 持久化失败:', err)
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
      return { sessionId: session.id, name: session.name, type: session.type }
    }
    return {
      resolveByProcessId: (processId) => {
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
          .map((s) => ({ sessionId: s.id, name: s.name, type: s.type })),
      getName: (sessionId) => sm.getSession(sessionId)?.name ?? null,
      isInjectable: (sessionId) => sm.getSession(sessionId)?.type !== 'terminal',
      isRunning: (sessionId) => {
        const s = sm.getSession(sessionId)
        return !!s && s.status === 'running' && !!s.processId
      },
      readHistory: (sessionId, lines) =>
        sm.outputManager
          .getHistory(sessionId, lines)
          .map((line) => line.text)
          .join('\n'),
      writeRaw: (sessionId, data) => sm.writeRaw(sessionId, data)
    }
  }
}
