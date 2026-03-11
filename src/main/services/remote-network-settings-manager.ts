import { join } from 'path'
import * as net from 'net'
import { DataStore } from './data-store'
import {
  REMOTE_NETWORK_RUNTIME_FILE,
  REMOTE_NETWORK_SETTINGS_FILE
} from '../remote/defaults'
import type {
  CliFailureAnalysis,
  CliFailureCategory,
  CliNetworkStrategyConfig,
  CliResolvedProxyState,
  CloudflareFailureCategory,
  CloudflareLaunchStrategy,
  CloudflareLaunchStrategyPreview,
  CloudflareNetworkStrategyConfig,
  DetectedProxyState,
  ProxyMode,
  RemoteNetworkRuntimeRecord,
  RemoteNetworkSettingsRecord,
  RemoteNetworkSettingsSnapshot,
  RemoteNetworkSettingsState,
  RemoteNetworkSettingsUpdate,
  ResolvedProxyMode,
  TunnelResolvedTransport
} from './remote-network-settings-types'
import type { CliType } from './types'

const DEFAULT_CLOUDFLARE_CONFIG: CloudflareNetworkStrategyConfig = {
  transportMode: 'auto',
  proxyMode: 'auto',
  customProxyUrl: null,
  rememberLastSuccess: true,
  autoFallback: true
}

const DEFAULT_CLI_CONFIG: CliNetworkStrategyConfig = {
  proxyMode: 'auto',
  customProxyUrl: null,
  enableNoProxyLocalhost: true
}

const DEFAULT_SETTINGS: RemoteNetworkSettingsRecord = {
  cloudflare: { ...DEFAULT_CLOUDFLARE_CONFIG },
  cli: { ...DEFAULT_CLI_CONFIG }
}

const DEFAULT_RUNTIME: RemoteNetworkRuntimeRecord = {
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
}

const DEFAULT_DETECTED: DetectedProxyState = {
  httpProxyUrl: null,
  socksProxyUrl: null,
  inheritedProxyUrl: null,
  updatedAt: null
}

const COMMON_HTTP_PROXY_PORTS = [7897, 7890, 7899]
const COMMON_SOCKS_PROXY_PORTS = [7898, 7891]

function normalizeProxyUrl(rawValue: unknown): string | null {
  if (typeof rawValue !== 'string') return null
  const value = rawValue.trim()
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (!parsed.protocol || !parsed.hostname) return null
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}

function normalizeProxyMode(rawValue: unknown): ProxyMode {
  return rawValue === 'off' || rawValue === 'inherit' || rawValue === 'custom'
    ? rawValue
    : 'auto'
}

function normalizeTransportMode(rawValue: unknown): 'auto' | TunnelResolvedTransport {
  return rawValue === 'http2' || rawValue === 'quic' ? rawValue : 'auto'
}

function normalizeCloudflareConfig(rawValue: unknown): CloudflareNetworkStrategyConfig {
  if (!rawValue || typeof rawValue !== 'object') {
    return { ...DEFAULT_CLOUDFLARE_CONFIG }
  }

  const record = rawValue as Partial<CloudflareNetworkStrategyConfig>
  return {
    transportMode: normalizeTransportMode(record.transportMode),
    proxyMode: normalizeProxyMode(record.proxyMode),
    customProxyUrl: normalizeProxyUrl(record.customProxyUrl),
    rememberLastSuccess:
      typeof record.rememberLastSuccess === 'boolean'
        ? record.rememberLastSuccess
        : DEFAULT_CLOUDFLARE_CONFIG.rememberLastSuccess,
    autoFallback:
      typeof record.autoFallback === 'boolean'
        ? record.autoFallback
        : DEFAULT_CLOUDFLARE_CONFIG.autoFallback
  }
}

