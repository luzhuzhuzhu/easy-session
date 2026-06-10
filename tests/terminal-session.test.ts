import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TerminalAdapter } from '../src/main/services/terminal-adapter'
import { TerminalSessionLifecycle } from '../src/main/services/terminal-session-lifecycle'
import { resolveShellPath, detectShells } from '../src/main/services/shell-detector'
import type { SessionOutputManager } from '../src/main/services/session-output'

describe('shell detector', () => {
  it('detects at least one shell on the current platform', () => {
    const shells = detectShells()
    expect(shells.length).toBeGreaterThan(0)
    for (const shell of shells) {
      expect(shell.id).toBeTruthy()
      expect(shell.path).toBeTruthy()
    }
  })

  it('resolves a detected shell id to its executable path', () => {
    const shells = detectShells()
    const first = shells[0]
    expect(resolveShellPath(first.id)).toBe(first.path)
  })

  it('passes through a custom executable path unchanged', () => {
    expect(resolveShellPath('D:\\tools\\nu.exe')).toBe('D:\\tools\\nu.exe')
  })

  it('falls back to the first detected shell when no shell is given', () => {
    const shells = detectShells()
    expect(resolveShellPath(undefined)).toBe(shells[0].path)
    expect(resolveShellPath('   ')).toBe(shells[0].path)
  })
})

function createCliManagerMock() {
  const outputListeners = new Set<(id: string, data: string, stream: string) => void>()
  return {
    spawn: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    onExit: vi.fn().mockReturnValue(() => {}),
    onOutput: vi.fn((listener: (id: string, data: string, stream: string) => void) => {
      outputListeners.add(listener)
      return () => outputListeners.delete(listener)
    }),
    emitOutput(id: string) {
      for (const listener of outputListeners) listener(id, 'prompt>', 'stdout')
    }
  }
}

describe('terminal adapter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('spawns the resolved shell with normalized args and explicit cliType', () => {
    const cliManager = createCliManagerMock()
    const adapter = new TerminalAdapter(cliManager as any)

    const id = adapter.startSession('D:/repo/project-a', {
      shell: 'D:\\tools\\nu.exe',
      shellArgs: [{ name: ' --login ' }, { name: '' }]
    })

    expect(id).toMatch(/^terminal-/)
    expect(cliManager.spawn).toHaveBeenCalledWith(
      expect.stringMatching(/^terminal-/),
      'D:\\tools\\nu.exe',
      ['--login'],
      { cwd: 'D:/repo/project-a', cliType: 'terminal' }
    )
  })

  it('writes startup commands in order after the shell produces output', () => {
    const cliManager = createCliManagerMock()
    const adapter = new TerminalAdapter(cliManager as any)

    const id = adapter.startSession('D:/repo/project-a', {
      shell: 'D:\\tools\\nu.exe',
      startupCommands: ['cd src', '  ', 'npm run dev']
    })

    expect(cliManager.write).not.toHaveBeenCalled()

    // shell 输出提示符 → 触发就绪
    cliManager.emitOutput(id)
    vi.runAllTimers()

    expect(cliManager.write).toHaveBeenNthCalledWith(1, id, 'cd src\r')
    expect(cliManager.write).toHaveBeenNthCalledWith(2, id, 'npm run dev\r')
  })

  it('falls back to writing startup commands when the shell never produces output', () => {
    const cliManager = createCliManagerMock()
    const adapter = new TerminalAdapter(cliManager as any)

    const id = adapter.startSession('D:/repo/project-a', {
      shell: 'D:\\tools\\nu.exe',
      startupCommands: ['echo hi']
    })

    vi.runAllTimers()
    expect(cliManager.write).toHaveBeenCalledWith(id, 'echo hi\r')
  })

  it('stops the startup chain when a write fails (process gone)', () => {
    const cliManager = createCliManagerMock()
    cliManager.write.mockReturnValue(false)
    const adapter = new TerminalAdapter(cliManager as any)

    const id = adapter.startSession('D:/repo/project-a', {
      shell: 'D:\\tools\\nu.exe',
      startupCommands: ['first', 'second']
    })

    cliManager.emitOutput(id)
    vi.runAllTimers()

    expect(cliManager.write).toHaveBeenCalledTimes(1)
    expect(cliManager.write).toHaveBeenCalledWith(id, 'first\r')
  })

  it('cancels pending startup commands when the process exits', () => {
    const cliManager = createCliManagerMock()
    const adapter = new TerminalAdapter(cliManager as any)
    const exitListener = cliManager.onExit.mock.calls[0][0] as (id: string) => void

    const id = adapter.startSession('D:/repo/project-a', {
      shell: 'D:\\tools\\nu.exe',
      startupCommands: ['echo hi']
    })

    exitListener(id)
    vi.runAllTimers()

    expect(cliManager.write).not.toHaveBeenCalled()
  })
})

describe('terminal session lifecycle', () => {
  it('creates a running terminal session', () => {
    const adapter = { startSession: vi.fn().mockReturnValue('terminal-proc-1') }
    const lifecycle = new TerminalSessionLifecycle(
      adapter as any,
      { appendOutput: vi.fn() } as unknown as SessionOutputManager
    )

    const session = lifecycle.create('session-1', 'Terminal-001', {
      type: 'terminal',
      projectPath: 'D:/repo/project-a',
      options: { shell: 'cmd' }
    })

    expect(session.type).toBe('terminal')
    expect(session.status).toBe('running')
    expect(session.processId).toBe('terminal-proc-1')
    expect(adapter.startSession).toHaveBeenCalledWith('D:/repo/project-a', { shell: 'cmd' })
  })

  it('marks the session as error when spawn fails and logs to output', () => {
    const adapter = {
      startSession: vi.fn(() => {
        throw new Error('ENOENT: shell not found')
      })
    }
    const outputManager = { appendOutput: vi.fn() }
    const lifecycle = new TerminalSessionLifecycle(adapter as any, outputManager as unknown as SessionOutputManager)

    const session = lifecycle.create('session-1', 'Terminal-001', {
      type: 'terminal',
      projectPath: 'D:/repo/project-a'
    })

    expect(session.status).toBe('error')
    expect(session.processId).toBeNull()
    expect(outputManager.appendOutput).toHaveBeenCalledWith(
      'session-1',
      expect.stringContaining('ENOENT'),
      'stderr'
    )
  })

  it('restarts the shell process via startProcess', () => {
    const adapter = { startSession: vi.fn().mockReturnValue('terminal-proc-2') }
    const lifecycle = new TerminalSessionLifecycle(
      adapter as any,
      { appendOutput: vi.fn() } as unknown as SessionOutputManager
    )

    const session = lifecycle.create('session-1', 'Terminal-001', {
      type: 'terminal',
      projectPath: 'D:/repo/project-a',
      options: { shell: 'cmd', startupCommands: ['echo hi'] }
    })

    session.status = 'stopped'
    session.processId = null

    lifecycle.startProcess(session, 12345)

    expect(session.status).toBe('running')
    expect(session.processId).toBe('terminal-proc-2')
    expect(session.lastStartAt).toBe(12345)
    expect(adapter.startSession).toHaveBeenLastCalledWith('D:/repo/project-a', {
      shell: 'cmd',
      startupCommands: ['echo hi']
    })
  })

  it('rejects non-terminal sessions in startProcess', () => {
    const lifecycle = new TerminalSessionLifecycle(
      { startSession: vi.fn() } as any,
      { appendOutput: vi.fn() } as unknown as SessionOutputManager
    )

    expect(() =>
      lifecycle.startProcess({ type: 'claude' } as never, Date.now())
    ).toThrow(/terminal/)
  })
})
