import { type WebContents, webContents } from 'electron'
import { io, type Socket } from 'socket.io-client'
import type { Project } from './project-types'
import type { SessionFilter, SessionStatus } from './session-types'
import type { OutputLine } from './session-output'
import { RemoteInstanceManager } from './remote-instance-manager'
import type { RemoteInstanceRecord } from './remote-instance-types'
type RemoteProjectPromptCliType = 'claude' | 'codex'

interface RemoteProjectPromptFile {
  path: string
  content: string
  exists: boolean
}

interface ApiEnvelope<T> {
  data: T
  requestId: string
}

interface ApiErrorEnvelope {
  message?: string
}

interface RemoteSessionDto {
  id: string
  name: string
  icon: string | null
  type: 'claude' | 'codex' | 'opencode'
  projectId: string | null
  projectPath: string
  status: SessionStatus
  createdAt: number
  lastStartAt?: number
  totalRunMs?: number
  lastRunMs?: number
  lastActiveAt: number
  processId: string | null
  options: Record<string, unknown>
  parentId: string | null
  claudeSessionId?: string | null
  codexSessionId?: string | null
  opencodeSessionId?: string | null
}

interface OutputHistoryResponse {
  sessionId: string
  lines: OutputLine[]
}

interface SocketAck {
  ok: boolean
  message?: string
}

interface SessionOutputEventPayload {
  sessionId: string
  data: string
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq?: number
}

interface SessionStatusEventPayload {
  sessionId: string
  status: SessionStatus
}

export interface RemoteGatewayOutputEvent extends SessionOutputEventPayload {
  instanceId: string
  globalSessionKey: string
}

export interface RemoteGatewayStatusEvent extends SessionStatusEventPayload {
  instanceId: string
  globalSessionKey: string
}

export type RemoteGatewayInvokeMethod =
  | 'createSession'
  | 'startSession'
  | 'pauseSession'
  | 'restartSession'
  | 'destroySession'
  | 'listSessions'
  | 'getSession'
  | 'getOutputHistory'
  | 'writeRaw'
  | 'resize'
  | 'listProjects'
  | 'getProject'
  | 'createProject'
  | 'updateProject'
  | 'removeProject'
  | 'openProject'
  | 'listProjectSessions'
  | 'detectProject'
  | 'readProjectPrompt'
  | 'writeProjectPrompt'

export interface RemoteGatewayInvokePayload {
  instanceId: string
  method: RemoteGatewayInvokeMethod
  args?: unknown[]
}

interface OutputSubscriptionState {
  subscribers: Set<number>
  cleanup: (() => void) | null
}

interface StatusSubscriptionState {
  subscribers: Set<number>
  cleanup: (() => void) | null
}

function buildGlobalSessionKey(instanceId: string, sessionId: string): string {
  return `${instanceId}:${sessionId}`
}

function isSessionUnavailableMessage(message: string | null | undefined): boolean {
  if (!message) return false
  return (
    message.startsWith('Session is not running:') ||
    message.startsWith('Session not found:')
  )
}

function isCloudflareQuickTunnelUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith('.trycloudflare.com')
  } catch {
    return false
  }
}

function formatRemoteHttpError(status: number, message: string | null, baseUrl: string): string {
  if (message) return message

  if (status === 530 && isCloudflareQuickTunnelUrl(baseUrl)) {
    return 'Cloudflare Quick Tunnel 不可用（530）。通常表示公网地址已失效、cloudflared 未运行，或被控端本机远程服务当前不可达。请在被控端重新开启 Quick Tunnel，并更新这里的 Base URL。'
  }

  if ([502, 503, 504, 522, 523, 524, 525, 526, 530].includes(status)) {
    return `远程服务当前不可达（${status}）。请检查远程服务、网络连接或反向隧道状态。`
  }

  return `Remote request failed: ${status}`
}

function buildQuery(filter?: SessionFilter): string {
  if (!filter) return ''
  const params = new URLSearchParams()
  if (filter.type) params.set('type', filter.type)
  if (filter.projectPath) params.set('projectPath', filter.projectPath)
  if (filter.status) params.set('status', filter.status)
  if (filter.parentId) params.set('parentId', filter.parentId)
  const query = params.toString()
  return query ? `?${query}` : ''
}