function normalizeCliConfig(rawValue: unknown): CliNetworkStrategyConfig {
  if (!rawValue || typeof rawValue !== 'object') {
    return { ...DEFAULT_CLI_CONFIG }
  }

  const record = rawValue as Partial<CliNetworkStrategyConfig>
  return {
    proxyMode: normalizeProxyMode(record.proxyMode),
    customProxyUrl: normalizeProxyUrl(record.customProxyUrl),
    enableNoProxyLocalhost:
      typeof record.enableNoProxyLocalhost === 'boolean'
        ? record.enableNoProxyLocalhost
        : DEFAULT_CLI_CONFIG.enableNoProxyLocalhost
  }
}

function normalizeSettings(rawValue: unknown): RemoteNetworkSettingsRecord {
  if (!rawValue || typeof rawValue !== 'object') {
    return {
      cloudflare: { ...DEFAULT_CLOUDFLARE_CONFIG },
      cli: { ...DEFAULT_CLI_CONFIG }
    }
  }

  const record = rawValue as Partial<RemoteNetworkSettingsRecord>
  return {
    cloudflare: normalizeCloudflareConfig(record.cloudflare),
    cli: normalizeCliConfig(record.cli)
  }
}

function normalizeRuntime(rawValue: unknown): RemoteNetworkRuntimeRecord {
  if (!rawValue || typeof rawValue !== 'object') {
    return {
      cloudflare: { ...DEFAULT_RUNTIME.cloudflare },
      cli: { ...DEFAULT_RUNTIME.cli }
    }
  }

  const record = rawValue as Partial<RemoteNetworkRuntimeRecord>
  const cloudflare = record.cloudflare
  const cli = record.cli

  return {
    cloudflare: {
      lastSuccessfulTransport:
        cloudflare?.lastSuccessfulTransport === 'http2' ||
        cloudflare?.lastSuccessfulTransport === 'quic'
          ? cloudflare.lastSuccessfulTransport
          : null,
      lastSuccessfulProxyMode:
        cloudflare?.lastSuccessfulProxyMode === 'off' ||
        cloudflare?.lastSuccessfulProxyMode === 'inherit' ||
        cloudflare?.lastSuccessfulProxyMode === 'custom'
          ? cloudflare.lastSuccessfulProxyMode
          : null,
      lastSuccessfulProxyUrl: normalizeProxyUrl(cloudflare?.lastSuccessfulProxyUrl),
      lastFailureReason:
        typeof cloudflare?.lastFailureReason === 'string' && cloudflare.lastFailureReason.trim()
          ? cloudflare.lastFailureReason.trim()
          : null,
      lastFailureCategory:
        cloudflare?.lastFailureCategory === 'protocol' ||
        cloudflare?.lastFailureCategory === 'proxy' ||
        cloudflare?.lastFailureCategory === 'timeout' ||
        cloudflare?.lastFailureCategory === 'public_url' ||
        cloudflare?.lastFailureCategory === 'local_service' ||
        cloudflare?.lastFailureCategory === 'cloudflare_api' ||
        cloudflare?.lastFailureCategory === 'process_exit' ||
        cloudflare?.lastFailureCategory === 'unknown'
          ? cloudflare.lastFailureCategory
          : null
    },
    cli: {
      lastFailureReason:
        typeof cli?.lastFailureReason === 'string' && cli.lastFailureReason.trim()
          ? cli.lastFailureReason.trim()
          : null,
      lastFailureCategory:
        cli?.lastFailureCategory === 'proxy_unavailable' ||
        cli?.lastFailureCategory === 'upstream_timeout' ||
        cli?.lastFailureCategory === 'strategy_mismatch' ||
        cli?.lastFailureCategory === 'unknown'
          ? cli.lastFailureCategory
          : null,
      lastFailureCli:
        cli?.lastFailureCli === 'claude' ||
        cli?.lastFailureCli === 'codex' ||
        cli?.lastFailureCli === 'opencode'
          ? cli.lastFailureCli
          : null
    }
  }
}

function getInheritedProxyUrl(baseEnv: Record<string, string>): string | null {
  const candidates = [
    baseEnv.HTTPS_PROXY,
    baseEnv.https_proxy,
    baseEnv.HTTP_PROXY,
    baseEnv.http_proxy,
    baseEnv.ALL_PROXY,
    baseEnv.all_proxy
  ]
  for (const candidate of candidates) {
    const normalized = normalizeProxyUrl(candidate)
    if (normalized) return normalized
  }
  return null
}

