import { vi } from 'vitest'
import type { Session, CreateSessionParams } from '../src/main/services/session-types'

// Mock electron modules
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  ipcMain: {
    handle: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata')
  }
}))

// Mock crypto.randomUUID to return predictable IDs
let uuidCounter = 0
vi.mock('crypto', () => ({
  randomUUID: () => `test-uuid-${++uuidCounter}`
}))

export function resetUuidCounter(): void {
  uuidCounter = 0
}

// Mock SessionManager
export function createMockSessionManager() {
  const sessions = new Map<string, Session>()
  let sessionCounter = 0

  return {
    sessions,
    createSession: vi.fn((params: CreateSessionParams): Session => {
      sessionCounter++
      const id = `session-${sessionCounter}`
      const base = {
        id,
        name: params.name || `${params.type}-${sessionCounter}`,
        projectPath: params.projectPath,
        status: 'running' as const,
        createdAt: Date.now(),
        lastStartAt: Date.now(),
        totalRunMs: 0,
        lastRunMs: 0,
        lastActiveAt: Date.now(),
        processId: `proc-${sessionCounter}`,
        parentId: params.parentId || null
      }
      const session: Session = params.type === 'claude'
        ? { ...base, type: 'claude', options: (params.options || {}) as any, claudeSessionId: `claude-sid-${sessionCounter}` }
        : { ...base, type: 'codex', options: (params.options || {}) as any, codexSessionId: null }
      sessions.set(id, session)
      return session
    }),
    destroySession: vi.fn((id: string) => {
      return sessions.delete(id)
    }),
    getSession: vi.fn((id: string) => sessions.get(id)),
    listSessions: vi.fn(() => Array.from(sessions.values())),
    sendInput: vi.fn(() => true),
    outputManager: {
      appendOutput: vi.fn(),
      removeSession: vi.fn()
    }
  }
}
