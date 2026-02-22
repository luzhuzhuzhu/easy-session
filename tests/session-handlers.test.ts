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

  beforeEach(() => {
    handlers.clear()

    sessionManager = {
      createSession: vi.fn(),
      destroySession: vi.fn(),
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

    registerSessionHandlers(sessionManager)
  })

  it('should register required handlers', () => {
    const expected = [
      'session:create',
      'session:destroy',
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
      'session:restart'
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

  it('session:pause should call pauseSession', async () => {
    sessionManager.pauseSession.mockReturnValue({ id: 's1' })
    const result = await handlers.get('session:pause')!({}, 's1')
    expect(result).toEqual({ id: 's1' })
    expect(sessionManager.pauseSession).toHaveBeenCalledWith('s1')
  })
})
