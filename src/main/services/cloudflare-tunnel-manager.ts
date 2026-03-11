import { exec, spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { DataStore } from './data-store'
import { CLOUDFLARE_TUNNEL_CONFIG_FILE } from '../remote/defaults'
import type { CloudflareTunnelConfigRecord, CloudflareTunnelState } from './cloudflare-tunnel-types'
import { RemoteServiceManager } from './remote-service-manager'
import { RemoteNetworkSettingsManager } from './remote-network-settings-manager'
import type {
  CloudflareFailureCategory,
  CloudflareLaunchStrategy
} from './remote-network-settings-types'

const DEFAULT_CONFIG: CloudflareTunnelConfigRecord = {
  binaryPath: null
}

interface ChildProcessLike {
  pid?: number
  stdout: NodeJS.ReadableStream
  stderr: NodeJS.ReadableStream
  on(event: 'error', listener: (error: Error) => void): this
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this
  kill(signal?: NodeJS.Signals | number): boolean
}

interface CloudflareTunnelManagerOptions {
  execCommand?: (command: string) => Promise<string>
  spawnProcess?: (
    command: string,
    args: string[],
    options: { windowsHide: boolean; stdio: 'pipe'; env?: Record<string, string> }
  ) => ChildProcessLike
}

function normalizeBinaryPath(rawPath: unknown): string | null {
  if (typeof rawPath !== 'string') return null
  const value = rawPath.trim()
  return value ? value : null
}

function normalizeConfig(rawConfig: unknown): CloudflareTunnelConfigRecord {
  if (!rawConfig || typeof rawConfig !== 'object') {
    return { ...DEFAULT_CONFIG }
  }
  const config = rawConfig as Partial<CloudflareTunnelConfigRecord>
  return {
    binaryPath: normalizeBinaryPath(config.binaryPath)
  }
}

function execCommand(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { windowsHide: true }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(stdout)
    })
  })
}

function redactProxyUrl(rawValue: string | null): string | null {
  if (!rawValue) return null
  try {
    const parsed = new URL(rawValue)
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? '***' : ''
      parsed.password = parsed.password ? '***' : ''
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return rawValue
  }
}

function classifyCloudflareFailure(message: string): CloudflareFailureCategory {
  const normalized = message.toLowerCase()
  if (normalized.includes('本机远程服务')) return 'local_service'
  if (normalized.includes('public url') || normalized.includes('公网地址')) {
    return 'public_url'
  }
  if (
    normalized.includes('proxyconnect') ||
    normalized.includes('proxy') ||
    normalized.includes('407') ||
    normalized.includes('connection refused')
  ) {
    return 'proxy'
  }
  if (normalized.includes('api.trycloudflare.com') || normalized.includes('trycloudflare.com')) {
    return 'cloudflare_api'
  }
  if (normalized.includes('timed out') || normalized.includes('启动超时') || normalized.includes('timeout')) {
    return 'timeout'
  }
  if (normalized.includes('quic') || normalized.includes('http2') || normalized.includes('protocol')) {
    return 'protocol'
  }
  if (normalized.includes('已退出') || normalized.includes('exit')) {
    return 'process_exit'
  }
  return 'unknown'
}

export function extractQuickTunnelUrl(output: string): string | null {
  const matched = output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)
  return matched ? matched[0] : null
}

export class CloudflareTunnelManager {
  private readonly configStore: DataStore<CloudflareTunnelConfigRecord>
  private readonly execCommandFn: (command: string) => Promise<string>
  private readonly spawnProcessFn: (
    command: string,
    args: string[],
    options: { windowsHide: boolean; stdio: 'pipe'; env?: Record<string, string> }
  ) => ChildProcessLike
  private config: CloudflareTunnelConfigRecord = { ...DEFAULT_CONFIG }
  private process: ChildProcessLike | null = null
  private effectiveBinaryPath: string | null = null
  private pathSource: CloudflareTunnelState['pathSource'] = 'missing'
  private publicUrl: string | null = null
  private localTargetUrl: string | null = null
  private lastError: string | null = null
  private lastOutput: string | null = null
  private effectiveTransport: CloudflareTunnelState['effectiveTransport'] = null
  private effectiveProxyMode: CloudflareTunnelState['effectiveProxyMode'] = null
  private effectiveProxyUrl: string | null = null
  private effectiveFallbackUsed = false
  private effectiveAttemptIndex: number | null = null

  constructor(
    userDataPath: string,
    private readonly remoteServiceManager: RemoteServiceManager,
    private readonly remoteNetworkSettingsManager: RemoteNetworkSettingsManager,
    options?: CloudflareTunnelManagerOptions
  ) {
    this.configStore = new DataStore<CloudflareTunnelConfigRecord>(
      join(userDataPath, CLOUDFLARE_TUNNEL_CONFIG_FILE)
    )
    this.execCommandFn = options?.execCommand ?? execCommand
    this.spawnProcessFn =
      options?.spawnProcess ??
      ((command, args, spawnOptions) =>
        spawn(command, args, spawnOptions) as unknown as ChildProcessWithoutNullStreams)
  }

