import { ipcMain } from 'electron'
import { RemoteServiceManager } from '../services/remote-service-manager'
import type {
  RemoteServiceSettingsUpdate,
  RemoteServiceTokenMode
} from '../services/remote-service-settings-types'

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`参数 ${name} 必须是对象`)
  }
}

function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`参数 ${name} 必须是布尔值`)
  }
}

function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`参数 ${name} 必须是非空字符串`)
  }
}

function parsePort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error('参数 port 必须是 1 到 65535 之间的整数')
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

  // SEC-8：非 loopback 需要显式风险确认（renderer 弹不可跳过的警示后传 true）
  if (Object.prototype.hasOwnProperty.call(value, 'insecureNonLoopbackAck')) {
    assertBoolean(value.insecureNonLoopbackAck, 'insecureNonLoopbackAck')
    update.insecureNonLoopbackAck = value.insecureNonLoopbackAck
  }

  return update
}

function isLoopbackHost(host: string): boolean {
  return (
    host === '127.0.0.1' ||
    host === 'localhost' ||
    host === '::1' ||
    host === '[::1]' ||
    host.toLowerCase() === '::ffff:127.0.0.1'
  )
}

export function registerRemoteServiceHandlers(remoteServiceManager: RemoteServiceManager): void {
  ipcMain.handle('remote-service:getState', () => {
    return remoteServiceManager.getState()
  })

  ipcMain.handle('remote-service:update', (_event, settings: unknown) => {
    const update = toUpdate(settings)
    // SEC-8：非 loopback 监听 = 明文 HTTP 传输 bearer token。renderer 必须显式带
    // insecureNonLoopbackAck=true（UI 侧确认弹窗）才允许保存，防止误改 host 无感裸奔。
    if (!isLoopbackHost(update.host) && update.enabled && !update.insecureNonLoopbackAck) {
      throw new Error('REMOTE_INSECURE_HOST_ACK_REQUIRED')
    }
    return remoteServiceManager.updateSettings(update)
  })

  ipcMain.handle('remote-service:getToken', () => {
    return remoteServiceManager.getEffectiveToken()
  })

  ipcMain.handle('remote-service:regenerateDefaultToken', () => {
    return remoteServiceManager.regenerateDefaultToken()
  })
}
