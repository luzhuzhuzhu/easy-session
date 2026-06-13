import type { IpcRendererEvent } from 'electron'
import { ipc } from './ipc'

export type AgentTaskStatus =
  | 'created'
  | 'accepted'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'rejected'

export interface AgentTaskEvent {
  at: number
  status: AgentTaskStatus | 'progress' | 'note'
  by: string
  text?: string
}

export interface AgentTask {
  id: string
  from: string
  fromName: string
  to: string
  toName: string
  title: string
  status: AgentTaskStatus
  result?: string
  createdAt: number
  updatedAt: number
  statusSince: number
  history: AgentTaskEvent[]
}

export interface AgentBusMessage {
  id: string
  from: string
  fromName: string
  to: string
  kind: 'message' | 'request' | 'reply' | 'event'
  body: string
  createdAt: number
  readAt?: number
}

export interface AgentIdentity {
  sessionId: string
  name: string
  type: string
}

export interface BusSnapshot {
  agents: AgentIdentity[]
  tasks: AgentTask[]
  messages: AgentBusMessage[]
  // bus 是否就绪；未就绪时 error 给出原因（用于 UI 提示）。旧主进程可能不返回，故可选。
  ready?: boolean
  error?: string | null
}

export function getBusSnapshot(): Promise<BusSnapshot> {
  return ipc.invoke<BusSnapshot>('bus:snapshot')
}

// 订阅 bus 变化（任务/消息更新），返回取消订阅函数。
export function onBusChanged(callback: () => void): () => void {
  const handler = (): void => callback()
  ipc.on('bus:changed', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('bus:changed', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}
