import type { IpcRendererEvent } from 'electron'

export interface ElectronAPI {
  platform: NodeJS.Platform
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void
  removeListener(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
