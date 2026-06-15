import { ipcMain } from 'electron'
import { z } from 'zod'
import { SessionManager } from '../services/session-manager'
import { detectShells } from '../services/shell-detector'
import type { CreateSessionParams, SessionFilter, Session } from '../services/session-types'

// session:create 的形状校验：用 zod 取代「不校验直接强转持久化」。
// options 用 passthrough（校验已知字段类型，放过未知字段保兼容），校验作为准入门，
// 通过后仍传原始 params，避免误删字段。
const customCliArgSchema = z.object({ name: z.string(), value: z.string().optional() }).passthrough()

const claudeOptionsSchema = z
  .object({
    model: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

const codexOptionsSchema = z
  .object({
    model: z.string().optional(),
    permissionsMode: z.enum(['read-only', 'default', 'full-access']).optional(),
    sandboxMode: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
    approvalMode: z
      .enum(['untrusted', 'on-request', 'never', 'suggest', 'auto-edit', 'full-auto'])
      .optional(),
    inlineMode: z.boolean().optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

const opencodeOptionsSchema = z
  .object({
    cliPath: z.string().optional(),
    model: z.string().optional(),
    agent: z.string().optional(),
    prompt: z.string().optional(),
    sessionId: z.string().optional(),
    continueLast: z.boolean().optional(),
    fork: z.boolean().optional(),
    attachUrl: z.string().optional(),
    serverMode: z.enum(['off', 'attach']).optional()
  })
  .passthrough()

const terminalOptionsSchema = z
  .object({
    shell: z.string().optional(),
    shellArgs: z.array(customCliArgSchema).optional(),
    startupCommands: z.array(z.string()).optional()
  })
  .passthrough()

const baseSessionFields = {
  name: z.string().optional(),
  icon: z.string().optional(),
  projectPath: z.string().min(1, 'projectPath 不能为空'),
  parentId: z.string().optional(),
  startPaused: z.boolean().optional()
}

const createSessionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('claude'), options: claudeOptionsSchema.optional(), ...baseSessionFields }),
  z.object({ type: z.literal('codex'), options: codexOptionsSchema.optional(), ...baseSessionFields }),
  z.object({ type: z.literal('opencode'), options: opencodeOptionsSchema.optional(), ...baseSessionFields }),
  z.object({ type: z.literal('terminal'), options: terminalOptionsSchema.optional(), ...baseSessionFields })
])

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
    const result = createSessionSchema.safeParse(params)
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.') || 'params'}: ${issue.message}`)
        .join('; ')
      throw new Error(`参数 params 校验失败：${detail}`)
    }
    // 校验通过后传原始 params（zod 仅作准入门，不改写形状）。
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

  ipcMain.handle('session:updateOptions', (_event, id: string, options: Session['options']) => {
    assertString(id, 'id')
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new Error('参数 options 必须为普通对象')
    }
    return sessionManager.updateSessionOptions(id, options)
  })

  ipcMain.handle('terminal:detectShells', () => {
    return detectShells()
  })
}
