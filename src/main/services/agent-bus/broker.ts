// AgentBroker：终端 / agent 间通信的中枢。
// 职责：校验 token、解析调用方身份、分发 es 命令、维护 mailbox 与阻塞等待、
// 通过 DispatchGate 唤醒目标会话、把任务语义委托给 TaskStore。

import { randomUUID, timingSafeEqual } from 'crypto'
import type {
  AgentCollabMode,
  AgentBusMessage,
  AgentBusMessageKind,
  AgentBusRequest,
  AgentBusResponse,
  AgentIdentity,
  AgentTask,
  NotifyOptions,
  SessionBridge
} from './types'
import { DispatchGate } from './dispatch-gate'
import { TaskStore } from './task-store'
import { ES_HELP_TEXT } from './help-text'

// recv --wait 默认超时：略小于 agent Bash 工具的常见超时（~120s），超时让 agent 自行重试。
const DEFAULT_WAIT_TIMEOUT_MS = 100_000
const MAX_WAIT_TIMEOUT_MS = 600_000

interface Waiter {
  sessionId: string
  from?: string
  kind?: AgentBusMessageKind
  resolve(res: AgentBusResponse): void
  timer: ReturnType<typeof setTimeout>
}

// 由 bus server 提供：客户端连接中止时通知 broker 取消挂起等待。
export interface AbortToken {
  aborted: boolean
  onAbort(cb: () => void): void
}

const MESSAGE_LOG_CAP = 500
// 单会话收件箱未读上限：防止从不 es recv 的会话未读无限堆积。
const MAILBOX_CAP = 200

export class AgentBroker {
  private mailboxes = new Map<string, AgentBusMessage[]>()
  private messageLog: AgentBusMessage[] = []
  private waiters = new Set<Waiter>()
  private bodyInjectedIds = new Set<string>()
  readonly taskStore: TaskStore

  constructor(
    private bridge: SessionBridge,
    private gate: DispatchGate,
    private token: string,
    isIdle: (sessionId: string) => boolean,
    private onChange: () => void = () => {}
  ) {
    this.taskStore = new TaskStore({
      bridge,
      // 任务事件统一走收件箱：进 mailbox（供 recv/recv --wait），并按需注入纯提醒。
      notify: (sessionId, text, opts) => this.notify(sessionId, text, opts),
      isIdle,
      onChange: () => this.onChange()
    })
  }

  // 供 UI 拉取的全量快照：在线会话、任务板、最近消息。
  snapshot(): {
    agents: AgentIdentity[]
    tasks: ReturnType<TaskStore['all']>
    messages: AgentBusMessage[]
  } {
    return {
      agents: this.bridge.listAgents().map((agent) => ({
        ...agent,
        unread: (this.mailboxes.get(agent.sessionId) || []).filter((m) => !m.readAt).length,
        activeTaskCount: this.taskStore
          .list(agent.sessionId)
          .filter((t) => ['created', 'delivered', 'accepted', 'in_progress', 'blocked', 'review'].includes(t.status))
          .length
      })),
      tasks: this.taskStore.all(),
      messages: this.messageLog.slice(-200)
    }
  }

  // 启动时从持久化恢复任务与消息。
  hydrate(data: { tasks?: AgentTask[]; messages?: AgentBusMessage[] }): void {
    if (Array.isArray(data.tasks)) this.taskStore.hydrate(data.tasks)
    if (Array.isArray(data.messages)) {
      this.messageLog = data.messages.slice(-MESSAGE_LOG_CAP)
      for (const msg of this.messageLog) {
        if (msg.readAt) continue // 已读消息只进日志，不回灌 mailbox（保持 mailbox 仅含未读）
        // 仅回灌仍存在的会话的未读；旧/已删会话（重启后已不在 sessions 中）不恢复收件箱，
        // 否则这些未读永远无人取走，成为内存残留。messageLog 仍全量保留供 UI/历史。
        if (!this.bridge.getName(msg.to)) continue
        const box = this.mailboxes.get(msg.to) || []
        box.push(msg)
        this.mailboxes.set(msg.to, box)
      }
    }
  }

  // 持久化快照（仅任务与消息日志）。
  persistState(): { tasks: AgentTask[]; messages: AgentBusMessage[] } {
    return { tasks: this.taskStore.all(), messages: this.messageLog.slice(-MESSAGE_LOG_CAP) }
  }

