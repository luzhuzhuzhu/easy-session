import {
  fingerprintToken,
  getRemoteTokenFilePath,
  loadRemoteRuntimeConfig,
  regenerateDefaultRemoteToken
} from '../remote/config'
import { RemoteGatewayServer } from '../remote'
import type { RemoteDependencies, RemoteRuntimeConfig } from '../remote/types'
import { RemoteServiceSettingsManager } from './remote-service-settings-manager'
import type {
  RemoteServiceSettingsUpdate,
  RemoteServiceState
} from './remote-service-settings-types'

export class RemoteServiceManager {
  private readonly settingsManager: RemoteServiceSettingsManager
  private readonly gateway: RemoteGatewayServer
  private runtimeConfig: RemoteRuntimeConfig | null = null
  private lastError: string | null = null
  private started = false

  constructor(
    _deps: RemoteDependencies,
    private readonly userDataPath: string,
    gateway?: RemoteGatewayServer,
    settingsManager?: RemoteServiceSettingsManager
  ) {
    this.settingsManager = settingsManager ?? new RemoteServiceSettingsManager(userDataPath)
    this.gateway = gateway ?? new RemoteGatewayServer(_deps, userDataPath)
  }

  private async resolveRuntimeConfig(): Promise<RemoteRuntimeConfig> {
    const snapshot = this.settingsManager.getSnapshot()
    const config = await loadRemoteRuntimeConfig(this.userDataPath, snapshot)
    this.runtimeConfig = config
    return config
  }

  private toState(config: RemoteRuntimeConfig): RemoteServiceState {
    const snapshot = this.settingsManager.getSnapshot()
    return {
      configuredEnabled: config.configuredEnabled,
      effectiveEnabled: config.enabled,
      host: config.host,
      port: config.port,
      passthroughOnly: config.passthroughOnly,
      tokenMode: config.tokenMode,
      tokenSource: config.tokenSource,
      tokenFingerprint: fingerprintToken(config.token),
      tokenFilePath: config.tokenFilePath,
      baseUrl: config.baseUrl,
      running: this.gateway.isRunning(),
      lastError: this.lastError,
      customTokenConfigured: snapshot.tokenMode === 'custom' && !!snapshot.customToken,
      envOverrides: { ...config.envOverrides }
    }
  }

  private async applyRuntime(): Promise<RemoteServiceState> {
    const config = await this.resolveRuntimeConfig()
    await this.gateway.stop()
    this.lastError = null
    try {
      await this.gateway.start(config)
    } catch (err) {
      this.lastError = formatRemoteServiceStartError(err, config)
      console.warn('[remote] local service start failed:', this.lastError)
    }
    return this.toState(config)
  }

  async init(): Promise<RemoteServiceState> {
    await this.settingsManager.init()
    this.started = true
    return this.applyRuntime()
  }

  async getState(): Promise<RemoteServiceState> {
    if (!this.started) {
      return this.init()
    }
    const config = await this.resolveRuntimeConfig()
    return this.toState(config)
  }

  async updateSettings(updates: RemoteServiceSettingsUpdate): Promise<RemoteServiceState> {
    await this.settingsManager.updateSettings(updates)
    return this.applyRuntime()
  }

  async getEffectiveToken(): Promise<string> {
    const config = await this.resolveRuntimeConfig()
    return config.token
  }

  async regenerateDefaultToken(): Promise<RemoteServiceState> {
    await regenerateDefaultRemoteToken(this.userDataPath)
    return this.applyRuntime()
  }

  getTokenFilePath(): string {
    return getRemoteTokenFilePath(this.userDataPath)
  }

  getBaseUrl(): string | null {
    if (!this.runtimeConfig) return null
    return this.runtimeConfig.baseUrl
  }

  async stop(): Promise<void> {
    await this.gateway.stop()
  }

  async flush(): Promise<void> {
    await this.settingsManager.flush()
  }
}

function formatRemoteServiceStartError(error: unknown, config: RemoteRuntimeConfig): string {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : ''
  if (code === 'EADDRINUSE') {
    return `端口 ${config.port} 已被占用，本机远程服务未启动。请关闭占用该端口的旧 EasySession/服务进程，或在设置中改用其他端口。`
  }
  if (code === 'EACCES') {
    return `没有权限监听 ${config.host}:${config.port}，本机远程服务未启动。请换用普通端口或检查系统权限。`
  }
  return error instanceof Error ? error.message : String(error)
}
