import { ipcMain, shell } from 'electron'
import { dirname } from 'path'
import type { SkillManager } from '../services/skill-manager'
import type { ProjectManager } from '../services/project-manager'
import type { Skill, SkillFilter } from '../services/skill-types'

export function registerSkillHandlers(skillManager: SkillManager, projectManager: ProjectManager): void {
  ipcMain.handle('skill:list', (_event, filter?: SkillFilter) => {
    return skillManager.listSkills(filter)
  })

  ipcMain.handle('skill:get', (_event, id: string) => {
    return skillManager.getSkill(id)
  })

  ipcMain.handle('skill:create', (_event, skill: Omit<Skill, 'id' | 'isBuiltin' | 'sourceCli' | 'filePath'>) => {
    return skillManager.createSkill(skill)
  })

  ipcMain.handle('skill:delete', (_event, id: string) => {
    return skillManager.deleteSkill(id)
  })

  ipcMain.handle('skill:execute', (_event, skillId: string, sessionId: string, inputs: Record<string, any>) => {
    return skillManager.executeSkill(skillId, sessionId, inputs)
  })

  ipcMain.handle('skill:preview', async (_event, skillId: string, inputs: Record<string, any>) => {
    const skill = await skillManager.getSkill(skillId)
    if (!skill) return null
    return skillManager.renderPrompt(skill, inputs)
  })

  ipcMain.handle('project:skill:list', (_event, projectId: string) => {
    const project = projectManager.getProject(projectId)
    if (!project) return []
    return skillManager.listProjectSkills(project.path)
  })

  ipcMain.handle('project:skill:delete', (_event, projectId: string, skillId: string) => {
    const project = projectManager.getProject(projectId)
    if (!project) return false
    return skillManager.deleteProjectSkill(project.path, skillId)
  })

  ipcMain.handle('project:skill:openPath', async (_event, filePath: string) => {
    await shell.openPath(dirname(filePath))
  })
}