  start(): void {
    this.taskStore.start()
  }

  stop(): void {
    this.taskStore.stop()
    for (const waiter of this.waiters) clearTimeout(waiter.timer)
    this.waiters.clear()
  }

  // 会话退出：任务兜底 + 清空门控队列 + 解除其挂起等待 + 清理收件箱（避免死会话残留泄漏）。
  handleSessionExit(sessionId: string): void {
    this.taskStore.onSessionExit(sessionId)
    this.gate.clear(sessionId)
    this.dropWaiters(sessionId)
    this.mailboxes.delete(sessionId)
  }

  // 解除并结束某会话所有挂起的 recv --wait（会话已不存在，无人接收）。
  private dropWaiters(sessionId: string): void {
    for (const waiter of Array.from(this.waiters)) {
      if (waiter.sessionId !== sessionId) continue
      this.waiters.delete(waiter)
      clearTimeout(waiter.timer)
      waiter.resolve({ ok: false, stdout: '', exitCode: 1 })
    }
  }

  // UI 直接发送（人触发），from 记为 user。
  sendFromUI(targetId: string, text: string): { ok: boolean; error?: string } {
    if (!this.bridge.isRunning(targetId)) return { ok: false, error: '目标会话未运行' }
    const msg = this.deliver({
      from: 'user',
      fromName: '用户',
      to: targetId,
      kind: 'message',
      body: text
    })
    this.nudgeAfterDeliver(targetId, msg)
    return { ok: true }
  }

  createTaskFromUI(targetId: string, title: string): { ok: boolean; taskId?: string; error?: string } {
    const body = title.trim()
    if (!body) return { ok: false, error: '任务描述不能为空' }
    if (!this.bridge.isRunning(targetId)) return { ok: false, error: '目标会话未运行' }
    const task = this.taskStore.create('user', targetId, body, { fromName: '用户' })
    return { ok: true, taskId: task.id }
  }

  transitionTaskFromUI(
    taskId: string,
    action: 'confirm' | 'cancel' | 'unblock',
    text?: string
  ): { ok: boolean; error?: string } {
    let result: { error?: string }
    if (action === 'confirm') {
      result = this.taskStore.confirm(taskId, 'user')
    } else if (action === 'cancel') {
      result = this.taskStore.cancel(taskId, 'user', text)
    } else {
      const body = (text || '').trim()
      if (!body) return { ok: false, error: '答复内容不能为空' }
      result = this.taskStore.unblock(taskId, 'user', body)
    }
    return result.error ? { ok: false, error: result.error } : { ok: true }
  }

  setTaskStatusFromUI(
    taskId: string,
    status: AgentTask['status'],
    text?: string
  ): { ok: boolean; error?: string } {
    if (!isTaskStatus(status)) return { ok: false, error: '任务状态无效' }
    const result = this.taskStore.forceStatus(taskId, 'user', status, text)
    return result.error ? { ok: false, error: result.error } : { ok: true }
  }

  archiveTaskFromUI(taskId: string): { ok: boolean; error?: string } {
    const result = this.taskStore.archive(taskId, 'user')
    return result.error ? { ok: false, error: result.error } : { ok: true }
  }

  unarchiveTaskFromUI(taskId: string): { ok: boolean; error?: string } {
    const result = this.taskStore.unarchive(taskId, 'user')
    return result.error ? { ok: false, error: result.error } : { ok: true }
  }

  // bus server 入口：处理一条 es 请求。
  async handle(req: AgentBusRequest, abort?: AbortToken): Promise<AgentBusResponse> {
    if (!req || typeof req.token !== 'string' || !safeEqual(req.token, this.token)) {
      return fail('鉴权失败（token 不匹配）', 1)
    }
    const argv = Array.isArray(req.argv) ? req.argv : []
    const cmd = (argv[0] || '').toLowerCase()
    const rest = argv.slice(1)

    if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
      return ok(ES_HELP_TEXT)
    }

    const me = this.bridge.resolveCaller(req.agent)
    if (!me) {
      return fail('无法识别当前会话（bus 身份缺失，可能会话尚未就绪）', 1)
    }

