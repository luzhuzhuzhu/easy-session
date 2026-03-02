import { ipcMain } from 'electron'
import { SessionManager } from '../services/session-manager'
import type { CreateSessionParams, SessionFilter } from '../services/session-types'

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value) {
    throw new Error(`参数 ${name} 必须为非空字符串`)
  }
}

function assertPositiveInt(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
    throw new Error(`参数 ${name} 必须为正整数`)
  }
}

export function registerSessionHandlers(
  sessionManager: SessionManager
): void {
  ipcMain.handle('session:create', (_event, params: CreateSessionParams) => {
    if (!params || typeof params !== 'object') {
      throw new Error('参数 params 必须为对象')
    }
    return sessionManager.createSession(params)
  })

  ipcMain.handle('session:destroy', (_event, id: string) => {
    assertString(id, 'id')
    return sessionManager.destroySession(id)
  })

  ipcMain.handle('session:list', (_event, filter?: SessionFilter) => {
    return sessionManager.listSessions(filter)
  })

  ipcMain.handle('session:get', (_event, id: string) => {
    assertString(id, 'id')
    return sessionManager.getSession(id) || null
  })

  ipcMain.handle('session:input', (_event, id: string, input: string) => {
    assertString(id, 'id')
    if (typeof input !== 'string') throw new Error('参数 input 必须为字符串')
    return sessionManager.sendInput(id, input)
  })

  ipcMain.handle('session:write', (_event, id: string, data: string) => {
    assertString(id, 'id')
    if (typeof data !== 'string') throw new Error('参数 data 必须为字符串')
    return sessionManager.writeRaw(id, data)
  })

  ipcMain.handle('session:output:history', (_event, id: string, lines?: number) => {
    assertString(id, 'id')
    if (lines !== undefined && (typeof lines !== 'number' || !Number.isFinite(lines) || lines < 0)) {
      throw new Error('参数 lines 必须为非负数')
    }
    return sessionManager.outputManager.getHistory(id, lines)
  })

  ipcMain.handle('session:output:clear', (_event, id: string) => {
    assertString(id, 'id')
    sessionManager.outputManager.clearHistory(id)
  })

  ipcMain.handle('session:resize', (_event, id: string, cols: number, rows: number) => {
    assertString(id, 'id')
    assertPositiveInt(cols, 'cols')
    assertPositiveInt(rows, 'rows')
    sessionManager.resizeTerminal(id, cols, rows)
  })

  ipcMain.handle('session:rename', (_event, id: string, name: string) => {
    assertString(id, 'id')
    assertString(name, 'name')
    return sessionManager.renameSession(id, name)
  })

  ipcMain.handle('session:updateIcon', (_event, id: string, icon: string | null) => {
    assertString(id, 'id')
    if (icon !== null && typeof icon !== 'string') throw new Error('参数 icon 必须为字符串或 null')
    return sessionManager.updateSessionIcon(id, icon)
  })

  ipcMain.handle('session:restart', (_event, id: string) => {
    assertString(id, 'id')
    return sessionManager.restartSession(id)
  })

  ipcMain.handle('session:start', (_event, id: string) => {
    assertString(id, 'id')
    return sessionManager.startSession(id)
  })

  ipcMain.handle('session:pause', (_event, id: string) => {
    assertString(id, 'id')
    return sessionManager.pauseSession(id)
  })
}
