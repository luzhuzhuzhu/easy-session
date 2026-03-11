import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RemoteGatewayServer } from '../src/main/remote'
import { RemoteServiceManager } from '../src/main/services/remote-service-manager'
import { RemoteServiceSettingsManager } from '../src/main/services/remote-service-settings-manager'
import type { RemoteRuntimeConfig } from '../src/main/remote/types'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'easysession-remote-service-manager-'))
}

describe('RemoteServiceManager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
    vi.unstubAllEnvs()
    delete process.env.EASYSESSION_REMOTE_ENABLED
    delete process.env.EASYSESSION_REMOTE_HOST
    delete process.env.EASYSESSION_REMOTE_PORT
    delete process.env.EASYSESSION_REMOTE_PASSTHROUGH_ONLY
    delete process.env.EASYSESSION_REMOTE_TOKEN
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('restarts local remote service when settings are saved and applied', async () => {
    let running = false
    const startCalls: RemoteRuntimeConfig[] = []
    const fakeGateway = {
      start: vi.fn(async (config?: RemoteRuntimeConfig) => {
        if (config) startCalls.push(config)
        running = !!config?.enabled
        return {
          enabled: !!config?.enabled,
          host: config?.host,
          port: config?.port,
          tokenFingerprint: config ? 'fingerprint' : undefined
        }
      }),
      stop: vi.fn(async () => {
        running = false
      }),
      isRunning: vi.fn(() => running)
    } as unknown as RemoteGatewayServer

    const settingsManager = new RemoteServiceSettingsManager(tempDir)
    const manager = new RemoteServiceManager(
      {
        sessionManager: {} as any,
        projectManager: {} as any,
        outputManager: {} as any
      },
      tempDir,
      fakeGateway,
      settingsManager
    )

    await manager.init()
    const state = await manager.updateSettings({
      enabled: true,
      host: '0.0.0.0',
      port: 18801,
      passthroughOnly: true,
      tokenMode: 'custom',
      customToken: 'z'.repeat(64)
    })

    expect(fakeGateway.stop).toHaveBeenCalledTimes(2)
    expect(fakeGateway.start).toHaveBeenCalledTimes(2)
    expect(startCalls[1].host).toBe('0.0.0.0')
    expect(startCalls[1].port).toBe(18801)
    expect(startCalls[1].tokenSource).toBe('custom')
    expect(startCalls[1].token).toBe('z'.repeat(64))
    expect(state.baseUrl).toBe('http://0.0.0.0:18801')
    expect(state.running).toBe(true)
    expect(state.tokenSource).toBe('custom')
  })
})
