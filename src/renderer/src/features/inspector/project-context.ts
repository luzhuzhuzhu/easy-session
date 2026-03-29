import { LOCAL_INSTANCE_ID } from '@/models/unified-resource'
import type { InspectorProjectOption } from './types'

interface InspectorProjectRecord {
  instanceId: string
  path: string
  name: string
}

interface InspectorSessionRef {
  instanceId: string
  globalSessionKey: string
}

interface InspectorSessionRecord {
  globalSessionKey: string
  instanceId: string
  status: string
  projectPath?: string
}

export function basenameOfInspectorPath(pathValue: string): string {
  return pathValue.split(/[\\/]/).filter(Boolean).at(-1) ?? pathValue
}

export function toInspectorProjectPathKey(pathValue: string, platform: string): string {
  return platform === 'win32' ? pathValue.toLowerCase() : pathValue
}

export function resolveInspectorProjectName(
  projectPath: string,
  projects: InspectorProjectRecord[]
): string {
  const existing = projects.find((project) =>
    project.instanceId === LOCAL_INSTANCE_ID && project.path === projectPath
  )
  return existing?.name || basenameOfInspectorPath(projectPath)
}

export function resolveActiveLocalSessionProject(params: {
  activeSessionRef: InspectorSessionRef | null | undefined
  fallbackSessionRef: InspectorSessionRef | null | undefined
  getSessionByKey: (globalSessionKey: string) => InspectorSessionRecord | undefined
  projects: InspectorProjectRecord[]
  platform: string
}): InspectorProjectOption | null {
  const sessionRef = params.activeSessionRef ?? params.fallbackSessionRef
  if (!sessionRef || sessionRef.instanceId !== LOCAL_INSTANCE_ID) return null

  const session = params.getSessionByKey(sessionRef.globalSessionKey)
  if (!session?.projectPath) return null

  return {
    key: toInspectorProjectPathKey(session.projectPath, params.platform),
    projectPath: session.projectPath,
    projectName: resolveInspectorProjectName(session.projectPath, params.projects),
    source: 'active'
  }
}

export function buildManualInspectorProjectOptions(params: {
  activeProjectOption: InspectorProjectOption | null
  sessions: InspectorSessionRecord[]
  projects: InspectorProjectRecord[]
  platform: string
}): InspectorProjectOption[] {
  const map = new Map<string, InspectorProjectOption>()
  const active = params.activeProjectOption

  if (active) {
    map.set(active.key, active)
  }

  for (const session of params.sessions) {
    if (session.instanceId !== LOCAL_INSTANCE_ID || session.status !== 'running' || !session.projectPath) continue
    const key = toInspectorProjectPathKey(session.projectPath, params.platform)
    if (map.has(key)) continue
    map.set(key, {
      key,
      projectPath: session.projectPath,
      projectName: resolveInspectorProjectName(session.projectPath, params.projects),
      source: 'running'
    })
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'active' ? -1 : 1
    }
    return a.projectName.localeCompare(b.projectName, 'zh-CN')
  })
}

export function resolveCurrentInspectorProjectOption(params: {
  autoFollowActivePaneProject: boolean
  activeProjectOption: InspectorProjectOption | null
  manualProjectPath: string | null
  manualProjectOptions: InspectorProjectOption[]
  projects: InspectorProjectRecord[]
  platform: string
}): InspectorProjectOption | null {
  if (params.autoFollowActivePaneProject) {
    return params.activeProjectOption
  }

  if (params.manualProjectPath) {
    const manualKey = toInspectorProjectPathKey(params.manualProjectPath, params.platform)
    const manual = params.manualProjectOptions.find((item) => item.key === manualKey)
    if (manual) return manual

    return {
      key: manualKey,
      projectPath: params.manualProjectPath,
      projectName: resolveInspectorProjectName(params.manualProjectPath, params.projects),
      source: 'running'
    }
  }

  return params.activeProjectOption
}
