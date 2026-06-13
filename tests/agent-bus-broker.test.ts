import { describe, expect, it, beforeEach } from 'vitest'
import { AgentBroker } from '../src/main/services/agent-bus/broker'
import type { AgentIdentity, SessionBridge } from '../src/main/services/agent-bus/types'
import type { DispatchGate } from '../src/main/services/agent-bus/dispatch-gate'

// 两个虚拟会话：architect(pidA) 与 builder(pidB)，都可注入、都在运行。
const AGENTS: Record<string, AgentIdentity> = {
  pidA: { sessionId: 'A', name: 'architect', type: 'claude' },
  pidB: { sessionId: 'B', name: 'builder', type: 'claude' }
}
const BY_SESSION: Record<string, AgentIdentity> = { A: AGENTS.pidA, B: AGENTS.pidB }

function makeBridge(): SessionBridge {
  const all = Object.values(BY_SESSION)
  return {
    resolveByProcessId: (pid) => AGENTS[pid] ?? null,
    resolveByQuery: (query) => {
      const q = query.trim().toLowerCase()
      const byId = BY_SESSION[query]
      if (byId) return { match: byId, candidates: [] }
      const exact = all.filter((a) => a.name.toLowerCase() === q)
      if (exact.length === 1) return { match: exact[0], candidates: [] }
      const prefix = all.filter((a) => a.name.toLowerCase().startsWith(q))
      if (prefix.length === 1) return { match: prefix[0], candidates: [] }
      return { candidates: exact.length ? exact : prefix }
    },
    listAgents: () => all,
    getName: (sid) => BY_SESSION[sid]?.name ?? null,
    isInjectable: () => true,
    isRunning: () => true,
    readHistory: () => 'last output line',
    writeRaw: () => true
  }
}

// 捕获唤醒注入，避免依赖真实计时器。
function makeStubGate(sink: Array<{ sid: string; text: string }>): DispatchGate {
  return {
    enqueue: (sid: string, text: string) => sink.push({ sid, text }),
    clear: () => {},
    getLastOutputAt: () => 0
  } as unknown as DispatchGate
}

