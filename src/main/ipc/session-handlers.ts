import { ipcMain } from 'electron'
import { z } from 'zod'
import { SessionManager } from '../services/session-manager'
import { detectShells } from '../services/shell-detector'
import type { CreateSessionParams, SessionFilter, Session } from '../services/session-types'
import { CLI_REGISTRY } from './cli-registry'
import type { OpenCodeAdapter } from '../services/opencode-adapter'
import type { CodexAdapter } from '../services/codex-adapter'
import { discoverNativeSessions } from '../services/native-session-discovery'
import { isCliType } from '../../shared/cli-types'

// session:create 的形状校验：用 zod 取代「不校验直接强转持久化」。
// options 用 passthrough（校验已知字段类型，放过未知字段保兼容），校验作为准入门，
// 通过后仍传原始 params，避免误删字段。
// FEAT-2：discriminatedUnion 由 cli-registry 派生，新增 CLI 只改注册表。

const baseSessionFields = {
  name: z.string().optional(),
  icon: z.string().optional(),
  projectPath: z.string().min(1, 'projectPath 不能为空'),
  parentId: z.string().optional(),
  startPaused: z.boolean().optional(),
  // UX-11：新建 terminal 会话时的协作注入模式预置
  collabMode: z.enum(['terminal-readonly', 'terminal-nudge', 'terminal-inject']).optional()
}

const OPTIONS_SCHEMAS: Record<string, z.ZodTypeAny> = Object.fromEntries(
  CLI_REGISTRY.map((entry) => [entry.id, entry.optionsSchema])
)

const createSessionSchema = z.discriminatedUnion(
  'type',
  CLI_REGISTRY.map((entry) =>
    z.object({ type: z.literal(entry.id as never), options: OPTIONS_SCHEMAS[entry.id].optional(), ...baseSessionFields })
  ) as never
)

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
  sessionManager: SessionManager,
  agentBus?: { presetCollabMode(sessionId: string, mode: string): void },
  openCodeAdapter?: OpenCodeAdapter,
  codexAdapter?: CodexAdapter
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
    const session = sessionManager.createSession(params)
    // UX-11：新建时预置协作模式（terminal-readonly/terminal-nudge/terminal-inject）。
    const presetMode = (params as { collabMode?: unknown }).collabMode
    if (session && agentBus && typeof presetMode === 'string') {
      agentBus.presetCollabMode(session.id, presetMode)
    }
    return session
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

  // UX-1：已退出会话的桌面 UI 日志出口——读 output journal 尾部。
  // 与 es output 共用同一份落盘文件；未启用 journal / 无文件时返回 null。
  ipcMain.handle('session:output:journalTail', (_event, id: string, lines?: number) => {
    assertString(id, 'id')
    if (lines !== undefined && (typeof lines !== 'number' || !Number.isFinite(lines) || lines < 0)) {
      throw new Error('参数 lines 必须为非负数')
    }
    return sessionManager.outputManager.readJournalTail(id, lines ?? 500)
  })

  // UX-9：跨会话输出全文搜索（内存缓冲 + journal 兜底），附带会话名元数据。
  ipcMain.handle('session:output:search', (_event, query: string, limitPerSession?: number) => {
    if (typeof query !== 'string' || !query.trim()) return []
    const names = new Map<string, { name?: string; type?: string }>()
    for (const session of sessionManager.listSessions()) {
      names.set(session.id, { name: session.name, type: session.type })
    }
    return sessionManager.outputManager.searchJournals(query, { limitPerSession, sessionNames: names })
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

  // 自定义绑定/修改会话的原生 resume ID（claude/codex/opencode/gemini/pi/omp/grok/hermes）。
  // value 为空串/null 表示解除绑定，下次启动全新会话；运行中的进程不受影响，重启后生效。
  ipcMain.handle('session:setNativeId', (_event, id: string, cliType: string, value: string | null) => {
    assertString(id, 'id')
    if (!isCliType(cliType) || cliType === 'terminal') {
      throw new Error('参数 cliType 必须为支持 resume 的 CLI 类型')
    }
    if (value !== null && typeof value !== 'string') throw new Error('参数 value 必须为字符串或 null')
    return sessionManager.setNativeSessionId(id, cliType, value)
  })

  // 会话候选列表：返回明确的 discovery 状态，避免把“不支持扫描”伪装成空结果。
  ipcMain.handle('session:nativeIdCandidates', async (_event, cliType: string, projectPath?: string, preferredPath?: string) => {
    return discoverNativeSessions(cliType, projectPath, preferredPath, {
      openCodeAdapter,
      codexAdapter
    })
  })

  ipcMain.handle('terminal:detectShells', () => {
    return detectShells()
  })
}