function applyProxyEnvironment(
  baseEnv: Record<string, string>,
  proxyMode: ResolvedProxyMode,
  options: {
    proxyUrl?: string | null
    httpProxyUrl?: string | null
    socksProxyUrl?: string | null
    enableNoProxyLocalhost?: boolean
  } = {}
): Record<string, string> {
  const inheritedEnv = { ...baseEnv }
  const env = { ...baseEnv }

  if (proxyMode === 'inherit') {
    if (options.enableNoProxyLocalhost) {
      inheritedEnv.NO_PROXY = mergeNoProxy(inheritedEnv.NO_PROXY, '127.0.0.1,localhost,::1')
      inheritedEnv.no_proxy = inheritedEnv.NO_PROXY
    }
    return inheritedEnv
  }

  delete env.HTTP_PROXY
  delete env.HTTPS_PROXY
  delete env.ALL_PROXY
  delete env.http_proxy
  delete env.https_proxy
  delete env.all_proxy

  if (proxyMode === 'off') {
    if (options.enableNoProxyLocalhost) {
      env.NO_PROXY = mergeNoProxy(env.NO_PROXY, '127.0.0.1,localhost,::1')
      env.no_proxy = env.NO_PROXY
    }
    return env
  }

  const explicitProxyUrl = normalizeProxyUrl(options.proxyUrl)
  const httpProxyUrl = normalizeProxyUrl(options.httpProxyUrl)
  const socksProxyUrl = normalizeProxyUrl(options.socksProxyUrl)

  if (explicitProxyUrl) {
    if (explicitProxyUrl.startsWith('http://') || explicitProxyUrl.startsWith('https://')) {
      env.HTTP_PROXY = explicitProxyUrl
      env.HTTPS_PROXY = explicitProxyUrl
      env.http_proxy = explicitProxyUrl
      env.https_proxy = explicitProxyUrl
    } else {
      env.ALL_PROXY = explicitProxyUrl
      env.all_proxy = explicitProxyUrl
    }
  } else {
    if (httpProxyUrl) {
      env.HTTP_PROXY = httpProxyUrl
      env.HTTPS_PROXY = httpProxyUrl
      env.http_proxy = httpProxyUrl
      env.https_proxy = httpProxyUrl
    }
    if (socksProxyUrl) {
      env.ALL_PROXY = socksProxyUrl
      env.all_proxy = socksProxyUrl
    }
  }

  if (options.enableNoProxyLocalhost) {
    env.NO_PROXY = mergeNoProxy(env.NO_PROXY, '127.0.0.1,localhost,::1')
    env.no_proxy = env.NO_PROXY
  }

  return env
}

function mergeNoProxy(currentValue: string | undefined, additions: string): string {
  const values = [
    ...(currentValue ? currentValue.split(',') : []),
    ...additions.split(',')
  ]
    .map((entry) => entry.trim())
    .filter(Boolean)

  return Array.from(new Set(values)).join(',')
}

function classifyCliFailure(message: string): CliFailureAnalysis {
  const normalized = message.toLowerCase()

  if (!normalized.trim()) {
    return { matched: false, category: null, reason: null }
  }

  if (
    normalized.includes('proxyconnect') ||
    normalized.includes('proxy connect') ||
    normalized.includes('proxy authentication') ||
    normalized.includes('407') ||
    normalized.includes('connect econnrefused') ||
    normalized.includes('connection refused') ||
    normalized.includes('failed to connect to proxy') ||
    normalized.includes('proxy error')
  ) {
    return {
      matched: true,
      category: 'proxy_unavailable',
      reason: 'CLI 代理未生效或代理端口不可达'
    }
  }

  if (
    normalized.includes('stream disconnected before completion') ||
    normalized.includes('os error 10060') ||
    normalized.includes('timed out') ||
    normalized.includes('timeout') ||
    normalized.includes('etimedout')
  ) {
    return {
      matched: true,
      category: 'upstream_timeout',
      reason: 'CLI 已连接到网络链路，但上游请求超时或流式连接被中断'
    }
  }

  if (
    normalized.includes('tls') ||
    normalized.includes('handshake') ||
    normalized.includes('unexpected eof') ||
    normalized.includes('connection reset') ||
    normalized.includes('certificate') ||
    normalized.includes('http2') ||
    normalized.includes('quic')
  ) {
    return {
      matched: true,
      category: 'strategy_mismatch',
      reason: '当前 CLI 网络策略与实际网络环境不兼容'
    }
  }

  return { matched: false, category: null, reason: null }
}

