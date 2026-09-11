import { describe, it, expect, vi, beforeEach } from 'vitest'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }
  }
}))

import { registerSessionHandlers } from '../src/main/ipc/session-handlers'

describe('session-handlers', () => {
  let sessionManager: any
  let openCodeAdapter: any
  let codexAdapter: any

  beforeEach(() => {
    handlers.clear()

    sessionManager = {
      createSession: vi.fn(),
      destroySession: vi.fn(),
      setSessionArchived: vi.fn(),
      startSession: vi.fn(),
      pauseSession: vi.fn(),
      listSessions: vi.fn(),
      getSession: vi.fn(),
      sendInput: vi.fn(),
      writeRaw: vi.fn(),
      resizeTerminal: vi.fn(),
      renameSession: vi.fn(),
      restartSession: vi.fn(),
      outputManager: {
        getHistory: vi.fn(),
        clearHistory: vi.fn()
      }
    }

    openCodeAdapter = { collectSessionCandidatesByPath: vi.fn() }
    codexAdapter = { collectSessionCandidatesByPath: vi.fn() }
    registerSessionHandlers(sessionManager, undefined, openCodeAdapter, codexAdapter)
  })

  it('should register required handlers', () => {
    const expected = [
      'session:create',
      'session:destroy',
      'session:setArchived',
      'session:start',
      'session:pause',
      'session:list',
      'session:get',
      'session:input',
      'session:write',
      'session:output:history',
      'session:output:clear',
      'session:resize',
      'session:rename',
      'session:restart',
      'session:nativeIdCandidates'
    ]

    for (const channel of expected) {
      expect(handlers.has(channel)).toBe(true)
    }
  })

  it('session:destroy should return result from destroySession', async () => {
    sessionManager.destroySession.mockReturnValue(true)

    const result = await handlers.get('session:destroy')!({}, 'session-1')

    expect(result).toBe(true)
    expect(sessionManager.destroySession).toHaveBeenCalledWith('session-1')
  })

  it('session:destroy should return false when destroy fails', async () => {
    sessionManager.destroySession.mockReturnValue(false)

    const result = await handlers.get('session:destroy')!({}, 'session-404')

    expect(result).toBe(false)
  })

  it('session:start should call startSession', async () => {
    sessionManager.startSession.mockReturnValue({ id: 's1' })
    const result = await handlers.get('session:start')!({}, 's1')
    expect(result).toEqual({ id: 's1' })
    expect(sessionManager.startSession).toHaveBeenCalledWith('s1')
  })

  it('session:nativeIdCandidates returns a discovery envelope', async () => {
    openCodeAdapter.collectSessionCandidatesByPath.mockResolvedValue([
      { id: 'ses-1', title: 'Resume me', titleSource: 'session-title' }
    ])

    const result = await handlers.get('session:nativeIdCandidates')!(
      {},
      'opencode',
      ' D:/repo ',
      ' C:/tools/opencode.exe '
    )

    expect(result).toEqual({
      status: 'ready',
      candidates: [{ id: 'ses-1', title: 'Resume me', titleSource: 'session-title' }]
    })
    expect(openCodeAdapter.collectSessionCandidatesByPath).toHaveBeenCalledWith(
      'D:/repo',
      'C:/tools/opencode.exe',
      40
    )
  })

  it('session:nativeIdCandidates returns unsupported for a non-discoverable CLI', async () => {
    const result = await handlers.get('session:nativeIdCandidates')!({}, 'terminal', 'D:/repo')

    expect(result).toMatchObject({ status: 'unsupported', candidates: [] })
  })

  it('session:nativeIdCandidates returns empty when projectPath is absent', async () => {
    const result = await handlers.get('session:nativeIdCandidates')!({}, 'codex', '  ')

    expect(result).toEqual({ status: 'empty', candidates: [] })
    expect(codexAdapter.collectSessionCandidatesByPath).not.toHaveBeenCalled()
  })

  it('session:pause should call pauseSession', async () => {
    sessionManager.pauseSession.mockReturnValue({ id: 's1' })
    const result = await handlers.get('session:pause')!({}, 's1')
    expect(result).toEqual({ id: 's1' })
    expect(sessionManager.pauseSession).toHaveBeenCalledWith('s1')
  })

  it('session:setArchived forwards the non-destructive archive state', async () => {
    sessionManager.setSessionArchived.mockReturnValue({ id: 'session-1', archivedAt: 123 })
    const result = await handlers.get('session:setArchived')!({}, 'session-1', true)
    expect(result).toEqual({ id: 'session-1', archivedAt: 123 })
    expect(sessionManager.setSessionArchived).toHaveBeenCalledWith('session-1', true)
  })

})
