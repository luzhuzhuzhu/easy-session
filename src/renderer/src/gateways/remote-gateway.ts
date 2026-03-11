import { io, type Socket } from 'socket.io-client'
import type { OutputLine, SessionFilter } from '../api/local-session'
import type { Project, ProjectPromptCliType, ProjectPromptFile } from '../api/local-project'
import { ipc } from '../api/ipc'
import {
  buildGlobalSessionKey,
  toUnifiedProject,
  toUnifiedSession,
  type RemoteInstance,
  type UnifiedProject,
  type UnifiedSession
} from '../models/unified-resource'
import type {
  Gateway,
  GatewayCreateProjectParams,
  GatewayCreateSessionParams,
  GatewayDetectProjectResult,
  GatewayOutputEvent,
  GatewayStatusEvent,
  GatewayUpdateProjectParams
} from './types'

interface RemoteSessionDto {
  id: string
  name: string
  icon: string | null
  type: 'claude' | 'codex' | 'opencode'
  projectId: string | null
  projectPath: string
  status: UnifiedSession['status']
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

interface RemoteOutputEventPayload {
  instanceId: string
  sessionId: string
  globalSessionKey: string
  data: string
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq?: number
}

interface SocketAck {
  ok: boolean
  message?: string
}

interface RemoteStatusEventPayload {
  instanceId: string
  sessionId: string
  globalSessionKey: string
  status: UnifiedSession['status']
}

function isSessionUnavailableMessage(message: string | null | undefined): boolean {
  if (!message) return false
  return (
    message.startsWith('Session is not running:') ||
    message.startsWith('Session not found:')
  )
}

type RemoteGatewayInvokeMethod =
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

function isCloudflareQuickTunnelUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.endsWith('.trycloudflare.com')
  } catch {
    return false
  }
}

function decorateRemoteError(error: unknown, baseUrl: string): never {
  if (error instanceof Error && error.message.trim()) {
    throw error
  }

  const status =
    typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : null

  if (status === 530 && isCloudflareQuickTunnelUrl(baseUrl)) {
    throw new Error(
      'Cloudflare Quick Tunnel 不可用（530）。通常表示公网地址已失效、cloudflared 未运行，或被控端本机远程服务当前不可达。请在被控端重新开启 Quick Tunnel，并更新这里的 Base URL。'
    )
  }

  if (typeof status === 'number') {
    throw new Error(`远程服务当前不可达（${status}）。请检查远程服务、网络连接或反向隧道状态。`)
  }

  throw new Error(String(error ?? 'Unknown remote error'))
}

export class RemoteGateway implements Gateway {
  private socket: Socket | null = null
  private outputListenersBySession = new Map<string, Set<(event: GatewayOutputEvent) => void>>()
  private statusListeners = new Set<(event: GatewayStatusEvent) => void>()
  private outputBridgeBound = false
  private statusBridgeBound = false
  private statusSubscriptionActive = false

  constructor(
    private readonly instance: RemoteInstance,
    private readonly directToken?: string
  ) {}

  private useElectronBridge(): boolean {
    if (this.directToken) return false
    if (typeof window === 'undefined') return false

    const api = window.electronAPI
    return (
      !!api &&
      typeof api.invoke === 'function' &&
      typeof api.on === 'function' &&
      typeof api.removeListener === 'function'
    )
  }