async function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    let settled = false

    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(250)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

export class RemoteNetworkSettingsManager {
  private readonly settingsStore: DataStore<RemoteNetworkSettingsRecord>
  private readonly runtimeStore: DataStore<RemoteNetworkRuntimeRecord>
  private settings: RemoteNetworkSettingsRecord = { ...DEFAULT_SETTINGS }
  private runtime: RemoteNetworkRuntimeRecord = { ...DEFAULT_RUNTIME }
  private detected: DetectedProxyState = { ...DEFAULT_DETECTED }

  constructor(userDataPath: string) {
    this.settingsStore = new DataStore<RemoteNetworkSettingsRecord>(
      join(userDataPath, REMOTE_NETWORK_SETTINGS_FILE)
    )
    this.runtimeStore = new DataStore<RemoteNetworkRuntimeRecord>(
      join(userDataPath, REMOTE_NETWORK_RUNTIME_FILE)
    )
  }

  private async persistSettings(): Promise<void> {
    await this.settingsStore.save(this.settings)
  }

  private async persistRuntime(): Promise<void> {
    await this.runtimeStore.save(this.runtime)
  }

  private buildCloudflareStrategyPreview(
    strategy: Pick<CloudflareLaunchStrategy, 'transport' | 'proxyMode' | 'proxyUrl'>
  ): CloudflareLaunchStrategyPreview {
    return {
      transport: strategy.transport,
      proxyMode: strategy.proxyMode,
      proxyUrl: strategy.proxyUrl
    }
  }

  private buildTransportOrder(): TunnelResolvedTransport[] {
    const configured = this.settings.cloudflare
    const configuredTransport = configured.transportMode
    if (configuredTransport === 'http2' || configuredTransport === 'quic') {
      return [configuredTransport]
    }

    let order: TunnelResolvedTransport[] = ['http2', 'quic']
    if (
      this.settings.cloudflare.rememberLastSuccess &&
      this.runtime.cloudflare.lastSuccessfulTransport &&
      order[0] !== this.runtime.cloudflare.lastSuccessfulTransport
    ) {
      order = [
        this.runtime.cloudflare.lastSuccessfulTransport,
        ...order.filter((item) => item !== this.runtime.cloudflare.lastSuccessfulTransport)
      ]
    }
    return configured.autoFallback ? order : order.slice(0, 1)
  }

