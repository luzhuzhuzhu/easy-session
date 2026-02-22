import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CodexSessionLifecycle } from '../src/main/services/codex-session-lifecycle'
import type { CodexSession } from '../src/main/services/session-types'

function createCodexSession(overrides: Partial<CodexSession> = {}): CodexSession {
  return {
    id: 'session-1',
    name: 'Codex-001',
    type: 'codex',
    projectPath: 'D:/repo/project-a',
    status: 'stopped',
    createdAt: 1_000,
    lastStartAt: 1_000,
    totalRunMs: 0,
    lastRunMs: 0,
    lastActiveAt: 1_000,
    processId: null,
    parentId: null,
    options: {},
    codexSessionId: null,
    ...overrides
  }
}

describe('CodexSessionLifecycle', () => {
  let adapter: {
    startSession: ReturnType<typeof vi.fn>
    resumeSession: ReturnType<typeof vi.fn>
    findSessionIdByProjectPath: ReturnType<typeof vi.fn>
  }
  let outputManager: {
    appendOutput: ReturnType<typeof vi.fn>
    getHistory: ReturnType<typeof vi.fn>
  }
  let lifecycle: CodexSessionLifecycle

  beforeEach(() => {
    adapter = {
      startSession: vi.fn(() => 'proc-start'),
      resumeSession: vi.fn(() => 'proc-resume'),
      findSessionIdByProjectPath: vi.fn(() => null)
    }
    outputManager = {
      appendOutput: vi.fn(),
      getHistory: vi.fn(() => [])
    }
    lifecycle = new CodexSessionLifecycle(adapter as any, outputManager as any)
  })

  it('should start a new conversation when no trusted id is available', () => {
    const session = createCodexSession()

    lifecycle.startProcess(session, 2_000)

    expect(adapter.resumeSession).not.toHaveBeenCalled()
    expect(adapter.startSession).toHaveBeenCalledWith('D:/repo/project-a', {})
    expect(outputManager.appendOutput).toHaveBeenCalledWith(
      'session-1',
      expect.stringContaining('No trusted resume ID found'),
      'stdout'
    )
    expect(session.processId).toBe('proc-start')
    expect(session.status).toBe('running')
    expect(session.lastStartAt).toBe(2_000)
  })

  it('should resume by stored id before trying any fallback', () => {
    const session = createCodexSession({
      codexSessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    })

    lifecycle.startProcess(session, 3_000)

    expect(adapter.resumeSession).toHaveBeenCalledWith(
      'D:/repo/project-a',
      {},
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    )
    expect(adapter.startSession).not.toHaveBeenCalled()
    expect(adapter.findSessionIdByProjectPath).not.toHaveBeenCalled()
  })

  it('should hydrate id from output history and avoid filesystem lookup', () => {
    outputManager.getHistory.mockReturnValue([
      { text: 'Tips: codex resume bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb\n' }
    ])
    const session = createCodexSession()

    const changed = lifecycle.hydrateSessionId(session)

    expect(changed).toBe(true)
    expect(session.codexSessionId).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    expect(adapter.findSessionIdByProjectPath).not.toHaveBeenCalled()
  })

  it('should fallback to strict adapter lookup when history has no id', () => {
    adapter.findSessionIdByProjectPath.mockReturnValue('cccccccc-cccc-cccc-cccc-cccccccccccc')
    const session = createCodexSession({ lastStartAt: 9_999 })

    const changed = lifecycle.hydrateSessionId(session)

    expect(changed).toBe(true)
    expect(session.codexSessionId).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc')
    expect(adapter.findSessionIdByProjectPath).toHaveBeenCalledWith(
      'D:/repo/project-a',
      9_999,
      180_000
    )
  })
})
