import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenCodeSessionLifecycle } from '../src/main/services/opencode-session-lifecycle'
import type { OpenCodeSession } from '../src/main/services/session-types'

describe('OpenCodeSessionLifecycle list discovery guard', () => {
  let lifecycle: OpenCodeSessionLifecycle
  let adapter: {
    extractSessionIdFromOutput: ReturnType<typeof vi.fn>
    findSessionIdByProjectPath: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.useFakeTimers()
    adapter = {
      extractSessionIdFromOutput: vi.fn(() => null),
      findSessionIdByProjectPath: vi.fn(async () => 'ses_old_should_not_bind')
    }
    lifecycle = new OpenCodeSessionLifecycle(
      adapter as any,
      { appendOutput: vi.fn(), removeSession: vi.fn(), getHistory: vi.fn(() => []) } as any
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function createSession(overrides: Partial<OpenCodeSession> = {}): OpenCodeSession {
    const now = Date.now()
    return {
      id: 's-opencode',
      name: 'OpenCode-001',
      icon: null,
      type: 'opencode',
      projectPath: 'E:/easy-session',
      status: 'running',
      createdAt: now,
      lastStartAt: now,
      totalRunMs: 0,
      lastRunMs: 0,
      lastActiveAt: now,
      processId: 'proc-opencode',
      options: {},
      parentId: null,
      opencodeSessionId: null,
      ...overrides
    }
  }

  it('should not query session list for plain new sessions', async () => {
    const session = createSession()

    lifecycle.ensureOpenCodeSessionIdAsync(
      session.id,
      session.projectPath,
      'proc-opencode',
      () => session
    )

    await vi.advanceTimersByTimeAsync(1300)

    expect(adapter.findSessionIdByProjectPath).toHaveBeenCalled()
    expect(adapter.findSessionIdByProjectPath).toHaveBeenCalledWith(
      session.projectPath,
      undefined,
      80,
      session.lastStartAt || session.createdAt,
      60_000,
      true
    )
    expect(session.opencodeSessionId).toBe('ses_old_should_not_bind')
  })

  it('should allow session list discovery when continueLast is enabled', async () => {
    const session = createSession({
      options: { continueLast: true }
    })

    lifecycle.ensureOpenCodeSessionIdAsync(
      session.id,
      session.projectPath,
      'proc-opencode',
      () => session
    )

    await vi.advanceTimersByTimeAsync(1300)

    expect(adapter.findSessionIdByProjectPath).toHaveBeenCalled()
    expect(session.opencodeSessionId).toBe('ses_old_should_not_bind')
  })
})

describe('OpenCodeSessionLifecycle stored id trust', () => {
  function createSession(overrides: Partial<OpenCodeSession> = {}): OpenCodeSession {
    const now = Date.now()
    return {
      id: 's-opencode',
      name: 'OpenCode-001',
      icon: null,
      type: 'opencode',
      projectPath: 'E:/easy-session',
      status: 'stopped',
      createdAt: now,
      lastStartAt: now,
      totalRunMs: 0,
      lastRunMs: 0,
      lastActiveAt: now,
      processId: null,
      options: {},
      parentId: null,
      opencodeSessionId: null,
      opencodeSessionIdSource: null,
      ...overrides
    }
  }

  it('ignores unknown legacy stored id and starts a new session', async () => {
    const adapter = {
      startSession: vi.fn(() => 'proc-new'),
      resumeSession: vi.fn(() => 'proc-resume'),
      continueLastSession: vi.fn(() => 'proc-continue'),
      attachSession: vi.fn(() => 'proc-attach')
    }
    const lifecycle = new OpenCodeSessionLifecycle(
      adapter as any,
      { appendOutput: vi.fn(), removeSession: vi.fn(), getHistory: vi.fn(() => []) } as any
    )

    const session = createSession({
      opencodeSessionId: 'ses_legacy_old',
      opencodeSessionIdSource: undefined,
      options: {}
    })

    await lifecycle.startProcess(session as any, Date.now())

    expect(adapter.startSession).toHaveBeenCalledOnce()
    expect(adapter.resumeSession).not.toHaveBeenCalled()
  })

  it('uses stored id when it came from output parsing', async () => {
    const adapter = {
      startSession: vi.fn(() => 'proc-new'),
      resumeSession: vi.fn(() => 'proc-resume'),
      continueLastSession: vi.fn(() => 'proc-continue'),
      attachSession: vi.fn(() => 'proc-attach')
    }
    const lifecycle = new OpenCodeSessionLifecycle(
      adapter as any,
      { appendOutput: vi.fn(), removeSession: vi.fn(), getHistory: vi.fn(() => []) } as any
    )

    const session = createSession({
      opencodeSessionId: 'ses_confirmed',
      opencodeSessionIdSource: 'output',
      options: {}
    })

    await lifecycle.startProcess(session as any, Date.now())

    expect(adapter.resumeSession).toHaveBeenCalledWith(
      session.projectPath,
      session.options,
      'ses_confirmed',
      undefined
    )
  })

  it('uses stored id when it came from strict list discovery', async () => {
    const adapter = {
      startSession: vi.fn(() => 'proc-new'),
      resumeSession: vi.fn(() => 'proc-resume'),
      continueLastSession: vi.fn(() => 'proc-continue'),
      attachSession: vi.fn(() => 'proc-attach')
    }
    const lifecycle = new OpenCodeSessionLifecycle(
      adapter as any,
      { appendOutput: vi.fn(), removeSession: vi.fn(), getHistory: vi.fn(() => []) } as any
    )

    const session = createSession({
      opencodeSessionId: 'ses_from_list',
      opencodeSessionIdSource: 'list',
      options: {}
    })

    await lifecycle.startProcess(session as any, Date.now())

    expect(adapter.resumeSession).toHaveBeenCalledWith(
      session.projectPath,
      session.options,
      'ses_from_list',
      undefined
    )
    expect(adapter.startSession).not.toHaveBeenCalled()
  })
})
