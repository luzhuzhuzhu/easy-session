import { copyFile, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RemoteServiceSettingsManager } from '../src/main/services/remote-service-settings-manager'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'easysession-remote-service-'))
}

describe('RemoteServiceSettingsManager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('stores local remote service config and custom token in separate files', async () => {
    const manager = new RemoteServiceSettingsManager(tempDir)
    await manager.init()

    await manager.updateSettings({
      enabled: true,
      host: '0.0.0.0',
      port: 19001,
      passthroughOnly: true,
      tokenMode: 'custom',
      customToken: 'x'.repeat(64)
    })
    await manager.flush()

    const configRaw = await readFile(join(tempDir, 'remote-service-config.json'), 'utf-8')
    const secretRaw = await readFile(join(tempDir, 'remote-service-secrets.json'), 'utf-8')
    const config = JSON.parse(configRaw) as Record<string, unknown>
    const secret = JSON.parse(secretRaw) as Record<string, unknown>

    expect(config).toEqual({
      enabled: true,
      host: '0.0.0.0',
      port: 19001,
      passthroughOnly: true,
      tokenMode: 'custom'
    })
    expect(config).not.toHaveProperty('customToken')
    expect(secret).toEqual({
      customToken: 'x'.repeat(64)
    })
  })

  it('restores config and secret from backup when primary files are corrupted', async () => {
    const manager = new RemoteServiceSettingsManager(tempDir)
    await manager.init()
    await manager.updateSettings({
      enabled: true,
      host: '127.0.0.1',
      port: 18765,
      passthroughOnly: true,
      tokenMode: 'custom',
      customToken: 'y'.repeat(64)
    })
    await manager.flush()

    const configPath = join(tempDir, 'remote-service-config.json')
    const secretPath = join(tempDir, 'remote-service-secrets.json')
    await copyFile(configPath, `${configPath}.bak`)
    await copyFile(secretPath, `${secretPath}.bak`)
    await writeFile(configPath, '{"broken": ]', 'utf-8')
    await writeFile(secretPath, '{"broken": ]', 'utf-8')

    const restored = new RemoteServiceSettingsManager(tempDir)
    await restored.init()

    expect(restored.getSnapshot()).toMatchObject({
      enabled: true,
      host: '127.0.0.1',
      port: 18765,
      passthroughOnly: true,
      tokenMode: 'custom',
      customToken: 'y'.repeat(64)
    })
  })

  it('rejects custom token mode when token is missing or too short', async () => {
    const manager = new RemoteServiceSettingsManager(tempDir)
    await manager.init()

    await expect(
      manager.updateSettings({
        enabled: true,
        host: '127.0.0.1',
        port: 18765,
        passthroughOnly: true,
        tokenMode: 'custom',
        customToken: 'short'
      })
    ).rejects.toThrow('自定义 token 模式下必须提供至少 64 位的 token')
  })
})
