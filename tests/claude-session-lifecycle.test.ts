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

  it('should flag invalid session on output without spawning directly', () => {
    const session = createClaudeSession({ status: 'running', processId: 'proc-resume' })

    lifecycle.handleOutput(
      session,
      'No conversation found with session ID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    )

    // 不在 handleOutput 里直接起进程——只做标记，等进程退出后统一处理
    expect(session.invalidSessionId).toBe(true)
    expect(adapter.startSession).not.toHaveBeenCalled()
    expect(adapter.resumeSession).not.toHaveBeenCalled()
    expect(session.processId).toBe('proc-resume')
    expect(outputManager.appendOutput).toHaveBeenCalledWith(
      'session-1',
      expect.stringContaining('session not found'),
      'stdout'
    )
  })

  it('should clear dead ID and request restart after abnormal exit', () => {
    const session = createClaudeSession({ status: 'running', processId: null })
    lifecycle.handleOutput(session, 'No conversation found with session ID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(session.invalidSessionId).toBe(true)

    const shouldRestart = lifecycle.shouldAutoRestartAfterExit(session, 1)

    expect(shouldRestart).toBe(true)
    // 死 ID 被换成全新 UUID；invalidSessionId 保持 true，startProcess 据此走 --session-id
    // 创建路径（直接 resume 新 UUID 会再次报 No conversation found 死循环）
    expect(session.claudeSessionId).not.toBe('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    expect(session.invalidSessionId).toBe(true)

    // startProcess 用全新 UUID 走 startSession（创建）而非 resumeSession
    lifecycle.startProcess(session, 2_000)
    expect(adapter.startSession).toHaveBeenCalledWith(
      'D:/repo/project-a',
      {},
      session.claudeSessionId
    )
    expect(adapter.resumeSession).not.toHaveBeenCalled()
    expect(session.invalidSessionId).toBe(false)
  })

  it('should not restart after exit when session output was healthy', () => {
    const session = createClaudeSession({ status: 'running', processId: null })

    expect(lifecycle.shouldAutoRestartAfterExit(session, 1)).toBe(false)
    expect(lifecycle.shouldAutoRestartAfterExit(session, 0)).toBe(false)
  })

  it('should guard repeated invalid flags to avoid duplicate warnings', () => {
    const session = createClaudeSession({ status: 'running', processId: 'proc-resume' })
    lifecycle.handleOutput(session, 'No conversation found with session ID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    lifecycle.handleOutput(session, 'No conversation found with session ID: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')

    // 只提示一次
    expect(outputManager.appendOutput).toHaveBeenCalledTimes(1)
  })

  it('should throw when claudeSessionId is missing', () => {
    const session = createClaudeSession({ claudeSessionId: null })

    expect(() => lifecycle.startProcess(session, 2_000)).toThrow('Claude session ID is missing')
  })
})
