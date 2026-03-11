import type { RemoteCapabilityMap, RemoteServerInfoResponse } from '../remote/types'

export type RemoteInstanceStatus = 'unknown' | 'connecting' | 'online' | 'offline' | 'error'

export interface RemoteInstanceRecord {
  id: string
  type: 'remote'
  name: string
  baseUrl: string
  enabled: boolean
  authRef: string
  status: RemoteInstanceStatus
  lastCheckedAt: number | null
  passthroughOnly: boolean
  capabilities: RemoteCapabilityMap
  lastError: string | null
  latencyMs: number | null
}

export interface RemoteInstanceSecretRecord {
  instanceId: string
  token: string
}

export interface RemoteInstanceDraft {
  name: string
  baseUrl: string
  token: string
  enabled?: boolean
}

export interface RemoteInstanceUpdate {
  name?: string
  baseUrl?: string
  token?: string
  enabled?: boolean
}

export interface RemoteInstanceConnectionResult {
  ok: boolean
  status: RemoteInstanceStatus
  lastCheckedAt: number
  passthroughOnly: boolean
  capabilities: RemoteCapabilityMap
  serverInfo: RemoteServerInfoResponse | null
  latencyMs: number | null
  error: string | null
  httpStatus?: number
}
