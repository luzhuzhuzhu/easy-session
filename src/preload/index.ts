import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

export interface ElectronAPI {
  platform: NodeJS.Platform
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void
  removeListener(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void
}

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
