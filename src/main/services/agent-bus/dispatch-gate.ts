// 注入门控：保证每个目标会话同一时刻只注入一条，且不在 agent 忙碌时打断。
// 借鉴 golutra chat_dispatch_batcher 的「单 inflight + 就绪放行」，外加输出静默判空闲。

import type { SessionBridge } from './types'
import { createLogger } from '../logger'

const log = createLogger('agent-bus')

interface PendingInject {
  text: string
  queuedAt: number
  // 合并键：入队时若队列里已有同键项，替换其文本而非追加（用于纯提醒去重，避免刷屏）。
  coalesceKey?: string
}

interface SessionGateState {
  queue: PendingInject[]
  inflight: boolean
  lastOutputAt: number
  // 主动 ack：上一次注入的时间戳，以及注入后是否已观察到 agent 产生输出（确认它消费了上一条）。
  lastInjectAt: number
  reactionSeen: boolean
  // 注入文本的待消费回显（去 ANSI/空白后）：PTY 会把注入内容 echo 回来，
  // 这部分输出不能当作 agent 的反应，否则 ack 反馈环会被自己的回显误触发。
  pendingEcho: string
}

// 去除 ANSI 转义与空白，用于判断某段输出是否为注入文本的回显。
function stripForEcho(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/[\x00-\x1f\x7f]/g, '').replace(/\s+/g, '')
}

// 连续无输出多久判定 agent 空闲（可注入）。
const SILENCE_MS = 3000
// 防抖：达到静默门槛后再等一会儿，避免把短暂停顿当空闲。
const IDLE_DEBOUNCE_MS = 800
// 强制兜底：排队过久（agent 一直刷屏）也要发，避免永远等不到静默。
const FORCE_FLUSH_MS = 30000
// 门控轮询间隔。
const TICK_MS = 500
// 注入文本与回车之间的延迟，避免 CLI 输入模式误判（照搬 golutra 结论）。
const CONFIRM_DELAY_MS = 100

export class DispatchGate {
  private states = new Map<string, SessionGateState>()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private bridge: SessionBridge) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.timer.unref?.()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  // 由 AgentBus 在收到 PTY 输出时调用，刷新空闲判定基准。
  // 传入 data 时会先扣除注入文本自身的回显，避免把回显当作 agent 的反应（误触发 ack）。
  noteOutput(sessionId: string, data?: string): void {
    const state = this.ensure(sessionId)
    const now = Date.now()
    // 注入之后首次看到「非回显」输出 = agent 已对上一条注入产生反应（主动 ack）。
    if (state.lastInjectAt > 0 && !state.reactionSeen) {
      if (this.consumeEcho(state, data)) {
        // 仍在消费注入回显，不计为反应。
        state.lastOutputAt = now
        return
      }
      if (now > state.lastInjectAt + 50) {
        state.reactionSeen = true
        state.pendingEcho = ''
      }
    }
    state.lastOutputAt = now
  }

  // 若本段输出是注入文本回显的一部分，从待消费回显中扣除并返回 true。
  // 无 data 或无待消费回显时退回时间启发式（返回 false，保持向后兼容）。
  private consumeEcho(state: SessionGateState, data?: string): boolean {
    if (!data || !state.pendingEcho) return false
    const norm = stripForEcho(data)
    if (!norm) return true // 纯控制字符/空白，视作回显噪声
    const idx = state.pendingEcho.indexOf(norm)
    if (idx === -1) return false
    state.pendingEcho = state.pendingEcho.slice(idx + norm.length)
    return true
  }

  // 最近一次输出时间戳（守护判空闲用）。无记录返回 0。
  getLastOutputAt(sessionId: string): number {
    return this.states.get(sessionId)?.lastOutputAt ?? 0
  }

  // 会话退出/暂停时清空其队列。
  clear(sessionId: string): void {
    this.states.delete(sessionId)
  }

  // 入队一条注入。terminal 类型不可注入的会话不会走到这里（broker 负责拦截）。
  // 传 coalesceKey 时，若队列中已有同键的待注入项，则替换其文本（合并）而非新增。
  enqueue(sessionId: string, text: string, coalesceKey?: string): void {
    const state = this.ensure(sessionId)
    if (coalesceKey) {
      const existing = state.queue.find((q) => q.coalesceKey === coalesceKey)
      if (existing) {
        existing.text = text
        return
      }
    }
    state.queue.push({ text, queuedAt: Date.now(), coalesceKey })
  }

  private ensure(sessionId: string): SessionGateState {
    let state = this.states.get(sessionId)
    if (!state) {
      state = { queue: [], inflight: false, lastOutputAt: 0, lastInjectAt: 0, reactionSeen: true, pendingEcho: '' }
      this.states.set(sessionId, state)
    }
    return state
  }

  private tick(): void {
    const now = Date.now()
    for (const [sessionId, state] of this.states) {
      if (state.inflight || state.queue.length === 0) continue
      if (!this.bridge.isRunning(sessionId)) {
        // 会话已不在运行，丢弃残留队列。
        state.queue = []
        continue
      }
      const head = state.queue[0]
      const silence = now - state.lastOutputAt
      const waited = now - head.queuedAt
      const idle = silence >= SILENCE_MS + IDLE_DEBOUNCE_MS
      const forced = waited >= FORCE_FLUSH_MS
      // 主动 ack 门控：上一条注入后若还没看到 agent 反应，先别发下一条（除非已强制超时），
      // 避免把多条消息糊给一个还没消费上一条的 agent。
      const ackPending = state.lastInjectAt > 0 && !state.reactionSeen
      if (forced || (idle && !ackPending)) {
        const item = state.queue.shift()
        if (item) void this.flush(sessionId, state, item.text)
      }
    }
  }

  private async flush(sessionId: string, state: SessionGateState, text: string): Promise<void> {
    state.inflight = true
    try {
      // 多行走 bracketed paste，避免被逐行当成多条消息。
      const multiline = text.includes('\n')
      const body = multiline ? `\x1b[200~${text}\x1b[201~` : text
      this.bridge.writeRaw(sessionId, body)
      await delay(CONFIRM_DELAY_MS)
      // await 期间会话可能被 clear() 删除并由新 enqueue 重建：若 state 已不是当前状态，
      // 放弃这次回车与基准刷新，避免与新注入交错、或把状态写进已废弃对象。
      if (this.states.get(sessionId) !== state) return
      this.bridge.writeRaw(sessionId, '\r')
      // 注入即视为「会话开始忙」：刷新基准，并等待 agent 反应作为下一条的放行前提。
      const now = Date.now()
      state.lastOutputAt = now
      state.lastInjectAt = now
      state.reactionSeen = false
      // 记录待消费回显：注入文本会被 PTY echo 回来，先扣除再判定真正的 agent 反应。
      state.pendingEcho = stripForEcho(text)
    } catch (err) {
      // writeRaw 抛错（会话在注入瞬间死亡等）：吞掉，避免 void flush 变成未处理 rejection。
      log.warn({ err }, '[agent-bus] 注入失败')
    } finally {
      state.inflight = false
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    t.unref?.()
  })
}
