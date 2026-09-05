/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  const component: DefineComponent<{}, {}, unknown>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  /** UX-1 LRU 终端历史快照缓存清理钩子（TerminalOutput.vue 挂载） */
  __esClearHistorySnapshot?: (globalSessionKey: string) => void
  /** e2e IPC mock 钩子 */
  __e2e_ipc_mock__?: (channel: string, ...args: unknown[]) => Promise<unknown> | undefined
}
