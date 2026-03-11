import { ipc } from './ipc'
import type { RemoteInstance } from '../models/unified-resource'

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

export interface RemoteServerInfo {
  name: string
  machineName: string
  platform: NodeJS.Platform
  serverVersion: string
  baseUrl: string
  passthroughOnly: boolean
}

export interface RemoteInstanceConnectionResult {
  ok: boolean
  status: RemoteInstance['status']
  lastCheckedAt: number
  passthroughOnly: boolean
  capabilities: RemoteInstance['capabilities']
  serverInfo: RemoteServerInfo | null
  latencyMs: number | null
  error: string | null
  httpStatus?: number
}

export function listRemoteInstances(): Promise<RemoteInstance[]> {
  return ipc.invoke<RemoteInstance[]>('remote-instance:list')
}

export function addRemoteInstance(draft: RemoteInstanceDraft): Promise<RemoteInstance> {
  return ipc.invoke<RemoteInstance>('remote-instance:add', draft)
}

export function updateRemoteInstance(id: string, updates: RemoteInstanceUpdate): Promise<RemoteInstance | null> {
  return ipc.invoke<RemoteInstance | null>('remote-instance:update', id, updates)
}

export function removeRemoteInstance(id: string): Promise<boolean> {
  return ipc.invoke<boolean>('remote-instance:remove', id)
}

export function testRemoteInstance(target: string | Pick<RemoteInstanceDraft, 'baseUrl' | 'token'>): Promise<RemoteInstanceConnectionResult> {
  return ipc.invoke<RemoteInstanceConnectionResult>('remote-instance:test', target)
}

export function getRemoteInstanceToken(id: string): Promise<string | null> {
  return ipc.invoke<string | null>('remote-instance:getToken', id)
}
