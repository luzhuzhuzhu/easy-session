import {
  clearOutput,
  createSession,
  destroySession,
  getOutputHistory,
  getSession,
  listSessions,
  onSessionStatusChange,
  pauseSession,
  resizeTerminal,
  restartSession,
  startSession,
  writeToSession,
  type OutputLine,
  type SessionFilter
} from '../api/local-session'
import {
  addProject,
  detectProject,
  getProject,
  getProjectSessions,
  listProjects,
  openProject,
  readProjectPrompt,
  removeProject,
  updateProject,
  writeProjectPrompt
} from '../api/local-project'
import { subscribeSessionOutput } from '../services/session-output-stream'
import {
  buildGlobalSessionKey,
  LOCAL_INSTANCE_ID,
  toUnifiedProject,
  toUnifiedSession,
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

function assertLocalInstance(instanceId: string): void {
  if (instanceId !== LOCAL_INSTANCE_ID) {
    throw new Error(`LocalGateway 仅支持本地实例，收到: ${instanceId}`)
  }
}

export class LocalGateway implements Gateway {
  async createSession(instanceId: string, params: GatewayCreateSessionParams): Promise<UnifiedSession> {
    assertLocalInstance(instanceId)
    let projectPath = params.projectPath
    if (!projectPath && params.projectId) {
      const project = await getProject(params.projectId)
      projectPath = project?.path
    }
    if (!projectPath) {
      throw new Error('LocalGateway 创建会话时必须提供 projectPath 或 projectId')
    }

    const session = await createSession({
      type: params.type,
      projectPath,
      name: params.name,
      icon: params.icon,
      options: params.options,
      parentId: params.parentId,
      startPaused: params.startPaused
    })
    return toUnifiedSession(session)
  }

  async startSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    assertLocalInstance(instanceId)
    const session = await startSession(sessionId)
    return session ? toUnifiedSession(session) : null
  }

  async pauseSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    assertLocalInstance(instanceId)
    const session = await pauseSession(sessionId)
    return session ? toUnifiedSession(session) : null
  }

  async restartSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    assertLocalInstance(instanceId)
    const session = await restartSession(sessionId)
    return session ? toUnifiedSession(session) : null
  }

  async destroySession(instanceId: string, sessionId: string): Promise<boolean> {
    assertLocalInstance(instanceId)
    return destroySession(sessionId)
  }

  async listProjects(instanceId: string): Promise<UnifiedProject[]> {
    assertLocalInstance(instanceId)
    const projects = await listProjects()
    return projects.map((project) => toUnifiedProject(project))
  }

  async getProject(instanceId: string, projectId: string): Promise<UnifiedProject | null> {
    assertLocalInstance(instanceId)
    const project = await getProject(projectId)
    return project ? toUnifiedProject(project) : null
  }

  async createProject(instanceId: string, params: GatewayCreateProjectParams): Promise<UnifiedProject> {
    assertLocalInstance(instanceId)
    const project = await addProject(params.path, params.name)
    return toUnifiedProject(project)
  }

  async updateProject(
    instanceId: string,
    projectId: string,
    updates: GatewayUpdateProjectParams
  ): Promise<UnifiedProject | null> {
    assertLocalInstance(instanceId)
    const project = await updateProject(projectId, updates)
    return project ? toUnifiedProject(project) : null
  }

  async removeProject(instanceId: string, projectId: string): Promise<boolean> {
    assertLocalInstance(instanceId)
    return removeProject(projectId)
  }

  async openProject(instanceId: string, projectId: string): Promise<UnifiedProject | null> {
    assertLocalInstance(instanceId)
    const project = await openProject(projectId)
    return project ? toUnifiedProject(project) : null
  }

  async listProjectSessions(instanceId: string, projectId: string): Promise<UnifiedSession[]> {
    assertLocalInstance(instanceId)
    const sessions = await getProjectSessions(projectId)
    return sessions.map((session) => toUnifiedSession(session))
  }

  async detectProject(instanceId: string, projectId: string): Promise<GatewayDetectProjectResult> {
    assertLocalInstance(instanceId)
    const project = await getProject(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }
    return detectProject(project.path)
  }

  async readProjectPrompt(instanceId: string, projectId: string, cliType: 'claude' | 'codex') {
    assertLocalInstance(instanceId)
    return readProjectPrompt(projectId, cliType)
  }

  async writeProjectPrompt(
    instanceId: string,
    projectId: string,
    cliType: 'claude' | 'codex',
    content: string
  ) {
    assertLocalInstance(instanceId)
    return writeProjectPrompt(projectId, cliType, content)
  }

  async listSessions(instanceId: string, filter?: SessionFilter): Promise<UnifiedSession[]> {
    assertLocalInstance(instanceId)
    const sessions = await listSessions(filter)
    return sessions.map((session) => toUnifiedSession(session))
  }

  async getSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null> {
    assertLocalInstance(instanceId)
    const session = await getSession(sessionId)
    return session ? toUnifiedSession(session) : null
  }

  async getOutputHistory(instanceId: string, sessionId: string, lines?: number): Promise<OutputLine[]> {
    assertLocalInstance(instanceId)
    return getOutputHistory(sessionId, lines)
  }

  subscribeOutput(
    instanceId: string,
    sessionId: string,
    listener: (event: GatewayOutputEvent) => void
  ): () => void {
    assertLocalInstance(instanceId)
    return subscribeSessionOutput(
      {
        instanceId,
        sessionId,
        globalSessionKey: buildGlobalSessionKey(instanceId, sessionId)
      },
      (event) => {
        listener({
          ...event,
          instanceId,
          globalSessionKey: buildGlobalSessionKey(instanceId, sessionId)
        })
      }
    )
  }

  subscribeStatus(instanceId: string, listener: (event: GatewayStatusEvent) => void): () => void {
    assertLocalInstance(instanceId)
    return onSessionStatusChange((event) => {
      listener({
        ...event,
        instanceId,
        globalSessionKey: buildGlobalSessionKey(instanceId, event.sessionId)
      })
    })
  }

  async writeRaw(instanceId: string, sessionId: string, data: string): Promise<boolean> {
    assertLocalInstance(instanceId)
    return writeToSession(sessionId, data)
  }

  async resize(instanceId: string, sessionId: string, cols: number, rows: number): Promise<void> {
    assertLocalInstance(instanceId)
    return resizeTerminal(sessionId, cols, rows)
  }

  async clearOutput(instanceId: string, sessionId: string): Promise<void> {
    assertLocalInstance(instanceId)
    return clearOutput(sessionId)
  }
}
