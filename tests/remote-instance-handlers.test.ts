import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }
  }
}))

import { registerRemoteInstanceHandlers } from '../src/main/ipc/remote-instance-handlers'

describe('remote-instance-handlers', () => {
  let remoteInstanceManager: any

  beforeEach(() => {
    handlers.clear()
    remoteInstanceManager = {
      listInstances: vi.fn(() => []),
      addInstance: vi.fn(async (draft) => ({ id: 'r1', ...draft })),
      updateInstance: vi.fn(async (id, updates) => ({ id, ...updates })),
      removeInstance: vi.fn(async () => true),
      testInstance: vi.fn(async (id) => ({ ok: true, id })),
      testDraft: vi.fn(async (draft) => ({ ok: true, ...draft })),
      getToken: vi.fn((id) => `${id}-token`)
    }

    registerRemoteInstanceHandlers(remoteInstanceManager)
  })

  it('registers all remote instance channels', () => {
    const expected = [
      'remote-instance:list',
      'remote-instance:add',
      'remote-instance:update',
      'remote-instance:remove',
      'remote-instance:test',
      'remote-instance:getToken'
    ]

    for (const channel of expected) {
      expect(handlers.has(channel)).toBe(true)
    }
  })

  it('routes stored instance test by id', async () => {
    const result = await handlers.get('remote-instance:test')!({}, 'remote-1')

    expect(result).toEqual({ ok: true, id: 'remote-1' })
    expect(remoteInstanceManager.testInstance).toHaveBeenCalledWith('remote-1')
    expect(remoteInstanceManager.testDraft).not.toHaveBeenCalled()
  })

  it('routes draft connectivity test without persisting', async () => {
    const result = await handlers.get('remote-instance:test')!({}, {
      baseUrl: 'https://example.com',
      token: 'x'.repeat(64)
    })

    expect(result).toEqual({
      ok: true,
      baseUrl: 'https://example.com',
      token: 'x'.repeat(64)
    })
    expect(remoteInstanceManager.testDraft).toHaveBeenCalledWith({
      baseUrl: 'https://example.com',
      token: 'x'.repeat(64)
    })
  })
})
