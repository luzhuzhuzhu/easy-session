import { app, ipcMain, shell } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'

export interface CrashNotice {
  /** 本次恢复原因：单次崩溃提示 or 连续崩溃进入安全模式 */
  level: 'recovered' | 'safe-mode'
  /** 安全模式下最近崩溃次数（recovered 时为 1） */
  count: number
}

export const CRASH_NOTICE_CHANNEL = 'app:crash:notice'
const CRASH_WINDOW_MS = 10 * 60 * 1000
const SAFE_MODE_THRESHOLD = 3

interface CrashRecord {
  at: number
}

const crashHistory: CrashRecord[] = []
let safeModeActive = false

export function crashLogPath(): string {
  return join(app.getPath('userData'), 'renderer-crash.log')
}

// UX-13：渲染进程崩溃恢复的用户感知。主进程在 reload 前调用 recordCrashAndDecide，
// 恢复完成后通过 app:crash:notice 告知渲染层弹 toast；连崩时附带安全模式语义。
export function recordCrashAndDecide(now = Date.now()): CrashNotice {
  // 清理窗口外的历史记录
  while (crashHistory.length && now - crashHistory[0].at > CRASH_WINDOW_MS) {
    crashHistory.shift()
  }
  crashHistory.push({ at: now })

  const count = crashHistory.length
  if (count >= SAFE_MODE_THRESHOLD) {
    safeModeActive = true
    return { level: 'safe-mode', count }
  }
  return { level: 'recovered', count: 1 }
}

export function isCrashSafeMode(): boolean {
  return safeModeActive
}

export function clearCrashSafeMode(): void {
  safeModeActive = false
  crashHistory.length = 0
}

export function registerCrashHandlers(): void {
  ipcMain.handle('app:crash:info', () => {
    return {
      safeMode: safeModeActive,
      crashCount: crashHistory.length,
      logExists: true
    }
  })

  // 「查看崩溃日志」：定位到 userData 目录下的 renderer-crash.log（文件存在才打开）
  ipcMain.handle('app:crash:openLog', async () => {
    const logPath = crashLogPath()
    try {
      await readFile(logPath, 'utf8')
    } catch {
      return { ok: false, error: 'CRASH_LOG_NOT_FOUND' }
    }
    shell.showItemInFolder(logPath)
    return { ok: true }
  })
}
