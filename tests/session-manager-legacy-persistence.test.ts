import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

import { DataStore } from '../src/main/services/data-store'
import { SessionManager } from '../src/main/services/session-manager'
import type { Session } from '../src/main/services/session-types'

function createLifecycle(type: 'claude' | 'codex' | 'opencode') {
  return {
    create: vi.fn(),
    startProcess: vi.fn(),
    handleOutput: vi.fn(),
    cleanup: vi.fn(),
    migrateOnLoad: vi.fn(() => false),
    hydrateSessionId: vi.fn(async () => false),
    setPersistCallback: vi.fn(),
    ensureCodexSessionIdAsync: vi.fn(),
    ensureOpenCodeSessionIdAsync: vi.fn()
  }
}

describe('SessionManager legacy persistence compatibility', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'easysession-session-store-'))
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads legacy sessions.json and normalizes missing runtime fields without dropping records', async () => {
    const legacySessions = [
      {
        id: 'legacy-claude',
        name: 'Claude-001',
        type: 'claude',
        projectPath: 'D:/repo/project-a',
        status: 'idle',
        createdAt: 1000,
        processId: null,
        options: {},
        parentId: null,
        claudeSessionId: null
      },
      {
        id: 'legacy-opencode',
        name: 'OpenCode-001',
        icon: 'X',
        type: 'opencode',
        projectPath: 'D:/repo/project-b',
        status: 'running',
        createdAt: 2000,
        lastStartAt: 2000,
        processId: 'proc-legacy',
        options: {},
        parentId: null,
        opencodeSessionId: null
      }
    ]

    const storePath = join(tempDir, 'sessions.json')
    await writeFile(storePath, JSON.stringify(legacySessions, null, 2), 'utf-8')

    const cliManager = {
      onOutput: vi.fn(),
      onExit: vi.fn(),
      kill: vi.fn(() => true),
      write: vi.fn(() => true),
      resize: vi.fn()
    }
    const outputManager = {
      appendOutput: vi.fn(),
      removeSession: vi.fn()
    }

    const sessionManager = new SessionManager(
      cliManager as any,
      createLifecycle('claude') as any,
      createLifecycle('codex') as any,
      outputManager as any,
      createLifecycle('opencode') as any
    )
    sessionManager.setStore(new DataStore<Session[]>(storePath))

    await sessionManager.loadSessions()
    await sessionManager.flush()

    const sessions = sessionManager.listSessions()
    expect(sessions).toHaveLength(2)

    const claude = sessions.find((session) => session.id === 'legacy-claude')
    expect(claude).toMatchObject({
      icon: null,
      lastStartAt: 1000,
      totalRunMs: 0,
      lastRunMs: 0,
      status: 'idle'
    })
    expect(typeof claude?.lastActiveAt).toBe('number')

    const opencode = sessions.find((session) => session.id === 'legacy-opencode')
    expect(opencode?.icon).toBe('O')
    expect(opencode?.status).toBe('stopped')
    expect(opencode?.processId).toBeNull()
    expect((opencode?.totalRunMs ?? 0) > 0).toBe(true)

    const persisted = JSON.parse(await readFile(storePath, 'utf-8')) as Session[]
    expect(persisted).toHaveLength(2)
    expect(persisted.find((session) => session.id === 'legacy-claude')).toMatchObject({
      icon: null,
      lastStartAt: 1000,
      totalRunMs: 0,
      lastRunMs: 0
    })
    expect(persisted.find((session) => session.id === 'legacy-opencode')).toMatchObject({
      icon: 'O',
      status: 'stopped',
      processId: null
    })
  })
})
