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

export function getCloudflareTunnelState(): Promise<CloudflareTunnelState> {
  return ipc.invoke<CloudflareTunnelState>('cloudflare-tunnel:getState')
}

export function updateCloudflareTunnelConfig(
  binaryPath: string | null
): Promise<CloudflareTunnelState> {
  return ipc.invoke<CloudflareTunnelState>('cloudflare-tunnel:updateConfig', binaryPath)
}

export function startCloudflareTunnel(): Promise<CloudflareTunnelState> {
  return ipc.invoke<CloudflareTunnelState>('cloudflare-tunnel:start')
}

export function stopCloudflareTunnel(): Promise<CloudflareTunnelState> {
  return ipc.invoke<CloudflareTunnelState>('cloudflare-tunnel:stop')
}
