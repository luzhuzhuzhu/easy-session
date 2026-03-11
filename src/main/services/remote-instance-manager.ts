import { randomUUID } from 'crypto'
import { join } from 'path'
import { DataStore } from './data-store'
import { buildRemoteCapabilityMap } from '../remote/capabilities'
import type { RemoteCapabilitiesResponse, RemoteServerInfoResponse } from '../remote/types'
import type {
  RemoteInstanceConnectionResult,
  RemoteInstanceDraft,
  RemoteInstanceRecord,
  RemoteInstanceSecretRecord,
  RemoteInstanceStatus,
  RemoteInstanceUpdate
} from './remote-instance-types'

interface ApiEnvelope<T> {
  data: T
  requestId: string
}

interface ApiErrorEnvelope {
  message?: string
}

function isCloudflareQuickTunnelUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith('.trycloudflare.com')
  } catch {
    return false
  }
}

function isConnectivityStatus(status: number): boolean {
  return [502, 503, 504, 522, 523, 524, 525, 526, 530].includes(status)
}

function formatRemoteHttpError(status: number, message: string | null, baseUrl: string): string {
  if (message) return message

  if (status === 530 && isCloudflareQuickTunnelUrl(baseUrl)) {
    return 'Cloudflare Quick Tunnel 不可用（530）。通常表示公网地址已失效、cloudflared 未运行，或被控端本机远程服务当前不可达。请在被控端重新开启 Quick Tunnel，并更新这里的 Base URL。'
  }

  if (isConnectivityStatus(status)) {
    return `远程服务当前不可达（${status}）。请检查远程服务、网络连接或反向隧道状态。`
  }

  return `Remote request failed: ${status}`
}

function normalizeBaseUrl(rawBaseUrl: string): string {
  if (typeof rawBaseUrl !== 'string' || !rawBaseUrl.trim()) {
    throw new Error('baseUrl 必须为非空字符串')
  }

  let parsed: URL
  try {
    parsed = new URL(rawBaseUrl.trim())
  } catch {
    throw new Error('baseUrl 必须为合法的 http/https URL')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('baseUrl 仅支持 http 或 https')
  }

  parsed.hash = ''
  parsed.search = ''
  return parsed.toString().replace(/\/$/, '')
}

function normalizeToken(rawToken: string): string {
  if (typeof rawToken !== 'string' || !rawToken.trim()) {
    throw new Error('token 必须为非空字符串')
  }
  return rawToken.trim()
}

function normalizeName(rawName: string): string {
  if (typeof rawName !== 'string' || !rawName.trim()) {
    throw new Error('name 必须为非空字符串')
  }
  return rawName.trim()
}

function cloneInstance(instance: RemoteInstanceRecord): RemoteInstanceRecord {
  return {
    ...instance,
    capabilities: { ...instance.capabilities }
  }
}

export class RemoteInstanceManager {
  private readonly instanceStore: DataStore<RemoteInstanceRecord[]>
  private readonly secretStore: DataStore<RemoteInstanceSecretRecord[]>
  private readonly instances = new Map<string, RemoteInstanceRecord>()
  private readonly secrets = new Map<string, RemoteInstanceSecretRecord>()

  constructor(userDataPath: string) {
    this.instanceStore = new DataStore<RemoteInstanceRecord[]>(join(userDataPath, 'remote-instances.json'))
    this.secretStore = new DataStore<RemoteInstanceSecretRecord[]>(
      join(userDataPath, 'remote-instance-secrets.json')
    )
  }

  private migrateRecord(record: Partial<RemoteInstanceRecord> & { id: string }): RemoteInstanceRecord {
    const passthroughOnly =
      typeof record.passthroughOnly === 'boolean' ? record.passthroughOnly : true

    return {
      id: record.id,
      type: 'remote',
      name: normalizeName(record.name || 'Remote Instance'),
      baseUrl: normalizeBaseUrl(record.baseUrl || ''),
      enabled: typeof record.enabled === 'boolean' ? record.enabled : true,
      authRef:
        typeof record.authRef === 'string' && record.authRef.trim() ? record.authRef.trim() : record.id,
      status: (record.status as RemoteInstanceStatus | undefined) || 'unknown',
      lastCheckedAt: typeof record.lastCheckedAt === 'number' ? record.lastCheckedAt : null,
      passthroughOnly,
      capabilities:
        record.capabilities && typeof record.capabilities === 'object'
          ? {
              ...buildRemoteCapabilityMap(passthroughOnly),
              ...record.capabilities
            }
          : buildRemoteCapabilityMap(passthroughOnly),
      lastError: typeof record.lastError === 'string' && record.lastError.trim() ? record.lastError.trim() : null,
      latencyMs: typeof record.latencyMs === 'number' ? record.latencyMs : null
    }
  }

