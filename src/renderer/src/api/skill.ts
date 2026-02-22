import { ipc } from './ipc'

export type CliType = 'claude' | 'codex'

export interface SkillInputField {
  name: string
  type: 'text' | 'number' | 'select' | 'boolean'
  required: boolean
  description: string
  default?: string | number | boolean
  options?: string[]
}

export interface SkillInput {
  fields: SkillInputField[]
}

export interface SkillOutput {
  format: 'text' | 'json' | 'markdown' | 'diff'
  fields?: { name: string; type: string; description: string }[]
}

export interface Skill {
  id: string
  name: string
  slug: string
  description: string
  sourceCli: CliType
  filePath: string
  compatibleCli: CliType[]
  inputSchema: SkillInput
  outputSchema: SkillOutput
  prompt: string
  isBuiltin: boolean
  category: string
}

export interface SkillFilter {
  category?: string
  cliType?: CliType
}

export function listSkills(filter?: SkillFilter): Promise<Skill[]> {
  return ipc.invoke<Skill[]>('skill:list', filter)
}

export function getSkill(id: string): Promise<Skill | undefined> {
  return ipc.invoke<Skill | undefined>('skill:get', id)
}

export function createSkill(skill: Omit<Skill, 'id' | 'isBuiltin' | 'sourceCli' | 'filePath'>): Promise<Skill> {
  return ipc.invoke<Skill>('skill:create', skill)
}

export function deleteSkill(id: string): Promise<boolean> {
  return ipc.invoke<boolean>('skill:delete', id)
}

export function executeSkill(
  skillId: string,
  sessionId: string,
  inputs: Record<string, any>
): Promise<{ success: boolean; prompt: string }> {
  return ipc.invoke<{ success: boolean; prompt: string }>('skill:execute', skillId, sessionId, inputs)
}

export function previewPrompt(skillId: string, inputs: Record<string, any>): Promise<string | null> {
  return ipc.invoke<string | null>('skill:preview', skillId, inputs)
}

// 项目级技能 API
export function listProjectSkills(projectId: string): Promise<Skill[]> {
  return ipc.invoke<Skill[]>('project:skill:list', projectId)
}

export function deleteProjectSkill(projectId: string, skillId: string): Promise<boolean> {
  return ipc.invoke<boolean>('project:skill:delete', projectId, skillId)
}

export function openSkillPath(filePath: string): Promise<void> {
  return ipc.invoke<void>('project:skill:openPath', filePath)
}
