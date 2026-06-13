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
