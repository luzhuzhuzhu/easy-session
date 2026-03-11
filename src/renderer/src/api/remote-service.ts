import { ipc } from './ipc'

export type RemoteServiceTokenMode = 'default' | 'custom'
export type RemoteServiceTokenSource = 'env' | 'custom' | 'file' | 'generated'

export interface RemoteServiceEnvOverrides {
  enabled: boolean
  host: boolean
  port: boolean
  passthroughOnly: boolean
  token: boolean
}

export interface RemoteServiceState {
  configuredEnabled: boolean
  effectiveEnabled: boolean
  host: string
  port: number
  passthroughOnly: boolean
  tokenMode: RemoteServiceTokenMode
  tokenSource: RemoteServiceTokenSource
  tokenFingerprint: string
  tokenFilePath: string
  baseUrl: string
  running: boolean
  customTokenConfigured: boolean
  envOverrides: RemoteServiceEnvOverrides
}

export interface RemoteServiceSettingsUpdate {
  enabled: boolean
  host: string
  port: number
  passthroughOnly: boolean
  tokenMode: RemoteServiceTokenMode
  customToken?: string | null
}

export function getRemoteServiceState(): Promise<RemoteServiceState> {
  return ipc.invoke<RemoteServiceState>('remote-service:getState')
}

export function updateRemoteServiceSettings(
  settings: RemoteServiceSettingsUpdate
): Promise<RemoteServiceState> {
  return ipc.invoke<RemoteServiceState>('remote-service:update', settings)
}

export function getRemoteServiceToken(): Promise<string> {
  return ipc.invoke<string>('remote-service:getToken')
}

export function regenerateRemoteServiceDefaultToken(): Promise<RemoteServiceState> {
  return ipc.invoke<RemoteServiceState>('remote-service:regenerateDefaultToken')
}
