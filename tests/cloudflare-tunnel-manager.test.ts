import { PassThrough } from 'stream'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CloudflareTunnelManager,
  extractQuickTunnelUrl
} from '../src/main/services/cloudflare-tunnel-manager'
import { RemoteNetworkSettingsManager } from '../src/main/services/remote-network-settings-manager'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'easysession-cloudflare-tunnel-'))
}

function createFakeProcess() {
  const stdout = new PassThrough()
  const stderr = new PassThrough()
  const listeners = {
    error: [] as Array<(error: Error) => void>,
    exit: [] as Array<(code: number | null, signal: NodeJS.Signals | null) => void>
  }

  return {
    pid: 43210,
    stdout,
    stderr,
    on(event: 'error' | 'exit', listener: any) {
      listeners[event].push(listener)
      return this
    },
    kill() {
      for (const listener of listeners.exit) {
        listener(0, null)
      }
      return true
    },
    emitError(error: Error) {
      for (const listener of listeners.error) {
        listener(error)
      }
    }
  }
}

describe('CloudflareTunnelManager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('extracts trycloudflare url from cloudflared output', () => {
    expect(
      extractQuickTunnelUrl(
        'INF Requesting new quick Tunnel on trycloudflare.com...\nhttps://gentle-river-abcd.trycloudflare.com\n'
      )
    ).toBe('https://gentle-river-abcd.trycloudflare.com')
  })

  it('starts and stops quick tunnel and captures the public url', async () => {
    const fakeProcess = createFakeProcess()
    const remoteServiceManager = {
      getState: vi.fn(async () => ({
        running: true,
        effectiveEnabled: true,
        port: 18765
      }))
    } as any

    const networkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await networkSettingsManager.init()
    await networkSettingsManager.updateSettings({
      cloudflare: {
        proxyMode: 'off',
        autoFallback: false,
        rememberLastSuccess: false
      }
    })

    const manager = new CloudflareTunnelManager(tempDir, remoteServiceManager, networkSettingsManager, {
      execCommand: vi.fn(async () => 'C:\\Tools\\cloudflared.exe\r\n'),
      spawnProcess: vi.fn(() => fakeProcess as any)
    })
    await manager.init()

    const startPromise = manager.start()
    fakeProcess.stderr.write(
      'INF Thank you for trying Cloudflare Tunnel. https://shiny-breeze-1234.trycloudflare.com\r\n'
    )
    const runningState = await startPromise

    expect(runningState.running).toBe(true)
    expect(runningState.publicUrl).toBe('https://shiny-breeze-1234.trycloudflare.com')
    expect(runningState.localTargetUrl).toBe('http://127.0.0.1:18765')
    expect(runningState.effectiveTransport).toBe('http2')
    expect(runningState.effectiveProxyMode).toBe('off')

    const stoppedState = await manager.stop()
    expect(stoppedState.running).toBe(false)
    expect(stoppedState.publicUrl).toBeNull()
  })

  it('returns a clear error when cloudflared is unavailable', async () => {
    const remoteServiceManager = {
      getState: vi.fn(async () => ({
        running: true,
        effectiveEnabled: true,
        port: 18765
      }))
    } as any

    const networkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await networkSettingsManager.init()

    const manager = new CloudflareTunnelManager(tempDir, remoteServiceManager, networkSettingsManager, {
      execCommand: vi.fn(async () => {
        throw new Error('not found')
      })
    })
    await manager.init()

    await expect(manager.start()).rejects.toThrow(
      '未检测到 cloudflared，请先安装或填写自定义可执行文件路径'
    )
  })

  it('prefers a configured custom binary path when it exists', async () => {
    const customBinaryPath = join(tempDir, 'cloudflared.exe')
    await writeFile(customBinaryPath, 'binary', 'utf-8')

    const remoteServiceManager = {
      getState: vi.fn(async () => ({
        running: true,
        effectiveEnabled: true,
        port: 18765
      }))
    } as any

    const networkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await networkSettingsManager.init()

    const manager = new CloudflareTunnelManager(tempDir, remoteServiceManager, networkSettingsManager, {
      execCommand: vi.fn(async () => {
        throw new Error('should not use system detection')
      })
    })
    await manager.init()
    const state = await manager.updateConfig(customBinaryPath)

    expect(state.available).toBe(true)
    expect(state.effectiveBinaryPath).toBe(customBinaryPath)
    expect(state.pathSource).toBe('custom')
  })

  it('passes protocol=http2 to cloudflared by default auto strategy', async () => {
    const fakeProcess = createFakeProcess()
    const spawnProcess = vi.fn(() => fakeProcess as any)
    const remoteServiceManager = {
      getState: vi.fn(async () => ({
        running: true,
        effectiveEnabled: true,
        port: 18765
      }))
    } as any

    const networkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await networkSettingsManager.init()
    await networkSettingsManager.updateSettings({
      cloudflare: {
        proxyMode: 'off',
        autoFallback: false,
        rememberLastSuccess: false
      }
    })

    const manager = new CloudflareTunnelManager(tempDir, remoteServiceManager, networkSettingsManager, {
      execCommand: vi.fn(async () => 'C:\\Tools\\cloudflared.exe\r\n'),
      spawnProcess
    })
    await manager.init()

    const startPromise = manager.start()
    fakeProcess.stderr.write('https://steady-wind-9876.trycloudflare.com\r\n')
    await startPromise

    expect(spawnProcess).toHaveBeenCalledTimes(1)
    expect(spawnProcess.mock.calls[0]?.[1]).toEqual([
      'tunnel',
      '--protocol',
      'http2',
      '--url',
      'http://127.0.0.1:18765'
    ])
  })

  it('falls back to the next launch strategy after a failed attempt', async () => {
    const firstProcess = createFakeProcess()
    const secondProcess = createFakeProcess()
    const spawnProcess = vi
      .fn()
      .mockImplementationOnce(() => firstProcess as any)
      .mockImplementationOnce(() => secondProcess as any)
    const remoteServiceManager = {
      getState: vi.fn(async () => ({
        running: true,
        effectiveEnabled: true,
        port: 18765
      }))
    } as any

    const networkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await networkSettingsManager.init()
    await networkSettingsManager.updateSettings({
      cloudflare: {
        proxyMode: 'off',
        autoFallback: true,
        rememberLastSuccess: false
      }
    })

    const manager = new CloudflareTunnelManager(tempDir, remoteServiceManager, networkSettingsManager, {
      execCommand: vi.fn(async () => 'C:\\Tools\\cloudflared.exe\r\n'),
      spawnProcess
    })
    await manager.init()

    const startPromise = manager.start()
    await vi.waitFor(
      () => {
        expect(spawnProcess).toHaveBeenCalledTimes(1)
      },
      { timeout: 4000 }
    )
    firstProcess.emitError(new Error('proxy connect timeout'))
    await vi.waitFor(
      () => {
        expect(spawnProcess).toHaveBeenCalledTimes(2)
      },
      { timeout: 4000 }
    )
    secondProcess.stderr.write('https://fallback-branch-4321.trycloudflare.com\r\n')

    const runningState = await startPromise

    expect(spawnProcess).toHaveBeenCalledTimes(2)
    expect(runningState.publicUrl).toBe('https://fallback-branch-4321.trycloudflare.com')
    expect(runningState.effectiveFallbackUsed).toBe(true)
    expect(runningState.effectiveAttemptIndex).toBe(2)
    expect(runningState.lastFailureCategory).toBeNull()
  })

  it('fails early when the local remote service is unavailable and records the category', async () => {
    const remoteServiceManager = {
      getState: vi.fn(async () => ({
        running: false,
        effectiveEnabled: false,
        port: 18765
      }))
    } as any

    const networkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await networkSettingsManager.init()

    const manager = new CloudflareTunnelManager(tempDir, remoteServiceManager, networkSettingsManager, {
      execCommand: vi.fn(async () => 'C:\\Tools\\cloudflared.exe\r\n')
    })
    await manager.init()

    await expect(manager.start()).rejects.toThrow('请先启用并启动本机远程服务')

    const runtimeState = await networkSettingsManager.getState()
    expect(runtimeState.runtime.cloudflare.lastFailureCategory).toBe('local_service')
    expect(runtimeState.runtime.cloudflare.lastFailureReason).toContain('请先启用并启动本机远程服务')
  })

  it('records public_url when cloudflared exits without returning a quick tunnel url', async () => {
    const fakeProcess = createFakeProcess()
    const spawnProcess = vi.fn(() => fakeProcess as any)
    const remoteServiceManager = {
      getState: vi.fn(async () => ({
        running: true,
        effectiveEnabled: true,
        port: 18765
      }))
    } as any

    const networkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await networkSettingsManager.init()
    await networkSettingsManager.updateSettings({
      cloudflare: {
        proxyMode: 'off',
        autoFallback: false,
        rememberLastSuccess: false
      }
    })

    const manager = new CloudflareTunnelManager(tempDir, remoteServiceManager, networkSettingsManager, {
      execCommand: vi.fn(async () => 'C:\\Tools\\cloudflared.exe\r\n'),
      spawnProcess
    })
    await manager.init()

    const startPromise = manager.start()
    await vi.waitFor(
      () => {
        expect(spawnProcess).toHaveBeenCalledTimes(1)
      },
      { timeout: 4000 }
    )
    fakeProcess.kill()

    await expect(startPromise).rejects.toThrow('未返回公网地址')

    const state = await networkSettingsManager.getState()
    expect(state.runtime.cloudflare.lastFailureCategory).toBe('public_url')
    expect(state.runtime.cloudflare.lastFailureReason).toContain('未返回公网地址')
  })
})