  private async persist(): Promise<void> {
    const instances = Array.from(this.instances.values()).map((instance) => cloneInstance(instance))
    const secrets = Array.from(this.secrets.values()).map((secret) => ({ ...secret }))
    await Promise.all([this.instanceStore.save(instances), this.secretStore.save(secrets)])
  }

  private getErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object' || !('message' in body)) {
      return null
    }
    const candidate = (body as ApiErrorEnvelope).message
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
  }

  private async requestJson<T>(baseUrl: string, token: string, path: string): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })

    const rawText = await response.text()
    let body: unknown = null
    if (rawText) {
      try {
        body = JSON.parse(rawText) as ApiEnvelope<T> | ApiErrorEnvelope
      } catch {
        body = null
      }
    }

    if (!response.ok) {
      const message = formatRemoteHttpError(response.status, this.getErrorMessage(body), baseUrl)
      const error = new Error(message) as Error & { status?: number }
      error.status = response.status
      throw error
    }

    if (!body || typeof body !== 'object' || !('data' in body)) {
      throw new Error(`Remote response missing data: ${path}`)
    }

    return (body as ApiEnvelope<T>).data
  }

  private updateInstanceStatus(
    instance: RemoteInstanceRecord,
    patch: Pick<
      RemoteInstanceRecord,
      'status' | 'lastCheckedAt' | 'passthroughOnly' | 'capabilities' | 'lastError' | 'latencyMs'
    >
  ): void {
    instance.status = patch.status
    instance.lastCheckedAt = patch.lastCheckedAt
    instance.passthroughOnly = patch.passthroughOnly
    instance.capabilities = { ...patch.capabilities }
    instance.lastError = patch.lastError
    instance.latencyMs = patch.latencyMs
  }

  async init(): Promise<void> {
    const [instanceLoad, secretLoad] = await Promise.all([this.instanceStore.load(), this.secretStore.load()])

    let mutated = false
    this.instances.clear()
    this.secrets.clear()

    if (instanceLoad.data) {
      for (const rawRecord of instanceLoad.data) {
        try {
          const record = this.migrateRecord(rawRecord)
          if (JSON.stringify(rawRecord) !== JSON.stringify(record)) {
            mutated = true
          }
          this.instances.set(record.id, record)
        } catch (error) {
          mutated = true
          console.warn('[remote-instance] skip invalid instance record:', error)
        }
      }
    }

    if (secretLoad.data) {
      for (const secret of secretLoad.data) {
        if (!secret || typeof secret.instanceId !== 'string') {
          mutated = true
          continue
        }
        if (typeof secret.token !== 'string' || !secret.token.trim()) {
          mutated = true
          continue
        }
        this.secrets.set(secret.instanceId, {
          instanceId: secret.instanceId,
          token: secret.token.trim()
        })
      }
    }

    for (const instance of this.instances.values()) {
      if (!this.secrets.has(instance.id)) {
        instance.lastError = instance.lastError || 'Missing token'
        instance.status = 'error'
        mutated = true
      }
    }

    if (instanceLoad.restoredFromBackup || secretLoad.restoredFromBackup || mutated) {
      await this.persist()
    }
  }

  listInstances(): RemoteInstanceRecord[] {
    return Array.from(this.instances.values())
      .map((instance) => cloneInstance(instance))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  }

  getInstance(id: string): RemoteInstanceRecord | null {
    const instance = this.instances.get(id)
    return instance ? cloneInstance(instance) : null
  }

  getToken(id: string): string | null {
    return this.secrets.get(id)?.token ?? null
  }

  async addInstance(draft: RemoteInstanceDraft): Promise<RemoteInstanceRecord> {
    const id = randomUUID()
    const instance: RemoteInstanceRecord = {
      id,
      type: 'remote',
      name: normalizeName(draft.name),
      baseUrl: normalizeBaseUrl(draft.baseUrl),
      enabled: draft.enabled !== false,
      authRef: id,
      status: 'unknown',
      lastCheckedAt: null,
      passthroughOnly: true,
      capabilities: buildRemoteCapabilityMap(true),
      lastError: null,
      latencyMs: null
    }
    const secret: RemoteInstanceSecretRecord = {
      instanceId: id,
      token: normalizeToken(draft.token)
    }

    this.instances.set(id, instance)
    this.secrets.set(id, secret)
    await this.persist()
    return cloneInstance(instance)
  }

  async updateInstance(id: string, updates: RemoteInstanceUpdate): Promise<RemoteInstanceRecord | null> {
    const instance = this.instances.get(id)
    if (!instance) return null

    let changed = false

    if (updates.name !== undefined) {
      instance.name = normalizeName(updates.name)
      changed = true
    }
    if (updates.baseUrl !== undefined) {
      instance.baseUrl = normalizeBaseUrl(updates.baseUrl)
      instance.status = 'unknown'
      instance.lastCheckedAt = null
      instance.lastError = null
      instance.latencyMs = null
      changed = true
    }
    if (updates.enabled !== undefined) {
      instance.enabled = updates.enabled
      changed = true
    }
    if (updates.token !== undefined) {
      this.secrets.set(id, {
        instanceId: id,
        token: normalizeToken(updates.token)
      })
      changed = true
    }

    if (!changed) {
      return cloneInstance(instance)
    }

    await this.persist()
    return cloneInstance(instance)
  }

  async removeInstance(id: string): Promise<boolean> {
    const deleted = this.instances.delete(id)
    this.secrets.delete(id)
    if (!deleted) return false
    await this.persist()
    return true
  }

  async testDraft(draft: Pick<RemoteInstanceDraft, 'baseUrl' | 'token'>): Promise<RemoteInstanceConnectionResult> {
    const baseUrl = normalizeBaseUrl(draft.baseUrl)
    const token = normalizeToken(draft.token)
    const lastCheckedAt = Date.now()
    const fallbackCapabilities = buildRemoteCapabilityMap(true)

    try {
      const healthStartedAt = Date.now()
      await this.requestJson<{ ok: boolean; ts: number }>(baseUrl, token, '/api/health')
      const latencyMs = Date.now() - healthStartedAt

      const [capabilities, serverInfo] = await Promise.all([
        this.requestJson<RemoteCapabilitiesResponse>(baseUrl, token, '/api/capabilities'),
        this.requestJson<RemoteServerInfoResponse>(baseUrl, token, '/api/server-info')
      ])

      return {
        ok: true,
        status: 'online',
        lastCheckedAt,
        passthroughOnly: capabilities.passthroughOnly,
        capabilities: { ...capabilities.capabilities },
        serverInfo,
        latencyMs,
        error: null
      }
    } catch (error) {
      const errorStatus =
        typeof (error as { status?: unknown }).status === 'number'
          ? (error as { status: number }).status
          : null
      const status =
        typeof errorStatus === 'number'
          ? (isConnectivityStatus(errorStatus) ? 'offline' : 'error')
          : 'offline'
      return {
        ok: false,
        status,
        lastCheckedAt,
        passthroughOnly: true,
        capabilities: fallbackCapabilities,
        serverInfo: null,
        latencyMs: null,
        error: error instanceof Error ? error.message : String(error),
        httpStatus: errorStatus ?? undefined
      }
    }
  }

  async testInstance(id: string): Promise<RemoteInstanceConnectionResult> {
    const instance = this.instances.get(id)
    if (!instance) {
      throw new Error(`Remote instance not found: ${id}`)
    }

    const token = this.secrets.get(id)?.token
    if (!token) {
      const result: RemoteInstanceConnectionResult = {
        ok: false,
        status: 'error',
        lastCheckedAt: Date.now(),
        passthroughOnly: instance.passthroughOnly,
        capabilities: { ...instance.capabilities },
        serverInfo: null,
        latencyMs: null,
        error: 'Remote instance token is missing'
      }
      this.updateInstanceStatus(instance, {
        status: result.status,
        lastCheckedAt: result.lastCheckedAt,
        passthroughOnly: result.passthroughOnly,
        capabilities: result.capabilities,
        lastError: result.error,
        latencyMs: result.latencyMs
      })
      await this.persist()
      return result
    }

    const result = await this.testDraft({ baseUrl: instance.baseUrl, token })
    this.updateInstanceStatus(instance, {
      status: result.status,
      lastCheckedAt: result.lastCheckedAt,
      passthroughOnly: result.passthroughOnly,
      capabilities: result.capabilities,
      lastError: result.error,
      latencyMs: result.latencyMs
    })
    await this.persist()
    return result
  }

  async flush(): Promise<void> {
    await Promise.all([this.instanceStore.flush(), this.secretStore.flush()])
  }
}
