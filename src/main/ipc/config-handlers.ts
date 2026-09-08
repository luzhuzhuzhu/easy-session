import { ipcMain, BrowserWindow } from 'electron'
import { ConfigService } from '../services/config-service'
import { isEditableCliType } from '../services/config-paths'
import { ProjectManager } from '../services/project-manager'

// SEC-6：项目级配置读写必须限定在已注册项目内——否则被攻破的 renderer
// 可借 config:claude:project:write 向任意路径投放 .claude/settings.json。
function assertRegisteredProject(projectManager: ProjectManager, projectPath: string): void {
  if (typeof projectPath !== 'string' || !projectPath.trim()) {
    throw new Error('参数 projectPath 必须为非空字符串')
  }
  if (!projectManager.getProjectByPath(projectPath)) {
    throw new Error(`REMOTE_PROJECT_NOT_REGISTERED: ${projectPath}`)
  }
}

export function registerConfigHandlers(configService: ConfigService, projectManager: ProjectManager): void {
  ipcMain.handle('config:cli:read', (_event, cliType: unknown) => {
    if (!isEditableCliType(cliType)) throw new Error('参数 cliType 必须为支持配置编辑的 CLI')
    return configService.readConfig(cliType)
  })

  ipcMain.handle('config:cli:write', (_event, cliType: unknown, content: unknown, expectedRevision?: unknown) => {
    if (!isEditableCliType(cliType)) throw new Error('参数 cliType 必须为支持配置编辑的 CLI')
    if (typeof content !== 'string') throw new Error('参数 content 必须为字符串')
    if (expectedRevision !== undefined && expectedRevision !== null && typeof expectedRevision !== 'string') {
      throw new Error('参数 expectedRevision 必须为字符串或 null')
    }
    return configService.writeConfig(cliType, content, expectedRevision as string | null | undefined)
  })

  ipcMain.handle('config:claude:read', () => {
    return configService.getClaudeGlobalConfig()
  })

  ipcMain.handle('config:claude:write', (_event, config: object) => {
    return configService.setClaudeGlobalConfig(config)
  })

  ipcMain.handle('config:claude:project:read', (_event, projectPath: string) => {
    assertRegisteredProject(projectManager, projectPath)
    return configService.getClaudeProjectConfig(projectPath)
  })

  ipcMain.handle('config:claude:project:write', (_event, projectPath: string, config: object) => {
    assertRegisteredProject(projectManager, projectPath)
    return configService.setClaudeProjectConfig(projectPath, config)
  })

  ipcMain.handle('config:codex:read', () => {
    return configService.getCodexConfig()
  })

  ipcMain.handle('config:codex:write', (_event, config: object) => {
    return configService.setCodexConfig(config)
  })

  ipcMain.handle('config:opencode:read', () => {
    return configService.getOpenCodeConfig()
  })

  ipcMain.handle('config:opencode:write', (_event, config: object) => {
    return configService.setOpenCodeConfig(config)
  })

  ipcMain.handle('config:watch:start', (_event, filePath: string) => {
    configService.watchConfig(filePath, (path) => {
      BrowserWindow.getAllWindows().forEach((win) => {
        win.webContents.send('config:changed', path)
      })
    })
  })

  ipcMain.handle('config:watch:stop', (_event, filePath: string) => {
    configService.unwatchConfig(filePath)
  })
}
