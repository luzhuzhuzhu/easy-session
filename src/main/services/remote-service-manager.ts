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
      customTokenConfigured: snapshot.tokenMode === 'custom' && !!snapshot.customToken,
      envOverrides: { ...config.envOverrides }
    }
  }

  private async applyRuntime(): Promise<RemoteServiceState> {
    const config = await this.resolveRuntimeConfig()
    await this.gateway.stop()
    await this.gateway.start(config)
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
