// 任务状态机：终端 / agent 间长事务的一等公民。
// 解决「大任务派发两边都超时」——派发不阻塞，状态变化靠唤醒注入驱动对方，
// 并由守护定时器兜底三类必现失败：接单超时、任务搁浅、会话死亡。

import { randomUUID } from 'crypto'
import type { AgentTask, AgentTaskStatus, NotifyOptions, SessionBridge } from './types'

// 派发后多久仍未接单 → 重发唤醒。
const ACCEPT_TIMEOUT_MS = 3 * 60_000
// in_progress 后多久无进展且接单方空闲 → 提醒收尾。
const STALL_TIMEOUT_MS = 5 * 60_000
// 守护轮询间隔。
const GUARD_TICK_MS = 20_000
// 接单超时向派发方升级提醒达此次数后过期（避免无人接单时永久刷屏）。
const MAX_ACCEPT_ESCALATIONS = 3

interface TaskStoreDeps {
  bridge: SessionBridge
  // 通知某会话：作为系统事件进其收件箱（供 recv/recv --wait），并按需注入纯提醒。
  notify(sessionId: string, text: string, opts?: NotifyOptions): void
  // 该会话最近一次产生输出至今是否已静默（空闲）。
  isIdle(sessionId: string): boolean
  // 任务数据变化时通知（用于持久化与 UI 推送）。
  onChange(): void
}

