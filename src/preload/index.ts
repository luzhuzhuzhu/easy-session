import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

export interface ElectronAPI {
  platform: NodeJS.Platform
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void
  removeListener(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void
}

const ALLOWED_INVOKE_CHANNELS = [
  // app / window
  'app:getVersion', 'app:getPlatform', 'app:getSystemInfo',
  'window:minimize', 'window:maximize', 'window:close',
  'dialog:selectFolder', 'shell:openPath', 'cli:check',
  // config
  'config:claude:read', 'config:claude:write',
  'config:claude:project:read', 'config:claude:project:write',
  'config:codex:read', 'config:codex:write',
  'config:watch:start', 'config:watch:stop',
  // workspace
  'workspace:getLayout', 'workspace:updateLayout', 'workspace:resetLayout',
  // session
  'session:create', 'session:destroy', 'session:list', 'session:get',
  'session:input', 'session:write', 'session:output:history', 'session:output:clear',
  'session:resize', 'session:rename', 'session:updateIcon',
  'session:restart', 'session:start', 'session:pause',
  // skill
  'skill:list', 'skill:get', 'skill:create', 'skill:delete',
  'skill:execute', 'skill:preview',
  'project:skill:list', 'project:skill:delete', 'project:skill:openPath',
  // project
  'project:add', 'project:remove', 'project:list', 'project:get',
  'project:update', 'project:open', 'project:selectFolder',
  'project:sessions', 'project:detect', 'project:prompt:read',
  // settings
  'settings:read', 'settings:write',
  // cli
  'cli:kill', 'cli:write', 'cli:list', 'cli:claude:version', 'cli:codex:version'
]

const ALLOWED_RECEIVE_CHANNELS = [
  'session:output',
  'session:status',
  'config:changed',
  'cli:output',
  'cli:exit',
  'cli:error',
  'protocol:message',
  'app:shutdown-start'
]

const electronAPI: ElectronAPI = {
  platform: process.platform,
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`Blocked invoke channel: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.on(channel, callback)
    }
  },
  removeListener(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void {
    if (ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      ipcRenderer.removeListener(channel, callback)
    }
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
