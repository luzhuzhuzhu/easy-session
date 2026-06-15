import { ipcMain } from 'electron'
import { CliManager } from '../services/cli-manager'
import { ClaudeAdapter } from '../services/claude-adapter'
import { CodexAdapter } from '../services/codex-adapter'
import { OpenCodeAdapter } from '../services/opencode-adapter'

export function registerCliHandlers(
  cliManager: CliManager,
  claudeAdapter: ClaudeAdapter,
  codexAdapter: CodexAdapter,
  openCodeAdapter: OpenCodeAdapter
): void {
  // 注：旧的 'cli:spawn' 裸进程启动 API 已下线——它游离于 SessionManager 之外、
  // 无会话生命周期归属，且 preload 白名单已不再放行该通道（渲染层无调用方）。
  // 会话启动统一走 session:create / 各 *-session-lifecycle 的 adapter.startSession。
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

  ipcMain.handle('cli:opencode:version', (_event, preferredPath?: string) => {
    const normalizedPath =
      typeof preferredPath === 'string' && preferredPath.trim().length > 0
        ? preferredPath.trim()
        : undefined
    return openCodeAdapter.getVersionWithPath(normalizedPath)
  })
}
