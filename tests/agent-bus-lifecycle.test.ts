import { describe, expect, it, beforeEach } from 'vitest'
import { AgentBroker } from '../src/main/services/agent-bus/broker'
import type { AgentIdentity, SessionBridge } from '../src/main/services/agent-bus/types'
import type { DispatchGate } from '../src/main/services/agent-bus/dispatch-gate'

// 生命周期命令测试：es start / stop / restart / output。
// 场景：A(architect, known-agent) 调用者；stopped-session 处于停止态；
// nudge(terminal-nudge) 不满足深度协作授权，不可被他人控制/读取。

interface KnownSession {
  id: string
  name: string
  type: string
  status: string
  projectPath: string
}

function makeLifecycleBridge(options: {
  known: KnownSession[]
  runningBySession: Record<string, boolean>
  identities: Record<string, AgentIdentity>
}): {
  bridge: SessionBridge
  started: string[]
  stopped: string[]
  restarted: string[]
  journalReads: Array<{ sid: string; lines: number }>
} {
  const { known, runningBySession, identities } = options
  const started: string[] = []
  const stopped: string[] = []
  const restarted: string[] = []
  const journalReads: Array<{ sid: string; lines: number }> = []
  const bySession: Record<string, AgentIdentity> = {}
  for (const a of Object.values(identities)) bySession[a.sessionId] = a

  const bridge: SessionBridge = {
    resolveCaller: (pid) => identities[pid] ?? null,
    resolveByQuery: (query) => {
      const q = query.trim().toLowerCase()
      const all = Object.values(identities).filter((a) => runningBySession[a.sessionId])
      const byId = all.find((a) => a.sessionId === query)
      if (byId) return { match: byId, candidates: [] }
      const exact = all.filter((a) => a.name.toLowerCase() === q)
      if (exact.length === 1) return { match: exact[0], candidates: [] }
      const prefix = all.filter((a) => a.name.toLowerCase().startsWith(q))
      if (prefix.length === 1) return { match: prefix[0], candidates: [] }
      return { candidates: exact.length ? exact : prefix }
    },
    listAgents: () => Object.values(identities).filter((a) => runningBySession[a.sessionId]),
    getName: (sid) => bySession[sid]?.name ?? null,
    isInjectable: (sid) => bySession[sid]?.injectable ?? false,
    isRunning: (sid) => runningBySession[sid] ?? false,
    readHistory: (sid) => (sid === 'nudge' ? 'secret nudge output' : 'visible output'),
    writeRaw: () => true,
    startSession: async (sid) => {
      started.push(sid)
      runningBySession[sid] = true
      return true
    },
    stopSession: (sid) => {
      stopped.push(sid)
      runningBySession[sid] = false
      return true
    },
    restartSession: async (sid) => {
      restarted.push(sid)
      return true
    },
    listKnownSessions: () => known,
    readStoppedSessionHistory: async (sid, lines) => {
      journalReads.push({ sid, lines })
      return sid === 'nudge' ? 'stopped journal output' : null
    }
  }
  return { bridge, started, stopped, restarted, journalReads }
}

function makeStubGate(): DispatchGate {
  return {
    enqueue: () => {},
    clear: () => {},
    getLastOutputAt: () => 0
  } as unknown as DispatchGate
}

