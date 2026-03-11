import type { CliType } from './types'

export type TunnelTransportMode = 'auto' | 'http2' | 'quic'
export type TunnelResolvedTransport = 'http2' | 'quic'
export type ProxyMode = 'auto' | 'off' | 'inherit' | 'custom'
export type ResolvedProxyMode = 'off' | 'inherit' | 'custom'
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

export interface RemoteNetworkSettingsRecord {
  cloudflare: CloudflareNetworkStrategyConfig
  cli: CliNetworkStrategyConfig
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
  lastFailureCli: CliType | null
}

export interface RemoteNetworkRuntimeRecord {
  cloudflare: CloudflareNetworkStrategyRuntime
  cli: CliNetworkStrategyRuntime
}

export interface DetectedProxyState {
  httpProxyUrl: string | null
  socksProxyUrl: string | null
  inheritedProxyUrl: string | null
  updatedAt: number | null
}

export interface RemoteNetworkSettingsSnapshot {
  config: RemoteNetworkSettingsRecord
  runtime: RemoteNetworkRuntimeRecord
  detected: DetectedProxyState
}

export interface CloudflareLaunchStrategy {
  transport: TunnelResolvedTransport
  proxyMode: ResolvedProxyMode
  proxyUrl: string | null
  env: Record<string, string>
}

export interface CliResolvedProxyState {
  proxyMode: ResolvedProxyMode
  proxyUrl: string | null
}

export interface CliFailureAnalysis {
  matched: boolean
  category: CliFailureCategory | null
  reason: string | null
}

export interface CloudflareLaunchStrategyPreview {
  transport: TunnelResolvedTransport
  proxyMode: ResolvedProxyMode
  proxyUrl: string | null
}

export interface RemoteNetworkSettingsUpdate {
  cloudflare?: Partial<CloudflareNetworkStrategyConfig>
  cli?: Partial<CliNetworkStrategyConfig>
}

export interface RemoteNetworkSettingsState extends RemoteNetworkSettingsSnapshot {
  cloudflareRecommended: CloudflareLaunchStrategyPreview | null
  cloudflareCandidates: CloudflareLaunchStrategyPreview[]
  cliResolved: CliResolvedProxyState
}
