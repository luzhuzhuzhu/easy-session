import { ipcMain } from 'electron'
import { CloudflareTunnelManager } from '../services/cloudflare-tunnel-manager'

export function registerCloudflareTunnelHandlers(
  cloudflareTunnelManager: CloudflareTunnelManager
): void {
  ipcMain.handle('cloudflare-tunnel:getState', () => {
    return cloudflareTunnelManager.getState()
  })

  ipcMain.handle('cloudflare-tunnel:updateConfig', (_event, binaryPath: unknown) => {
    if (binaryPath !== null && binaryPath !== undefined && typeof binaryPath !== 'string') {
      throw new Error('参数 binaryPath 必须为字符串或 null')
    }
    return cloudflareTunnelManager.updateConfig(
      typeof binaryPath === 'string' ? binaryPath : null
    )
  })

  ipcMain.handle('cloudflare-tunnel:start', () => {
    return cloudflareTunnelManager.start()
  })

  ipcMain.handle('cloudflare-tunnel:stop', () => {
    return cloudflareTunnelManager.stop()
  })
}
