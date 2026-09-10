import type { OutputEvent, OutputLine, SessionFilter, SessionStatus } from '../api/session'
import type { ProjectPromptCliType, ProjectPromptFile } from '../api/project'
import type { CliType } from '@shared/cli-types'
import type { NativeSessionDiscoveryResult } from '@shared/native-session-candidates'
import type {
  InstanceCapabilities,
  UnifiedProject,
  UnifiedSession
} from '../models/unified-resource'

export interface GatewayCreateSessionParams {
  type: CliType
  projectId?: string
  projectPath?: string
  name?: string
  icon?: string
  options?: Record<string, unknown>
  parentId?: string
  startPaused?: boolean
}

export interface GatewayCreateProjectParams {
  path: string
  name?: string
}

export interface GatewayUpdateProjectParams {
  name?: string
}

export interface GatewayDetectProjectResult {
  claude: boolean
  codex: boolean
  opencode: boolean
}

export interface GatewayOutputEvent extends OutputEvent {
  instanceId: string
  globalSessionKey: string
}

export interface GatewayStatusEvent {
  instanceId: string
  sessionId: string
  globalSessionKey: string
  status: SessionStatus
}

export interface GatewayCapabilitySnapshot {
  passthroughOnly: boolean
  capabilities: InstanceCapabilities
}

export interface SessionGateway {
  createSession(instanceId: string, params: GatewayCreateSessionParams): Promise<UnifiedSession>
  startSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null>
  pauseSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null>
  restartSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null>
  destroySession(instanceId: string, sessionId: string): Promise<boolean>
  listSessions(instanceId: string, filter?: SessionFilter): Promise<UnifiedSession[]>
  getSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null>
  getOutputHistory(instanceId: string, sessionId: string, lines?: number): Promise<OutputLine[]>
  subscribeOutput(
    instanceId: string,
    sessionId: string,
    listener: (event: GatewayOutputEvent) => void
  ): () => void
  subscribeStatus(instanceId: string, listener: (event: GatewayStatusEvent) => void): () => void
  writeRaw(instanceId: string, sessionId: string, data: string): Promise<boolean>
  resize(instanceId: string, sessionId: string, cols: number, rows: number): Promise<void>
  getCapabilities(instanceId: string): Promise<GatewayCapabilitySnapshot>
  updateSessionOptions(instanceId: string, sessionId: string, options: Record<string, unknown>): Promise<UnifiedSession | null>
  setNativeSessionId(instanceId: string, sessionId: string, cliType: CliType, value: string | null): Promise<UnifiedSession | null>
  getNativeIdCandidates(instanceId: string, cliType: CliType, projectPath?: string, preferredPath?: string): Promise<NativeSessionDiscoveryResult>
}

export interface ProjectGateway {
  listProjects(instanceId: string): Promise<UnifiedProject[]>
  getProject(instanceId: string, projectId: string): Promise<UnifiedProject | null>
  createProject(instanceId: string, params: GatewayCreateProjectParams): Promise<UnifiedProject>
  updateProject(instanceId: string, projectId: string, updates: GatewayUpdateProjectParams): Promise<UnifiedProject | null>
  removeProject(instanceId: string, projectId: string): Promise<boolean>
  openProject(instanceId: string, projectId: string): Promise<UnifiedProject | null>
  listProjectSessions(instanceId: string, projectId: string): Promise<UnifiedSession[]>
  detectProject(instanceId: string, projectId: string): Promise<GatewayDetectProjectResult>
  readProjectPrompt(
    instanceId: string,
    projectId: string,
    cliType: ProjectPromptCliType
  ): Promise<ProjectPromptFile | null>
  writeProjectPrompt(
    instanceId: string,
    projectId: string,
    cliType: ProjectPromptCliType,
    content: string
  ): Promise<ProjectPromptFile | null>
}

export interface Gateway extends SessionGateway, ProjectGateway {}