  private buildCloudflareProxyCandidates(baseEnv: Record<string, string>): Array<{
    proxyMode: ResolvedProxyMode
    proxyUrl: string | null
    env: Record<string, string>
  }> {
    const configured = this.settings.cloudflare
    const inheritedProxyUrl = getInheritedProxyUrl(baseEnv)
    const httpProxyUrl = this.detected.httpProxyUrl
    const customProxyUrl = configured.customProxyUrl

    const buildCustom = (proxyUrl: string | null) => ({
      proxyMode: 'custom' as const,
      proxyUrl,
      env: applyProxyEnvironment(baseEnv, 'custom', {
        proxyUrl,
        enableNoProxyLocalhost: true
      })
    })

    if (configured.proxyMode === 'off') {
      return [
        {
          proxyMode: 'off',
          proxyUrl: null,
          env: applyProxyEnvironment(baseEnv, 'off', { enableNoProxyLocalhost: true })
        }
      ]
    }

    if (configured.proxyMode === 'inherit') {
      return [
        {
          proxyMode: 'inherit',
          proxyUrl: inheritedProxyUrl,
          env: applyProxyEnvironment(baseEnv, 'inherit', { enableNoProxyLocalhost: true })
        }
      ]
    }

    if (configured.proxyMode === 'custom') {
      if (customProxyUrl) {
        return [buildCustom(customProxyUrl)]
      }

      if (inheritedProxyUrl) {
        return [
          {
            proxyMode: 'inherit',
            proxyUrl: inheritedProxyUrl,
            env: applyProxyEnvironment(baseEnv, 'inherit', { enableNoProxyLocalhost: true })
          }
        ]
      }

      return [
        {
          proxyMode: 'off',
          proxyUrl: null,
          env: applyProxyEnvironment(baseEnv, 'off', { enableNoProxyLocalhost: true })
        }
      ]
    }

    const candidates: Array<{
      proxyMode: ResolvedProxyMode
      proxyUrl: string | null
      env: Record<string, string>
    }> = []

    const pushCandidate = (candidate: {
      proxyMode: ResolvedProxyMode
      proxyUrl: string | null
      env: Record<string, string>
    }) => {
      if (
        candidates.some(
          (item) => item.proxyMode === candidate.proxyMode && item.proxyUrl === candidate.proxyUrl
        )
      ) {
        return
      }
      candidates.push(candidate)
    }

    if (
      configured.rememberLastSuccess &&
      configured.autoFallback &&
      this.runtime.cloudflare.lastSuccessfulProxyMode
    ) {
      if (this.runtime.cloudflare.lastSuccessfulProxyMode === 'off') {
        pushCandidate({
          proxyMode: 'off',
          proxyUrl: null,
          env: applyProxyEnvironment(baseEnv, 'off', { enableNoProxyLocalhost: true })
        })
      } else if (this.runtime.cloudflare.lastSuccessfulProxyMode === 'inherit') {
        pushCandidate({
          proxyMode: 'inherit',
          proxyUrl: inheritedProxyUrl,
          env: applyProxyEnvironment(baseEnv, 'inherit', { enableNoProxyLocalhost: true })
        })
      } else {
        pushCandidate(buildCustom(this.runtime.cloudflare.lastSuccessfulProxyUrl))
      }
    }

    if (inheritedProxyUrl) {
      pushCandidate({
        proxyMode: 'inherit',
        proxyUrl: inheritedProxyUrl,
        env: applyProxyEnvironment(baseEnv, 'inherit', { enableNoProxyLocalhost: true })
      })
    }

    if (customProxyUrl) {
      pushCandidate(buildCustom(customProxyUrl))
    }

    if (httpProxyUrl) {
      pushCandidate(buildCustom(httpProxyUrl))
    }

    pushCandidate({
      proxyMode: 'off',
      proxyUrl: null,
      env: applyProxyEnvironment(baseEnv, 'off', { enableNoProxyLocalhost: true })
    })

    return configured.autoFallback ? candidates : candidates.slice(0, 1)
  }

  async init(): Promise<void> {
    const [settingsLoad, runtimeLoad] = await Promise.all([
      this.settingsStore.load(),
      this.runtimeStore.load()
    ])

    this.settings = normalizeSettings(settingsLoad.data)
    this.runtime = normalizeRuntime(runtimeLoad.data)

    const settingsMutated =
      !!settingsLoad.restoredFromBackup ||
      JSON.stringify(settingsLoad.data ?? null) !== JSON.stringify(this.settings)
    const runtimeMutated =
      !!runtimeLoad.restoredFromBackup ||
      JSON.stringify(runtimeLoad.data ?? null) !== JSON.stringify(this.runtime)

    if (settingsMutated) {
      await this.persistSettings()
    }
    if (runtimeMutated) {
      await this.persistRuntime()
    }

    await this.refreshDetectedProxyState()
  }

