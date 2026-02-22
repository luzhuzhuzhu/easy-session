import { ipcMain, app } from 'electron'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const getSettingsPath = () => join(app.getPath('userData'), 'app-settings.json')

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
    return true
  })

  ipcMain.handle('app:getSystemInfo', () => ({
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    arch: process.arch
  }))
}
