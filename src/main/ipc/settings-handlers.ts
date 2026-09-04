import { ipcMain, app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const getSettingsPath = () => join(app.getPath('userData'), 'app-settings.json')

// 会话退出通知偏好变化时通知主进程内订阅方（index.ts 的 exit notifier）。
type NotifyPrefListener = (pref: unknown) => void
const notifyPrefListeners = new Set<NotifyPrefListener>()

export function onSessionExitNotifyPrefChange(listener: NotifyPrefListener): () => void {
  notifyPrefListeners.add(listener)
  return () => notifyPrefListeners.delete(listener)
}

export function registerSettingsHandlers(): void {
  ipcMain.handle('settings:read', async () => {
    try {
      const data = await readFile(getSettingsPath(), 'utf-8')
      return JSON.parse(data)
    } catch {
      return {}
    }
  })

  ipcMain.handle('settings:write', async (_event, settings: Record<string, unknown>) => {
    const filePath = getSettingsPath()
    await mkdir(join(filePath, '..'), { recursive: true })
    await writeFile(filePath, JSON.stringify(settings, null, 2), 'utf-8')
    if ('sessionExitNotify' in settings) {
      for (const listener of notifyPrefListeners) {
        try {
          listener(settings.sessionExitNotify)
        } catch {
          // 单个订阅方失败不影响写盘
        }
      }
    }
    return true
  })

  ipcMain.handle('app:getSystemInfo', () => ({
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch
  }))
}
