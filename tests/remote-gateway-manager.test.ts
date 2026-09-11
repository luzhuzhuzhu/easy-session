import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  webContents: {
    fromId: vi.fn()
  }
}))

import { RemoteGatewayManager } from '../src/main/services/remote-gateway-manager'
import type { RemoteInstanceRecord } from '../src/main/services/remote-instance-types'

function createRemoteInstance(baseUrl: string): RemoteInstanceRecord {
  return {
    id: 'remote-1',
    type: 'remote',
    name: 'remote-1',
    baseUrl,
    enabled: true,
    authRef: 'remote-1',
    status: 'online',
    lastCheckedAt: null,
    passthroughOnly: true,
    capabilities: {} as RemoteInstanceRecord['capabilities'],
    lastError: null,
    latencyMs: 42
  }
}

describe('RemoteGatewayManager', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    {
      name: 'legacy bare array',
      payload: [{
        id: 'legacy-1',
        title: ' Legacy title ',
        content: ' Full prompt ',
        updated: 1_789_000_000_000,
        projectPath: ' D:/repo '
      }]
    },
    {
      name: 'new discovery envelope',
      payload: {
        status: 'ready',
        candidates: [{
          id: 'new-1',
          title: ' Summary title ',
          titleSource: 'summary',
          content: ' Full content ',
          updated: 1_790_000_000_000,
          projectPath: ' D:/new-repo '
        }]
      }
    }
  ])('normalizes $name from the remote REST bridge', async ({ payload }) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: payload,
      requestId: 'candidate-request'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const manager = new RemoteGatewayManager({
      getInstance: vi.fn(() => createRemoteInstance('https://remote.example.com')),
      getToken: vi.fn(() => 't'.repeat(64))
    } as any)

    const result = await manager.invoke({
      instanceId: 'remote-1',
      method: 'getNativeIdCandidates',
      args: ['claude', 'D:/repo', 'C:/bin/claude.exe']
    })

    expect(result).toMatchObject({ status: 'ready' })
    expect((result as any).candidates[0]).toMatchObject({
      content: expect.any(String),
      updated: expect.any(Number),
      projectPath: expect.any(String),
      titleSource: expect.stringMatching(/^(session-title|summary)$/)
    })
  })

  it('forwards remote archive mutations through the main-process bridge', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify({
      data: {
        id: 's1', name: 'Remote', icon: null, type: 'codex', projectPath: 'D:/repo', status: 'stopped',
        createdAt: 1, lastActiveAt: 2, processId: null, options: {}, parentId: null, archivedAt: 10
      },
      requestId: 'archive-request'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const manager = new RemoteGatewayManager({
      getInstance: vi.fn(() => createRemoteInstance('https://remote.example.com')),
      getToken: vi.fn(() => 't'.repeat(64))
    } as any)

    const result = await manager.invoke({
      instanceId: 'remote-1',
      method: 'setSessionArchived',
      args: ['s1', true]
    } as any)

    expect(result).toMatchObject({ id: 's1', archivedAt: 10 })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://remote.example.com/api/sessions/s1/archive',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify({ archived: true }) })
    )
  })

  it('maps a missing candidate endpoint to unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'NOT_FOUND',
      message: 'Not found',
      requestId: 'candidate-request'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })))

    const manager = new RemoteGatewayManager({
      getInstance: vi.fn(() => createRemoteInstance('https://remote.example.com')),
      getToken: vi.fn(() => 't'.repeat(64))
    } as any)

    await expect(manager.invoke({
      instanceId: 'remote-1',
      method: 'getNativeIdCandidates',
      args: ['claude', 'D:/repo']
    })).resolves.toEqual({
      status: 'unsupported',
      candidates: [],
      message: 'The remote instance does not support native session discovery'
    })
  })

  it('turns trycloudflare DNS failures into actionable errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: {
            code: 'ENOTFOUND',
            hostname: 'pest-madrid-carbon-park.trycloudflare.com'
          }
        })
      })
    )

    const manager = new RemoteGatewayManager({
      getInstance: vi.fn(() => createRemoteInstance('https://pest-madrid-carbon-park.trycloudflare.com')),
      getToken: vi.fn(() => 't'.repeat(64))
    } as any)

    await expect(
      manager.invoke({
        instanceId: 'remote-1',
        method: 'getCapabilities'
      })
    ).rejects.toThrow(/Quick Tunnel 地址无法解析/)
  })
})
