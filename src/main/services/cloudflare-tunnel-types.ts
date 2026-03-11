import type {
  CloudflareFailureCategory,
  ProxyMode,
  ResolvedProxyMode,
  TunnelResolvedTransport,
  TunnelTransportMode
} from './remote-network-settings-types'

export interface CloudflareTunnelConfigRecord {
  binaryPath: string | null
}

export interface CloudflareTunnelState {
  binaryPath: string | null
  effectiveBinaryPath: string | null
  pathSource: 'custom' | 'system' | 'missing'
  available: boolean
  running: boolean
  publicUrl: string | null
  localTargetUrl: string | null
  pid: number | null
  lastError: string | null
  lastOutput: string | null
  transportMode: TunnelTransportMode
  proxyMode: ProxyMode
  customProxyUrl: string | null
  rememberLastSuccess: boolean
  autoFallback: boolean
  effectiveTransport: TunnelResolvedTransport | null
  effectiveProxyMode: ResolvedProxyMode | null
  effectiveProxyUrl: string | null
  effectiveFallbackUsed: boolean
  effectiveAttemptIndex: number | null
  lastSuccessfulTransport: TunnelResolvedTransport | null
  lastSuccessfulProxyMode: ResolvedProxyMode | null
  lastSuccessfulProxyUrl: string | null
  lastFailureCategory: CloudflareFailureCategory | null
}