describe('AgentBroker', () => {
  let broker: AgentBroker
  let notes: Array<{ sid: string; text: string }>

  beforeEach(() => {
    notes = []
    broker = new AgentBroker(makeBridge(), makeStubGate(notes), 'tok', () => true)
  })

  it('拒绝错误 token', async () => {
    const res = await broker.handle({ token: 'bad', agent: 'pidA', argv: ['sessions'] })
    expect(res.ok).toBe(false)
    expect(res.exitCode).toBe(1)
  })

  it('sessions 列出所有会话', async () => {
    const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['sessions'] })
    expect(res.ok).toBe(true)
    expect(res.stdout).toContain('architect')
    expect(res.stdout).toContain('builder')
  })

  it('whoami 返回自身身份', async () => {
    const res = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['whoami', '--json'] })
    const data = JSON.parse(res.stdout || '{}')
    expect(data.name).toBe('builder')
    expect(data.sessionId).toBe('B')
  })

  it('send 投递并唤醒目标，recv 取回', async () => {
    const sent = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'builder', 'hello', 'there'] })
    expect(sent.ok).toBe(true)
    expect(sent.stdout).toContain('builder')
    // 目标 B 被唤醒一次
    expect(notes.some((n) => n.sid === 'B')).toBe(true)

    const recv = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv'] })
    expect(recv.stdout).toContain('hello there')
    expect(recv.stdout).toContain('architect')

    // 再次 recv 应为空（已读）
    const again = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv'] })
    expect(again.stdout).toContain('无新消息')
  })

  it('不能给自己发消息', async () => {
    const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'architect', 'hi'] })
    expect(res.ok).toBe(false)
    expect(res.stderr).toContain('自己')
  })

  it('peek 读取目标输出历史', async () => {
    const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['peek', 'builder', '--lines', '10'] })
    expect(res.ok).toBe(true)
    expect(res.stdout).toContain('last output line')
  })

  it('任务全流程：create → accept → start → done，并唤醒对端', async () => {
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', '重构 auth 模块'] })
    expect(created.ok).toBe(true)
    const idMatch = created.stdout?.match(/t-[a-z0-9]+/)
    expect(idMatch).toBeTruthy()
    const id = idMatch![0]
    // B 收到提醒；任务详情进入 B 的收件箱（recv 可取）
    expect(notes.some((n) => n.sid === 'B')).toBe(true)
    const inboxB = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv'] })
    expect(inboxB.stdout).toContain(id)

    // 仅接单方可接单
    const wrongAccept = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'accept', id] })
    expect(wrongAccept.ok).toBe(false)

    const accept = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'accept', id] })
    expect(accept.ok).toBe(true)
    // A 收到接单通知（进收件箱）
    const inboxA1 = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv'] })
    expect(inboxA1.stdout).toContain('接单')

    const start = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'start', id] })
    expect(start.ok).toBe(true)

    const done = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'done', id, '--result', '已完成，见 src/auth'] })
    expect(done.ok).toBe(true)
    // A 收到完成通知，结果随事件进收件箱
    const inboxA2 = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv'] })
    expect(inboxA2.stdout).toContain('完成')
    expect(inboxA2.stdout).toContain('src/auth')

    const show = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'show', id, '--json'] })
    const task = JSON.parse(show.stdout || '{}')
    expect(task.status).toBe('done')
    expect(task.result).toContain('src/auth')
  })

  it('snapshot 返回在线会话/任务/消息', async () => {
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'builder', 'hi'] })
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', 'do x'] })
    const snap = broker.snapshot()
    expect(snap.agents.map((a) => a.name).sort()).toEqual(['architect', 'builder'])
    expect(snap.tasks.length).toBe(1)
    // 消息流含一条 send 与一条任务事件
    expect(snap.messages.length).toBe(2)
    expect(snap.messages[0].body).toBe('hi')
    expect(snap.messages[1].kind).toBe('event')
  })

  it('persistState → hydrate 跨实例恢复任务与消息', async () => {
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'builder', '持久化测试'] })
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', '恢复我'] })
    const id = created.stdout!.match(/t-[a-z0-9]+/)![0]
    const dumped = broker.persistState()

    // 新实例从持久化恢复
    const fresh = new AgentBroker(makeBridge(), makeStubGate([]), 'tok', () => true)
    fresh.hydrate(dumped)
    const show = await fresh.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'show', id, '--json'] })
    expect(JSON.parse(show.stdout || '{}').title).toBe('恢复我')
    // 恢复的消息仍可被 B 取回
    const recv = await fresh.handle({ token: 'tok', agent: 'pidB', argv: ['recv'] })
    expect(recv.stdout).toContain('持久化测试')
  })

  it('onChange 在发送与任务变更时触发', async () => {
    let changes = 0
    const b = new AgentBroker(makeBridge(), makeStubGate([]), 'tok', () => true, () => { changes++ })
    await b.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'builder', 'x'] })
    await b.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', 'y'] })
    expect(changes).toBeGreaterThanOrEqual(2)
  })

  it('任务搁浅守护不在终结态触发；会话退出使未完成任务失败', async () => {
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', 'x'] })
    const id = created.stdout!.match(/t-[a-z0-9]+/)![0]
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'accept', id] })
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'start', id] })

    broker.handleSessionExit('B')

    const show = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'show', id, '--json'] })
    const task = JSON.parse(show.stdout || '{}')
    expect(task.status).toBe('failed')
    // A 被通知接单方退出（进收件箱）
    expect(notes.some((n) => n.sid === 'A')).toBe(true)
    const inboxA = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv'] })
    expect(inboxA.stdout).toContain('退出')
  })

  it('未接单时不能直接交付/置失败（状态机前置态）', async () => {
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', 'x'] })
    const id = created.stdout!.match(/t-[a-z0-9]+/)![0]
    const done = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'done', id, '--result', 'r'] })
    expect(done.ok).toBe(false)
    expect(done.stderr).toContain('先接单')
    // 正常路径：accept → start → done 仍可用
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'accept', id] })
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'start', id] })
    const ok2 = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'done', id, '--result', 'r'] })
    expect(ok2.ok).toBe(true)
  })

  it('进展文本中再次出现任务 id 不被整体滤掉（只删首个）', async () => {
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', 'x'] })
    const id = created.stdout!.match(/t-[a-z0-9]+/)![0]
    const prog = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'progress', id, '重试', id, '完成'] })
    expect(prog.ok).toBe(true)
    const show = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'show', id, '--json'] })
    const task = JSON.parse(show.stdout || '{}')
    const last = task.history[task.history.length - 1]
    expect(last.text).toContain('重试')
    expect(last.text).toContain('完成')
    expect(last.text).toContain(id) // 文本里再次出现的 id 被保留
  })

  it('已读消息从 mailbox 移除：未读计数归零', async () => {
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'builder', 'm1'] })
    const before = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['whoami', '--json'] })
    expect(JSON.parse(before.stdout || '{}').unread).toBe(1)
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv'] })
    const after = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['whoami', '--json'] })
    expect(JSON.parse(after.stdout || '{}').unread).toBe(0)
  })

  it('recv --wait 命中后不再注入重复提醒（消除双发）', async () => {
    const waitP = broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv', '--wait'] })
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'builder', 'ping'] })
    const res = await waitP
    expect(res.stdout).toContain('ping')
    // 关键：消息已被 recv --wait 取走，不应再向 B 注入任何提醒
    expect(notes.some((n) => n.sid === 'B')).toBe(false)
  })

  it('recv --wait 可等到任务完成事件（消息/任务通道统一）', async () => {
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', 'x'] })
    const id = created.stdout!.match(/t-[a-z0-9]+/)![0]
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'accept', id] })
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv'] }) // 清掉 A 的接单通知
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'start', id] })
    const waitP = broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv', '--wait'] })
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'done', id, '--result', 'DONE-42'] })
    const res = await waitP
    expect(res.stdout).toContain('完成')
    expect(res.stdout).toContain('DONE-42')
  })

  it('recv --kind 只取指定类型（消息/事件可分别接收）', async () => {
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['send', 'builder', '聊天内容'] })
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', '任务事件'] })
    const id = created.stdout!.match(/t-[a-z0-9]+/)![0]
    // 只取事件
    const ev = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv', '--kind', 'event'] })
    expect(ev.stdout).toContain(id)
    expect(ev.stdout).not.toContain('聊天内容')
    // 剩下的消息仍可取
    const msg = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv', '--kind', 'message'] })
    expect(msg.stdout).toContain('聊天内容')
    // 非法 kind 报错
    const bad = await broker.handle({ token: 'tok', agent: 'pidB', argv: ['recv', '--kind', 'xxx'] })
    expect(bad.ok).toBe(false)
  })

  it('进度仅在派发方等待时投递（onlyIfWaiting 精确匹配）', async () => {
    const created = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['task', 'create', 'builder', 'x'] })
    const id = created.stdout!.match(/t-[a-z0-9]+/)![0]
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'accept', id] })
    await broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv'] }) // 清掉接单通知
    // A 未等待时的进度不进收件箱
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'progress', id, '做了一半'] })
    const idle = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv'] })
    expect(idle.stdout).not.toContain('做了一半')
    // A 正等待时的进度即时送达
    const waitP = broker.handle({ token: 'tok', agent: 'pidA', argv: ['recv', '--wait'] })
    await broker.handle({ token: 'tok', agent: 'pidB', argv: ['task', 'progress', id, '快好了'] })
    const res = await waitP
    expect(res.stdout).toContain('快好了')
  })
})
