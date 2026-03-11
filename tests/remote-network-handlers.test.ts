import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }
  }
}))

import { registerRemoteNetworkHandlers } from '../src/main/ipc/remote-network-handlers'

describe('remote-network-handlers', () => {
  let remoteNetworkSettingsManager: any

  beforeEach(() => {
    handlers.clear()
    remoteNetworkSettingsManager = {
      getState: vi.fn(async () => ({
        config: {
          cloudflare: {
            transportMode: 'auto',
            proxyMode: 'auto',
            customProxyUrl: null,
            rememberLastSuccess: true,
            autoFallback: true
          },
          cli: {
            proxyMode: 'auto',
            customProxyUrl: null,
            enableNoProxyLocalhost: true
          }
        },
        runtime: {
          cloudflare: {
            lastSuccessfulTransport: null,
            lastSuccessfulProxyMode: null,
            lastSuccessfulProxyUrl: null,
            lastFailureReason: null,
            lastFailureCategory: null
          },
          cli: {
            lastFailureReason: null,
            lastFailureCategory: null,
            lastFailureCli: null
          }
        },
        detected: {
          httpProxyUrl: null,
          socksProxyUrl: null,
          inheritedProxyUrl: null,
          updatedAt: null
        },
        cloudflareRecommended: null,
        cloudflareCandidates: [],
        cliResolved: {
          proxyMode: 'off',
          proxyUrl: null
        }
      })),
      updateSettings: vi.fn(async (updates) => updates)
    }

    registerRemoteNetworkHandlers(remoteNetworkSettingsManager)
  })

  it('registers remote network channels', () => {
    expect(handlers.has('remote-network:getState')).toBe(true)
    expect(handlers.has('remote-network:update')).toBe(true)
  })

  it('passes validated update payload to manager', async () => {
    await handlers.get('remote-network:update')!({}, {
      cloudflare: {
        transportMode: 'http2',
        proxyMode: 'custom',
        customProxyUrl: 'http://127.0.0.1:7897',
        rememberLastSuccess: true,
        autoFallback: true
      },
      cli: {
        proxyMode: 'inherit',
        enableNoProxyLocalhost: true
      }
    })

    expect(remoteNetworkSettingsManager.updateSettings).toHaveBeenCalledWith({
      cloudflare: {
        transportMode: 'http2',
        proxyMode: 'custom',
        customProxyUrl: 'http://127.0.0.1:7897',
        rememberLastSuccess: true,
        autoFallback: true
      },
      cli: {
        proxyMode: 'inherit',
        enableNoProxyLocalhost: true
      }
    })
  })
})
