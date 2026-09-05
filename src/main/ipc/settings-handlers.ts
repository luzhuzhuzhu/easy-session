import { ipcMain, app } from 'electron'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { writeFileAtomic } from '../services/atomic-write'

const getSettingsPath = () => join(app.getPath('userData'), 'app-settings.json')

// 会话退出通知偏好变化时通知主进程内订阅方（index.ts 的 exit notifier）。
type NotifyPrefListener = (pref: unknown) => void
const notifyPrefListeners = new Set<NotifyPrefListener>()

export function onSessionExitNotifyPrefChange(listener: NotifyPrefListener): () => void {
  notifyPrefListeners.add(listener)
  return () => notifyPrefListeners.delete(listener)
}

// UX-2：任务事件通知偏好（taskNotify：'off' 仅关 / 'fail' 仅失败阻塞 / 'all' 全部终态）。
type TaskNotifyPrefListener = (pref: unknown) => void
const taskNotifyPrefListeners = new Set<TaskNotifyPrefListener>()

export function onTaskNotifyPrefChange(listener: TaskNotifyPrefListener): () => void {
  taskNotifyPrefListeners.add(listener)
  return () => taskNotifyPrefListeners.delete(listener)
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
    // STAB-1：app-settings.json 原子写，避免崩溃时截断
    await writeFileAtomic(getSettingsPath(), JSON.stringify(settings, null, 2))
    if ('sessionExitNotify' in settings) {
      for (const listener of notifyPrefListeners) {
        try {
          listener(settings.sessionExitNotify)
        } catch {
          // 单个订阅方失败不影响写盘
        }
      }
    }
    if ('taskNotify' in settings) {
      for (const listener of taskNotifyPrefListeners) {
        try {
          listener(settings.taskNotify)
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
