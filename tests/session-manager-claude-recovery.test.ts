import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { SessionManager } from '../src/main/services/session-manager'

let outputListener: ((id: string, data: string, stream: 'stdout' | 'stderr') => void) | null = null
let exitListener: ((id: string, code: number | null) => void) | null = null

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

describe('SessionManager Claude exit handling', () => {
  let sessionManager: SessionManager
  let claudeStartProcess: ReturnType<typeof vi.fn>
  let outputManager: {
    appendOutput: ReturnType<typeof vi.fn>
    removeSession: ReturnType<typeof vi.fn>
  }

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

    claudeStartProcess = vi.fn((session: any, startAt: number) => {
      session.processId = 'claude-proc-fallback'
      session.status = 'running'
      session.lastStartAt = startAt
      session.lastActiveAt = startAt
    })

    const claudeLifecycle = {
      create: vi.fn((id: string, name: string, params: any) => {
        const now = Date.now()
        return {
          id, name, icon: null, type: 'claude' as const,
          projectPath: params.projectPath,
          status: 'running' as const,
          createdAt: now, lastStartAt: now,
          totalRunMs: 0, lastRunMs: 0, lastActiveAt: now,
          processId: 'claude-proc-initial',
          options: {}, parentId: null,
          claudeSessionId: 'dead-session-id'
        }
      }),
      startProcess: claudeStartProcess,
      handleOutput: vi.fn(),
      cleanup: vi.fn(),
      migrateOnLoad: vi.fn(() => false),
      hydrateSessionId: vi.fn(() => false),
      setPersistCallback: vi.fn()
    }

    const codexLifecycle = {
      create: vi.fn(), startProcess: vi.fn(), handleOutput: vi.fn(),
      cleanup: vi.fn(), migrateOnLoad: vi.fn(() => false),
      hydrateSessionId: vi.fn(() => false),
      setPersistCallback: vi.fn(), ensureCodexSessionIdAsync: vi.fn()
    }

    outputManager = { appendOutput: vi.fn(), removeSession: vi.fn() }

    sessionManager = new SessionManager(
      cliManager as any, claudeLifecycle as any,
      codexLifecycle as any, outputManager as any
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

  it('should set error status on non-zero exit without auto-recovery', () => {
    const created = sessionManager.createSession({
      type: 'claude',
      projectPath: 'D:/repo/project-a'
    })

    // 非零退出码应直接设为 error 状态，不触发自动恢复
    exitListener?.('claude-proc-initial', 1)
    vi.advanceTimersByTime(0)

    const current = sessionManager.getSession(created.id)
    expect(current).toBeDefined()
    expect(current?.status).toBe('error')
    // claudeSessionId 保持不变
    expect((current as any)?.claudeSessionId).toBe('dead-session-id')
    // 不应触发自动恢复
    expect(claudeStartProcess).not.toHaveBeenCalled()
  })
})