  async refreshDetectedProxyState(baseEnv: Record<string, string> = process.env as Record<string, string>): Promise<DetectedProxyState> {
    const inheritedProxyUrl = getInheritedProxyUrl(baseEnv)
    const [httpPort, socksPort] = await Promise.all([
      (async () => {
        for (const port of COMMON_HTTP_PROXY_PORTS) {
          if (await probePort(port)) return port
        }
        return null
      })(),
      (async () => {
        for (const port of COMMON_SOCKS_PROXY_PORTS) {
          if (await probePort(port)) return port
        }
        return null
      })()
    ])

    this.detected = {
      httpProxyUrl: httpPort ? `http://127.0.0.1:${httpPort}` : null,
      socksProxyUrl: socksPort ? `socks5://127.0.0.1:${socksPort}` : null,
      inheritedProxyUrl,
      updatedAt: Date.now()
    }

    return { ...this.detected }
  }

  getSnapshot(): RemoteNetworkSettingsSnapshot {
    return {
      config: JSON.parse(JSON.stringify(this.settings)) as RemoteNetworkSettingsRecord,
      runtime: JSON.parse(JSON.stringify(this.runtime)) as RemoteNetworkRuntimeRecord,
      detected: { ...this.detected }
    }
  }

  async getState(
    baseEnv: Record<string, string> = process.env as Record<string, string>
  ): Promise<RemoteNetworkSettingsState> {
    const cloudflareCandidates = (
      await this.buildCloudflareLaunchStrategies(baseEnv)
    ).map((strategy) => this.buildCloudflareStrategyPreview(strategy))
    const cliResolved = this.buildCliEnvironment(baseEnv).state

    return {
      ...this.getSnapshot(),
      cloudflareRecommended: cloudflareCandidates[0] ?? null,
      cloudflareCandidates,
      cliResolved
    }
  }

  async updateSettings(
    updates: RemoteNetworkSettingsUpdate,
    baseEnv: Record<string, string> = process.env as Record<string, string>
  ): Promise<RemoteNetworkSettingsState> {
    const nextSettings = normalizeSettings({
      cloudflare: {
        ...this.settings.cloudflare,
        ...(updates.cloudflare ?? {})
      },
      cli: {
        ...this.settings.cli,
        ...(updates.cli ?? {})
      }
    })

    if (nextSettings.cloudflare.proxyMode === 'custom' && !nextSettings.cloudflare.customProxyUrl) {
      throw new Error('Cloudflare 自定义代理模式下必须提供有效的代理地址')
    }

    if (nextSettings.cli.proxyMode === 'custom' && !nextSettings.cli.customProxyUrl) {
      throw new Error('CLI 自定义代理模式下必须提供有效的代理地址')
    }

    this.settings = nextSettings
    await this.persistSettings()
    return this.getState(baseEnv)
  }

  async recordCloudflareSuccess(strategy: {
    transport: TunnelResolvedTransport
    proxyMode: ResolvedProxyMode
    proxyUrl: string | null
  }): Promise<void> {
    this.runtime.cloudflare.lastSuccessfulTransport = strategy.transport
    this.runtime.cloudflare.lastSuccessfulProxyMode = strategy.proxyMode
    this.runtime.cloudflare.lastSuccessfulProxyUrl = strategy.proxyUrl
    this.runtime.cloudflare.lastFailureReason = null
    this.runtime.cloudflare.lastFailureCategory = null
    await this.persistRuntime()
  }

  async recordCloudflareFailure(
    reason: string,
    category: CloudflareFailureCategory = 'unknown'
  ): Promise<void> {
    this.runtime.cloudflare.lastFailureReason = reason
    this.runtime.cloudflare.lastFailureCategory = category
    await this.persistRuntime()
  }

  analyzeCliFailure(message: string): CliFailureAnalysis {
    return classifyCliFailure(message)
  }

  async recordCliFailure(
    cliType: CliType,
    message: string,
    category: CliFailureCategory = 'unknown'
  ): Promise<void> {
    if (
      this.runtime.cli.lastFailureCli === cliType &&
      this.runtime.cli.lastFailureCategory === category &&
      this.runtime.cli.lastFailureReason === message
    ) {
      return
    }
    this.runtime.cli.lastFailureCli = cliType
    this.runtime.cli.lastFailureReason = message
    this.runtime.cli.lastFailureCategory = category
    await this.persistRuntime()
  }

