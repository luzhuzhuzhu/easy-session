import { ipcMain, BrowserWindow, dialog } from 'electron'
import { access } from 'fs/promises'
import { join } from 'path'
import { ProjectManager } from '../services/project-manager'
import { SessionManager } from '../services/session-manager'

export function registerProjectHandlers(
  projectManager: ProjectManager,
  sessionManager: SessionManager
): void {
  ipcMain.handle('project:add', (_event, path: string, name?: string) => {
    return projectManager.addProject(path, name)
  })

  ipcMain.handle('project:remove', async (_event, id: string) => {
    const project = projectManager.getProject(id)
    if (!project) return false

    const projectSessions = sessionManager.listSessions({ projectPath: project.path })
    for (const session of projectSessions) {
      sessionManager.destroySession(session.id)
    }

    return projectManager.removeProject(id)
  })

  ipcMain.handle('project:list', async () => {
    return projectManager.listProjects()
  })

  ipcMain.handle('project:get', (_event, id: string) => {
    return projectManager.getProject(id) || null
  })

  ipcMain.handle('project:update', (_event, id: string, updates: { name?: string }) => {
    return projectManager.updateProject(id, updates)
  })

  ipcMain.handle('project:open', (_event, id: string) => {
    return projectManager.openProject(id)
  })

  ipcMain.handle('project:selectFolder', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('project:sessions', (_event, projectId: string) => {
    const project = projectManager.getProject(projectId)
    if (!project) return []
    return sessionManager.listSessions({ projectPath: project.path })
  })

  ipcMain.handle('project:detect', async (_event, projectPath: string) => {
    const exists = async (relativePath: string): Promise<boolean> => {
      try {
        await access(join(projectPath, relativePath))
        return true
      } catch {
        return false
      }
    }

    const [
      hasClaudeDir,
      hasClaudeSettings,
      hasClaudePrompt,
      hasClaudePromptUpper,
      hasCodexDir,
      hasCodexConfig,
      hasAgentsFile,
      hasAgentsFileUpper
    ] = await Promise.all([
      exists('.claude'),
      exists(join('.claude', 'settings.json')),
      exists('CLAUDE.md'),
      exists('CLAUDE.MD'),
      exists('.codex'),
      exists(join('.codex', 'config.json')),
      exists('AGENTS.md'),
      exists('AGENTS.MD')
    ])

    return {
      claude: hasClaudeDir || hasClaudeSettings || hasClaudePrompt || hasClaudePromptUpper,
      codex: hasCodexDir || hasCodexConfig || hasAgentsFile || hasAgentsFileUpper
    }
  })

  ipcMain.handle('project:prompt:read', async (_event, id: string, cliType: 'claude' | 'codex') => {
    return projectManager.readProjectPromptFile(id, cliType)
  })

  ipcMain.handle(
    'project:prompt:write',
    async (_event, id: string, cliType: 'claude' | 'codex', content: string) => {
      return projectManager.writeProjectPromptFile(id, cliType, content)
    }
  )
}