  private isHttpStatus(error: unknown, status: number): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status?: number }).status === status
    )
  }

  private assertInstance(instanceId: string): void {
    if (instanceId !== this.instance.id) {
      throw new Error(`RemoteGateway 实例不匹配，期望 ${this.instance.id}，收到 ${instanceId}`)
    }
  }

  private async invoke<T>(method: RemoteGatewayInvokeMethod, ...args: unknown[]): Promise<T> {
    if (!this.useElectronBridge()) {
      return this.invokeDirect<T>(method, ...args)
    }
    try {
      return await ipc.invoke<T>('remote-gateway:invoke', {
        instanceId: this.instance.id,
        method,
        args
      })
    } catch (error) {
      decorateRemoteError(error, this.instance.baseUrl)
    }
  }

  private async requestJsonDirect<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.instance.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.directToken}`,
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
      const error = new Error(String((body as { message?: string } | null)?.message || '')) as Error & {
        status?: number
      }
      error.status = response.status
      decorateRemoteError(error, this.instance.baseUrl)
    }

    if (!body || typeof body !== 'object' || !('data' in body)) {
      throw new Error(`Remote response missing data: ${path}`)
    }

    return (body as { data: T }).data
  }

  private ensureDirectSocket(): Socket {
    if (this.socket) return this.socket

    const socket = io(this.instance.baseUrl, {
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
      auth: {
        token: this.directToken
      }
    })

    socket.on('connect', () => {
      for (const sessionId of this.outputListenersBySession.keys()) {
        socket.emit('session:subscribe', { sessionId, historyLines: 0 })
      }
    })

    socket.on('session:output', (payload: RemoteOutputEventPayload) => {
      if (payload.instanceId && payload.instanceId !== this.instance.id) return
      const listeners = this.outputListenersBySession.get(payload.sessionId)
      if (!listeners || listeners.size === 0) return

      const event: GatewayOutputEvent = {
        sessionId: payload.sessionId,
        data: payload.data,
        stream: payload.stream,
        timestamp: payload.timestamp,
        seq: payload.seq,
        instanceId: this.instance.id,
        globalSessionKey:
          payload.globalSessionKey || buildGlobalSessionKey(this.instance.id, payload.sessionId)
      }

      for (const listener of listeners) {
        listener(event)
      }
    })

    socket.on('session:status', (payload: RemoteStatusEventPayload) => {
      if (payload.instanceId && payload.instanceId !== this.instance.id) return
      const event: GatewayStatusEvent = {
        instanceId: this.instance.id,
        sessionId: payload.sessionId,
        globalSessionKey:
          payload.globalSessionKey || buildGlobalSessionKey(this.instance.id, payload.sessionId),
        status: payload.status
      }
      for (const listener of this.statusListeners) {
        listener(event)
      }
    })

    this.socket = socket
    return socket
  }

  private async emitAckDirect<TPayload>(eventName: string, payload: TPayload): Promise<void> {
    const socket = this.ensureDirectSocket()
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

  private async invokeDirect<T>(method: RemoteGatewayInvokeMethod, ...args: unknown[]): Promise<T> {
    switch (method) {
      case 'createSession':
        return this.requestJsonDirect<T>('/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args[0] ?? {})
        })
      case 'startSession':
        try {
          return await this.requestJsonDirect<T>(`/api/sessions/${args[0]}/start`, { method: 'POST' })
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return null as T
          throw error
        }
      case 'pauseSession':
        try {
          return await this.requestJsonDirect<T>(`/api/sessions/${args[0]}/pause`, { method: 'POST' })
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return null as T
          throw error
        }
      case 'restartSession':
        try {
          return await this.requestJsonDirect<T>(`/api/sessions/${args[0]}/restart`, { method: 'POST' })
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return null as T
          throw error
        }
      case 'destroySession':
        try {
          return await this.requestJsonDirect<T>(`/api/sessions/${args[0]}`, { method: 'DELETE' })
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return false as T
          throw error
        }
      case 'listSessions':
        return this.requestJsonDirect<T>(`/api/sessions${buildQuery(args[0] as SessionFilter | undefined)}`)
      case 'getSession':
        return this.requestJsonDirect<T>(`/api/sessions${buildQuery(undefined)}`).then((sessions) => {
          const current = (sessions as RemoteSessionDto[]).find((item) => item.id === args[0])
          return (current ?? null) as T
        })
      case 'getOutputHistory':
        return this.requestJsonDirect<OutputLine[] | { lines: OutputLine[] }>(
          `/api/sessions/${args[0]}/output${typeof args[1] === 'number' ? `?lines=${args[1]}` : ''}`
        ).then((response) => {
          if (Array.isArray(response)) {
            return response as T
          }
          return response.lines as T
        })
      case 'writeRaw':
        try {
          await this.emitAckDirect('session:write', { sessionId: args[0], data: args[1] })
          return true as T
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (isSessionUnavailableMessage(message)) {
            return false as T
          }
          throw error
        }
      case 'resize':
        try {
          await this.emitAckDirect('session:resize', {
            sessionId: args[0],
            cols: args[1],
            rows: args[2]
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!isSessionUnavailableMessage(message)) {
            throw error
          }
        }
        return undefined as T
      case 'listProjects':
        return this.requestJsonDirect<T>('/api/projects')
      case 'getProject':
        try {
          return await this.requestJsonDirect<T>(`/api/projects/${args[0]}`)
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return null as T
          throw error
        }
      case 'createProject':
        return this.requestJsonDirect<T>('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args[0] ?? {})
        })
      case 'updateProject':
        return this.requestJsonDirect<T>(`/api/projects/${args[0]}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(args[1] ?? {})
        })
      case 'removeProject':
        try {
          return await this.requestJsonDirect<T>(`/api/projects/${args[0]}`, { method: 'DELETE' })
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return false as T
          throw error
        }
      case 'openProject':
        try {
          return await this.requestJsonDirect<T>(`/api/projects/${args[0]}/open`, { method: 'POST' })
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return null as T
          throw error
        }
      case 'listProjectSessions':
        return this.requestJsonDirect<T>(`/api/projects/${args[0]}/sessions`)
      case 'detectProject':
        return this.requestJsonDirect<T>(`/api/projects/${args[0]}/detect`)
      case 'readProjectPrompt':
        try {
          return await this.requestJsonDirect<T>(`/api/projects/${args[0]}/prompt?cliType=${args[1]}`)
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return null as T
          throw error
        }
      case 'writeProjectPrompt':
        try {
          return await this.requestJsonDirect<T>(`/api/projects/${args[0]}/prompt?cliType=${args[1]}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: args[2] })
          })
        } catch (error) {
          if (this.isHttpStatus(error, 404)) return null as T
          throw error
        }
      default:
        throw new Error(`Unsupported remote gateway method: ${method}`)
    }
  }

  private ensureOutputBridge(): void {
    if (this.outputBridgeBound) return
    this.outputBridgeBound = true

    ipc.on('remote-session:output', (_event, ...args) => {
      const payload = args[0] as RemoteOutputEventPayload | undefined
      if (!payload) return
      if (payload.instanceId !== this.instance.id) return

      const listeners = this.outputListenersBySession.get(payload.sessionId)
      if (!listeners || listeners.size === 0) return

      const event: GatewayOutputEvent = {
        sessionId: payload.sessionId,
        data: payload.data,
        stream: payload.stream,
        timestamp: payload.timestamp,
        seq: payload.seq,
        instanceId: payload.instanceId,
        globalSessionKey: payload.globalSessionKey
      }

      for (const listener of listeners) {
        listener(event)
      }
    })
  }

  private ensureStatusBridge(): void {
    if (this.statusBridgeBound) return
    this.statusBridgeBound = true

    ipc.on('remote-session:status', (_event, ...args) => {
      const payload = args[0] as RemoteStatusEventPayload | undefined
      if (!payload) return
      if (payload.instanceId !== this.instance.id) return

      const event: GatewayStatusEvent = {
        instanceId: payload.instanceId,
        sessionId: payload.sessionId,
        globalSessionKey: payload.globalSessionKey,
        status: payload.status
      }

      for (const listener of this.statusListeners) {
        listener(event)
      }
    })
  }

  async createSession(instanceId: string, params: GatewayCreateSessionParams): Promise<UnifiedSession> {
    this.assertInstance(instanceId)
    const session = await this.invoke<RemoteSessionDto>('createSession', params)
    return toUnifiedSession(session, { instanceId, source: 'remote' })
  }

  async startSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    this.assertInstance(instanceId)
    const session = await this.invoke<RemoteSessionDto | null>('startSession', sessionId)
    return session ? toUnifiedSession(session, { instanceId, source: 'remote' }) : null
  }

  async pauseSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    this.assertInstance(instanceId)
    const session = await this.invoke<RemoteSessionDto | null>('pauseSession', sessionId)
    return session ? toUnifiedSession(session, { instanceId, source: 'remote' }) : null
  }

  async restartSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    this.assertInstance(instanceId)
    const session = await this.invoke<RemoteSessionDto | null>('restartSession', sessionId)
    return session ? toUnifiedSession(session, { instanceId, source: 'remote' }) : null
  }

  async destroySession(instanceId: string, sessionId: string): Promise<boolean> {
    this.assertInstance(instanceId)
    return this.invoke<boolean>('destroySession', sessionId)
  }

  async listProjects(instanceId: string): Promise<UnifiedProject[]> {
    this.assertInstance(instanceId)
    const projects = await this.invoke<Project[]>('listProjects')
    return projects.map((project) => toUnifiedProject(project, { instanceId, source: 'remote' }))
  }

  async getProject(instanceId: string, projectId: string): Promise<UnifiedProject | null> {
    this.assertInstance(instanceId)
    const project = await this.invoke<Project | null>('getProject', projectId)
    return project ? toUnifiedProject(project, { instanceId, source: 'remote' }) : null
  }

  async createProject(instanceId: string, params: GatewayCreateProjectParams): Promise<UnifiedProject> {
    this.assertInstance(instanceId)
    const project = await this.invoke<Project>('createProject', params)
    return toUnifiedProject(project, { instanceId, source: 'remote' })
  }

  async updateProject(
    instanceId: string,
    projectId: string,
    updates: GatewayUpdateProjectParams
  ): Promise<UnifiedProject | null> {
    this.assertInstance(instanceId)
    const project = await this.invoke<Project | null>('updateProject', projectId, updates)
    return project ? toUnifiedProject(project, { instanceId, source: 'remote' }) : null
  }

  async removeProject(instanceId: string, projectId: string): Promise<boolean> {
    this.assertInstance(instanceId)
    return this.invoke<boolean>('removeProject', projectId)
  }

  async openProject(instanceId: string, projectId: string): Promise<UnifiedProject | null> {
    this.assertInstance(instanceId)
    const project = await this.invoke<Project | null>('openProject', projectId)
    return project ? toUnifiedProject(project, { instanceId, source: 'remote' }) : null
  }

  async listProjectSessions(instanceId: string, projectId: string): Promise<UnifiedSession[]> {
    this.assertInstance(instanceId)
    const sessions = await this.invoke<RemoteSessionDto[]>('listProjectSessions', projectId)
    return sessions.map((session) => toUnifiedSession(session, { instanceId, source: 'remote' }))
  }

  async detectProject(instanceId: string, projectId: string): Promise<GatewayDetectProjectResult> {
    this.assertInstance(instanceId)
    return this.invoke<GatewayDetectProjectResult>('detectProject', projectId)
  }

  async readProjectPrompt(
    instanceId: string,
    projectId: string,
    cliType: ProjectPromptCliType
  ): Promise<ProjectPromptFile | null> {
    this.assertInstance(instanceId)
    return this.invoke<ProjectPromptFile | null>('readProjectPrompt', projectId, cliType)
  }

  async writeProjectPrompt(
    instanceId: string,
    projectId: string,
    cliType: ProjectPromptCliType,
    content: string
  ): Promise<ProjectPromptFile | null> {
    this.assertInstance(instanceId)
    return this.invoke<ProjectPromptFile | null>('writeProjectPrompt', projectId, cliType, content)
  }

  async listSessions(instanceId: string, filter?: SessionFilter): Promise<UnifiedSession[]> {
    this.assertInstance(instanceId)
    const sessions = await this.invoke<RemoteSessionDto[]>('listSessions', filter)
    return sessions.map((session) => toUnifiedSession(session, { instanceId, source: 'remote' }))
  }

  async getSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    this.assertInstance(instanceId)
    const session = await this.invoke<RemoteSessionDto | null>('getSession', sessionId)
    return session ? toUnifiedSession(session, { instanceId, source: 'remote' }) : null
  }

  async getOutputHistory(instanceId: string, sessionId: string, lines?: number): Promise<OutputLine[]> {
    this.assertInstance(instanceId)
    return this.invoke<OutputLine[]>('getOutputHistory', sessionId, lines)
  }

  subscribeOutput(
    instanceId: string,
    sessionId: string,
    listener: (event: GatewayOutputEvent) => void
  ): () => void {
    this.assertInstance(instanceId)

    if (this.useElectronBridge()) {
      this.ensureOutputBridge()
    } else {
      this.ensureDirectSocket()
    }

    let listeners = this.outputListenersBySession.get(sessionId)
    if (!listeners) {
      listeners = new Set<(event: GatewayOutputEvent) => void>()
      this.outputListenersBySession.set(sessionId, listeners)
      if (this.useElectronBridge()) {
        void ipc.invoke('remote-gateway:subscribeOutput', instanceId, sessionId)
      } else {
        void this.emitAckDirect('session:subscribe', { sessionId, historyLines: 0 })
      }
    }
    listeners.add(listener)

    return () => {
      const current = this.outputListenersBySession.get(sessionId)
      if (!current) return
      current.delete(listener)
      if (current.size === 0) {
        this.outputListenersBySession.delete(sessionId)
        if (this.useElectronBridge()) {
          void ipc.invoke('remote-gateway:unsubscribeOutput', instanceId, sessionId)
        } else {
          void this.emitAckDirect('session:unsubscribe', { sessionId })
        }
      }
    }
  }

  subscribeStatus(instanceId: string, listener: (event: GatewayStatusEvent) => void): () => void {
    this.assertInstance(instanceId)
    if (this.useElectronBridge()) {
      this.ensureStatusBridge()
    } else {
      this.ensureDirectSocket()
    }

    if (!this.statusSubscriptionActive && this.useElectronBridge()) {
      this.statusSubscriptionActive = true
      void ipc.invoke('remote-gateway:subscribeStatus', instanceId)
    }

    this.statusListeners.add(listener)
    return () => {
      this.statusListeners.delete(listener)
      if (this.statusListeners.size > 0) return
      if (this.useElectronBridge() && this.statusSubscriptionActive) {
        this.statusSubscriptionActive = false
        void ipc.invoke('remote-gateway:unsubscribeStatus', instanceId)
      }
    }
  }

  async writeRaw(instanceId: string, sessionId: string, data: string): Promise<boolean> {
    this.assertInstance(instanceId)
    return this.invoke<boolean>('writeRaw', sessionId, data)
  }

  async resize(instanceId: string, sessionId: string, cols: number, rows: number): Promise<void> {
    this.assertInstance(instanceId)
    await this.invoke<void>('resize', sessionId, cols, rows)
  }

  dispose(): void {
    if (this.useElectronBridge()) {
      for (const sessionId of this.outputListenersBySession.keys()) {
        void ipc.invoke('remote-gateway:unsubscribeOutput', this.instance.id, sessionId)
      }

      if (this.statusSubscriptionActive) {
        this.statusSubscriptionActive = false
        void ipc.invoke('remote-gateway:unsubscribeStatus', this.instance.id)
      }
    } else if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }

    this.outputListenersBySession.clear()
    this.statusListeners.clear()
  }
}