  async buildCloudflareLaunchStrategies(
    baseEnv: Record<string, string> = process.env as Record<string, string>
  ): Promise<CloudflareLaunchStrategy[]> {
    await this.refreshDetectedProxyState(baseEnv)

    const transportCandidates = this.buildTransportOrder()
    const proxyCandidates = this.buildCloudflareProxyCandidates(baseEnv)
    const strategies: CloudflareLaunchStrategy[] = []

    for (const transport of transportCandidates) {
      for (const proxyCandidate of proxyCandidates) {
        if (
          strategies.some(
            (item) =>
              item.transport === transport &&
              item.proxyMode === proxyCandidate.proxyMode &&
              item.proxyUrl === proxyCandidate.proxyUrl
          )
        ) {
          continue
        }
        strategies.push({
          transport,
          proxyMode: proxyCandidate.proxyMode,
          proxyUrl: proxyCandidate.proxyUrl,
          env: proxyCandidate.env
        })
      }
    }

    return strategies
  }

  buildCliEnvironment(
    baseEnv: Record<string, string> = process.env as Record<string, string>
  ): { env: Record<string, string>; state: CliResolvedProxyState } {
    const config = this.settings.cli
    const inheritedProxyUrl = getInheritedProxyUrl(baseEnv)
    const httpProxyUrl = this.detected.httpProxyUrl
    const socksProxyUrl = this.detected.socksProxyUrl

    if (config.proxyMode === 'off') {
      return {
        env: applyProxyEnvironment(baseEnv, 'off', {
          enableNoProxyLocalhost: config.enableNoProxyLocalhost
        }),
        state: {
          proxyMode: 'off',
          proxyUrl: null
        }
      }
    }

    if (config.proxyMode === 'inherit') {
      return {
        env: applyProxyEnvironment(baseEnv, 'inherit', {
          enableNoProxyLocalhost: config.enableNoProxyLocalhost
        }),
        state: {
          proxyMode: 'inherit',
          proxyUrl: inheritedProxyUrl
        }
      }
    }

    if (config.proxyMode === 'custom') {
      return {
        env: applyProxyEnvironment(baseEnv, 'custom', {
          proxyUrl: config.customProxyUrl,
          enableNoProxyLocalhost: config.enableNoProxyLocalhost
        }),
        state: {
          proxyMode: 'custom',
          proxyUrl: config.customProxyUrl
        }
      }
    }

    if (config.customProxyUrl) {
      return {
        env: applyProxyEnvironment(baseEnv, 'custom', {
          proxyUrl: config.customProxyUrl,
          enableNoProxyLocalhost: config.enableNoProxyLocalhost
        }),
        state: {
          proxyMode: 'custom',
          proxyUrl: config.customProxyUrl
        }
      }
    }

    if (inheritedProxyUrl) {
      return {
        env: applyProxyEnvironment(baseEnv, 'inherit', {
          enableNoProxyLocalhost: config.enableNoProxyLocalhost
        }),
        state: {
          proxyMode: 'inherit',
          proxyUrl: inheritedProxyUrl
        }
      }
    }

    if (httpProxyUrl || socksProxyUrl) {
      return {
        env: applyProxyEnvironment(baseEnv, 'custom', {
          httpProxyUrl,
          socksProxyUrl,
          enableNoProxyLocalhost: config.enableNoProxyLocalhost
        }),
        state: {
          proxyMode: 'custom',
          proxyUrl: httpProxyUrl || socksProxyUrl
        }
      }
    }

    return {
      env: applyProxyEnvironment(baseEnv, 'off', {
        enableNoProxyLocalhost: config.enableNoProxyLocalhost
      }),
      state: {
        proxyMode: 'off',
        proxyUrl: null
      }
    }
  }

  async flush(): Promise<void> {
    await Promise.all([this.settingsStore.flush(), this.runtimeStore.flush()])
  }
}
