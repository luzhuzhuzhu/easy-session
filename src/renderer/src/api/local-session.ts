import type { IpcRendererEvent } from 'electron'
import { ipc } from './ipc'

import type { CliType } from '@shared/cli-types'

export type { CliType }
export type SessionStatus = 'idle' | 'running' | 'stopped' | 'error'

export interface Session {
  id: string
  name: string
  icon: string | null
  type: CliType
  projectPath: string
  status: SessionStatus
  createdAt: number
  lastStartAt?: number
  totalRunMs?: number
  lastRunMs?: number
  lastActiveAt: number
  processId: string | null
  options: Record<string, unknown>
  parentId: string | null
  claudeSessionId?: string | null
  codexSessionId?: string | null
  opencodeSessionId?: string | null
  geminiSessionId?: string | null
  piSessionId?: string | null
  ompSessionId?: string | null
  grokSessionId?: string | null
  hermesSessionId?: string | null
}

export interface CreateSessionParams {
  name?: string
  icon?: string
  type: CliType
  projectPath: string
  options?: Record<string, unknown>
  parentId?: string
  startPaused?: boolean
  collabMode?: 'terminal-readonly' | 'terminal-nudge' | 'terminal-inject'
}

export interface SessionFilter {
  type?: CliType
  projectPath?: string
  status?: SessionStatus
  parentId?: string
}

export interface OutputEvent {
  sessionId: string
  data: string
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq?: number
}

export interface OutputLine {
  text: string
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq?: number
}

const inflightReadRequests = new Map<string, Promise<unknown>>()

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)

  return `{${entries.join(',')}}`
}

function withReadDedupe<T>(channel: string, args: unknown[], fn: () => Promise<T>): Promise<T> {
  const key = `${channel}:${args.map((arg) => stableStringify(arg)).join('|')}`
  const existing = inflightReadRequests.get(key) as Promise<T> | undefined
  if (existing) return existing

  const request = fn().finally(() => {
    inflightReadRequests.delete(key)
  })
  inflightReadRequests.set(key, request as Promise<unknown>)
  return request
}

export function createSession(params: CreateSessionParams): Promise<Session> {
  return ipc.invoke<Session>('session:create', params)
}

export function destroySession(id: string): Promise<boolean> {
  return ipc.invoke<boolean>('session:destroy', id)
}

export function listSessions(filter?: SessionFilter): Promise<Session[]> {
  return withReadDedupe('session:list', [filter ?? null], () => ipc.invoke<Session[]>('session:list', filter))
}

export function getSession(id: string): Promise<Session | null> {
  return withReadDedupe('session:get', [id], () => ipc.invoke<Session | null>('session:get', id))
}

export function sendInput(id: string, input: string): Promise<boolean> {
  return ipc.invoke<boolean>('session:input', id, input)
}

export function resizeTerminal(id: string, cols: number, rows: number): Promise<void> {
  return ipc.invoke<void>('session:resize', id, cols, rows)
}

export function writeToSession(id: string, data: string): Promise<boolean> {
  return ipc.invoke<boolean>('session:write', id, data)
}

// 终端间通信：把一段文本发送到另一个会话（经主进程 agent bus 注入门控）。
export function sendToSession(targetId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  return ipc.invoke<{ ok: boolean; error?: string }>('session:sendTo', targetId, text)
}

export function getOutputHistory(id: string, lines?: number): Promise<OutputLine[]> {
  return withReadDedupe('session:output:history', [id, lines ?? null], () =>
    ipc.invoke<OutputLine[]>('session:output:history', id, lines)
  )
}

export function clearOutput(id: string): Promise<void> {
  return ipc.invoke<void>('session:output:clear', id)
}

export function renameSession(id: string, name: string): Promise<boolean> {
  return ipc.invoke<boolean>('session:rename', id, name)
}

export function updateSessionIcon(id: string, icon: string | null): Promise<boolean> {
  return ipc.invoke<boolean>('session:updateIcon', id, icon)
}

export function restartSession(id: string): Promise<Session> {
  return ipc.invoke<Session>('session:restart', id)
}

export function startSession(id: string): Promise<Session> {
  return ipc.invoke<Session>('session:start', id)
}

