import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let lastPty: {
  emitData: (data: string) => void
  emitExit: (code: number) => void
} | null = null

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const dataListeners: Array<(data: string) => void> = []
    const exitListeners: Array<(event: { exitCode: number }) => void> = []
    const ptyInstance = {
      pid: 4321,
      onData(listener: (data: string) => void) {
        dataListeners.push(listener)
      },
      onExit(listener: (event: { exitCode: number }) => void) {
        exitListeners.push(listener)
      },
      write: vi.fn(),
      kill: vi.fn(),
      resize: vi.fn(),
      emitData(data: string) {
        for (const listener of dataListeners) {
          listener(data)
        }
      },
      emitExit(code: number) {
        for (const listener of exitListeners) {
          listener({ exitCode: code })
        }
      }
    }
    lastPty = ptyInstance
    return ptyInstance
  })
}))

import { CliManager } from '../src/main/services/cli-manager'
import { RemoteNetworkSettingsManager } from '../src/main/services/remote-network-settings-manager'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'easysession-cli-network-'))
}

describe('CliManager remote network diagnostics', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
    lastPty = null
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('records CLI timeout-style network failures from process output', async () => {
    const remoteNetworkSettingsManager = new RemoteNetworkSettingsManager(tempDir)
    await remoteNetworkSettingsManager.init()

    const cliManager = new CliManager()
    cliManager.setRemoteNetworkSettingsManager(remoteNetworkSettingsManager)

    cliManager.spawn('codex-1', 'codex', [], { cwd: tempDir })
    expect(lastPty).not.toBeNull()

    lastPty!.emitData(
      'Stream disconnected before completion: 由于连接方在一段时间后没有正确答复或连接的主机没有反应，连接尝试失败。 (os error 10060)'
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    const state = await remoteNetworkSettingsManager.getState()
    expect(state.runtime.cli.lastFailureCli).toBe('codex')
    expect(state.runtime.cli.lastFailureCategory).toBe('upstream_timeout')
    expect(state.runtime.cli.lastFailureReason).toContain('上游请求超时')
  })
})