    try {
      switch (cmd) {
        case 'whoami':
          return this.cmdWhoami(me, rest)
        case 'sessions':
        case 'ls':
          return this.cmdSessions(me, rest)
        case 'send':
          return this.cmdSend(me, rest)
        case 'recv':
          return await this.cmdRecv(me, rest, abort)
        case 'peek':
          return this.cmdPeek(me, rest)
        case 'task':
          return this.cmdTask(me, rest)
        case 'mode':
          return this.cmdMode(me)
        default:
          return fail(`未知命令：${cmd}\n运行 es help 查看用法`, 1)
      }
    } catch (err) {
      return fail(`命令执行出错：${err instanceof Error ? err.message : String(err)}`, 1)
    }
  }

  // ---- 唤醒与投递 ----

  // 统一通知入口（任务事件等）：作为一条系统消息进对端收件箱，使 recv/recv --wait 可统一接收；
  // 再按需注入「纯提醒」（不含正文，避免与 recv 内容重复）。
  private notify(to: string, body: string, opts: NotifyOptions = {}): void {
    // 死/暂停会话不投递事件，避免孤儿未读堆积（会话恢复后是新 id）。
    if (!this.bridge.isRunning(to)) return
    // 心跳类（如进度）：仅当存在「会取走该事件」的等待者时才投递，避免未读堆积。
    if (opts.onlyIfWaiting && !this.hasMatchingWaiter(to, opts.from, 'event')) return
    const msg = this.deliver({
      from: opts.from ?? 'system',
      fromName: opts.fromName ?? 'easysession',
      to,
      kind: 'event',
      body
    })
    if (opts.nudge === false) return
    this.nudgeAfterDeliver(to, msg)
  }

  // 投递后决定是否注入提醒：
  // ① 被活跃 recv --wait 即时取走（readAt 已置）→ 不注入（消除双发）。
  // ② 对端正有活跃 waiter（前台 es 占用 tty）→ 不注入，待 waiter 清空时由 removeWaiter 补发。
  private nudgeAfterDeliver(to: string, msg: AgentBusMessage): void {
    if (msg.readAt) return
    if (this.hasWaiter(to)) return
    if (this.shouldInjectBody(to)) {
      this.injectMessageBody(to, msg)
      return
    }
    this.nudge(to)
  }

  // 纯提醒：只告知有未读，不带正文（正文只走 recv，杜绝重复）。
  private nudge(sessionId: string): void {
    if (!this.bridge.isInjectable(sessionId)) return
    if (!this.bridge.isRunning(sessionId)) return
    const unread = (this.mailboxes.get(sessionId) || []).filter((m) => !m.readAt).length
    if (unread === 0) return
    // coalesceKey 'nudge'：多条提醒在门控队列里合并成一条，避免刷屏。
    this.gate.enqueue(sessionId, `[easysession] 📬 你有 ${unread} 条新消息/事件 — 运行 es recv 查看`, 'nudge')
  }

  private injectUnread(sessionId: string): void {
    if (this.shouldInjectBody(sessionId)) {
      const box = this.mailboxes.get(sessionId) || []
      for (const msg of box) {
        if (!msg.readAt) this.injectMessageBody(sessionId, msg)
      }
      return
    }
    this.nudge(sessionId)
  }

  // terminal-inject 是用户显式信任后的兼容模式：把正文作为一条 agent prompt 注入。
  // 不标记 readAt，保证对方仍可通过 es recv 获取权威收件箱内容；用 bodyInjectedIds 避免同进程重复注入。
  private injectMessageBody(sessionId: string, msg: AgentBusMessage): void {
    if (!this.bridge.isInjectable(sessionId)) return
    if (!this.bridge.isRunning(sessionId)) return
    if (this.bodyInjectedIds.has(msg.id)) return
    this.bodyInjectedIds.add(msg.id)
    if (this.bodyInjectedIds.size > MESSAGE_LOG_CAP * 2) {
      const oldest = this.bodyInjectedIds.values().next().value
      if (oldest) this.bodyInjectedIds.delete(oldest)
    }
    this.gate.enqueue(sessionId, formatInjectedPrompt(msg), `body:${msg.id}`)
  }

  private shouldInjectBody(sessionId: string): boolean {
    const agent = this.bridge.listAgents().find((item) => item.sessionId === sessionId)
    return agent?.collabMode === 'terminal-inject'
  }

  private hasWaiter(sessionId: string): boolean {
    for (const w of this.waiters) if (w.sessionId === sessionId) return true
    return false
  }

  // 是否存在「会取走指定 from/kind 事件」的等待者（无过滤或过滤命中才算）。
  private hasMatchingWaiter(sessionId: string, from?: string, kind?: AgentBusMessageKind): boolean {
    for (const w of this.waiters) {
      if (w.sessionId !== sessionId) continue
      if (w.from && w.from !== from) continue
      if (w.kind && w.kind !== kind) continue
      return true
    }
    return false
  }

  private deliver(input: Omit<AgentBusMessage, 'id' | 'createdAt'>): AgentBusMessage {
    const message: AgentBusMessage = {
      ...input,
      id: `m-${randomUUID().replace(/-/g, '').slice(0, 8)}`,
      createdAt: Date.now()
    }
    const box = this.mailboxes.get(input.to) || []
    box.push(message)
    let dropped: AgentBusMessage[] = []
    if (box.length > MAILBOX_CAP) dropped = box.splice(0, box.length - MAILBOX_CAP) // 软上限：丢最旧未读
    this.mailboxes.set(input.to, box)
    if (dropped.length) this.notifyDroppedSenders(input.to, dropped)
    this.messageLog.push(message)
    if (this.messageLog.length > MESSAGE_LOG_CAP) {
      this.messageLog.splice(0, this.messageLog.length - MESSAGE_LOG_CAP)
    }
    this.flushWaiters(input.to)
    this.onChange()
    return message
  }

  // 收件箱溢出丢弃最旧未读时，回告各原始发送方其投递已被丢弃，避免任务事件静默丢失。
  // 仅回告真实会话发送方（system/user 略过）；丢弃通知本身 from=system，不会递归放大。
  private notifyDroppedSenders(recipient: string, dropped: AgentBusMessage[]): void {
    const recipientName = this.bridge.getName(recipient) || recipient
    const senders = new Set<string>()
    for (const msg of dropped) {
      if (!msg.from || msg.from === 'system' || msg.from === 'user' || msg.from === recipient) continue
      senders.add(msg.from)
    }
    for (const sender of senders) {
      this.notify(
        sender,
        `⚠️ 你发往「${recipientName}」的部分消息因其收件箱已满（未读超过 ${MAILBOX_CAP} 条）被丢弃，请确认对方是否在处理。`
      )
    }
  }

  // 移除一个 waiter；若该会话再无 waiter（前台 es 已退出）且仍有未读，补一个纯提醒。
  private removeWaiter(waiter: Waiter): void {
    this.waiters.delete(waiter)
    clearTimeout(waiter.timer)
    if (!this.hasWaiter(waiter.sessionId)) this.injectUnread(waiter.sessionId)
  }

  private flushWaiters(sessionId: string): void {
    for (const waiter of Array.from(this.waiters)) {
      if (waiter.sessionId !== sessionId) continue
      const msgs = this.takeUnread(sessionId, waiter.from, waiter.kind)
      if (msgs.length === 0) continue
      this.removeWaiter(waiter)
      waiter.resolve(ok(formatMessages(msgs)))
    }
  }

  private takeUnread(
    sessionId: string,
    fromFilter?: string,
    kindFilter?: AgentBusMessageKind
  ): AgentBusMessage[] {
    const box = this.mailboxes.get(sessionId)
    if (!box || box.length === 0) return []
    const now = Date.now()
    const taken: AgentBusMessage[] = []
    const remaining: AgentBusMessage[] = []
    for (const msg of box) {
      // 已读消息从 mailbox 移除（仅 messageLog 留存供 UI/持久化），避免 mailbox 无上限增长。
      if (msg.readAt) continue
      if (fromFilter && msg.from !== fromFilter) {
        remaining.push(msg)
        continue
      }
      if (kindFilter && msg.kind !== kindFilter) {
        remaining.push(msg)
        continue
      }
      msg.readAt = now
      taken.push(msg)
    }
    if (remaining.length) this.mailboxes.set(sessionId, remaining)
    else this.mailboxes.delete(sessionId)
    return taken
  }

  // ---- 命令实现 ----

  private cmdWhoami(me: AgentIdentity, rest: string[]): AgentBusResponse {
    const unread = (this.mailboxes.get(me.sessionId) || []).filter((m) => !m.readAt).length
    if (hasFlag(rest, '--json')) {
      return ok(JSON.stringify({ ...me, unread }))
    }
    return ok(`会话名：${me.name}\n类型：${me.type}\nsessionId：${me.sessionId}\n未读消息：${unread}`)
  }

  private cmdSessions(me: AgentIdentity, rest: string[]): AgentBusResponse {
    const agents = this.bridge.listAgents()
    if (hasFlag(rest, '--json')) {
      const data = agents.map((a) => ({
        ...a,
        self: a.sessionId === me.sessionId,
        unread: (this.mailboxes.get(a.sessionId) || []).filter((m) => !m.readAt).length
      }))
      return ok(JSON.stringify(data))
    }
    if (agents.length === 0) return ok('（当前没有运行中的会话）')
    const lines = agents.map((a) => {
      const self = a.sessionId === me.sessionId ? ' (我)' : ''
      const unread = (this.mailboxes.get(a.sessionId) || []).filter((m) => !m.readAt).length
      const badge = unread > 0 ? ` [未读${unread}]` : ''
      return `· ${a.name}（${a.type}）${self}${badge}`
    })
    return ok(lines.join('\n'))
  }

  private cmdSend(me: AgentIdentity, rest: string[]): AgentBusResponse {
    const { value: textFlag, rest: r1 } = takeFlagValue(rest, '--text')
    const positional = r1.filter((t) => !t.startsWith('--'))
    const target = positional[0]
    if (!target) return fail('用法：es send <会话名|id> "<消息>"', 1)
    const body = (textFlag ?? positional.slice(1).join(' ')).trim()
    if (!body) return fail('消息内容不能为空', 1)

    const resolved = this.resolveTarget(target, me)
    if (resolved.error) return fail(resolved.error, 1)
    const to = resolved.match!

    const msg = this.deliver({ from: me.sessionId, fromName: me.name, to: to.sessionId, kind: 'message', body })
    this.nudgeAfterDeliver(to.sessionId, msg)
    const live = msg.readAt ? '（对方正在等待，已即时送达）' : ''
    return ok(`已发送给「${to.name}」${live}`)
  }

  private async cmdRecv(me: AgentIdentity, rest: string[], abort?: AbortToken): Promise<AgentBusResponse> {
    const wait = hasFlag(rest, '--wait')
    const json = hasFlag(rest, '--json')
    const { value: fromRaw } = takeFlagValue(rest, '--from')
    const { value: timeoutRaw } = takeFlagValue(rest, '--timeout')
    const { value: kindRaw } = takeFlagValue(rest, '--kind')

    if (hasFlag(rest, '--from') && !fromRaw) {
      return fail('用法：es recv --from <会话名|id>（--from 缺少来源会话）', 1)
    }
    let kindFilter: AgentBusMessageKind | undefined
    if (kindRaw) {
      if (kindRaw !== 'message' && kindRaw !== 'event') {
        return fail('--kind 仅支持 message 或 event', 1)
      }
      kindFilter = kindRaw
    }

    let fromFilter: string | undefined
    if (fromRaw) {
      const resolved = this.resolveTarget(fromRaw, me)
      if (resolved.error) return fail(resolved.error, 1)
      fromFilter = resolved.match!.sessionId
    }

    const immediate = this.takeUnread(me.sessionId, fromFilter, kindFilter)
    if (immediate.length > 0) {
      return ok(json ? JSON.stringify(immediate) : formatMessages(immediate))
    }
    if (!wait) {
      return ok(json ? '[]' : '（无新消息）')
    }

    if (abort?.aborted) {
      return { ok: true, stdout: '', exitCode: 1 }
    }
    const timeoutMs = clampTimeout(timeoutRaw)
    return await new Promise<AgentBusResponse>((resolve) => {
      const waiter: Waiter = {
        sessionId: me.sessionId,
        from: fromFilter,
        kind: kindFilter,
        resolve,
        timer: setTimeout(() => {
          this.removeWaiter(waiter)
          resolve({
            ok: true,
            stdout: json ? '[]' : '（无新消息，等待超时；可重新运行 es recv --wait 继续等待）',
            exitCode: 2
          })
        }, timeoutMs)
      }
      waiter.timer.unref?.()
      this.waiters.add(waiter)
      // 客户端断开（进程被杀）时取消等待，避免 waiter 泄漏与消息被投进死连接而丢失。
      abort?.onAbort(() => {
        if (!this.waiters.has(waiter)) return
        this.removeWaiter(waiter)
        resolve({ ok: false, stdout: '', exitCode: 1 })
      })
    })
  }

  private cmdPeek(me: AgentIdentity, rest: string[]): AgentBusResponse {
    const { value: linesRaw } = takeFlagValue(rest, '--lines')
    const positional = rest.filter((t) => !t.startsWith('--'))
    const target = positional[0]
    if (!target) return fail('用法：es peek <会话名|id> [--lines N]', 1)
    const resolved = this.resolveTarget(target, me, { allowSelf: true })
    if (resolved.error) return fail(resolved.error, 1)
    const to = resolved.match!
    // 授权：peek 会读到对端最近的终端输出（可能含密钥/路径/源码）。
    // 「可被读屏」不等于「可被注入提醒」——仅允许查看自己，或深度协作的会话：
    // known-agent（真 agent）与 terminal-inject（用户已开启双向注入）。
    // terminal-nudge 只是单向接收提醒，用户并不期望自己终端被任意会话读屏，故不可被 peek；
    // 默认 terminal-readonly 同样不可被 peek。
    if (to.sessionId !== me.sessionId && !isPeekable(to.collabMode)) {
      return fail(`无权查看「${to.name}」的输出：该会话未开启深度协作（known-agent 或 terminal-inject 才可被 peek）`, 1)
    }
    const parsedLines = parseInt(linesRaw ?? '', 10)
    const lines = Number.isFinite(parsedLines) ? Math.min(Math.max(parsedLines, 1), 400) : 40
    const history = this.bridge.readHistory(to.sessionId, lines)
    if (!history.trim()) return ok(`（「${to.name}」暂无可见输出）`)
    return ok(`—— 「${to.name}」最近 ${lines} 行 ——\n${history}`)
  }

  private cmdTask(me: AgentIdentity, rest: string[]): AgentBusResponse {
    const sub = (rest[0] || '').toLowerCase()
    const args = rest.slice(1)
    switch (sub) {
      case 'create': {
        const positional = args.filter((t) => !t.startsWith('--'))
        const { value: titleFlag } = takeFlagValue(args, '--title')
        const target = positional[0]
        if (!target) return fail('用法：es task create <会话名|id> "<任务描述>"', 1)
        const title = (titleFlag ?? positional.slice(1).join(' ')).trim()
        if (!title) return fail('任务描述不能为空', 1)
        const resolved = this.resolveTarget(target, me)
        if (resolved.error) return fail(resolved.error, 1)
        const task = this.taskStore.create(me.sessionId, resolved.match!.sessionId, title)
        return ok(`已派发任务 ${task.id} 给「${task.toName}」`)
      }
      case 'accept':
        return this.taskTransition(me, args, 'accepted')
      case 'reject':
        return this.taskTransition(me, args, 'rejected')
      case 'start':
        return this.taskTransition(me, args, 'in_progress')
      case 'block':
        return this.taskTransition(me, args, 'blocked')
      case 'done':
        return this.taskDone(me, args)
      case 'fail':
        return this.taskTransition(me, args, 'failed')
      case 'progress': {
        const id = args.find((t) => !t.startsWith('--'))
        if (!id) return fail('用法：es task progress <id> "<进展>"', 1)
        const text = textExcludingId(args, id)
        if (!text) return fail('进展内容不能为空', 1)
        const r = this.taskStore.progress(id, me.sessionId, text)
        return r.error ? fail(r.error, 1) : ok(`已记录进展（${id}）`)
      }
      case 'unblock': {
        const id = args.find((t) => !t.startsWith('--'))
        if (!id) return fail('用法：es task unblock <id> "<答复>"', 1)
        const text = textExcludingId(args, id)
        if (!text) return fail('答复内容不能为空', 1)
        const r = this.taskStore.unblock(id, me.sessionId, text)
        return r.error ? fail(r.error, 1) : ok(`已解除阻塞（${id}）`)
      }
      case 'confirm': {
        const id = args.find((t) => !t.startsWith('--'))
        if (!id) return fail('用法：es task confirm <id>', 1)
        const r = this.taskStore.confirm(id, me.sessionId)
        return r.error ? fail(r.error, 1) : ok(`任务 ${id} 已确认完成`)
      }
      case 'cancel': {
        const id = args.find((t) => !t.startsWith('--'))
        if (!id) return fail('用法：es task cancel <id> [原因]', 1)
        const r = this.taskStore.cancel(id, me.sessionId, textExcludingId(args, id) || undefined)
        return r.error ? fail(r.error, 1) : ok(`任务 ${id} 已取消`)
      }
      case 'list':
      case 'ls':
        return this.taskList(me, args)
      case 'show':
        return this.taskShow(me, args)
      default:
        return fail('用法：es task <create|accept|reject|start|progress|block|unblock|done|fail|list|show> …', 1)
    }
  }

  private taskTransition(me: AgentIdentity, args: string[], next: AgentTask['status']): AgentBusResponse {
    const id = args.find((t) => !t.startsWith('--'))
    if (!id) return fail(`用法：es task ${next === 'in_progress' ? 'start' : next} <id> [文本]`, 1)
    const text = textExcludingId(args, id) || undefined
    const r = this.taskStore.transition(id, me.sessionId, next, text)
    return r.error ? fail(r.error, 1) : ok(`任务 ${id} → ${next}`)
  }

  private taskDone(me: AgentIdentity, args: string[]): AgentBusResponse {
    const id = args.find((t) => !t.startsWith('--'))
    if (!id) return fail('用法：es task done <id> --result "<结果>"', 1)
    const { value: resultFlag } = takeFlagValue(args, '--result')
    const result = (resultFlag ?? textExcludingId(args, id)).trim()
    const r = this.taskStore.transition(id, me.sessionId, 'done', result || '（无结果说明）')
    return r.error ? fail(r.error, 1) : ok(`任务 ${id} 已交付`)
  }

  private taskList(me: AgentIdentity, args: string[]): AgentBusResponse {
    const tasks = this.taskStore.list(me.sessionId)
    if (hasFlag(args, '--json')) return ok(JSON.stringify(tasks))
    if (tasks.length === 0) return ok('（没有与你相关的任务）')
    const lines = tasks.map((t) => {
      const dir = t.from === me.sessionId ? `→ ${t.toName}` : `← ${t.fromName}`
      return `${t.id}  [${t.status}]  ${dir}  ${truncate(t.title, 40)}`
    })
    return ok(lines.join('\n'))
  }

  private taskShow(me: AgentIdentity, args: string[]): AgentBusResponse {
    const id = args.find((t) => !t.startsWith('--'))
    if (!id) return fail('用法：es task show <id>', 1)
    const task = this.taskStore.get(id)
    if (!task) return fail(`任务 ${id} 不存在`, 1)
    if (task.from !== me.sessionId && task.to !== me.sessionId) {
      return fail('无权查看该任务', 1)
    }
    if (hasFlag(args, '--json')) return ok(JSON.stringify(task))
    const head = [
      `任务 ${task.id}  [${task.status}]`,
      `派发方：${task.fromName}    接单方：${task.toName}`,
      `标题：${task.title}`,
      task.result ? `结果：${task.result}` : ''
    ].filter(Boolean)
    const history = task.history.map((h) => {
      const time = new Date(h.at).toLocaleTimeString()
      const byName = this.bridge.getName(h.by) || h.by
      return `  ${time}  ${h.status}  ${byName}${h.text ? '  ' + truncate(h.text, 50) : ''}`
    })
    return ok([...head, '历史：', ...history].join('\n'))
  }

  private cmdMode(me: AgentIdentity): AgentBusResponse {
    const lines = [
      `协作模式：${collabModeLabel(me.collabMode)}`,
      `可注入提醒：${me.injectable ? '是' : '否'}`,
      me.type === 'terminal'
        ? 'terminal 默认只读；如其中运行 Gemini/Qwen/未知 agent，可在 EasySession 协作面板中开启提醒或完整注入。'
        : '已知 agent 会自动获得 es 命令与协作提示。'
    ]
    return ok(lines.join('\n'))
  }

  // ---- 目标解析 ----

  private resolveTarget(
    query: string,
    me: AgentIdentity,
    opts?: { allowSelf?: boolean }
  ): { match?: AgentIdentity; error?: string } {
    const { match, candidates } = this.bridge.resolveByQuery(query)
    if (!match) {
      if (candidates.length > 1) {
        return { error: `「${query}」匹配到多个会话：${candidates.map((c) => c.name).join('、')}，请用更精确的名字或 id` }
      }
      return { error: `找不到会话「${query}」` }
    }
    if (!opts?.allowSelf && match.sessionId === me.sessionId) {
      return { error: '不能对自己执行该操作' }
    }
    return { match }
  }
}

