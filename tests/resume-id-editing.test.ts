import { describe, expect, it, vi } from 'vitest'

// session:setNativeId / session:nativeIdCandidates——resume ID 自定义绑定与候选发现。

import { SessionManager } from '../src/main/services/session-manager'
import { GeminiAdapter } from '../src/main/services/gemini-adapter'
import { GeminiSessionLifecycle } from '../src/main/services/gemini-session-lifecycle'
import { OpenCodeAdapter } from '../src/main/services/opencode-adapter'
import { exec } from 'child_process'
import type { Session } from '../src/main/services/session-types'

vi.mock('child_process', () => ({ exec: vi.fn() }))

function makeManagerWithGemini(): SessionManager {
  const outputManager = {
    appendOutput: vi.fn(),
    getHistory: vi.fn(() => [])
  } as never
  const broadcaster = { broadcast: vi.fn() }
  const manager = new SessionManager(
    { spawn: vi.fn(() => 'p1'), onOutput: vi.fn(), onExit: vi.fn(), write: vi.fn(() => true) } as never,
    { setPersistCallback: vi.fn() } as never,
    { setPersistCallback: vi.fn() } as never,
    outputManager,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    broadcaster as never
  )
  const geminiLifecycle = new GeminiSessionLifecycle(
    new GeminiAdapter({ spawn: vi.fn(() => 'p1') } as never),
    manager.outputManager
  )
  ;(manager as unknown as { lifecycles: Record<string, unknown> }).lifecycles.gemini = geminiLifecycle
  return manager
}

describe('setNativeSessionId (session-manager)', () => {
  it('sets, replaces and clears native resume id', () => {
    const manager = makeManagerWithGemini()
    const session = manager.createSession({ type: 'gemini', projectPath: '/tmp/x' }) as Session & {
      geminiSessionId: string | null
    }
    expect(session.geminiSessionId).toBeNull()

    const updated = manager.setNativeSessionId(session.id, 'gemini', '  my-resume-id  ') as typeof session
    expect(updated?.geminiSessionId).toBe('my-resume-id')

    // 换绑
    const replaced = manager.setNativeSessionId(session.id, 'gemini', 'other-id') as typeof session
    expect(replaced?.geminiSessionId).toBe('other-id')

    // 清空解绑
    const cleared = manager.setNativeSessionId(session.id, 'gemini', '') as typeof session
    expect(cleared?.geminiSessionId).toBeNull()

    // 类型不匹配/未知会话拒绝
    expect(manager.setNativeSessionId(session.id, 'claude', 'x')).toBeNull()
    expect(manager.setNativeSessionId('nope', 'gemini', 'x')).toBeNull()
  })

  it('clears invalid-session guard so restart can proceed', () => {
    const manager = makeManagerWithGemini()
    const session = manager.createSession({ type: 'gemini', projectPath: '/tmp/x' }) as Session & {
      geminiSessionId: string | null
      invalidSessionId?: boolean
    }
    session.geminiSessionId = 'dead-id'
    session.invalidSessionId = true

    manager.setNativeSessionId(session.id, 'gemini', 'fresh-id')
    // 守卫被删除（重新绑定即新的用户意图，一次性守卫复位）
    expect((session as { invalidSessionId?: boolean }).invalidSessionId).toBeUndefined()
    expect(session.geminiSessionId).toBe('fresh-id')
  })
})

describe('collectSessionCandidatesByPath (opencode-adapter)', () => {
  it('returns deduped candidates with titles for the matching path', async () => {
    const childExec = vi.mocked(exec)
    childExec.mockImplementation(
      ((_cmd: string, _opts: unknown, cb: (err: null, stdout: string) => void) =>
        cb(
          null,
          JSON.stringify([
            { id: 'ses_aaa', title: 'Fix bug', updated: 200, created: 100, directory: 'D:\\proj' },
            { id: 'ses_aaa', title: 'Fix bug', updated: 200, directory: 'D:\\proj' },
            { id: 'ses_bbb', title: 'Other', updated: 300, directory: 'D:\\other' }
          ])
        )) as never
    )
    const adapter = new OpenCodeAdapter({} as never)
    const result = await adapter.collectSessionCandidatesByPath('d:/proj')
    // 时间戳取候选内最大 updated（created=100 与 updated=200 同 id 时取 directTimestamp 优先顺序：updated=200）
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('ses_aaa')
    expect(result[0].title).toBe('Fix bug')
    expect(result[0].updated).toBeGreaterThan(0)
  })

  it('returns empty array when CLI fails', async () => {
    const childExec = vi.mocked(exec)
    childExec.mockImplementation(((_cmd: string, _opts: unknown, cb: (err: Error) => void) =>
      cb(new Error('boom'))) as never)
    const adapter = new OpenCodeAdapter({} as never)
    const result = await adapter.collectSessionCandidatesByPath('d:/proj')
    expect(result).toEqual([])
  })
})
