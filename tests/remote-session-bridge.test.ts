import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendSpy, getAllWindowsSpy } = vi.hoisted(() => {
  const send = vi.fn()
  const getAllWindows = vi.fn(() => [{ webContents: { send } }])
  return { sendSpy: send, getAllWindowsSpy: getAllWindows }
})

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: getAllWindowsSpy
  }
}))

import { SessionOutputManager } from '../src/main/services/session-output'
import { SessionManager } from '../src/main/services/session-manager'

function createLifecycle(type: 'claude' | 'codex') {
  return {
    create: (id: string, name: string, params: any) => {
      const now = Date.now()
      if (type === 'claude') {
        return {
          id,
          name,
          icon: null,
          type: 'claude' as const,
          projectPath: params.projectPath,
          status: 'running' as const,
          createdAt: now,
          lastStartAt: now,
          totalRunMs: 0,
          lastRunMs: 0,
          lastActiveAt: now,
          processId: `proc-${id}`,
          options: {},
          parentId: null,
          claudeSessionId: null
        }
      }
      return {
        id,
        name,
        icon: null,
        type: 'codex' as const,
        projectPath: params.projectPath,
        status: 'running' as const,
        createdAt: now,
        lastStartAt: now,
        totalRunMs: 0,
        lastRunMs: 0,
        lastActiveAt: now,
        processId: `proc-${id}`,
        options: {},
        parentId: null,
        codexSessionId: null
      }
    },
    startProcess: vi.fn(),
    handleOutput: vi.fn(),
    cleanup: vi.fn(),
    migrateOnLoad: vi.fn(() => false),
    hydrateSessionId: vi.fn(() => false),
    setPersistCallback: vi.fn(),
    ensureCodexSessionIdAsync: vi.fn()
  }
}

describe('remote bridge compatibility', () => {
  beforeEach(() => {
    sendSpy.mockClear()
    getAllWindowsSpy.mockClear()
  })

  it('SessionOutputManager should keep renderer push while allowing subscribe', () => {
    const manager = new SessionOutputManager()
    const listener = vi.fn()
    const off = manager.subscribe(listener)

    manager.appendOutput('s1', 'hello\n', 'stdout')

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 's1',
        data: 'hello\n',
        stream: 'stdout'
      })
    )
    expect(sendSpy).toHaveBeenCalledWith(
      'session:output',
      expect.objectContaining({
        sessionId: 's1',
        data: 'hello\n',
        stream: 'stdout'
      })
    )

    off()
    manager.appendOutput('s1', 'world\n', 'stdout')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('SessionManager should emit status to subscriber and renderer together', async () => {
    const cliManager = {
      onOutput: vi.fn(),
      onExit: vi.fn(),
      kill: vi.fn(() => true),
      write: vi.fn(() => true),
      resize: vi.fn()
    }
    const claudeLifecycle = createLifecycle('claude')
    const codexLifecycle = createLifecycle('codex')
    const outputManager = new SessionOutputManager()
    const manager = new SessionManager(
      cliManager as any,
      claudeLifecycle as any,
      codexLifecycle as any,
      outputManager
    )
    manager.setStore({
      save: vi.fn(async () => undefined),
      load: vi.fn(),
      flush: vi.fn()
    } as any)

    const session = manager.createSession({ type: 'claude', projectPath: 'D:/repo/demo' })
    const statusListener = vi.fn()
    const off = manager.subscribeStatus(statusListener)

    manager.pauseSession(session.id)
    await manager.flush()

    expect(statusListener).toHaveBeenCalledWith({
      sessionId: session.id,
      status: 'stopped'
    })
    expect(sendSpy).toHaveBeenCalledWith('session:status', {
      sessionId: session.id,
      status: 'stopped'
    })

    off()
  })
})