// ---- 工具函数 ----

function ok(stdout: string): AgentBusResponse {
  return { ok: true, stdout, exitCode: 0 }
}

function fail(stderr: string, exitCode: number): AgentBusResponse {
  return { ok: false, stderr, exitCode }
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

function takeFlagValue(args: string[], flag: string): { value?: string; rest: string[] } {
  const index = args.indexOf(flag)
  if (index === -1 || index + 1 >= args.length) return { rest: args }
  const value = args[index + 1]
  const rest = args.slice(0, index).concat(args.slice(index + 2))
  return { value, rest }
}

function clampTimeout(raw?: string): number {
  if (!raw) return DEFAULT_WAIT_TIMEOUT_MS
  const seconds = parseInt(raw, 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_WAIT_TIMEOUT_MS
  return Math.min(seconds * 1000, MAX_WAIT_TIMEOUT_MS)
}

function truncate(text: string, max = 60): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? trimmed.slice(0, max - 1) + '…' : trimmed
}

// 常量时间 token 比较，避免按字符短路泄漏时序。
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

// 提取任务文本：仅移除首个 id token（避免文本里再次出现 id 被一并滤掉）与所有 --flag。
function textExcludingId(tokens: string[], id: string): string {
  let removedId = false
  const out: string[] = []
  for (const t of tokens) {
    if (!removedId && t === id) {
      removedId = true
      continue
    }
    if (t.startsWith('--')) continue
    out.push(t)
  }
  return out.join(' ').trim()
}

function formatMessages(msgs: AgentBusMessage[]): string {
  return msgs
    .map((m) => {
      const time = new Date(m.createdAt).toLocaleTimeString()
      return `[${time}] 来自「${m.fromName}」(${m.id})：\n${m.body}`
    })
    .join('\n\n')
}

function formatInjectedPrompt(msg: AgentBusMessage): string {
  const kind = msg.kind === 'event' ? '任务事件' : '消息'
  return [
    `[easysession] 收到来自「${msg.fromName}」的${kind}（${msg.id}）：`,
    msg.body,
    '',
    '请直接处理；如需查看收件箱原文或更新任务状态，可运行 es recv / es task show。'
  ].join('\n')
}

function collabModeLabel(mode: AgentCollabMode): string {
  switch (mode) {
    case 'known-agent':
      return '已知 agent'
    case 'terminal-readonly':
      return 'Terminal 只读'
    case 'terminal-nudge':
      return 'Terminal 仅提醒'
    case 'terminal-inject':
      return 'Terminal 完整注入'
    default:
      return mode
  }
}

// peek 授权集合：只有深度协作的会话可被他人读屏。
// known-agent = 真 agent；terminal-inject = 用户已开启双向注入。
// terminal-nudge（仅单向收提醒）与 terminal-readonly（默认）一律不可被 peek。
function isPeekable(mode: AgentCollabMode): boolean {
  return mode === 'known-agent' || mode === 'terminal-inject'
}

function isTaskStatus(value: unknown): value is AgentTask['status'] {
  return (
    value === 'created' ||
    value === 'delivered' ||
    value === 'accepted' ||
    value === 'in_progress' ||
    value === 'blocked' ||
    value === 'review' ||
    value === 'done' ||
    value === 'failed' ||
    value === 'rejected' ||
    value === 'cancelled' ||
    value === 'expired'
  )
}