export function pauseSession(id: string): Promise<Session> {
  return ipc.invoke<Session>('session:pause', id)
}

export function updateSessionOptions(id: string, options: Record<string, unknown>): Promise<Session | null> {
  return ipc.invoke<Session | null>('session:updateOptions', id, options)
}

// 自定义绑定/修改会话的原生 resume ID；value 为空串/null 解除绑定。
// 运行中的进程不受影响，重启后生效。
export function setSessionNativeId(id: string, cliType: Session['type'], value: string | null): Promise<Session | null> {
  return ipc.invoke<Session | null>('session:setNativeId', id, cliType, value)
}

// 会话候选列表（resume ID 选择器数据源）。目前仅 opencode 有发现能力，
// 其他 CLI 返回空数组（UI 回退为手动输入）。
export interface NativeSessionCandidate {
  id: string
  title: string
  updated: number
}
export function getNativeIdCandidates(cliType: Session['type'], projectPath?: string): Promise<NativeSessionCandidate[]> {
  return ipc.invoke<NativeSessionCandidate[]>('session:nativeIdCandidates', cliType, projectPath)
}

export interface DetectedShell {
  id: string
  label: string
  path: string
}

export function detectShells(): Promise<DetectedShell[]> {
  return withReadDedupe('terminal:detectShells', [], () => ipc.invoke<DetectedShell[]>('terminal:detectShells'))
}

export function onSessionOutput(callback: (event: OutputEvent) => void): () => void {
  const handler = (_e: IpcRendererEvent, data: OutputEvent) => callback(data)
  ipc.on('session:output', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('session:output', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}

export function onSessionStatusChange(callback: (data: { sessionId: string; status: SessionStatus; lastActiveAt?: number }) => void): () => void {
  const handler = (_e: IpcRendererEvent, data: { sessionId: string; status: SessionStatus; lastActiveAt?: number }) => callback(data)
  ipc.on('session:status', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('session:status', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}

// 主进程点击“会话退出”系统通知后请求聚焦该会话（窗口已同时被拉到前台）。
export function onSessionFocusRequest(callback: (sessionId: string) => void): () => void {
  const handler = (_e: IpcRendererEvent, sessionId: unknown): void => {
    if (typeof sessionId === 'string') callback(sessionId)
  }
  ipc.on('session:focus-request', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('session:focus-request', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}

// UX-1：读取已退出会话的 journal 尾部（桌面 UI「查看输出日志」入口）。
// journal 未启用或无文件时返回 null。
export function getSessionJournalTail(id: string, lines?: number): Promise<string | null> {
  return ipc.invoke<string | null>('session:output:journalTail', id, lines)
}

// UX-9：跨会话输出全文搜索（运行中会话走内存缓冲，已退出会话走 journal）。
export interface JournalSearchMatch {
  line: string
  fromMemory: boolean
}
export interface JournalSearchResult {
  sessionId: string
  name?: string
  type?: string
  matches: JournalSearchMatch[]
}
export function searchSessionOutput(query: string, limitPerSession?: number): Promise<JournalSearchResult[]> {
  return ipc.invoke<JournalSearchResult[]>('session:output:search', query, limitPerSession)
}

// UX-13：崩溃恢复感知。主进程 reload 后推送一次通知；渲染层据此弹 toast。
export interface CrashNoticePayload {
  level: 'recovered' | 'safe-mode'
  count: number
}
export function onCrashNotice(callback: (payload: CrashNoticePayload) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: unknown): void => {
    if (payload && typeof payload === 'object' && typeof (payload as CrashNoticePayload).level === 'string') {
      callback(payload as CrashNoticePayload)
    }
  }
  ipc.on('app:crash:notice', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('app:crash:notice', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}

export interface CrashInfo {
  safeMode: boolean
  crashCount: number
  logExists: boolean
}
export function getCrashInfo(): Promise<CrashInfo> {
  return ipc.invoke<CrashInfo>('app:crash:info')
}
export function openCrashLog(): Promise<{ ok: boolean; error?: string }> {
  return ipc.invoke<{ ok: boolean; error?: string }>('app:crash:openLog')
}