export class TaskStore {
  private tasks = new Map<string, AgentTask>()
  private acceptReminded = new Set<string>()
  private acceptEscalations = new Map<string, number>()
  private acceptGaveUp = new Set<string>()
  private stallReminded = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private deps: TaskStoreDeps) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.guardTick(), GUARD_TICK_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  get(id: string): AgentTask | undefined {
    return this.tasks.get(id)
  }

  // 全部任务（持久化/快照用），最近的在前。
  all(): AgentTask[] {
    return Array.from(this.tasks.values()).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // 启动时从持久化恢复。
  hydrate(tasks: AgentTask[]): void {
    for (const task of tasks) {
      if (task && task.id) this.tasks.set(task.id, task)
    }
  }

  // 列出与某会话相关（派发或接单）的任务，最近的在前。
  list(sessionId: string): AgentTask[] {
    return Array.from(this.tasks.values())
      .filter((t) => t.from === sessionId || t.to === sessionId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  create(fromId: string, toId: string, title: string, opts?: { fromName?: string }): AgentTask {
    const now = Date.now()
    const fromName = opts?.fromName || this.deps.bridge.getName(fromId) || fromId
    const task: AgentTask = {
      id: `t-${shortId()}`,
      from: fromId,
      fromName,
      to: toId,
      toName: this.deps.bridge.getName(toId) || toId,
      title,
      status: 'created',
      createdAt: now,
      updatedAt: now,
      statusSince: now,
      history: [{ at: now, status: 'created', by: fromId, text: title }]
    }
    this.tasks.set(task.id, task)
    this.deps.notify(
      toId,
      `📋 新任务 ${task.id} 来自「${task.fromName}」：${truncate(title)} — 运行 es task show ${task.id} 查看，accept/reject ${task.id} 应答`,
      { from: fromId, fromName: task.fromName }
    )
    if (this.deps.bridge.isInjectable(toId)) {
      task.status = 'delivered'
      task.statusSince = now
      task.updatedAt = now
      task.history.push({ at: now, status: 'delivered', by: 'system', text: '已投递提醒' })
    }
    this.deps.onChange()
    return task
  }

  // 状态流转的统一入口；返回错误字符串或 null（成功）。
  transition(
    id: string,
    by: string,
    next: AgentTaskStatus,
    text?: string
  ): { task?: AgentTask; error?: string } {
    const task = this.tasks.get(id)
    if (!task) return { error: `任务 ${id} 不存在` }

    const allowed = this.canTransition(task, by, next)
    if (allowed) return { error: allowed }

    const actualNext = next === 'done' && task.from === 'user' ? 'review' : next
    const now = Date.now()
    task.status = actualNext
    task.statusSince = now
    task.updatedAt = now
    if (actualNext === 'done' || actualNext === 'failed' || actualNext === 'review') task.result = text
    task.history.push({ at: now, status: actualNext, by, text })
    this.clearGuards(id)

    this.wakeForTransition(task, actualNext, text)
    this.deps.onChange()
    return { task }
  }

  forceStatus(
    id: string,
    by: string,
    next: AgentTaskStatus,
    text?: string
  ): { task?: AgentTask; error?: string } {
    const task = this.tasks.get(id)
    if (!task) return { error: `任务 ${id} 不存在` }

    // 用户手动校正可在活动态/终结态之间往返（含重开已完成任务），但禁止跳到
    // 系统专属的初始态 created/delivered（由派发/投递时机管理，手动置入会破坏
    // 投递与计时不变量）；同状态空跳转也拒绝，避免无意义事件与刷新。
    if (next === 'created' || next === 'delivered') {
      return { error: `不能手动将任务置为「${next}」：该状态由系统在派发/投递时管理` }
    }
    if (task.status === next) {
      return { error: `任务已处于 ${next}` }
    }

    const now = Date.now()
    const note = (text || '').trim()
    task.status = next
    task.statusSince = now
    task.updatedAt = now
    if (['done', 'failed', 'rejected', 'cancelled', 'expired', 'review'].includes(next) && note) {
      task.result = note
    } else if (!['done', 'failed', 'rejected', 'cancelled', 'expired', 'review'].includes(next)) {
      delete task.result
    }
    task.history.push({
      at: now,
      status: next,
      by,
      text: note || `用户手动将任务状态改为 ${next}`
    })
    this.clearGuards(id)

    const targets = new Set([task.from, task.to].filter((item) => item && item !== by && item !== 'user'))
    for (const target of targets) {
      this.deps.notify(
        target,
        `🛠️ 任务 ${task.id}「${truncate(task.title)}」已由用户手动改为 ${next}${note ? `：${truncate(note)}` : ''} — es task show ${task.id}`,
        { from: by, fromName: '用户' }
      )
    }
    this.deps.onChange()
    return { task }
  }

  confirm(id: string, by: string): { task?: AgentTask; error?: string } {
    const task = this.tasks.get(id)
    if (!task) return { error: `任务 ${id} 不存在` }
    if (task.from !== by && by !== 'user') return { error: '只有派发方可以确认完成' }
    if (task.status !== 'review') return { error: `任务当前为 ${task.status}，无需确认` }
    const now = Date.now()
    task.status = 'done'
    task.statusSince = now
    task.updatedAt = now
    task.history.push({ at: now, status: 'done', by, text: '确认完成' })
    this.deps.onChange()
    return { task }
  }

  cancel(id: string, by: string, text?: string): { task?: AgentTask; error?: string } {
    const task = this.tasks.get(id)
    if (!task) return { error: `任务 ${id} 不存在` }
    if (task.from !== by && by !== 'user') return { error: '只有派发方可以取消任务' }
    if (['done', 'failed', 'rejected', 'cancelled', 'expired'].includes(task.status)) {
      return { error: `任务当前为 ${task.status}，无法取消` }
    }
    const now = Date.now()
    task.status = 'cancelled'
    task.statusSince = now
    task.updatedAt = now
    task.result = text || '派发方取消'
    task.history.push({ at: now, status: 'cancelled', by, text: task.result })
    this.clearGuards(id)
    this.deps.notify(task.to, `🛑 任务 ${task.id}「${truncate(task.title)}」已取消${text ? '：' + truncate(text) : ''}`, {
      from: task.from,
      fromName: task.fromName
    })
    this.deps.onChange()
    return { task }
  }

  // 进度汇报：只记录，不打扰派发方（兼作心跳）。
  progress(id: string, by: string, text: string): { task?: AgentTask; error?: string } {
    const task = this.tasks.get(id)
    if (!task) return { error: `任务 ${id} 不存在` }
    if (task.to !== by) return { error: '只有接单方可以汇报进度' }
    const now = Date.now()
    task.updatedAt = now
    task.history.push({ at: now, status: 'progress', by, text })
    this.stallReminded.delete(id)
    // 心跳：仅当派发方正 recv --wait 等待时投递进展，避免无人读取造成未读堆积。
    this.deps.notify(task.from, `📈 任务 ${id} 进展：${truncate(text)}`, {
      from: task.to,
      fromName: task.toName,
      onlyIfWaiting: true
    })
    this.deps.onChange()
    return { task }
  }

  // 会话退出/重启：把它名下未完成的任务标记失败并唤醒对端，避免对方永远等待。
  onSessionExit(sessionId: string): void {
    const open: AgentTaskStatus[] = ['created', 'delivered', 'accepted', 'in_progress', 'blocked', 'review']
    let changed = false
    for (const task of this.tasks.values()) {
      if (!open.includes(task.status)) continue
      this.clearGuards(task.id)
      const now = Date.now()
      if (task.to === sessionId) {
        task.status = 'failed'
        task.statusSince = now
        task.updatedAt = now
        task.result = '接单方会话已退出'
        task.history.push({ at: now, status: 'failed', by: sessionId, text: '接单方会话已退出' })
        this.deps.notify(
          task.from,
          `⚠️ 任务 ${task.id}「${truncate(task.title)}」失败：接单方「${task.toName}」会话已退出`,
          { from: task.to, fromName: task.toName }
        )
        changed = true
      } else if (task.from === sessionId) {
        // 派发方退出：标记失败但无需唤醒（无人等待）。
        task.status = 'failed'
        task.statusSince = now
        task.updatedAt = now
        task.result = '派发方会话已退出'
        task.history.push({ at: now, status: 'failed', by: sessionId, text: '派发方会话已退出' })
        changed = true
      }
    }
    if (changed) this.deps.onChange()
  }

  // 清理某任务的守护状态（离开 created/in_progress 或退出时调用，避免 Set/Map 泄漏与误触发）。
  private clearGuards(id: string): void {
    this.acceptReminded.delete(id)
    this.acceptEscalations.delete(id)
    this.acceptGaveUp.delete(id)
    this.stallReminded.delete(id)
  }

  private canTransition(task: AgentTask, by: string, next: AgentTaskStatus): string | null {
    const isTo = task.to === by
    const isFrom = task.from === by
    switch (next) {
      case 'accepted':
      case 'rejected':
        if (!isTo) return '只有接单方可以接单/拒单'
        if (task.status !== 'created' && task.status !== 'delivered') return `任务当前为 ${task.status}，无法${next === 'accepted' ? '接单' : '拒单'}`
        return null
      case 'in_progress':
        if (!isTo) return '只有接单方可以开始任务'
        if (task.status !== 'accepted' && task.status !== 'blocked') return `任务当前为 ${task.status}，无法开始`
        return null
      case 'blocked':
        if (!isTo) return '只有接单方可以阻塞任务'
        if (task.status !== 'in_progress' && task.status !== 'accepted') return `任务当前为 ${task.status}，无法阻塞`
        return null
      case 'done':
      case 'failed':
        if (!isTo) return '只有接单方可以交付/置失败'
        if (task.status !== 'accepted' && task.status !== 'in_progress' && task.status !== 'blocked' && task.status !== 'review') {
          return `任务当前为 ${task.status}，需先接单/开始才能${next === 'done' ? '交付' : '置失败'}`
        }
        return null
      default:
        if (next === 'created' || (!isTo && !isFrom)) return '非法状态流转'
        return null
    }
  }

  // unblock 由 from 触发，单独处理（带答复文本，唤醒 to）。
  unblock(id: string, by: string, text: string): { task?: AgentTask; error?: string } {
    const task = this.tasks.get(id)
    if (!task) return { error: `任务 ${id} 不存在` }
    if (task.from !== by) return { error: '只有派发方可以解除阻塞' }
    if (task.status !== 'blocked') return { error: `任务当前为 ${task.status}，未处于阻塞` }
    const now = Date.now()
    task.status = 'in_progress'
    task.statusSince = now
    task.updatedAt = now
    task.history.push({ at: now, status: 'in_progress', by, text })
    this.deps.notify(
      task.to,
      `🔓 任务 ${task.id} 已解除阻塞，派发方「${task.fromName}」答复：${truncate(text)} — es task show ${task.id}`,
      { from: task.from, fromName: task.fromName }
    )
    this.deps.onChange()
    return { task }
  }

  private wakeForTransition(task: AgentTask, next: AgentTaskStatus, text?: string): void {
    // 接单方触发的状态转移，通知派发方；归属记为接单方，便于 recv --from 过滤与 UI 展示。
    const peer: NotifyOptions = { from: task.to, fromName: task.toName }
    switch (next) {
      case 'accepted':
        this.deps.notify(task.from, `✅ 任务 ${task.id} 已被「${task.toName}」接单`, peer)
        break
      case 'rejected':
        this.deps.notify(task.from, `🚫 任务 ${task.id} 被「${task.toName}」拒单${text ? '：' + truncate(text) : ''}`, peer)
        break
      case 'blocked':
        this.deps.notify(task.from, `⛔ 任务 ${task.id} 被阻塞，「${task.toName}」需要澄清：${truncate(text || '')} — es task unblock ${task.id} "答复"`, peer)
        break
      case 'done':
        // 结果直接随事件进派发方收件箱，使 recv --wait 等结果即时拿到。
        this.deps.notify(task.from, `🎉 任务 ${task.id}「${truncate(task.title)}」已完成${task.result ? '：' + truncate(task.result) : ''} — es task show ${task.id} 查看完整结果`, peer)
        break
      case 'review':
        this.deps.notify(task.from, `🧾 任务 ${task.id}「${truncate(task.title)}」已提交待确认${task.result ? '：' + truncate(task.result) : ''}`, peer)
        break
      case 'failed':
        this.deps.notify(task.from, `❌ 任务 ${task.id}「${truncate(task.title)}」失败${text ? '：' + truncate(text) : ''}`, peer)
        break
      default:
        break
    }
  }

  private guardTick(): void {
    const now = Date.now()
    for (const task of this.tasks.values()) {
      // ① 接单超时
      if (
        (task.status === 'created' || task.status === 'delivered') &&
        !this.acceptGaveUp.has(task.id) &&
        now - task.statusSince >= ACCEPT_TIMEOUT_MS
      ) {
        if (!this.acceptReminded.has(task.id)) {
          this.acceptReminded.add(task.id)
          this.deps.notify(task.to, `⏰ 任务 ${task.id} 来自「${task.fromName}」仍未应答 — es task show ${task.id}`, {
            from: task.from,
            fromName: task.fromName
          })
        } else if (now - task.statusSince >= ACCEPT_TIMEOUT_MS * 2) {
          const escalations = (this.acceptEscalations.get(task.id) || 0) + 1
          this.acceptEscalations.set(task.id, escalations)
          const peer: NotifyOptions = { from: task.to, fromName: task.toName }
          if (escalations >= MAX_ACCEPT_ESCALATIONS) {
            // 多次无响应后过期，交由人工重派，避免永久刷屏。
            this.acceptGaveUp.add(task.id)
            task.status = 'expired'
            task.statusSince = now
            task.updatedAt = now
            task.result = '接单方长时间无响应'
            // 过期是守护行为，归属记为系统而非接单方（接单方并未操作）。
            task.history.push({ at: now, status: 'expired', by: 'system', text: task.result })
            this.deps.notify(task.from, `⏰ 任务 ${task.id} 派给「${task.toName}」长时间无响应，已过期 — 可重新派发`, peer)
            this.deps.onChange()
          } else {
            this.deps.notify(task.from, `⏰ 任务 ${task.id} 派给「${task.toName}」长时间无响应`, peer)
            // 通知后推进 statusSince 重新计时。
            task.statusSince = now
            this.acceptReminded.delete(task.id)
          }
        }
      }
      // ② 任务搁浅：进行中但久无进展且接单方已空闲（大概率干完忘了 done）
      if (task.status === 'in_progress' && now - task.updatedAt >= STALL_TIMEOUT_MS) {
        if (!this.stallReminded.has(task.id) && this.deps.isIdle(task.to)) {
          this.stallReminded.add(task.id)
          this.deps.notify(task.to, `🔔 任务 ${task.id} 仍是进行中，若已完成请 es task done ${task.id} --result "…"，否则 es task progress ${task.id} "进展"`, {
            from: task.from,
            fromName: task.fromName
          })
        }
      }
    }
  }
}

function shortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8)
}

function truncate(text: string, max = 60): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > max ? trimmed.slice(0, max - 1) + '…' : trimmed
}
