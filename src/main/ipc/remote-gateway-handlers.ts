import { ipcMain } from 'electron'
import { RemoteGatewayManager, type RemoteGatewayInvokePayload } from '../services/remote-gateway-manager'

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

function toInvokePayload(value: unknown): RemoteGatewayInvokePayload {
  assertObject(value, 'payload')
  assertNonEmptyString(value.instanceId, 'instanceId')
  assertNonEmptyString(value.method, 'method')

  return {
    instanceId: value.instanceId.trim(),
    method: value.method.trim() as RemoteGatewayInvokePayload['method'],
    args: Array.isArray(value.args) ? value.args : []
  }
}

export function registerRemoteGatewayHandlers(remoteGatewayManager: RemoteGatewayManager): void {
  ipcMain.handle('remote-gateway:invoke', (_event, payload: unknown) => {
    return remoteGatewayManager.invoke(toInvokePayload(payload))
  })

  ipcMain.handle('remote-gateway:subscribeOutput', (event, instanceId: unknown, sessionId: unknown) => {
    assertNonEmptyString(instanceId, 'instanceId')
    assertNonEmptyString(sessionId, 'sessionId')
    return remoteGatewayManager.subscribeOutput(event.sender, instanceId.trim(), sessionId.trim())
  })

  ipcMain.handle('remote-gateway:unsubscribeOutput', (event, instanceId: unknown, sessionId: unknown) => {
    assertNonEmptyString(instanceId, 'instanceId')
    assertNonEmptyString(sessionId, 'sessionId')
    remoteGatewayManager.unsubscribeOutput(event.sender, instanceId.trim(), sessionId.trim())
  })

  ipcMain.handle('remote-gateway:subscribeStatus', (event, instanceId: unknown) => {
    assertNonEmptyString(instanceId, 'instanceId')
    return remoteGatewayManager.subscribeStatus(event.sender, instanceId.trim())
  })

  ipcMain.handle('remote-gateway:unsubscribeStatus', (event, instanceId: unknown) => {
    assertNonEmptyString(instanceId, 'instanceId')
    remoteGatewayManager.unsubscribeStatus(event.sender, instanceId.trim())
  })
}
