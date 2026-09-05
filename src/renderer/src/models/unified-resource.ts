import type { Project } from '@/api/project'
import type { Session } from '@/api/session'

export const LOCAL_INSTANCE_ID = 'local'

export interface InstanceCapabilities {
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

export interface LocalInstance {
  id: typeof LOCAL_INSTANCE_ID
  type: 'local'
  name: string
  status: 'online'
  platform: NodeJS.Platform
  capabilities: InstanceCapabilities
}

export interface RemoteInstance {
  id: string
  type: 'remote'
  name: string
  baseUrl: string
  enabled: boolean
  authRef: string
  status: 'unknown' | 'connecting' | 'online' | 'offline' | 'error'
  lastCheckedAt: number | null
  passthroughOnly: boolean
  capabilities: InstanceCapabilities
  lastError: string | null
  latencyMs: number | null
}

export type Instance = LocalInstance | RemoteInstance
export type ResourceSource = 'local' | 'remote'

export interface UnifiedProject {
  instanceId: string
  projectId: string
  globalProjectKey: string
  name: string
  path: string
  createdAt: number
  lastOpenedAt: number
  pathExists?: boolean
  source: ResourceSource
}

export interface UnifiedSession {
  instanceId: string
  sessionId: string
  globalSessionKey: string
  name: string
  icon: string | null
  type: Session['type']
  projectId?: string | null
  projectPath: string
  status: Session['status']
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
  /** FEAT-1：按 CLI 类型归一后的原生会话 ID（resume 用）。null = 尚未发现/不支持。 */
  nativeSessionId?: string | null
  source: ResourceSource
}

const CLI_TO_NATIVE_FIELD: Partial<Record<Session['type'], 'claudeSessionId' | 'codexSessionId' | 'opencodeSessionId'>> = {
  claude: 'claudeSessionId',
  codex: 'codexSessionId',
  opencode: 'opencodeSessionId'
}

// FEAT-1：把旧平铺字段（claudeSessionId/codexSessionId/opencodeSessionId）
// 归一为 nativeSessionId。读取处统一走 helper，新增 CLI 只改 CLI_TO_NATIVE_FIELD。
export function readNativeSessionId(session: Pick<UnifiedSession, 'type' | 'claudeSessionId' | 'codexSessionId' | 'opencodeSessionId'>): string | null {
  const field = CLI_TO_NATIVE_FIELD[session.type]
  if (!field) return null
  return (session[field] as string | null | undefined) ?? null
}

export interface ProjectRef {
  instanceId: string
  projectId: string
  globalProjectKey: string
}

export interface SessionRef {
  instanceId: string
  sessionId: string
  globalSessionKey: string
}

export function createFullCapabilities(): InstanceCapabilities {
  return {
    projectsList: true,
    projectRead: true,
    projectCreate: true,
    projectUpdate: true,
    projectRemove: true,
    projectOpen: true,
    projectSessionsList: true,
    projectDetect: true,
    sessionsList: true,
    sessionSubscribe: true,
    sessionInput: true,
    sessionResize: true,
    sessionOutputHistory: true,
    sessionCreate: true,
    sessionStart: true,
    sessionPause: true,
    sessionRestart: true,
    sessionDestroy: true,
    projectPromptRead: true,
    projectPromptWrite: true,
    localPathOpen: true
  }
}

export function buildGlobalProjectKey(instanceId: string, projectId: string): string {
  return `${instanceId}:${projectId}`
}

export function buildGlobalSessionKey(instanceId: string, sessionId: string): string {
  return `${instanceId}:${sessionId}`
}

export function toProjectRef(project: Pick<UnifiedProject, 'instanceId' | 'projectId' | 'globalProjectKey'>): ProjectRef {
  return {
    instanceId: project.instanceId,
    projectId: project.projectId,
    globalProjectKey: project.globalProjectKey
  }
}

export function buildLocalInstance(platform: NodeJS.Platform): LocalInstance {
  return {
    id: LOCAL_INSTANCE_ID,
    type: 'local',
    name: '本机',
    status: 'online',
    platform,
    capabilities: createFullCapabilities()
  }
}

export function toUnifiedProject(
  project: Project,
  options: { instanceId?: string; source?: ResourceSource } = {}
): UnifiedProject {
  const instanceId = options.instanceId ?? LOCAL_INSTANCE_ID
  const source = options.source ?? 'local'

  return {
    instanceId,
    projectId: project.id,
    globalProjectKey: buildGlobalProjectKey(instanceId, project.id),
    name: project.name,
    path: project.path,
    createdAt: project.createdAt,
    lastOpenedAt: project.lastOpenedAt,
    pathExists: project.pathExists,
    source
  }
}

export function toUnifiedSession(
  session: Session & { projectId?: string | null },
  options: { instanceId?: string; source?: ResourceSource } = {}
): UnifiedSession {
  const instanceId = options.instanceId ?? LOCAL_INSTANCE_ID
  const source = options.source ?? 'local'

  return {
    instanceId,
    sessionId: session.id,
    globalSessionKey: buildGlobalSessionKey(instanceId, session.id),
    name: session.name,
    icon: session.icon,
    type: session.type,
    projectId: session.projectId ?? null,
    projectPath: session.projectPath,
    status: session.status,
    createdAt: session.createdAt,
    lastStartAt: session.lastStartAt,
    totalRunMs: session.totalRunMs,
    lastRunMs: session.lastRunMs,
    lastActiveAt: session.lastActiveAt,
    processId: session.processId,
    options: session.options,
    parentId: session.parentId,
    claudeSessionId: session.claudeSessionId,
    codexSessionId: session.codexSessionId,
    opencodeSessionId: session.opencodeSessionId,
    nativeSessionId: readNativeSessionId(session),
    source
  }
}

