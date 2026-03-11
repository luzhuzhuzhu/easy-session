export type RemoteServiceTokenMode = 'default' | 'custom'

export interface RemoteServiceConfigRecord {
  enabled: boolean
  host: string
  port: number
  passthroughOnly: boolean
  tokenMode: RemoteServiceTokenMode
}

export interface RemoteServiceSecretRecord {
  customToken: string | null
}

export interface RemoteServiceSettingsSnapshot extends RemoteServiceConfigRecord {
  customToken: string | null
}

export interface RemoteServiceSettingsUpdate extends RemoteServiceConfigRecord {
  customToken?: string | null
}

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
  tokenSource: 'env' | 'custom' | 'file' | 'generated'
  tokenFingerprint: string
  tokenFilePath: string
  baseUrl: string
  running: boolean
  customTokenConfigured: boolean
  envOverrides: RemoteServiceEnvOverrides
}
