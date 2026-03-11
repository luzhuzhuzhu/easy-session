import { ipc } from './ipc'

export type TunnelTransportMode = 'auto' | 'http2' | 'quic'
export type ProxyMode = 'auto' | 'off' | 'inherit' | 'custom'
export type ResolvedProxyMode = 'off' | 'inherit' | 'custom'
export type TunnelResolvedTransport = 'http2' | 'quic'
export type CloudflareFailureCategory =
  | 'protocol'
  | 'proxy'
  | 'timeout'
  | 'public_url'
  | 'local_service'
  | 'cloudflare_api'
  | 'process_exit'
  | 'unknown'

export type CliFailureCategory =
  | 'proxy_unavailable'
  | 'upstream_timeout'
  | 'strategy_mismatch'
  | 'unknown'

export interface CloudflareNetworkStrategyConfig {
  transportMode: TunnelTransportMode
  proxyMode: ProxyMode
  customProxyUrl: string | null
  rememberLastSuccess: boolean
  autoFallback: boolean
}

export interface CliNetworkStrategyConfig {
  proxyMode: ProxyMode
  customProxyUrl: string | null
  enableNoProxyLocalhost: boolean
}

export interface DetectedProxyState {
  httpProxyUrl: string | null
  socksProxyUrl: string | null
  inheritedProxyUrl: string | null
  updatedAt: number | null
}

export interface CloudflareNetworkStrategyRuntime {
  lastSuccessfulTransport: TunnelResolvedTransport | null
  lastSuccessfulProxyMode: ResolvedProxyMode | null
  lastSuccessfulProxyUrl: string | null
  lastFailureReason: string | null
  lastFailureCategory: CloudflareFailureCategory | null
}

export interface CliNetworkStrategyRuntime {
  lastFailureReason: string | null
  lastFailureCategory: CliFailureCategory | null
  lastFailureCli: 'claude' | 'codex' | 'opencode' | null
}

export interface CloudflareLaunchStrategyPreview {
  transport: TunnelResolvedTransport
  proxyMode: ResolvedProxyMode
  proxyUrl: string | null
}

export interface CliResolvedProxyState {
  proxyMode: ResolvedProxyMode
  proxyUrl: string | null
}

export interface RemoteNetworkSettingsState {
  config: {
    cloudflare: CloudflareNetworkStrategyConfig
    cli: CliNetworkStrategyConfig
  }
  runtime: {
    cloudflare: CloudflareNetworkStrategyRuntime
    cli: CliNetworkStrategyRuntime
  }
  detected: DetectedProxyState
  cloudflareRecommended: CloudflareLaunchStrategyPreview | null
  cloudflareCandidates: CloudflareLaunchStrategyPreview[]
  cliResolved: CliResolvedProxyState
}

export interface RemoteNetworkSettingsUpdate {
  cloudflare?: Partial<CloudflareNetworkStrategyConfig>
  cli?: Partial<CliNetworkStrategyConfig>
}

export function getRemoteNetworkState(): Promise<RemoteNetworkSettingsState> {
  return ipc.invoke<RemoteNetworkSettingsState>('remote-network:getState')
}

export function updateRemoteNetworkSettings(
  settings: RemoteNetworkSettingsUpdate
): Promise<RemoteNetworkSettingsState> {
  return ipc.invoke<RemoteNetworkSettingsState>('remote-network:update', settings)
}
