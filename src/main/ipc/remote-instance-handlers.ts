import { ipcMain } from 'electron'
import { RemoteInstanceManager } from '../services/remote-instance-manager'
import type { RemoteInstanceDraft, RemoteInstanceUpdate } from '../services/remote-instance-types'

function assertNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`参数 ${name} 必须为非空字符串`)
  }
}

function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(`参数 ${name} 必须为对象`)
  }
}

function toDraft(value: unknown): RemoteInstanceDraft {
  assertObject(value, 'draft')
  assertNonEmptyString(value.name, 'name')
  assertNonEmptyString(value.baseUrl, 'baseUrl')
  assertNonEmptyString(value.token, 'token')

  return {
    name: value.name,
    baseUrl: value.baseUrl,
    token: value.token,
    enabled: typeof value.enabled === 'boolean' ? value.enabled : true
  }
}

function toUpdate(value: unknown): RemoteInstanceUpdate {
  assertObject(value, 'updates')
  const updates: RemoteInstanceUpdate = {}

  if ('name' in value) {
    assertNonEmptyString(value.name, 'name')
    updates.name = value.name
  }
  if ('baseUrl' in value) {
    assertNonEmptyString(value.baseUrl, 'baseUrl')
    updates.baseUrl = value.baseUrl
  }
  if ('token' in value) {
    assertNonEmptyString(value.token, 'token')
    updates.token = value.token
  }
  if ('enabled' in value) {
    if (typeof value.enabled !== 'boolean') {
      throw new Error('参数 enabled 必须为布尔值')
    }
    updates.enabled = value.enabled
  }

  return updates
}

export function registerRemoteInstanceHandlers(remoteInstanceManager: RemoteInstanceManager): void {
  ipcMain.handle('remote-instance:list', () => {
    return remoteInstanceManager.listInstances()
  })

  ipcMain.handle('remote-instance:add', (_event, draft: unknown) => {
    return remoteInstanceManager.addInstance(toDraft(draft))
  })

  ipcMain.handle('remote-instance:update', (_event, id: unknown, updates: unknown) => {
    assertNonEmptyString(id, 'id')
    return remoteInstanceManager.updateInstance(id, toUpdate(updates))
  })

  ipcMain.handle('remote-instance:remove', (_event, id: unknown) => {
    assertNonEmptyString(id, 'id')
    return remoteInstanceManager.removeInstance(id)
  })

  ipcMain.handle('remote-instance:test', (_event, target: unknown) => {
    if (typeof target === 'string' && target.trim()) {
      return remoteInstanceManager.testInstance(target.trim())
    }

    assertObject(target, 'target')
    assertNonEmptyString(target.baseUrl, 'baseUrl')
    assertNonEmptyString(target.token, 'token')
    return remoteInstanceManager.testDraft({
      baseUrl: target.baseUrl,
      token: target.token
    })
  })

  ipcMain.handle('remote-instance:getToken', (_event, id: unknown) => {
    assertNonEmptyString(id, 'id')
    return remoteInstanceManager.getToken(id)
  })
}
