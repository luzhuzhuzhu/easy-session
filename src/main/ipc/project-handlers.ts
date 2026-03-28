import { ipcMain, BrowserWindow, dialog } from 'electron'
import { access } from 'fs/promises'
import { join } from 'path'
import { ProjectInspectorService, type ProjectInspectorTarget } from '../services/project-inspector'
import { ProjectManager } from '../services/project-manager'
import { SessionManager } from '../services/session-manager'

export function registerProjectHandlers(
  projectManager: ProjectManager,
  sessionManager: SessionManager
): void {
  const inspector = new ProjectInspectorService(projectManager, sessionManager)

  ipcMain.handle('project:add', (_event, path: string, name?: string) => {
    if (typeof path !== 'string' || !path) throw new Error('参数 path 必须为非空字符串')
    return projectManager.addProject(path, name)
  })

  ipcMain.handle('project:remove', async (_event, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('参数 id 必须为非空字符串')
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
      hasAgentsFileUpper,
      hasOpenCodeDir,
      hasOpenCodeConfig,
      hasOpenCodeSkills,
      hasAgentsSkills
    ] = await Promise.all([
      exists('.claude'),
      exists(join('.claude', 'settings.json')),
      exists('CLAUDE.md'),
      exists('CLAUDE.MD'),
      exists('.codex'),
      exists(join('.codex', 'config.json')),
      exists('AGENTS.md'),
      exists('AGENTS.MD'),
      exists('.opencode'),
      exists('opencode.json'),
      exists(join('.opencode', 'skills')),
      exists(join('.agents', 'skills'))
    ])

    return {
      claude: hasClaudeDir || hasClaudeSettings || hasClaudePrompt || hasClaudePromptUpper,
      codex: hasCodexDir || hasCodexConfig || hasAgentsFile || hasAgentsFileUpper,
      opencode: hasOpenCodeDir || hasOpenCodeConfig || hasOpenCodeSkills || hasAgentsSkills
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

  ipcMain.handle('project:fileTree', async (_event, target: ProjectInspectorTarget, relativePath?: string) => {
    return inspector.listFileTree(target, relativePath)
  })

  ipcMain.handle('project:fileRead', async (_event, target: ProjectInspectorTarget, relativePath: string) => {
    return inspector.readFile(target, relativePath)
  })

  ipcMain.handle('project:gitStatus', async (_event, target: ProjectInspectorTarget) => {
    return inspector.getGitStatus(target)
  })

  ipcMain.handle(
    'project:gitDiff',
    async (
      _event,
      target: ProjectInspectorTarget,
      relativePath: string,
      options?: { viewMode?: 'staged' | 'unstaged' | 'auto' }
    ) => {
      return inspector.getGitDiff(target, relativePath, options)
    }
  )

  ipcMain.handle(
    'project:gitLog',
    async (
      _event,
      target: ProjectInspectorTarget,
      options?: { skip?: number; maxCount?: number; branch?: string }
    ) => {
      return inspector.getGitLog(target, options)
    }
  )

  ipcMain.handle(
    'project:gitFileHistory',
    async (
      _event,
      target: ProjectInspectorTarget,
      relativePath: string,
      options?: { skip?: number; maxCount?: number }
    ) => {
      return inspector.getGitFileHistory(target, relativePath, options)
    }
  )

  ipcMain.handle('project:gitBranches', async (_event, target: ProjectInspectorTarget) => {
    return inspector.getGitBranches(target)
  })

  ipcMain.handle('project:gitStage', async (_event, target: ProjectInspectorTarget, relativePath: string) => {
    return inspector.stageFile(target, relativePath)
  })

  ipcMain.handle('project:gitUnstage', async (_event, target: ProjectInspectorTarget, relativePath: string) => {
    return inspector.unstageFile(target, relativePath)
  })

  ipcMain.handle('project:gitDiscard', async (_event, target: ProjectInspectorTarget, relativePath: string) => {
    return inspector.discardFile(target, relativePath)
  })

  ipcMain.handle('project:gitCommit', async (_event, target: ProjectInspectorTarget, message: string) => {
    return inspector.commitChanges(target, message)
  })

  ipcMain.handle('project:gitCheckout', async (_event, target: ProjectInspectorTarget, branchName: string) => {
    return inspector.checkoutBranch(target, branchName)
  })

  ipcMain.handle('project:gitFetch', async (_event, target: ProjectInspectorTarget) => {
    return inspector.fetchGitRemote(target)
  })

  ipcMain.handle('project:gitPull', async (_event, target: ProjectInspectorTarget) => {
    return inspector.pullCurrentBranch(target)
  })

  ipcMain.handle('project:gitPush', async (_event, target: ProjectInspectorTarget) => {
    return inspector.pushCurrentBranch(target)
  })

  ipcMain.handle('project:gitCommitChanges', async (_event, target: ProjectInspectorTarget, commitHash: string) => {
    return inspector.getCommitChanges(target, commitHash)
  })

  ipcMain.handle('project:gitCommitDiff', async (_event, target: ProjectInspectorTarget, commitHash: string, relativePath?: string) => {
    return inspector.getCommitDiff(target, commitHash, relativePath)
  })
}
