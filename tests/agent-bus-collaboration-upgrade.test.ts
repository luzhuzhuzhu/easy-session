import { beforeEach, describe, expect, it } from 'vitest'
import { AgentBroker } from '../src/main/services/agent-bus/broker'
import type { DispatchGate } from '../src/main/services/agent-bus/dispatch-gate'
import type { AgentCollabMode, AgentIdentity, SessionBridge } from '../src/main/services/agent-bus/types'

type Note = { sid: string; text: string; coalesceKey?: string }

const TOKEN = 'tok'

function agent(
  sessionId: string,
  name: string,
  type: string,
  collabMode: AgentCollabMode
): AgentIdentity {
  return {
    sessionId,
    name,
    type,
    collabMode,
    injectable: collabMode === 'known-agent' || collabMode === 'terminal-nudge' || collabMode === 'terminal-inject'
  }
}

function makeBridge(agents: AgentIdentity[]): SessionBridge {
  const byId = new Map(agents.map((item) => [item.sessionId, item]))
  const byPid = new Map(agents.map((item) => [`pid${item.sessionId}`, item]))
  return {
    resolveCaller: (pid) => byPid.get(pid) ?? null,
    resolveByQuery: (query) => {
      const q = query.trim().toLowerCase()
      const exactId = byId.get(query)
      if (exactId) return { match: exactId, candidates: [] }
      const exact = agents.filter((item) => item.name.toLowerCase() === q)
      if (exact.length === 1) return { match: exact[0], candidates: [] }
      const prefix = agents.filter((item) => item.name.toLowerCase().startsWith(q))
      if (prefix.length === 1) return { match: prefix[0], candidates: [] }
      return { candidates: exact.length ? exact : prefix }
    },
    listAgents: () => agents,
    getName: (sid) => byId.get(sid)?.name ?? null,
    isInjectable: (sid) => byId.get(sid)?.injectable ?? false,
    isRunning: (sid) => byId.has(sid),
    readHistory: () => '',
    writeRaw: () => true
  }
}

function makeGate(notes: Note[]): DispatchGate {
  return {
    enqueue: (sid: string, text: string, coalesceKey?: string) => notes.push({ sid, text, coalesceKey }),
    clear: () => {},
    getLastOutputAt: () => 0
  } as unknown as DispatchGate
}

function makeBroker(agents: AgentIdentity[]): { broker: AgentBroker; notes: Note[] } {
  const notes: Note[] = []
  return {
    broker: new AgentBroker(makeBridge(agents), makeGate(notes), TOKEN, () => true),
    notes
  }
}

