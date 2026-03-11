import { ipcMain } from 'electron'
import { RemoteNetworkSettingsManager } from '../services/remote-network-settings-manager'
import type {
  ProxyMode,
  RemoteNetworkSettingsUpdate,
  TunnelTransportMode
} from '../services/remote-network-settings-types'

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`参数 ${name} 必须为对象`)
  }
}

function parseProxyMode(value: unknown, field: string): ProxyMode {
  if (value === 'auto' || value === 'off' || value === 'inherit' || value === 'custom') {
    return value
  }
  throw new Error(`参数 ${field} 仅支持 auto / off / inherit / custom`)
}

function parseTransportMode(value: unknown): TunnelTransportMode {
  if (value === 'auto' || value === 'http2' || value === 'quic') {
    return value
  }
  throw new Error('参数 cloudflare.transportMode 仅支持 auto / http2 / quic')
}

function parseNullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new Error(`参数 ${field} 必须为字符串或 null`)
}

function toUpdate(value: unknown): RemoteNetworkSettingsUpdate {
  assertObject(value, 'settings')
  const update: RemoteNetworkSettingsUpdate = {}

  if (Object.prototype.hasOwnProperty.call(value, 'cloudflare')) {
    assertObject(value.cloudflare, 'cloudflare')
    update.cloudflare = {}

    if (Object.prototype.hasOwnProperty.call(value.cloudflare, 'transportMode')) {
      update.cloudflare.transportMode = parseTransportMode(value.cloudflare.transportMode)
    }
    if (Object.prototype.hasOwnProperty.call(value.cloudflare, 'proxyMode')) {
      update.cloudflare.proxyMode = parseProxyMode(
        value.cloudflare.proxyMode,
        'cloudflare.proxyMode'
      )
    }
    if (Object.prototype.hasOwnProperty.call(value.cloudflare, 'customProxyUrl')) {
      update.cloudflare.customProxyUrl = parseNullableString(
        value.cloudflare.customProxyUrl,
        'cloudflare.customProxyUrl'
      )
    }
    if (Object.prototype.hasOwnProperty.call(value.cloudflare, 'rememberLastSuccess')) {
      if (typeof value.cloudflare.rememberLastSuccess !== 'boolean') {
        throw new Error('参数 cloudflare.rememberLastSuccess 必须为布尔值')
      }
      update.cloudflare.rememberLastSuccess = value.cloudflare.rememberLastSuccess
    }
    if (Object.prototype.hasOwnProperty.call(value.cloudflare, 'autoFallback')) {
      if (typeof value.cloudflare.autoFallback !== 'boolean') {
        throw new Error('参数 cloudflare.autoFallback 必须为布尔值')
      }
      update.cloudflare.autoFallback = value.cloudflare.autoFallback
    }
  }

  if (Object.prototype.hasOwnProperty.call(value, 'cli')) {
    assertObject(value.cli, 'cli')
    update.cli = {}

    if (Object.prototype.hasOwnProperty.call(value.cli, 'proxyMode')) {
      update.cli.proxyMode = parseProxyMode(value.cli.proxyMode, 'cli.proxyMode')
    }
    if (Object.prototype.hasOwnProperty.call(value.cli, 'customProxyUrl')) {
      update.cli.customProxyUrl = parseNullableString(value.cli.customProxyUrl, 'cli.customProxyUrl')
    }
    if (Object.prototype.hasOwnProperty.call(value.cli, 'enableNoProxyLocalhost')) {
      if (typeof value.cli.enableNoProxyLocalhost !== 'boolean') {
        throw new Error('参数 cli.enableNoProxyLocalhost 必须为布尔值')
      }
      update.cli.enableNoProxyLocalhost = value.cli.enableNoProxyLocalhost
    }
  }

  return update
}

export function registerRemoteNetworkHandlers(
  remoteNetworkSettingsManager: RemoteNetworkSettingsManager
): void {
  ipcMain.handle('remote-network:getState', () => {
    return remoteNetworkSettingsManager.getState()
  })

  ipcMain.handle('remote-network:update', (_event, settings: unknown) => {
    return remoteNetworkSettingsManager.updateSettings(toUpdate(settings))
  })
}
