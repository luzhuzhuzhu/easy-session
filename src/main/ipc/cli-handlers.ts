import { ipcMain } from 'electron'
import { CliManager } from '../services/cli-manager'
import { ClaudeAdapter } from '../services/claude-adapter'
import { CodexAdapter } from '../services/codex-adapter'
import type { CliType } from '../services/types'

export function registerCliHandlers(
  cliManager: CliManager,
  claudeAdapter: ClaudeAdapter,
  codexAdapter: CodexAdapter
): void {
  ipcMain.handle(
    'cli:spawn',
    (_event, type: CliType, projectPath: string, options?: object) => {
      if (type !== 'claude' && type !== 'codex') {
        throw new Error('参数 type 必须为 claude 或 codex')
      }
      if (typeof projectPath !== 'string') {
        throw new Error('参数 projectPath 必须为字符串')
      }
      if (type === 'claude') {
        return claudeAdapter.startSession(projectPath, options)
      }
      return codexAdapter.startSession(projectPath, options)
    }
  )

  ipcMain.handle('cli:kill', (_event, id: string) => {
    if (typeof id !== 'string' || !id) throw new Error('参数 id 必须为非空字符串')
    return cliManager.kill(id)
  })

  ipcMain.handle('cli:write', (_event, id: string, input: string) => {
    if (typeof id !== 'string' || !id) throw new Error('参数 id 必须为非空字符串')
    if (typeof input !== 'string') throw new Error('参数 input 必须为字符串')
    return cliManager.write(id, input)
  })

  ipcMain.handle('cli:list', () => {
    return cliManager.listProcesses()
  })

  ipcMain.handle('cli:claude:version', () => {
    return claudeAdapter.getVersion()
  })

  ipcMain.handle('cli:codex:version', () => {
    return codexAdapter.getVersion()
  })
}