  private async resolveExecutablePath(): Promise<{
    effectiveBinaryPath: string | null
    pathSource: CloudflareTunnelState['pathSource']
  }> {
    const customPath = normalizeBinaryPath(this.config.binaryPath)
    if (customPath) {
      if (existsSync(customPath)) {
        return {
          effectiveBinaryPath: customPath,
          pathSource: 'custom'
        }
      }
      return {
        effectiveBinaryPath: null,
        pathSource: 'missing'
      }
    }

    try {
      const command = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared'
      const stdout = await this.execCommandFn(command)
      const candidate = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean)

      return {
        effectiveBinaryPath: candidate || null,
        pathSource: candidate ? 'system' : 'missing'
      }
    } catch {
      return {
        effectiveBinaryPath: null,
        pathSource: 'missing'
      }
    }
  }

  private async refreshExecutablePath(): Promise<void> {
    const resolved = await this.resolveExecutablePath()
    this.effectiveBinaryPath = resolved.effectiveBinaryPath
    this.pathSource = resolved.pathSource
  }

  private async persist(): Promise<void> {
    await this.configStore.save({ ...this.config })
  }

  private getStateSnapshot(): CloudflareTunnelState {
    const snapshot = this.remoteNetworkSettingsManager.getSnapshot()
    return {
      binaryPath: this.config.binaryPath,
      effectiveBinaryPath: this.effectiveBinaryPath,
      pathSource: this.pathSource,
      available: !!this.effectiveBinaryPath,
      running: !!this.process,
      publicUrl: this.publicUrl,
      localTargetUrl: this.localTargetUrl,
      pid: this.process?.pid ?? null,
      lastError: this.lastError,
      lastOutput: this.lastOutput,
      transportMode: snapshot.config.cloudflare.transportMode,
      proxyMode: snapshot.config.cloudflare.proxyMode,
      customProxyUrl: snapshot.config.cloudflare.customProxyUrl,
      rememberLastSuccess: snapshot.config.cloudflare.rememberLastSuccess,
      autoFallback: snapshot.config.cloudflare.autoFallback,
      effectiveTransport: this.effectiveTransport,
      effectiveProxyMode: this.effectiveProxyMode,
      effectiveProxyUrl: this.effectiveProxyUrl,
      effectiveFallbackUsed: this.effectiveFallbackUsed,
      effectiveAttemptIndex: this.effectiveAttemptIndex,
      lastSuccessfulTransport: snapshot.runtime.cloudflare.lastSuccessfulTransport,
      lastSuccessfulProxyMode: snapshot.runtime.cloudflare.lastSuccessfulProxyMode,
      lastSuccessfulProxyUrl: snapshot.runtime.cloudflare.lastSuccessfulProxyUrl,
      lastFailureCategory: snapshot.runtime.cloudflare.lastFailureCategory
    }
  }

  private clearRuntimeState(): void {
    this.process = null
    this.publicUrl = null
    this.effectiveTransport = null
    this.effectiveProxyMode = null
    this.effectiveProxyUrl = null
    this.effectiveFallbackUsed = false
    this.effectiveAttemptIndex = null
  }

  private async getLocalTargetUrl(): Promise<string> {
    const state = await this.remoteServiceManager.getState()
    if (!state.running || !state.effectiveEnabled) {
      throw new Error('请先启用并启动本机远程服务，再开启 Cloudflare Quick Tunnel')
    }
    return `http://127.0.0.1:${state.port}`
  }

  private async runLaunchAttempt(
    strategy: CloudflareLaunchStrategy,
    localTargetUrl: string,
    attemptIndex: number
  ): Promise<CloudflareTunnelState> {
    if (!this.effectiveBinaryPath) {
      throw new Error('未检测到 cloudflared，请先安装或填写自定义可执行文件路径')
    }

    const args = ['tunnel', '--protocol', strategy.transport, '--url', localTargetUrl]
    this.lastOutput = null
    this.lastError = null
    this.publicUrl = null
    this.effectiveTransport = strategy.transport
    this.effectiveProxyMode = strategy.proxyMode
    this.effectiveProxyUrl = strategy.proxyUrl
    this.effectiveFallbackUsed = attemptIndex > 0
    this.effectiveAttemptIndex = attemptIndex + 1

    console.info(
      `[cloudflare-tunnel] 启动尝试 #${attemptIndex + 1}: protocol=${strategy.transport}, proxyMode=${strategy.proxyMode}, proxyUrl=${redactProxyUrl(strategy.proxyUrl) ?? '-'}`
    )

    return new Promise<CloudflareTunnelState>((resolve, reject) => {
      const processRef = this.spawnProcessFn(this.effectiveBinaryPath!, args, {
        windowsHide: true,
        stdio: 'pipe',
        env: strategy.env
      })
      this.process = processRef

      let resolved = false
      let connected = false

      const fail = (message: string) => {
        this.lastError = message
        if (!resolved) {
          resolved = true
          reject(new Error(message))
        }
      }

      const succeed = () => {
        connected = true
        if (resolved) return
        resolved = true
        resolve(this.getStateSnapshot())
      }

      const timer = setTimeout(() => {
        const message = `Cloudflare Quick Tunnel 启动超时（protocol=${strategy.transport}, proxy=${strategy.proxyMode}）`
        processRef.kill()
        fail(message)
      }, 15_000)

      const cleanupTimer = () => clearTimeout(timer)

      const handleChunk = (chunk: Buffer | string) => {
        const text = String(chunk)
        this.lastOutput = text.trim() || this.lastOutput
        const publicUrl = extractQuickTunnelUrl(text)
        if (publicUrl) {
          this.publicUrl = publicUrl
          cleanupTimer()
          console.info(
            `[cloudflare-tunnel] 启动成功: protocol=${strategy.transport}, proxyMode=${strategy.proxyMode}, publicUrl=${publicUrl}`
          )
          succeed()
        }
      }

      processRef.stdout.on('data', handleChunk)
      processRef.stderr.on('data', handleChunk)
      processRef.on('error', (error) => {
        cleanupTimer()
        this.clearRuntimeState()
        fail(error.message)
      })
      processRef.on('exit', (code, signal) => {
        cleanupTimer()
        const details = signal ? `signal=${signal}` : `code=${code ?? 'unknown'}`
        if (connected) {
          this.process = null
          this.publicUrl = null
          if (!this.lastError) {
            this.lastError = `Cloudflare Tunnel 已停止（${details}）`
          }
          this.effectiveTransport = null
          this.effectiveProxyMode = null
          this.effectiveProxyUrl = null
          this.effectiveFallbackUsed = false
          this.effectiveAttemptIndex = null
          return
        }

        this.clearRuntimeState()
        fail(`Cloudflare Tunnel 未返回公网地址并已退出（${details}）`)
      })
    })
  }

  async init(): Promise<void> {
    const loaded = await this.configStore.load()
    this.config = normalizeConfig(loaded.data)
    await this.refreshExecutablePath()
    if (loaded.restoredFromBackup || JSON.stringify(loaded.data ?? null) !== JSON.stringify(this.config)) {
      await this.persist()
    }
  }

  async getState(): Promise<CloudflareTunnelState> {
    await this.refreshExecutablePath()
    this.localTargetUrl = await this.getLocalTargetUrl().catch(() => null)
    return this.getStateSnapshot()
  }

  async updateConfig(binaryPath: string | null): Promise<CloudflareTunnelState> {
    this.config = {
      binaryPath: normalizeBinaryPath(binaryPath)
    }
    await this.persist()
    await this.refreshExecutablePath()
    return this.getState()
  }

  async start(): Promise<CloudflareTunnelState> {
    if (this.process) {
      return this.getState()
    }

    await this.refreshExecutablePath()
    if (!this.effectiveBinaryPath) {
      throw new Error('未检测到 cloudflared，请先安装或填写自定义可执行文件路径')
    }

    let localTargetUrl: string
    try {
      localTargetUrl = await this.getLocalTargetUrl()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await this.remoteNetworkSettingsManager.recordCloudflareFailure(message, 'local_service')
      throw error
    }
    this.localTargetUrl = localTargetUrl

    const baseEnv = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>
    const strategies = await this.remoteNetworkSettingsManager.buildCloudflareLaunchStrategies(baseEnv)

    let lastFailure: Error | null = null
    for (const [attemptIndex, strategy] of strategies.entries()) {
      try {
        await this.runLaunchAttempt(strategy, localTargetUrl, attemptIndex)
        await this.remoteNetworkSettingsManager.recordCloudflareSuccess({
          transport: strategy.transport,
          proxyMode: strategy.proxyMode,
          proxyUrl: strategy.proxyUrl
        })
        return this.getStateSnapshot()
      } catch (error) {
        lastFailure = error instanceof Error ? error : new Error(String(error))
        const category = classifyCloudflareFailure(lastFailure.message)
        console.warn(
          `[cloudflare-tunnel] 启动失败 #${attemptIndex + 1}: category=${category}, protocol=${strategy.transport}, proxyMode=${strategy.proxyMode}, proxyUrl=${redactProxyUrl(strategy.proxyUrl) ?? '-'}, reason=${lastFailure.message}`
        )
        await this.remoteNetworkSettingsManager.recordCloudflareFailure(lastFailure.message, category)
      }
    }

    throw lastFailure ?? new Error('Cloudflare Quick Tunnel 启动失败')
  }

  async stop(): Promise<CloudflareTunnelState> {
    const current = this.process
    if (!current) {
      return this.getState()
    }
    current.kill()
    this.clearRuntimeState()
    return this.getState()
  }

  async flush(): Promise<void> {
    await this.configStore.flush()
  }
}
