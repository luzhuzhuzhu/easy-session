import { ipcMain, BrowserWindow } from 'electron'
import { ConfigService } from '../services/config-service'

export function registerConfigHandlers(configService: ConfigService): void {
  ipcMain.handle('config:claude:read', () => {
    return configService.getClaudeGlobalConfig()
  })

  ipcMain.handle('config:claude:write', (_event, config: object) => {
    return configService.setClaudeGlobalConfig(config)
  })

  ipcMain.handle('config:claude:project:read', (_event, projectPath: string) => {
    return configService.getClaudeProjectConfig(projectPath)
  })

  ipcMain.handle('config:claude:project:write', (_event, projectPath: string, config: object) => {
    return configService.setClaudeProjectConfig(projectPath, config)
  })

  ipcMain.handle('config:codex:read', () => {
    return configService.getCodexConfig()
  })

  ipcMain.handle('config:codex:write', (_event, config: object) => {
    return configService.setCodexConfig(config)
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
