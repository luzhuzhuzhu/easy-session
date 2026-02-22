import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaudeSessionLifecycle } from '../src/main/services/claude-session-lifecycle'
import type { ClaudeSession } from '../src/main/services/session-types'

function createClaudeSession(overrides: Partial<ClaudeSession> = {}): ClaudeSession {
  return {
    id: 'session-1',
    name: 'Claude-001',
    icon: null,
    type: 'claude',
    projectPath: 'D:/repo/project-a',
    status: 'stopped',
    createdAt: 1_000,
    lastStartAt: 1_000,
    totalRunMs: 0,
    lastRunMs: 0,
    lastActiveAt: 1_000,
    processId: null,
    options: {},
    parentId: null,
    claudeSessionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    ...overrides
  }
}

describe('ClaudeSessionLifecycle', () => {
  let adapter: {
    startSession: ReturnType<typeof vi.fn>
    resumeSession: ReturnType<typeof vi.fn>
  }
  let outputManager: {
    appendOutput: ReturnType<typeof vi.fn>
  }
  let lifecycle: ClaudeSessionLifecycle

  beforeEach(() => {
    adapter = {
      startSession: vi.fn(() => 'proc-start'),
      resumeSession: vi.fn(() => 'proc-resume')
    }
    outputManager = {
      appendOutput: vi.fn()
    }
    lifecycle = new ClaudeSessionLifecycle(adapter as any, outputManager as any)
  })

  it('should keep claudeSessionId and warn when session not found', () => {
    const persistSpy = vi.fn()
    lifecycle.setPersistCallback(persistSpy)

    const session = createClaudeSession()
    lifecycle.handleOutput(
      session,
      'No conversation found with session ID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    )

    // ID 不应被清除，保留以便下次 --resume 恢复正确会话
    expect(session.claudeSessionId).toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(persistSpy).not.toHaveBeenCalled()
    expect(outputManager.appendOutput).toHaveBeenCalledWith(
      'session-1',
      expect.stringContaining('retry with same ID'),
      'stdout'
    )
  })

  it('should throw when claudeSessionId is missing', () => {
    const session = createClaudeSession({ claudeSessionId: null })

    expect(() => lifecycle.startProcess(session, 2_000)).toThrow('Claude session ID is missing')
  })
})
