import type { IpcRendererEvent } from 'electron'
import { ipc } from './ipc'

export type CliType = 'claude' | 'codex'
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
}

export interface CreateSessionParams {
  name?: string
  icon?: string
  type: CliType
  projectPath: string
  options?: Record<string, unknown>
  parentId?: string
  startPaused?: boolean
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

export function onSessionOutput(callback: (event: OutputEvent) => void): () => void {
  const handler = (_e: IpcRendererEvent, data: OutputEvent) => callback(data)
  ipc.on('session:output', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('session:output', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}

export function onSessionStatusChange(callback: (data: { sessionId: string; status: SessionStatus }) => void): () => void {
  const handler = (_e: IpcRendererEvent, data: { sessionId: string; status: SessionStatus }) => callback(data)
  ipc.on('session:status', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
  return () => ipc.removeListener('session:status', handler as (event: IpcRendererEvent, ...args: unknown[]) => void)
}