describe('Agent collaboration upgrade', () => {
  let known: AgentIdentity
  let terminalReadonly: AgentIdentity
  let terminalNudge: AgentIdentity
  let terminalInject: AgentIdentity

  beforeEach(() => {
    known = agent('B', 'builder', 'claude', 'known-agent')
    terminalReadonly = agent('T', 'gemini-shell', 'terminal', 'terminal-readonly')
    terminalNudge = agent('T', 'gemini-shell', 'terminal', 'terminal-nudge')
    terminalInject = agent('T', 'gemini-shell', 'terminal', 'terminal-inject')
  })

  it('keeps terminal-readonly tasks in mailbox without PTY injection', () => {
    const { broker, notes } = makeBroker([terminalReadonly])

    const created = broker.createTaskFromUI('T', '让 Gemini 检查登录流程')

    expect(created.ok).toBe(true)
    expect(notes).toEqual([])
    const snap = broker.snapshot()
    expect(snap.tasks[0].status).toBe('created')
    expect(snap.agents[0].unread).toBe(1)
    expect(snap.agents[0].injectable).toBe(false)
  })

  it('uses pure nudges for terminal-nudge without injecting message body', () => {
    const { broker, notes } = makeBroker([terminalNudge])

    const created = broker.createTaskFromUI('T', '让 Gemini 检查登录流程')

    expect(created.ok).toBe(true)
    expect(broker.snapshot().tasks[0].status).toBe('delivered')
    expect(notes).toHaveLength(1)
    expect(notes[0].sid).toBe('T')
    expect(notes[0].coalesceKey).toBe('nudge')
    expect(notes[0].text).toContain('运行 es recv')
    expect(notes[0].text).not.toContain('登录流程')
  })

  it('injects trusted message bodies for terminal-inject', () => {
    const { broker, notes } = makeBroker([terminalInject])

    const created = broker.createTaskFromUI('T', '让 Gemini 检查登录流程')

    expect(created.ok).toBe(true)
    expect(broker.snapshot().tasks[0].status).toBe('delivered')
    expect(notes).toHaveLength(1)
    expect(notes[0].sid).toBe('T')
    expect(notes[0].coalesceKey).toMatch(/^body:m-/)
    expect(notes[0].text).toContain('收到来自「用户」的任务事件')
    expect(notes[0].text).toContain('登录流程')
    expect(notes[0].text).toContain('es task show')
  })

  it('moves UI-created tasks to review before user confirmation', async () => {
    const { broker } = makeBroker([known])

    const created = broker.createTaskFromUI('B', '审查登录流程')
    expect(created.ok).toBe(true)
    const id = created.taskId!

    await broker.handle({ token: TOKEN, agent: 'pidB', argv: ['task', 'accept', id] })
    await broker.handle({ token: TOKEN, agent: 'pidB', argv: ['task', 'start', id] })
    const done = await broker.handle({ token: TOKEN, agent: 'pidB', argv: ['task', 'done', id, '--result', '发现 2 个问题'] })

    expect(done.ok).toBe(true)
    expect(broker.snapshot().tasks[0].status).toBe('review')
    expect(broker.snapshot().tasks[0].result).toBe('发现 2 个问题')

    const confirmed = broker.transitionTaskFromUI(id, 'confirm')

    expect(confirmed.ok).toBe(true)
    expect(broker.snapshot().tasks[0].status).toBe('done')
    expect(broker.snapshot().tasks[0].history.at(-1)?.text).toBe('确认完成')
  })

  it('lets the user cancel open UI-created tasks', () => {
    const { broker } = makeBroker([known])

    const created = broker.createTaskFromUI('B', '暂时不要做这项任务')
    const cancelled = broker.transitionTaskFromUI(created.taskId!, 'cancel', '需求变更')

    expect(cancelled.ok).toBe(true)
    const task = broker.snapshot().tasks[0]
    expect(task.status).toBe('cancelled')
    expect(task.result).toBe('需求变更')
  })

  it('lets the user manually correct a stale task status from the collaboration page', async () => {
    const { broker, notes } = makeBroker([known])

    const created = broker.createTaskFromUI('B', '实现导出功能')
    const id = created.taskId!
    await broker.handle({ token: TOKEN, agent: 'pidB', argv: ['task', 'accept', id] })
    await broker.handle({ token: TOKEN, agent: 'pidB', argv: ['task', 'start', id] })

    const updated = broker.setTaskStatusFromUI(id, 'done', '用户确认 agent 已经完成，只是忘记更新状态')

    expect(updated.ok).toBe(true)
    const task = broker.snapshot().tasks[0]
    expect(task.status).toBe('done')
    expect(task.result).toContain('忘记更新状态')
    expect(task.history.at(-1)?.by).toBe('user')
    expect(notes.some((item) => item.sid === 'B')).toBe(true)
    const inbox = await broker.handle({ token: TOKEN, agent: 'pidB', argv: ['recv'] })
    expect(inbox.stdout).toContain('done')
    expect(inbox.stdout).toContain('忘记更新状态')
  })

  it('clears stale result when the user manually reopens a task', async () => {
    const { broker } = makeBroker([known])

    const created = broker.createTaskFromUI('B', '实现导出功能')
    const id = created.taskId!
    expect(broker.setTaskStatusFromUI(id, 'done', '已经交付')).toEqual({ ok: true })
    expect(broker.snapshot().tasks[0].result).toBe('已经交付')

    const reopened = broker.setTaskStatusFromUI(id, 'in_progress', '发现还需要补充校验')

    expect(reopened.ok).toBe(true)
    const task = broker.snapshot().tasks[0]
    expect(task.status).toBe('in_progress')
    expect(task.result).toBeUndefined()
    expect(task.history.at(-1)?.text).toContain('补充校验')
  })
})
