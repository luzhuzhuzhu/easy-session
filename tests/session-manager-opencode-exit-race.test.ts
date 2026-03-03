import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionManager } from '../src/main/services/session-manager'

let outputListener: ((id: string, data: string, stream: 'stdout' | 'stderr') => void) | null = null
let exitListener: ((id: string, code: number | null) => void) | null = null

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

describe('SessionManager OpenCode exit/output race', () => {
  let sessionManager: SessionManager

  beforeEach(() => {
    vi.useFakeTimers()
    outputListener = null
    exitListener = null

    const cliManager = {
      onOutput: vi.fn((listener: typeof outputListener) => {
        outputListener = listener as any
      }),
      onExit: vi.fn((listener: typeof exitListener) => {
        exitListener = listener as any
      }),
      kill: vi.fn(() => true),
      write: vi.fn(() => true),
      resize: vi.fn()
    }

    const claudeLifecycle = {
      create: vi.fn(),
      startProcess: vi.fn(),
      handleOutput: vi.fn(),
      cleanup: vi.fn(),
      migrateOnLoad: vi.fn(() => false),
      hydrateSessionId: vi.fn(() => false),
      setPersistCallback: vi.fn()
    }

    const codexLifecycle = {
      create: vi.fn(),
      startProcess: vi.fn(),
      handleOutput: vi.fn(),
      cleanup: vi.fn(),
      migrateOnLoad: vi.fn(() => false),
      hydrateSessionId: vi.fn(() => false),
      setPersistCallback: vi.fn(),
      ensureCodexSessionIdAsync: vi.fn()
    }

    const opencodeLifecycle = {
      create: vi.fn((id: string, name: string, params: any) => {
        const now = Date.now()
        return {
          id,
          name,
          icon: null,
          type: 'opencode' as const,
          projectPath: params.projectPath,
          status: 'running' as const,
          createdAt: now,
          lastStartAt: now,
          totalRunMs: 0,
          lastRunMs: 0,
          lastActiveAt: now,
          processId: 'opencode-proc-1',
          options: {},
          parentId: null,
          opencodeSessionId: null
        }
      }),
      startProcess: vi.fn(),
      handleOutput: vi.fn((session: any, data: string) => {
        const match = data.match(/-s\s+(ses_[A-Za-z0-9_-]+)/)
        if (match?.[1]) {
          session.opencodeSessionId = match[1]
        }
      }),
      cleanup: vi.fn(),
      migrateOnLoad: vi.fn(() => false),
      hydrateSessionId: vi.fn(() => false),
      setPersistCallback: vi.fn(),
      ensureOpenCodeSessionIdAsync: vi.fn()
    }

    const outputManager = {
      appendOutput: vi.fn(),
      removeSession: vi.fn()
    }

    sessionManager = new SessionManager(
      cliManager as any,
      claudeLifecycle as any,
      codexLifecycle as any,
      outputManager as any,
      opencodeLifecycle as any
    )
    sessionManager.setStore({
      save: vi.fn(async () => undefined),
      load: vi.fn(async () => ({ data: [] })),
      flush: vi.fn(async () => undefined)
    } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps process mapping long enough to capture trailing OpenCode continue hint', () => {
    const created = sessionManager.createSession({
      type: 'opencode',
      projectPath: 'E:/easy-session'
    })

    exitListener?.('opencode-proc-1', 0)

    outputListener?.(
      'opencode-proc-1',
      'Continue  opencode -s ses_34ebf18e8ffeQSN2prliKpaecx',
      'stdout'
    )

    const beforeExitHandled = sessionManager.getSession(created.id) as any
    expect(beforeExitHandled?.opencodeSessionId).toBe('ses_34ebf18e8ffeQSN2prliKpaecx')

    vi.advanceTimersByTime(179)
    expect(sessionManager.getSession(created.id)?.status).toBe('running')

    vi.advanceTimersByTime(1)
    expect(sessionManager.getSession(created.id)?.status).toBe('stopped')
  })
})
