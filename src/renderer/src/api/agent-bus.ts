import type { IpcRendererEvent } from 'electron'
import { ipc } from './ipc'

export type AgentTaskStatus =
  | 'created'
  | 'delivered'
  | 'accepted'
  | 'in_progress'
  | 'blocked'
  | 'review'
  | 'done'
  | 'failed'
  | 'rejected'
  | 'cancelled'
  | 'expired'

export type AgentCollabMode =
  | 'known-agent'
  | 'terminal-readonly'
  | 'terminal-nudge'
  | 'terminal-inject'

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
  // 归档时间戳（undefined = 未归档）。正交于 status：仅终态任务可归档。
  archivedAt?: number
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
  collabMode: AgentCollabMode
  injectable: boolean
  unread?: number
  activeTaskCount?: number
}

export interface BusSnapshot {
  agents: AgentIdentity[]
  tasks: AgentTask[]
  messages: AgentBusMessage[]
  // bus 是否就绪；未就绪时 error 给出原因（用于 UI 提示）。旧主进程可能不返回，故可选。
  ready?: boolean
  error?: string | null
  skillInstall?: {
    ok: boolean
    installed: Array<{ dir: string; ok: boolean; skipped: boolean; error?: string }>
    failed: Array<{ dir: string; ok: boolean; skipped: boolean; error?: string }>
  } | null
}

export function getBusSnapshot(): Promise<BusSnapshot> {
  return ipc.invoke<BusSnapshot>('bus:snapshot')
}

export function getCollabSkillMarkdown(): Promise<string> {
  return ipc.invoke<string>('bus:getCollabSkill')
}

// 单个目标的群发结果（部分成功/失败要在 UI 可见）。
export interface BusTargetResult {
  targetId: string
  ok: boolean
  error?: string
  taskId?: string
}

export interface BusActionResult {
  // ok = 至少一个目标成功。
  ok: boolean
  error?: string
  taskId?: string
  // 群发时逐目标的结果；单目标旧主进程可能不返回，故可选。
  results?: BusTargetResult[]
}

export function sendBusMessage(targetIds: string[], text: string): Promise<BusActionResult> {
  return ipc.invoke<BusActionResult>('bus:sendMessage', targetIds, text)
}

export function createBusTask(targetIds: string[], title: string): Promise<BusActionResult> {
  return ipc.invoke<BusActionResult>('bus:createTask', targetIds, title)
}

export function transitionBusTask(
  taskId: string,
  action: 'confirm' | 'cancel' | 'unblock',
  text?: string
): Promise<BusActionResult> {
  return ipc.invoke<BusActionResult>('bus:taskTransition', taskId, action, text)
}

export function setBusTaskStatus(
  taskId: string,
  status: AgentTaskStatus,
  text?: string
): Promise<BusActionResult> {
  return ipc.invoke<BusActionResult>('bus:setTaskStatus', taskId, status, text)
}

export function setSessionCollabMode(
  sessionId: string,
  mode: AgentCollabMode
): Promise<BusActionResult> {
  return ipc.invoke<BusActionResult>('bus:setSessionCollabMode', sessionId, mode)
}

// 归档/取消归档任务（仅终态可归档，非终态主进程返回 ok:false；幂等）。
export function archiveBusTask(taskId: string): Promise<BusActionResult> {
  return ipc.invoke<BusActionResult>('bus:archiveTask', taskId)
}

export function unarchiveBusTask(taskId: string): Promise<BusActionResult> {
  return ipc.invoke<BusActionResult>('bus:unarchiveTask', taskId)
}

// 订阅 bus 变化（任务/消息更新），返回取消订阅函数。
export function onBusChanged(callback: () => void): () => void {
  const handler = (): void => callback()
  ipc.on('bus:changed', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('bus:changed', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}

export interface NotifyUserPayload {
  title: string
  body: string
  taskId?: string
}

// 设置任务栏角标（离开协作页时反映未处理待办数）。主进程未就绪时静默失败。
export function setAppBadgeCount(count: number): Promise<void> {
  return ipc.invoke<void>('app:setBadgeCount', count).catch(() => undefined)
}

// 弹系统级通知（水位之后新出现的待办）。主进程未就绪时静默失败。
export function notifyUser(payload: NotifyUserPayload): Promise<void> {
  return ipc.invoke<void>('app:notifyUser', payload).catch(() => undefined)
}

// 监听主进程的“聚焦协作页”请求（点击系统通知/角标后），回调收到可选 taskId。
export function onCollabFocus(callback: (taskId?: string) => void): () => void {
  const handler = (_event: IpcRendererEvent, taskId?: unknown): void => {
    callback(typeof taskId === 'string' ? taskId : undefined)
  }
  ipc.on('collab:focus', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('collab:focus', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}
