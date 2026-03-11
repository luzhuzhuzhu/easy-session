import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { RemoteNetworkSettingsManager } from '../src/main/services/remote-network-settings-manager'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'easysession-remote-network-'))
}

describe('RemoteNetworkSettingsManager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads defaults when settings files do not exist', async () => {
    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    const snapshot = manager.getSnapshot()
    expect(snapshot.config.cloudflare.transportMode).toBe('auto')
    expect(snapshot.config.cloudflare.proxyMode).toBe('auto')
    expect(snapshot.config.cli.proxyMode).toBe('auto')
    expect(snapshot.runtime.cloudflare.lastSuccessfulTransport).toBeNull()
    expect(snapshot.runtime.cli.lastFailureCategory).toBeNull()
    expect(snapshot.runtime.cli.lastFailureCli).toBeNull()
  })

  it('normalizes corrupted settings shape to defaults', async () => {
    await writeFile(
      join(tempDir, 'remote-network-settings.json'),
      JSON.stringify({
        cloudflare: {
          transportMode: 'broken',
          proxyMode: 'custom',
          customProxyUrl: 'not-a-url'
        },
        cli: {
          proxyMode: 'inherit',
          enableNoProxyLocalhost: 'bad'
        }
      }),
      'utf-8'
    )

    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    const snapshot = manager.getSnapshot()
    expect(snapshot.config.cloudflare.transportMode).toBe('auto')
    expect(snapshot.config.cloudflare.proxyMode).toBe('custom')
    expect(snapshot.config.cloudflare.customProxyUrl).toBeNull()
    expect(snapshot.config.cli.proxyMode).toBe('inherit')
    expect(snapshot.config.cli.enableNoProxyLocalhost).toBe(true)
  })

  it('injects inherited NO_PROXY for cli auto mode when process env has proxy', async () => {
    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    const { env, state } = manager.buildCliEnvironment({
      HTTP_PROXY: 'http://127.0.0.1:7897'
    })

    expect(state.proxyMode).toBe('inherit')
    expect(state.proxyUrl).toBe('http://127.0.0.1:7897')
    expect(env.HTTP_PROXY).toBe('http://127.0.0.1:7897')
    expect(env.NO_PROXY).toContain('127.0.0.1')
    expect(env.no_proxy).toContain('localhost')
  })

  it('rejects custom proxy mode without a valid proxy url', async () => {
    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    await expect(
      manager.updateSettings({
        cloudflare: {
          proxyMode: 'custom',
          customProxyUrl: null
        }
      })
    ).rejects.toThrow('Cloudflare 自定义代理模式下必须提供有效的代理地址')
  })

  it('exposes recommended cloudflare strategy and resolved cli proxy state', async () => {
    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    const state = await manager.getState({
      HTTP_PROXY: 'http://127.0.0.1:7897'
    })

    expect(state.cloudflareRecommended).toMatchObject({
      transport: 'http2',
      proxyMode: 'inherit',
      proxyUrl: 'http://127.0.0.1:7897'
    })
    expect(state.cliResolved).toEqual({
      proxyMode: 'inherit',
      proxyUrl: 'http://127.0.0.1:7897'
    })
  })

  it('supports custom and off cli proxy modes', async () => {
    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    await manager.updateSettings({
      cli: {
        proxyMode: 'custom',
        customProxyUrl: 'socks5://127.0.0.1:7898',
        enableNoProxyLocalhost: true
      }
    })

    const customResult = manager.buildCliEnvironment({})
    expect(customResult.state).toEqual({
      proxyMode: 'custom',
      proxyUrl: 'socks5://127.0.0.1:7898'
    })
    expect(customResult.env.ALL_PROXY).toBe('socks5://127.0.0.1:7898')
    expect(customResult.env.NO_PROXY).toContain('localhost')

    await manager.updateSettings({
      cli: {
        proxyMode: 'off',
        customProxyUrl: null,
        enableNoProxyLocalhost: true
      }
    })

    const offResult = manager.buildCliEnvironment({
      HTTP_PROXY: 'http://127.0.0.1:7897'
    })
    expect(offResult.state).toEqual({
      proxyMode: 'off',
      proxyUrl: null
    })
    expect(offResult.env.HTTP_PROXY).toBeUndefined()
    expect(offResult.env.NO_PROXY).toContain('127.0.0.1')
  })

  it('prefers the last successful cloudflare transport when rememberLastSuccess is enabled', async () => {
    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    await manager.recordCloudflareSuccess({
      transport: 'quic',
      proxyMode: 'inherit',
      proxyUrl: 'http://127.0.0.1:7897'
    })

    const state = await manager.getState({
      HTTP_PROXY: 'http://127.0.0.1:7897'
    })

    expect(state.cloudflareRecommended).toMatchObject({
      transport: 'quic',
      proxyMode: 'inherit',
      proxyUrl: 'http://127.0.0.1:7897'
    })
    expect(state.runtime.cloudflare.lastSuccessfulTransport).toBe('quic')
  })

  it('normalizes legacy runtime files without cli state', async () => {
    await writeFile(
      join(tempDir, 'remote-network-runtime.json'),
      JSON.stringify({
        cloudflare: {
          lastSuccessfulTransport: 'http2',
          lastSuccessfulProxyMode: 'inherit',
          lastSuccessfulProxyUrl: 'http://127.0.0.1:7897',
          lastFailureReason: null,
          lastFailureCategory: null
        }
      }),
      'utf-8'
    )

    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    const snapshot = manager.getSnapshot()
    expect(snapshot.runtime.cloudflare.lastSuccessfulTransport).toBe('http2')
    expect(snapshot.runtime.cli).toEqual({
      lastFailureReason: null,
      lastFailureCategory: null,
      lastFailureCli: null
    })
  })

  it('classifies and records cli timeout failures', async () => {
    const manager = new RemoteNetworkSettingsManager(tempDir)
    await manager.init()

    const analysis = manager.analyzeCliFailure(
      'Stream disconnected before completion: 由于连接方在一段时间后没有正确答复或连接的主机没有反应，连接尝试失败。 (os error 10060)'
    )

    expect(analysis).toMatchObject({
      matched: true,
      category: 'upstream_timeout'
    })

    await manager.recordCliFailure('codex', analysis.reason ?? 'fallback', analysis.category ?? 'unknown')
    const snapshot = manager.getSnapshot()
    expect(snapshot.runtime.cli.lastFailureCli).toBe('codex')
    expect(snapshot.runtime.cli.lastFailureCategory).toBe('upstream_timeout')
    expect(snapshot.runtime.cli.lastFailureReason).toContain('上游请求超时')
  })
})
