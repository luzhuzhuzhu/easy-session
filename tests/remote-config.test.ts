import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildRemoteBaseUrl, loadRemoteRuntimeConfig } from '../src/main/remote/config'
import { RemoteServiceSettingsManager } from '../src/main/services/remote-service-settings-manager'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'easysession-remote-config-'))
}

function clearRemoteEnv(): void {
  delete process.env.EASYSESSION_REMOTE_ENABLED
  delete process.env.EASYSESSION_REMOTE_HOST
  delete process.env.EASYSESSION_REMOTE_PORT
  delete process.env.EASYSESSION_REMOTE_PASSTHROUGH_ONLY
  delete process.env.EASYSESSION_REMOTE_TOKEN
}

describe('loadRemoteRuntimeConfig', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
    clearRemoteEnv()
  })

  it('builds base urls for wildcard and ipv6 hosts', () => {
    expect(buildRemoteBaseUrl('0.0.0.0', 18765)).toBe('http://0.0.0.0:18765')
    expect(buildRemoteBaseUrl('::', 18765)).toBe('http://[::]:18765')
    expect(buildRemoteBaseUrl('::1', 18765)).toBe('http://[::1]:18765')
    expect(buildRemoteBaseUrl('127.0.0.1', 18765)).toBe('http://127.0.0.1:18765')
  })

  afterEach(async () => {
    clearRemoteEnv()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('uses custom token from local remote service settings when env token is absent', async () => {
    const manager = new RemoteServiceSettingsManager(tempDir)
    await manager.init()
    await manager.updateSettings({
      enabled: true,
      host: '127.0.0.1',
      port: 18765,
      passthroughOnly: true,
      tokenMode: 'custom',
      customToken: 'c'.repeat(64)
    })

    const config = await loadRemoteRuntimeConfig(tempDir, manager.getSnapshot())

    expect(config.tokenSource).toBe('custom')
    expect(config.token).toBe('c'.repeat(64))
    expect(config.enabled).toBe(true)
  })

  it('uses token file in default mode when file exists', async () => {
    const manager = new RemoteServiceSettingsManager(tempDir)
    await manager.init()
    await manager.updateSettings({
      enabled: true,
      host: '127.0.0.1',
      port: 18765,
      passthroughOnly: true,
      tokenMode: 'default',
      customToken: null
    })
    await writeFile(join(tempDir, 'remote-token.txt'), 'f'.repeat(64), 'utf-8')

    const config = await loadRemoteRuntimeConfig(tempDir, manager.getSnapshot())

    expect(config.tokenSource).toBe('file')
    expect(config.token).toBe('f'.repeat(64))
  })

  it('generates and persists a default token when file is missing', async () => {
    const manager = new RemoteServiceSettingsManager(tempDir)
    await manager.init()

    const config = await loadRemoteRuntimeConfig(tempDir, manager.getSnapshot())
    const savedToken = (await readFile(join(tempDir, 'remote-token.txt'), 'utf-8')).trim()

    expect(config.tokenSource).toBe('generated')
    expect(config.token).toHaveLength(64)
    expect(savedToken).toBe(config.token)
  })

  it('keeps env values at highest priority', async () => {
    const manager = new RemoteServiceSettingsManager(tempDir)
    await manager.init()
    await manager.updateSettings({
      enabled: false,
      host: '127.0.0.1',
      port: 18765,
      passthroughOnly: true,
      tokenMode: 'custom',
      customToken: 'l'.repeat(64)
    })

    process.env.EASYSESSION_REMOTE_ENABLED = 'true'
    process.env.EASYSESSION_REMOTE_HOST = '0.0.0.0'
    process.env.EASYSESSION_REMOTE_PORT = '18888'
    process.env.EASYSESSION_REMOTE_PASSTHROUGH_ONLY = 'false'
    process.env.EASYSESSION_REMOTE_TOKEN = 'e'.repeat(64)

    const config = await loadRemoteRuntimeConfig(tempDir, manager.getSnapshot())

    expect(config.enabled).toBe(true)
    expect(config.configuredEnabled).toBe(false)
    expect(config.host).toBe('0.0.0.0')
    expect(config.port).toBe(18888)
    expect(config.passthroughOnly).toBe(false)
    expect(config.tokenSource).toBe('env')
    expect(config.token).toBe('e'.repeat(64))
    expect(config.baseUrl).toBe('http://0.0.0.0:18888')
    expect(config.envOverrides).toEqual({
      enabled: true,
      host: true,
      port: true,
      passthroughOnly: true,
      token: true
    })
  })
})
