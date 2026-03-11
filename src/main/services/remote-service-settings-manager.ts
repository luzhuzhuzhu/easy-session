import { join } from 'path'
import { DataStore } from './data-store'
import {
  DEFAULT_REMOTE_HOST,
  DEFAULT_REMOTE_PORT,
  DEFAULT_REMOTE_PASSTHROUGH_ONLY,
  REMOTE_SERVICE_CONFIG_FILE,
  REMOTE_SERVICE_SECRETS_FILE
} from '../remote/defaults'
import type {
  RemoteServiceConfigRecord,
  RemoteServiceSecretRecord,
  RemoteServiceSettingsSnapshot,
  RemoteServiceSettingsUpdate,
  RemoteServiceTokenMode
} from './remote-service-settings-types'

const DEFAULT_CONFIG: RemoteServiceConfigRecord = {
  enabled: false,
  host: DEFAULT_REMOTE_HOST,
  port: DEFAULT_REMOTE_PORT,
  passthroughOnly: DEFAULT_REMOTE_PASSTHROUGH_ONLY,
  tokenMode: 'default'
}

const DEFAULT_SECRET: RemoteServiceSecretRecord = {
  customToken: null
}

function normalizeHost(rawHost: unknown): string {
  if (typeof rawHost !== 'string' || !rawHost.trim()) {
    return DEFAULT_CONFIG.host
  }
  return rawHost.trim()
}

function normalizePort(rawPort: unknown): number {
  const port = typeof rawPort === 'number' ? rawPort : Number.parseInt(String(rawPort ?? ''), 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    return DEFAULT_CONFIG.port
  }
  return Math.floor(port)
}

function normalizeTokenMode(rawMode: unknown): RemoteServiceTokenMode {
  return rawMode === 'custom' ? 'custom' : 'default'
}

function normalizeCustomToken(rawToken: unknown): string | null {
  if (typeof rawToken !== 'string') return null
  const token = rawToken.trim()
  return token.length >= 64 ? token : null
}

function normalizeConfigRecord(rawRecord: unknown): RemoteServiceConfigRecord {
  if (!rawRecord || typeof rawRecord !== 'object') {
    return { ...DEFAULT_CONFIG }
  }

  const record = rawRecord as Partial<RemoteServiceConfigRecord>
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_CONFIG.enabled,
    host: normalizeHost(record.host),
    port: normalizePort(record.port),
    passthroughOnly:
      typeof record.passthroughOnly === 'boolean'
        ? record.passthroughOnly
        : DEFAULT_CONFIG.passthroughOnly,
    tokenMode: normalizeTokenMode(record.tokenMode)
  }
}

function normalizeSecretRecord(rawRecord: unknown): RemoteServiceSecretRecord {
  if (!rawRecord || typeof rawRecord !== 'object') {
    return { ...DEFAULT_SECRET }
  }

  const record = rawRecord as Partial<RemoteServiceSecretRecord>
  return {
    customToken: normalizeCustomToken(record.customToken)
  }
}

async function loadStores(
  configStore: DataStore<RemoteServiceConfigRecord>,
  secretStore: DataStore<RemoteServiceSecretRecord>
): Promise<{
  config: RemoteServiceConfigRecord
  secret: RemoteServiceSecretRecord
  restoredFromBackup: boolean
  mutated: boolean
}> {
  const [configLoad, secretLoad] = await Promise.all([configStore.load(), secretStore.load()])

  const config = normalizeConfigRecord(configLoad.data)
  const secret = normalizeSecretRecord(secretLoad.data)

  let mutated =
    !!configLoad.restoredFromBackup ||
    !!secretLoad.restoredFromBackup ||
    JSON.stringify(configLoad.data ?? null) !== JSON.stringify(config) ||
    JSON.stringify(secretLoad.data ?? null) !== JSON.stringify(secret)

  if (config.tokenMode === 'custom' && !secret.customToken) {
    config.tokenMode = 'default'
    mutated = true
  }

  return {
    config,
    secret,
    restoredFromBackup: !!configLoad.restoredFromBackup || !!secretLoad.restoredFromBackup,
    mutated
  }
}

export async function readRemoteServiceSettingsSnapshot(
  userDataPath: string
): Promise<RemoteServiceSettingsSnapshot> {
  const configStore = new DataStore<RemoteServiceConfigRecord>(
    join(userDataPath, REMOTE_SERVICE_CONFIG_FILE)
  )
  const secretStore = new DataStore<RemoteServiceSecretRecord>(
    join(userDataPath, REMOTE_SERVICE_SECRETS_FILE)
  )
  const { config, secret } = await loadStores(configStore, secretStore)
  return {
    ...config,
    customToken: secret.customToken
  }
}

export class RemoteServiceSettingsManager {
  private readonly configStore: DataStore<RemoteServiceConfigRecord>
  private readonly secretStore: DataStore<RemoteServiceSecretRecord>
  private config: RemoteServiceConfigRecord = { ...DEFAULT_CONFIG }
  private secret: RemoteServiceSecretRecord = { ...DEFAULT_SECRET }

  constructor(userDataPath: string) {
    this.configStore = new DataStore<RemoteServiceConfigRecord>(
      join(userDataPath, REMOTE_SERVICE_CONFIG_FILE)
    )
    this.secretStore = new DataStore<RemoteServiceSecretRecord>(
      join(userDataPath, REMOTE_SERVICE_SECRETS_FILE)
    )
  }

  private async persist(): Promise<void> {
    await Promise.all([
      this.configStore.save({ ...this.config }),
      this.secretStore.save({ ...this.secret })
    ])
  }

  async init(): Promise<void> {
    const { config, secret, mutated } = await loadStores(this.configStore, this.secretStore)
    this.config = config
    this.secret = secret
    if (mutated) {
      await this.persist()
    }
  }

  getSnapshot(): RemoteServiceSettingsSnapshot {
    return {
      ...this.config,
      customToken: this.secret.customToken
    }
  }

  async updateSettings(updates: RemoteServiceSettingsUpdate): Promise<RemoteServiceSettingsSnapshot> {
    const nextConfig = normalizeConfigRecord(updates)
    const nextSecret = {
      customToken:
        Object.prototype.hasOwnProperty.call(updates, 'customToken') &&
        updates.customToken !== undefined
          ? normalizeCustomToken(updates.customToken)
          : this.secret.customToken
    }

    if (nextConfig.tokenMode === 'custom' && !nextSecret.customToken) {
      throw new Error('自定义 token 模式下必须提供至少 64 位的 token')
    }

    this.config = nextConfig
    this.secret = nextSecret
    await this.persist()
    return this.getSnapshot()
  }

  async flush(): Promise<void> {
    await Promise.all([this.configStore.flush(), this.secretStore.flush()])
  }
}
