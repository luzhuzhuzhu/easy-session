import { ipcMain } from 'electron'
import { SessionManager } from '../services/session-manager'
import type { CreateSessionParams, SessionFilter } from '../services/session-types'

export function registerSessionHandlers(
  sessionManager: SessionManager
): void {
  ipcMain.handle('session:create', (_event, params: CreateSessionParams) => {
    return sessionManager.createSession(params)
  })

  ipcMain.handle('session:destroy', (_event, id: string) => {
    return sessionManager.destroySession(id)
  })

  ipcMain.handle('session:list', (_event, filter?: SessionFilter) => {
    return sessionManager.listSessions(filter)
  })

  ipcMain.handle('session:get', (_event, id: string) => {
    return sessionManager.getSession(id) || null
  })

  ipcMain.handle('session:input', (_event, id: string, input: string) => {
    return sessionManager.sendInput(id, input)
  })

  ipcMain.handle('session:write', (_event, id: string, data: string) => {
    return sessionManager.writeRaw(id, data)
  })

  ipcMain.handle('session:output:history', (_event, id: string, lines?: number) => {
    return sessionManager.outputManager.getHistory(id, lines)
  })

  ipcMain.handle('session:output:clear', (_event, id: string) => {
    sessionManager.outputManager.clearHistory(id)
  })

  ipcMain.handle('session:resize', (_event, id: string, cols: number, rows: number) => {
    sessionManager.resizeTerminal(id, cols, rows)
  })

  ipcMain.handle('session:rename', (_event, id: string, name: string) => {
    return sessionManager.renameSession(id, name)
  })

  ipcMain.handle('session:updateIcon', (_event, id: string, icon: string | null) => {
    return sessionManager.updateSessionIcon(id, icon)
  })

  ipcMain.handle('session:restart', (_event, id: string) => {
    return sessionManager.restartSession(id)
  })

  ipcMain.handle('session:start', (_event, id: string) => {
    return sessionManager.startSession(id)
  })

  ipcMain.handle('session:pause', (_event, id: string) => {
    return sessionManager.pauseSession(id)
  })
}
