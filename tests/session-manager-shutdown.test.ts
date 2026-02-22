import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '../src/main/services/session-types'

const sendSpy = vi.fn()
const getAllWindowsSpy = vi.fn(() => [{ webContents: { send: sendSpy } }])

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: getAllWindowsSpy
  }
}))

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

describe('SessionManager shutdownAll', () => {
  let sessionManager: SessionManager
  let storeSave: ReturnType<typeof vi.fn>
  let cliKill: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendSpy.mockClear()
    getAllWindowsSpy.mockClear()

    storeSave = vi.fn(async () => undefined)
    cliKill = vi.fn(() => true)

    const cliManager = {
      onOutput: vi.fn(),
      onExit: vi.fn(),
      kill: cliKill,
      write: vi.fn(() => true),
      resize: vi.fn()
    }

    const claudeLifecycle = createLifecycle('claude')
    const codexLifecycle = createLifecycle('codex')
    const outputManager = {
      appendOutput: vi.fn(),
      removeSession: vi.fn()
    }

    sessionManager = new SessionManager(
      cliManager as any,
      claudeLifecycle as any,
      codexLifecycle as any,
      outputManager as any
    )
    sessionManager.setStore({
      save: storeSave,
      load: vi.fn(),
      flush: vi.fn()
    } as any)
  })

  it('keeps session records while stopping runtime state during shutdown', async () => {
    sessionManager.createSession({
      type: 'claude',
      projectPath: '/tmp/project-a'
    })
    sessionManager.createSession({
      type: 'codex',
      projectPath: '/tmp/project-b'
    })

    sessionManager.shutdownAll()
    await sessionManager.flush()

    const sessions = sessionManager.listSessions()
    expect(sessions).toHaveLength(2)
    for (const session of sessions) {
      expect(session.status).toBe('stopped')
      expect(session.processId).toBeNull()
    }

    expect(cliKill).toHaveBeenCalledTimes(2)
    expect(storeSave).toHaveBeenCalled()

    const persistedSnapshot = storeSave.mock.calls.at(-1)?.[0] as Session[]
    expect(persistedSnapshot).toHaveLength(2)
    for (const session of persistedSnapshot) {
      expect(session.status).toBe('stopped')
      expect(session.processId).toBeNull()
    }

    expect(sendSpy).not.toHaveBeenCalledWith('sessions:cleared')
  })
})
