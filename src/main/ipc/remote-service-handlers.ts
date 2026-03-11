import { ipcMain } from 'electron'
import { RemoteServiceManager } from '../services/remote-service-manager'
import type {
  RemoteServiceSettingsUpdate,
  RemoteServiceTokenMode
} from '../services/remote-service-settings-types'

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`参数 ${name} 必须为对象`)
  }
}

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`参数 ${name} 必须为布尔值`)
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`参数 ${name} 必须为非空字符串`)
  }
}

function parsePort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error('参数 port 必须是 1-65535 之间的整数')
  }
  return Math.floor(port)
}

function parseTokenMode(value: unknown): RemoteServiceTokenMode {
  if (value === 'default' || value === 'custom') {
    return value
  }
  throw new Error('参数 tokenMode 仅支持 default 或 custom')
}

function toUpdate(value: unknown): RemoteServiceSettingsUpdate {
  assertObject(value, 'settings')
  assertBoolean(value.enabled, 'enabled')
  assertString(value.host, 'host')
  assertBoolean(value.passthroughOnly, 'passthroughOnly')

  const update: RemoteServiceSettingsUpdate = {
    enabled: value.enabled,
    host: value.host.trim(),
    port: parsePort(value.port),
    passthroughOnly: value.passthroughOnly,
    tokenMode: parseTokenMode(value.tokenMode)
  }

  if (Object.prototype.hasOwnProperty.call(value, 'customToken')) {
    update.customToken = typeof value.customToken === 'string' ? value.customToken : null
  }

  return update
}

export function registerRemoteServiceHandlers(remoteServiceManager: RemoteServiceManager): void {
  ipcMain.handle('remote-service:getState', () => {
    return remoteServiceManager.getState()
  })

  ipcMain.handle('remote-service:update', (_event, settings: unknown) => {
    return remoteServiceManager.updateSettings(toUpdate(settings))
  })

  ipcMain.handle('remote-service:getToken', () => {
    return remoteServiceManager.getEffectiveToken()
  })

  ipcMain.handle('remote-service:regenerateDefaultToken', () => {
    return remoteServiceManager.regenerateDefaultToken()
  })
}