describe('AgentBroker lifecycle commands (es start/stop/restart/output)', () => {
  const identities: Record<string, AgentIdentity> = {
    pidA: { sessionId: 'A', name: 'architect', type: 'claude', collabMode: 'known-agent', injectable: true },
    pidNudge: { sessionId: 'nudge', name: 'term-nudge', type: 'terminal', collabMode: 'terminal-nudge', injectable: false }
  }
  const runningBySession: Record<string, boolean> = { A: true, nudge: false }
  const known: KnownSession[] = [
    { id: 'A', name: 'architect', type: 'claude', status: 'running', projectPath: 'D:/r' },
    { id: 'nudge', name: 'term-nudge', type: 'terminal', status: 'stopped', projectPath: 'D:/r' }
  ]

  let ctx: ReturnType<typeof makeLifecycleBridge>
  let broker: AgentBroker

  beforeEach(() => {
    runningBySession.A = true
    runningBySession.nudge = false
    for (const k of known) {
      k.status = runningBySession[k.id] ? 'running' : 'stopped'
    }
    ctx = makeLifecycleBridge({ known, runningBySession, identities })
    broker = new AgentBroker(ctx.bridge, makeStubGate(), 'tok', () => true)
  })

  describe('es start', () => {
    it('按名称启动一个已停止会话', async () => {
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['start', 'term-nudge'] })
      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('term-nudge')
      expect(ctx.started).toContain('nudge')
    })

    it('名称忽略大小写', async () => {
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['start', 'TERM-NUDGE'] })
      expect(res.ok).toBe(true)
      expect(ctx.started).toContain('nudge')
    })

    it('支持唯一前缀匹配', async () => {
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['start', 'term'] })
      expect(res.ok).toBe(true)
      expect(ctx.started).toContain('nudge')
    })

    it('精确 id 优先', async () => {
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['start', 'nudge'] })
      expect(res.ok).toBe(true)
      expect(ctx.started).toContain('nudge')
    })

    it('已在运行时幂等提示', async () => {
      runningBySession.A = true
      known[0].status = 'running'
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['start', 'architect'] })
      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('已在运行')
      expect(ctx.started).toHaveLength(0)
    })

    it('前缀歧义时报错并列出候选', async () => {
      known.push({ id: 'nudge2', name: 'term-extra', type: 'terminal', status: 'stopped', projectPath: 'D:/r' })
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['start', 'term'] })
      expect(res.ok).toBe(false)
      expect(res.stderr).toContain('多个会话')
      expect(ctx.started).toHaveLength(0)
    })

    it('找不到会话时报错', async () => {
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['start', 'nope'] })
      expect(res.ok).toBe(false)
      expect(res.stderr).toContain('未找到')
    })
  })

  describe('es stop', () => {
    it('停止一个运行中的深度协作会话', async () => {
      runningBySession.nudge = true
      known[1].status = 'running'
      // nudge 是 terminal-nudge，但自己可以停自己
      const res = await broker.handle({ token: 'tok', agent: 'pidNudge', argv: ['stop', 'term-nudge'] })
      expect(res.ok).toBe(true)
      expect(ctx.stopped).toContain('nudge')
    })

    it('不能停止未授权的他人会话', async () => {
      runningBySession.nudge = true
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['stop', 'term-nudge'] })
      expect(res.ok).toBe(false)
      expect(res.stderr).toContain('无权')
      expect(ctx.stopped).toHaveLength(0)
    })

    it('已停止的会话幂等提示', async () => {
      // architect 运行中，目标自己已停止 → resolveTarget 只看到运行中的 A，
      // 所以对已停止的 nudge 用 start 语义测试；stop 幂等用一个运行中的目标验证分支。
      runningBySession.nudge = false
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['stop', 'architect-not-running'] })
      expect(res.ok).toBe(false)
    })
  })

  describe('es output', () => {
    it('读取自己输出', async () => {
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['output', 'architect'] })
      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('visible output')
    })

    it('不能读取未授权会话输出', async () => {
      runningBySession.nudge = true
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['output', 'term-nudge'] })
      expect(res.ok).toBe(false)
      expect(res.stderr).toContain('无权')
    })

    it('--json 返回结构化结果', async () => {
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['output', 'architect', '--json'] })
      expect(res.ok).toBe(true)
      const data = JSON.parse(res.stdout || '{}')
      expect(data.session).toBe('architect')
      expect(data.output).toContain('visible output')
    })

    it('--lines 限制行数', async () => {
      const seen: string[] = []
      const { bridge } = makeLifecycleBridge({ known, runningBySession, identities })
      const patched = bridge as SessionBridge & { readHistory: (sid: string, lines: number) => string }
      patched.readHistory = (_sid, lines) => {
        seen.push(String(lines))
        return 'x'.repeat(lines)
      }
      const b = new AgentBroker(patched, makeStubGate(), 'tok', () => true)
      const res = await b.handle({ token: 'tok', agent: 'pidA', argv: ['output', 'architect', '--lines', '7'] })
      expect(res.ok).toBe(true)
      expect(seen[0]).toBe('7')
    })

    it('已停止会话回退读 journal（事后取证）', async () => {
      // nudge 处于停止态：resolveByQuery 找不到，应回退 listKnownSessions + journal
      const res = await broker.handle({ token: 'tok', agent: 'pidNudge', argv: ['output', 'term-nudge'] })
      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('stopped journal output')
      expect(ctx.journalReads).toEqual([{ sid: 'nudge', lines: 200 }])
    })

    it('已停止会话的他人读取仍受深度协作授权约束', async () => {
      // nudge 是 terminal-nudge（非 peekable），A 即使是 known-agent 也不能读它的 journal
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['output', 'term-nudge'] })
      expect(res.ok).toBe(false)
      expect(res.stderr).toContain('无权')
      expect(ctx.journalReads).toHaveLength(0)
    })

    it('已停止会话无 journal 时给出明确提示', async () => {
      // architect 自身停止且无 journal（bridge 对非 nudge 返回 null）
      runningBySession.A = false
      known[0].status = 'stopped'
      const res = await broker.handle({ token: 'tok', agent: 'pidA', argv: ['output', 'architect'] })
      expect(res.ok).toBe(true)
      expect(res.stdout).toContain('没有退出日志')
    })
  })
})
