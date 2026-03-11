import {
  LOCAL_INSTANCE_ID,
  type Instance,
  type UnifiedProject,
  type UnifiedSession
} from '../../models/unified-resource'
import { projectPriorityScore, sessionPriorityScore } from '../../utils/smart-priority'

export type SessionPriorityMode = 'balanced' | 'recent'

export type SessionTreeSessionItem = UnifiedSession & { id: string }

export interface ProjectMeta {
  globalProjectKey: string
  projectId: string
  instanceId: string
  name: string
  path: string
  lastOpenedAt: number
  source: UnifiedProject['source']
}

export interface ProjectSessionGroup {
  key: string
  instanceId: string
  instanceName: string
  instanceType: 'local' | 'remote'
  instanceStatus: 'unknown' | 'connecting' | 'online' | 'offline' | 'error'
  instanceLastError: string | null
  instanceLatencyMs: number | null
  instanceLastCheckedAt: number | null
  projectId: string | null
  projectName: string
  projectPath: string
  sessions: SessionTreeSessionItem[]
  canCreateSession: boolean
  canOpenProjectDetail: boolean
  canOpenLocalProject: boolean
}

export interface InstanceTreeGroup {
  key: string
  instanceId: string
  instanceName: string
  instanceType: 'local' | 'remote'
  instanceStatus: 'unknown' | 'connecting' | 'online' | 'offline' | 'error'
  instanceLastError: string | null
  instanceLatencyMs: number | null
  instanceLastCheckedAt: number | null
  projects: ProjectSessionGroup[]
  sessionCount: number
}

export interface BuildProjectSessionTreeOptions {
  filteredSessions: SessionTreeSessionItem[]
  sortedProjects: ProjectMeta[]
  projectByKey: Map<string, ProjectMeta>
  instancesById: Record<string, Instance>
  includeEmptyProjects: boolean
  smartSessionsEnabled: boolean
  smartProjectsEnabled: boolean
  mode: SessionPriorityMode
  now: number
  manualSessionOrder: Record<string, string[]>
  manualProjectOrder: string[]
  unmanagedProjectLabel: string
}

export function normalizePathKey(path: string, platform: NodeJS.Platform | undefined): string {
  const safePath = path || ''
  return platform === 'win32' ? safePath.toLowerCase() : safePath
}

export function buildProjectGroupKey(
  instanceId: string,
  path: string,
  platform?: NodeJS.Platform
): string {
  const normalizedPath = normalizePathKey(path, platform)
  if (instanceId === LOCAL_INSTANCE_ID) return normalizedPath
  return `${instanceId}::${normalizedPath}`
}

export function getPathLeaf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path || '-'
}

function canCreateSession(
  instanceId: string,
  projectId: string | null,
  projectPath: string,
  instance: Instance | undefined
): boolean {
  const canCreate = instance?.capabilities.sessionCreate ?? true
  if (!canCreate) return false

  if (instanceId === LOCAL_INSTANCE_ID) {
    return !!projectPath
  }

  return !!projectId
}

function canOpenLocalProjectWorkbench(
  instanceId: string,
  projectId: string | null,
  instance: Instance | undefined
): boolean {
  if (instanceId !== LOCAL_INSTANCE_ID || !projectId) return false

  const capabilities = instance?.capabilities
  if (!capabilities) return true

  return !!(
    capabilities.localPathOpen ||
    capabilities.projectPromptRead ||
    capabilities.projectPromptWrite
  )
}

function canOpenProjectDetail(projectId: string | null, instance: Instance | undefined): boolean {
  if (!projectId) return false
  if (!instance) return true
  return !!instance.capabilities.projectRead
}

