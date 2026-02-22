import { ipc } from './ipc'
import type { Session } from './session'

export interface Project {
  id: string
  name: string
  path: string
  createdAt: number
  lastOpenedAt: number
  pathExists?: boolean
}

export type ProjectPromptCliType = 'claude' | 'codex'

export interface ProjectPromptFile {
  path: string
  content: string
  exists: boolean
}

export function addProject(path: string, name?: string): Promise<Project> {
  return ipc.invoke<Project>('project:add', path, name)
}

export function removeProject(id: string): Promise<boolean> {
  return ipc.invoke<boolean>('project:remove', id)
}

export function listProjects(): Promise<Project[]> {
  return ipc.invoke<Project[]>('project:list')
}

export function getProject(id: string): Promise<Project | null> {
  return ipc.invoke<Project | null>('project:get', id)
}

export function updateProject(id: string, updates: { name?: string }): Promise<Project> {
  return ipc.invoke<Project>('project:update', id, updates)
}

export function openProject(id: string): Promise<Project> {
  return ipc.invoke<Project>('project:open', id)
}

export function selectFolder(): Promise<string | null> {
  return ipc.invoke<string | null>('project:selectFolder')
}

export function getProjectSessions(projectId: string): Promise<Session[]> {
  return ipc.invoke<Session[]>('project:sessions', projectId)
}

export function detectProject(projectPath: string): Promise<{ claude: boolean; codex: boolean }> {
  return ipc.invoke<{ claude: boolean; codex: boolean }>('project:detect', projectPath)
}

export function readProjectPrompt(
  projectId: string,
  cliType: ProjectPromptCliType
): Promise<ProjectPromptFile | null> {
  return ipc.invoke<ProjectPromptFile | null>('project:prompt:read', projectId, cliType)
}

export function writeProjectPrompt(
  projectId: string,
  cliType: ProjectPromptCliType,
  content: string
): Promise<ProjectPromptFile | null> {
  return ipc.invoke<ProjectPromptFile | null>('project:prompt:write', projectId, cliType, content)
}