class RemoteGatewayClient {
  private socket: Socket | null = null
  private outputListenersBySession = new Map<string, Set<(event: RemoteGatewayOutputEvent) => void>>()
  private statusListeners = new Set<(event: RemoteGatewayStatusEvent) => void>()
  private subscriptionCounts = new Map<string, number>()

  constructor(
    private readonly instance: RemoteInstanceRecord,
    private readonly token: string
  ) {}

  get signature(): string {
    return `${this.instance.baseUrl}|${this.token}`
  }

  private getErrorMessage(body: unknown): string | null {
    if (!body || typeof body !== 'object' || !('message' in body)) {
      return null
    }
    const candidate = (body as ApiErrorEnvelope).message
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
  }

  private isHttpStatus(error: unknown, status: number): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status?: number }).status === status
    )
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.instance.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init?.headers || {})
      }
    })

    const raw = await response.text()
    let body: unknown = null
    if (raw) {
      try {
        body = JSON.parse(raw)
      } catch {
        body = null
      }
    }

    if (!response.ok) {
      const error = new Error(
        formatRemoteHttpError(response.status, this.getErrorMessage(body), this.instance.baseUrl)
      ) as Error & { status?: number }
      error.status = response.status
      throw error
    }

    if (!body || typeof body !== 'object' || !('data' in body)) {
      throw new Error(`Remote response missing data: ${path}`)
    }

    return (body as ApiEnvelope<T>).data
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket

    const socket = io(this.instance.baseUrl, {
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
      auth: {
        token: this.token
      }
    })

    socket.on('connect', () => {
      for (const [sessionId, count] of this.subscriptionCounts) {
        if (count < 1) continue
        socket.emit('session:subscribe', { sessionId, historyLines: 0 })
      }
    })

    socket.on('session:output', (event: SessionOutputEventPayload) => {
      const listeners = this.outputListenersBySession.get(event.sessionId)
      if (!listeners || listeners.size === 0) return

      const payload: RemoteGatewayOutputEvent = {
        ...event,
        instanceId: this.instance.id,
        globalSessionKey: buildGlobalSessionKey(this.instance.id, event.sessionId)
      }

      for (const listener of listeners) {
        listener(payload)
      }
    })

    socket.on('session:status', (event: SessionStatusEventPayload) => {
      const payload: RemoteGatewayStatusEvent = {
        ...event,
        instanceId: this.instance.id,
        globalSessionKey: buildGlobalSessionKey(this.instance.id, event.sessionId)
      }

      for (const listener of this.statusListeners) {
        listener(payload)
      }
    })

    this.socket = socket
    return socket
  }

  private emitAck<TPayload>(eventName: string, payload: TPayload): Promise<void> {
    const socket = this.ensureSocket()
    return new Promise((resolve, reject) => {
      socket.emit(eventName, payload, (ack: SocketAck) => {
        if (ack?.ok) {
          resolve()
          return
        }
        reject(new Error(ack?.message || `Socket event failed: ${eventName}`))
      })
    })
  }

  private async subscribeSession(sessionId: string): Promise<void> {
    const current = this.subscriptionCounts.get(sessionId) ?? 0
    this.subscriptionCounts.set(sessionId, current + 1)
    if (current > 0) return
    await this.emitAck('session:subscribe', { sessionId, historyLines: 0 })
  }

  private async unsubscribeSession(sessionId: string): Promise<void> {
    const current = this.subscriptionCounts.get(sessionId) ?? 0
    if (current <= 1) {
      this.subscriptionCounts.delete(sessionId)
      await this.emitAck('session:unsubscribe', { sessionId }).catch(() => undefined)
      return
    }
    this.subscriptionCounts.set(sessionId, current - 1)
  }

  async createSession(params: Record<string, unknown>): Promise<RemoteSessionDto> {
    return this.requestJson<RemoteSessionDto>('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
  }

  async startSession(sessionId: string): Promise<RemoteSessionDto | null> {
    try {
      return await this.requestJson<RemoteSessionDto>(`/api/sessions/${sessionId}/start`, {
        method: 'POST'
      })
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async pauseSession(sessionId: string): Promise<RemoteSessionDto | null> {
    try {
      return await this.requestJson<RemoteSessionDto>(`/api/sessions/${sessionId}/pause`, {
        method: 'POST'
      })
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async restartSession(sessionId: string): Promise<RemoteSessionDto | null> {
    try {
      return await this.requestJson<RemoteSessionDto>(`/api/sessions/${sessionId}/restart`, {
        method: 'POST'
      })
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async destroySession(sessionId: string): Promise<boolean> {
    try {
      const result = await this.requestJson<{ deleted: boolean }>(`/api/sessions/${sessionId}`, {
        method: 'DELETE'
      })
      return result.deleted
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return false
      throw error
    }
  }

  async listProjects(): Promise<Project[]> {
    return this.requestJson<Project[]>('/api/projects')
  }

  async getProject(projectId: string): Promise<Project | null> {
    try {
      return await this.requestJson<Project>(`/api/projects/${projectId}`)
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async createProject(params: Record<string, unknown>): Promise<Project> {
    return this.requestJson<Project>('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    })
  }

  async updateProject(projectId: string, updates: Record<string, unknown>): Promise<Project | null> {
    try {
      return await this.requestJson<Project>(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async removeProject(projectId: string): Promise<boolean> {
    try {
      const result = await this.requestJson<{ deleted: boolean }>(`/api/projects/${projectId}`, {
        method: 'DELETE'
      })
      return result.deleted
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return false
      throw error
    }
  }

  async openProject(projectId: string): Promise<Project | null> {
    try {
      return await this.requestJson<Project>(`/api/projects/${projectId}/open`, { method: 'POST' })
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async listProjectSessions(projectId: string): Promise<RemoteSessionDto[]> {
    return this.requestJson<RemoteSessionDto[]>(`/api/projects/${projectId}/sessions`)
  }

  async detectProject(projectId: string): Promise<{
    claude: boolean
    codex: boolean
    opencode: boolean
  }> {
    return this.requestJson<{
      claude: boolean
      codex: boolean
      opencode: boolean
    }>(`/api/projects/${projectId}/detect`)
  }

  async readProjectPrompt(
    projectId: string,
    cliType: RemoteProjectPromptCliType
  ): Promise<RemoteProjectPromptFile | null> {
    try {
      return await this.requestJson<RemoteProjectPromptFile>(
        `/api/projects/${projectId}/prompt?cliType=${cliType}`
      )
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async writeProjectPrompt(
    projectId: string,
    cliType: RemoteProjectPromptCliType,
    content: string
  ): Promise<RemoteProjectPromptFile | null> {
    try {
      return await this.requestJson<RemoteProjectPromptFile>(
        `/api/projects/${projectId}/prompt?cliType=${cliType}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        }
      )
    } catch (error) {
      if (this.isHttpStatus(error, 404)) return null
      throw error
    }
  }

  async listSessions(filter?: SessionFilter): Promise<RemoteSessionDto[]> {
    return this.requestJson<RemoteSessionDto[]>(`/api/sessions${buildQuery(filter)}`)
  }

  async getSession(sessionId: string): Promise<RemoteSessionDto | null> {
    const sessions = await this.listSessions()
    return sessions.find((session) => session.id === sessionId) ?? null
  }

  async getOutputHistory(sessionId: string, lines?: number): Promise<OutputLine[]> {
    const suffix = typeof lines === 'number' ? `?lines=${lines}` : ''
    const response = await this.requestJson<OutputHistoryResponse>(`/api/sessions/${sessionId}/output${suffix}`)
    return response.lines
  }

  subscribeOutput(sessionId: string, listener: (event: RemoteGatewayOutputEvent) => void): () => void {
    let listeners = this.outputListenersBySession.get(sessionId)
    if (!listeners) {
      listeners = new Set<(event: RemoteGatewayOutputEvent) => void>()
      this.outputListenersBySession.set(sessionId, listeners)
      void this.subscribeSession(sessionId)
    }
    listeners.add(listener)

    return () => {
      const current = this.outputListenersBySession.get(sessionId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) {
        this.outputListenersBySession.delete(sessionId)
        void this.unsubscribeSession(sessionId)
      }
    }
  }

  subscribeStatus(listener: (event: RemoteGatewayStatusEvent) => void): () => void {
    this.ensureSocket()
    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
    }
  }

  async writeRaw(sessionId: string, data: string): Promise<boolean> {
    try {
      await this.emitAck('session:write', { sessionId, data })
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isSessionUnavailableMessage(message)) {
        return false
      }
      throw error
    }
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    try {
      await this.emitAck('session:resize', { sessionId, cols, rows })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (isSessionUnavailableMessage(message)) {
        return
      }
      throw error
    }
  }

  dispose(): void {
    if (!this.socket) return
    this.socket.removeAllListeners()
    this.socket.disconnect()
    this.socket = null
    this.outputListenersBySession.clear()
    this.statusListeners.clear()
    this.subscriptionCounts.clear()
  }
}

export class RemoteGatewayManager {
  private readonly clients = new Map<string, { signature: string; client: RemoteGatewayClient }>()
  private readonly outputSubscriptions = new Map<string, Map<string, OutputSubscriptionState>>()
  private readonly statusSubscriptions = new Map<string, StatusSubscriptionState>()
  private readonly trackedSenders = new Set<number>()

  constructor(private readonly remoteInstanceManager: RemoteInstanceManager) {}

  private observeSender(sender: WebContents): void {
    if (this.trackedSenders.has(sender.id)) return
    this.trackedSenders.add(sender.id)
    sender.once('destroyed', () => {
      this.cleanupSender(sender.id)
    })
  }

  private cleanupSender(senderId: number): void {
    this.trackedSenders.delete(senderId)

    for (const [instanceId, sessions] of this.outputSubscriptions) {
      for (const [sessionId, state] of sessions) {
        state.subscribers.delete(senderId)
        if (state.subscribers.size > 0) continue
        state.cleanup?.()
        sessions.delete(sessionId)
      }
      if (sessions.size === 0) {
        this.outputSubscriptions.delete(instanceId)
      }
    }

    for (const [instanceId, state] of this.statusSubscriptions) {
      state.subscribers.delete(senderId)
      if (state.subscribers.size > 0) continue
      state.cleanup?.()
      this.statusSubscriptions.delete(instanceId)
    }
  }

  private async resolveRemoteAuth(instanceId: string): Promise<{
    instance: RemoteInstanceRecord
    token: string
  }> {
    const instance = this.remoteInstanceManager.getInstance(instanceId)
    if (!instance) {
      throw new Error(`Remote instance not found: ${instanceId}`)
    }
    const token = this.remoteInstanceManager.getToken(instanceId)
    if (!token) {
      throw new Error(`Remote instance token missing: ${instanceId}`)
    }
    return { instance, token }
  }

  private async getClient(instanceId: string): Promise<RemoteGatewayClient> {
    const { instance, token } = await this.resolveRemoteAuth(instanceId)
    const signature = `${instance.baseUrl}|${token}`
    const cached = this.clients.get(instanceId)
    if (cached && cached.signature === signature) {
      return cached.client
    }

    cached?.client.dispose()

    const client = new RemoteGatewayClient(instance, token)
    this.clients.set(instanceId, { signature, client })
    this.rebindInstanceSubscriptions(instanceId, client)
    return client
  }

  private rebindInstanceSubscriptions(instanceId: string, client: RemoteGatewayClient): void {
    const sessionSubscriptions = this.outputSubscriptions.get(instanceId)
    if (sessionSubscriptions) {
      for (const [sessionId, state] of sessionSubscriptions) {
        state.cleanup?.()
        state.cleanup = client.subscribeOutput(sessionId, (event) => {
          for (const subscriberId of state.subscribers) {
            const contents = webContents.fromId(subscriberId)
            contents?.send('remote-session:output', event)
          }
        })
      }
    }

    const statusState = this.statusSubscriptions.get(instanceId)
    if (statusState) {
      statusState.cleanup?.()
      statusState.cleanup = client.subscribeStatus((event) => {
        for (const subscriberId of statusState.subscribers) {
          const contents = webContents.fromId(subscriberId)
          contents?.send('remote-session:status', event)
        }
      })
    }
  }

  async invoke(payload: RemoteGatewayInvokePayload): Promise<unknown> {
    const client = await this.getClient(payload.instanceId)
    const args = payload.args ?? []

    switch (payload.method) {
      case 'createSession':
        return client.createSession(args[0] as Record<string, unknown>)
      case 'startSession':
        return client.startSession(args[0] as string)
      case 'pauseSession':
        return client.pauseSession(args[0] as string)
      case 'restartSession':
        return client.restartSession(args[0] as string)
      case 'destroySession':
        return client.destroySession(args[0] as string)
      case 'listSessions':
        return client.listSessions(args[0] as SessionFilter | undefined)
      case 'getSession':
        return client.getSession(args[0] as string)
      case 'getOutputHistory':
        return client.getOutputHistory(args[0] as string, args[1] as number | undefined)
      case 'writeRaw':
        return client.writeRaw(args[0] as string, args[1] as string)
      case 'resize':
        return client.resize(args[0] as string, args[1] as number, args[2] as number)
      case 'listProjects':
        return client.listProjects()
      case 'getProject':
        return client.getProject(args[0] as string)
      case 'createProject':
        return client.createProject(args[0] as Record<string, unknown>)
      case 'updateProject':
        return client.updateProject(args[0] as string, args[1] as Record<string, unknown>)
      case 'removeProject':
        return client.removeProject(args[0] as string)
      case 'openProject':
        return client.openProject(args[0] as string)
      case 'listProjectSessions':
        return client.listProjectSessions(args[0] as string)
      case 'detectProject':
        return client.detectProject(args[0] as string)
      case 'readProjectPrompt':
        return client.readProjectPrompt(args[0] as string, args[1] as RemoteProjectPromptCliType)
      case 'writeProjectPrompt':
        return client.writeProjectPrompt(
          args[0] as string,
          args[1] as RemoteProjectPromptCliType,
          args[2] as string
        )
      default:
        throw new Error(`Unsupported remote gateway method: ${(payload as { method: string }).method}`)
    }
  }

  async subscribeOutput(sender: WebContents, instanceId: string, sessionId: string): Promise<void> {
    this.observeSender(sender)
    const client = await this.getClient(instanceId)
    let sessions = this.outputSubscriptions.get(instanceId)
    if (!sessions) {
      sessions = new Map<string, OutputSubscriptionState>()
      this.outputSubscriptions.set(instanceId, sessions)
    }

    let state = sessions.get(sessionId)
    if (!state) {
      state = {
        subscribers: new Set<number>(),
        cleanup: client.subscribeOutput(sessionId, (event) => {
          for (const subscriberId of state!.subscribers) {
            const contents = webContents.fromId(subscriberId)
            contents?.send('remote-session:output', event)
          }
        })
      }
      sessions.set(sessionId, state)
    }

    state.subscribers.add(sender.id)
  }

  unsubscribeOutput(sender: WebContents, instanceId: string, sessionId: string): void {
    const sessions = this.outputSubscriptions.get(instanceId)
    if (!sessions) return
    const state = sessions.get(sessionId)
    if (!state) return

    state.subscribers.delete(sender.id)
    if (state.subscribers.size > 0) return

    state.cleanup?.()
    sessions.delete(sessionId)
    if (sessions.size === 0) {
      this.outputSubscriptions.delete(instanceId)
    }
  }

  async subscribeStatus(sender: WebContents, instanceId: string): Promise<void> {
    this.observeSender(sender)
    const client = await this.getClient(instanceId)
    let state = this.statusSubscriptions.get(instanceId)
    if (!state) {
      state = {
        subscribers: new Set<number>(),
        cleanup: client.subscribeStatus((event) => {
          for (const subscriberId of state!.subscribers) {
            const contents = webContents.fromId(subscriberId)
            contents?.send('remote-session:status', event)
          }
        })
      }
      this.statusSubscriptions.set(instanceId, state)
    }

    state.subscribers.add(sender.id)
  }

  unsubscribeStatus(sender: WebContents, instanceId: string): void {
    const state = this.statusSubscriptions.get(instanceId)
    if (!state) return
    state.subscribers.delete(sender.id)
    if (state.subscribers.size > 0) return

    state.cleanup?.()
    this.statusSubscriptions.delete(instanceId)
  }

  invalidate(instanceId?: string): void {
    if (!instanceId) {
      for (const { client } of this.clients.values()) {
        client.dispose()
      }
      this.clients.clear()
      return
    }

    const cached = this.clients.get(instanceId)
    cached?.client.dispose()
    this.clients.delete(instanceId)
  }

  dispose(): void {
    for (const sessions of this.outputSubscriptions.values()) {
      for (const state of sessions.values()) {
        state.cleanup?.()
      }
    }
    this.outputSubscriptions.clear()

    for (const state of this.statusSubscriptions.values()) {
      state.cleanup?.()
    }
    this.statusSubscriptions.clear()

    this.invalidate()
    this.trackedSenders.clear()
  }
}
