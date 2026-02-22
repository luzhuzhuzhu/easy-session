import type { IpcRendererEvent } from 'electron'

type IpcListener = (event: IpcRendererEvent, ...args: unknown[]) => void

interface ChannelListeners {
  listeners: Set<IpcListener>
  bridge: IpcListener | null
}

interface IpcBusState {
  channels: Map<string, ChannelListeners>
}

function getIpcBusState(): IpcBusState {
  const win = window as any
  if (!win.__easy_session_ipc_bus__) {
    win.__easy_session_ipc_bus__ = {
      channels: new Map<string, ChannelListeners>()
    } satisfies IpcBusState
  }
  return win.__easy_session_ipc_bus__ as IpcBusState
}

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    // e2e 测试 mock 钩子：优先使用 mock，返回 undefined 时回退到真实 IPC
    const mock = (window as any).__e2e_ipc_mock__
    if (mock) {
      const r = await mock(channel, ...args)
      if (r !== undefined) return r as T
    }
    return (await window.electronAPI.invoke(channel, ...args)) as T
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`IPC 调用失败 [${channel}]: ${message}`)
  }
}

function on(channel: string, callback: (event: IpcRendererEvent, ...args: unknown[]) => void): void {
  const state = getIpcBusState()
  let channelState = state.channels.get(channel)
  if (!channelState) {
    channelState = {
      listeners: new Set<IpcListener>(),
      bridge: null
    }
    state.channels.set(channel, channelState)
  }

  if (!channelState.bridge) {
    channelState.bridge = (event: IpcRendererEvent, ...args: unknown[]) => {
      const listenersSnapshot = Array.from(channelState!.listeners)
      for (const listener of listenersSnapshot) {
        listener(event, ...args)
      }
    }
    window.electronAPI.on(channel, channelState.bridge)
  }

  channelState.listeners.add(callback)
}

function removeListener(
  channel: string,
  callback: (event: IpcRendererEvent, ...args: unknown[]) => void
): void {
  const state = getIpcBusState()
  const channelState = state.channels.get(channel)
  if (!channelState) return

  channelState.listeners.delete(callback)

  if (channelState.listeners.size === 0 && channelState.bridge) {
    window.electronAPI.removeListener(channel, channelState.bridge)
    state.channels.delete(channel)
  }
}

export const ipc = { invoke, on, removeListener }
