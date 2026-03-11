import type { SessionManager } from '../services/session-manager'
import type { ProjectManager } from '../services/project-manager'
import type { Project } from '../services/project-types'
import type { OutputLine, SessionOutputManager } from '../services/session-output'
import type { Session, SessionFilter } from '../services/session-types'
import type { CliType } from '../services/types'
import type {
  RemoteServiceEnvOverrides,
  RemoteServiceTokenMode
} from '../services/remote-service-settings-types'

export interface RemoteRuntimeConfig {
  enabled: boolean
  configuredEnabled: boolean
  passthroughOnly: boolean
  host: string
  port: number
  token: string
  idleTimeoutMs: number
  rateLimitWindowMs: number
  rateLimitMax: number
  tokenSource: 'env' | 'custom' | 'file' | 'generated'
  tokenMode: RemoteServiceTokenMode
  tokenFilePath: string
  envOverrides: RemoteServiceEnvOverrides
  baseUrl: string
}

export interface RemoteDependencies {
  sessionManager: SessionManager
  projectManager: ProjectManager
  outputManager: SessionOutputManager
}

export interface RemoteServerInfo {
  enabled: boolean
  host?: string
  port?: number
  tokenFingerprint?: string
}

export interface RemoteCapabilityMap {
  projectsList: boolean
  projectRead: boolean
  projectCreate: boolean
  projectUpdate: boolean
  projectRemove: boolean
  projectOpen: boolean
  projectSessionsList: boolean
  projectDetect: boolean
  sessionsList: boolean
  sessionSubscribe: boolean
  sessionInput: boolean
  sessionResize: boolean
  sessionOutputHistory: boolean
  sessionCreate: boolean
  sessionStart: boolean
  sessionPause: boolean
  sessionRestart: boolean
  sessionDestroy: boolean
  projectPromptRead: boolean
  projectPromptWrite: boolean
  localPathOpen: boolean
}

export interface RemoteRouteRegistrationOptions {
  defaultBaseUrl: string
  passthroughOnly: boolean
  serverName: string
  serverVersion: string
  platform: NodeJS.Platform
  machineName: string
}

export interface RemoteCapabilitiesResponse {
  passthroughOnly: boolean
  serverVersion: string
  capabilities: RemoteCapabilityMap
}

export interface RemoteServerInfoResponse {
  name: string
  machineName: string
  platform: NodeJS.Platform
  serverVersion: string
  baseUrl: string
  passthroughOnly: boolean
}

export type RemoteSessionDto = Session & {
  projectId: string | null
}

export interface RemoteSessionOutputHistoryResponse {
  sessionId: string
  lines: OutputLine[]
}

export interface RemoteSessionCreateBody {
  type: CliType
  projectId?: string
  projectPath?: string
  name?: string
  icon?: string
  options?: Record<string, unknown>
  parentId?: string
  startPaused?: boolean
}

export interface RemoteSessionListQuery extends SessionFilter {
  projectId?: string
}

export interface RemoteProjectUpdateBody {
  name?: string
}

export interface RemoteProjectCreateBody {
  path: string
  name?: string
}

export interface RemoteProjectPromptBody {
  content: string
}

export type RemoteProjectDto = Project

export interface RemoteErrorBody {
  code: string
  message: string
  requestId: string
}

export interface RemoteSuccessBody<T> {
  data: T
  requestId: string
}

export interface SessionSubscribePayload {
  sessionId: string
  historyLines?: number
}

export interface SessionInputPayload {
  sessionId: string
  input: string
}

export interface SessionWritePayload {
  sessionId: string
  data: string
}

export interface SessionResizePayload {
  sessionId: string
  cols: number
  rows: number
}

export interface SessionStatusPayload {
  sessionId: string
  status: Session['status']
}

export interface SocketAck {
  ok: boolean
  message?: string
}