export function buildProjectSessionTree(options: BuildProjectSessionTreeOptions): ProjectSessionGroup[] {
  const {
    filteredSessions,
    sortedProjects,
    projectByKey,
    instancesById,
    includeEmptyProjects,
    smartSessionsEnabled,
    smartProjectsEnabled,
    mode,
    now,
    manualSessionOrder,
    manualProjectOrder,
    unmanagedProjectLabel
  } = options

  const platform = instancesById[LOCAL_INSTANCE_ID]?.type === 'local'
    ? instancesById[LOCAL_INSTANCE_ID].platform
    : undefined
  const groupMap = new Map<string, ProjectSessionGroup>()

  if (includeEmptyProjects) {
    for (const project of sortedProjects) {
      const instance = instancesById[project.instanceId]
      const key = buildProjectGroupKey(project.instanceId, project.path, platform)
      groupMap.set(key, {
        key,
        instanceId: project.instanceId,
        instanceName: instance?.name ?? project.instanceId,
        instanceType: instance?.type ?? project.source,
        instanceStatus: instance?.type === 'remote' ? instance.status : 'online',
        instanceLastError: instance?.type === 'remote' ? instance.lastError : null,
        instanceLatencyMs: instance?.type === 'remote' ? instance.latencyMs : null,
        instanceLastCheckedAt: instance?.type === 'remote' ? instance.lastCheckedAt : null,
        projectId: project.projectId,
        projectName: project.name,
        projectPath: project.path,
        sessions: [],
        canCreateSession: canCreateSession(project.instanceId, project.projectId, project.path, instance),
        canOpenProjectDetail: canOpenProjectDetail(project.projectId, instance),
        canOpenLocalProject: canOpenLocalProjectWorkbench(project.instanceId, project.projectId, instance)
      })
    }
  }

  for (const session of filteredSessions) {
    const path = session.projectPath || ''
    const key = buildProjectGroupKey(session.instanceId, path, platform)

    if (!groupMap.has(key)) {
      const project = projectByKey.get(key)
      const instance = instancesById[session.instanceId]
      groupMap.set(key, {
        key,
        instanceId: session.instanceId,
        instanceName: instance?.name ?? session.instanceId,
        instanceType: instance?.type ?? session.source,
        instanceStatus: instance?.type === 'remote' ? instance.status : 'online',
        instanceLastError: instance?.type === 'remote' ? instance.lastError : null,
        instanceLatencyMs: instance?.type === 'remote' ? instance.latencyMs : null,
        instanceLastCheckedAt: instance?.type === 'remote' ? instance.lastCheckedAt : null,
        projectId: project ? project.projectId : (session.projectId ?? null),
        projectName: project ? project.name : (path ? getPathLeaf(path) : unmanagedProjectLabel),
        projectPath: path,
        sessions: [],
        canCreateSession: canCreateSession(
          session.instanceId,
          project ? project.projectId : (session.projectId ?? null),
          path,
          instance
        ),
        canOpenProjectDetail: canOpenProjectDetail(project ? project.projectId : (session.projectId ?? null), instance),
        canOpenLocalProject: canOpenLocalProjectWorkbench(
          session.instanceId,
          project ? project.projectId : (session.projectId ?? null),
          instance
        )
      })
    }

    groupMap.get(key)!.sessions.push(session)
  }

  const groups = Array.from(groupMap.values()).filter((group) => group.sessions.length > 0 || includeEmptyProjects)

  for (const group of groups) {
    if (smartSessionsEnabled) {
      const sessionScores = new Map<string, number>()
      for (const session of group.sessions) {
        sessionScores.set(session.id, sessionPriorityScore(session, mode, now))
      }
      group.sessions.sort((a, b) => (sessionScores.get(b.id) ?? 0) - (sessionScores.get(a.id) ?? 0))
      continue
    }

    const manualOrder = manualSessionOrder[group.key]
    if (manualOrder && manualOrder.length > 0) {
      const orderMap = new Map<string, number>()
      manualOrder.forEach((id, index) => orderMap.set(id, index))
      group.sessions.sort((a, b) => {
        const aIndex = orderMap.get(a.id) ?? 999999
        const bIndex = orderMap.get(b.id) ?? 999999
        if (aIndex !== bIndex) return aIndex - bIndex
        if (a.status === 'running' && b.status !== 'running') return -1
        if (b.status === 'running' && a.status !== 'running') return 1
        return b.createdAt - a.createdAt
      })
    } else {
      group.sessions.sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return -1
        if (b.status === 'running' && a.status !== 'running') return 1
        return b.createdAt - a.createdAt
      })
    }
  }

  if (smartProjectsEnabled) {
    const groupScores = new Map<string, number>()
    for (const group of groups) {
      const meta = projectByKey.get(group.key)
      groupScores.set(
        group.key,
        projectPriorityScore(
          { lastOpenedAt: meta?.lastOpenedAt ?? 0 },
          group.sessions,
          mode,
          now
        )
      )
    }
    groups.sort((a, b) => (groupScores.get(b.key) ?? 0) - (groupScores.get(a.key) ?? 0))
  } else if (manualProjectOrder.length > 0) {
    const orderMap = new Map<string, number>()
    manualProjectOrder.forEach((key, index) => orderMap.set(key, index))
    groups.sort((a, b) => {
      const aIndex = orderMap.get(a.key) ?? 999999
      const bIndex = orderMap.get(b.key) ?? 999999
      return aIndex - bIndex
    })
  } else {
    groups.sort((a, b) => a.projectName.localeCompare(b.projectName))
  }

  return groups
}

export function buildInstanceTree(
  instances: Instance[],
  projectGroups: ProjectSessionGroup[]
): InstanceTreeGroup[] {
  const byInstance = new Map<string, InstanceTreeGroup>()

  for (const instance of instances) {
    byInstance.set(instance.id, {
      key: instance.id,
      instanceId: instance.id,
      instanceName: instance.name,
      instanceType: instance.type,
      instanceStatus: instance.type === 'remote' ? instance.status : 'online',
      instanceLastError: instance.type === 'remote' ? instance.lastError : null,
      instanceLatencyMs: instance.type === 'remote' ? instance.latencyMs : null,
      instanceLastCheckedAt: instance.type === 'remote' ? instance.lastCheckedAt : null,
      projects: [],
      sessionCount: 0
    })
  }

  for (const group of projectGroups) {
    const current = byInstance.get(group.instanceId) ?? {
      key: group.instanceId,
      instanceId: group.instanceId,
      instanceName: group.instanceName,
      instanceType: group.instanceType,
      instanceStatus: group.instanceStatus,
      instanceLastError: group.instanceLastError,
      instanceLatencyMs: group.instanceLatencyMs,
      instanceLastCheckedAt: group.instanceLastCheckedAt,
      projects: [],
      sessionCount: 0
    }

    current.projects.push(group)
    current.sessionCount += group.sessions.length
    byInstance.set(group.instanceId, current)
  }

  return Array.from(byInstance.values()).sort((left, right) => {
    if (left.instanceId === LOCAL_INSTANCE_ID) return -1
    if (right.instanceId === LOCAL_INSTANCE_ID) return 1
    return left.instanceName.localeCompare(right.instanceName, 'zh-CN')
  })
}
