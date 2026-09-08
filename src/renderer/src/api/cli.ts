import { ipc } from './ipc'
import type { CliType } from '@shared/cli-types'

export type { CliType }

export interface ProcessInfo {
  id: string
  pid: number | undefined
  cliType: CliType
  command: string
  args: string[]
  status: 'running' | 'exited'
  exitCode: number | null
  startTime: number
  endTime?: number
}

export function killCli(id: string): Promise<void> {
  return ipc.invoke<void>('cli:kill', id)
}

export function writeToCli(id: string, input: string): Promise<void> {
  return ipc.invoke<void>('cli:write', id, input)
}

export function listCli(): Promise<ProcessInfo[]> {
  return ipc.invoke<ProcessInfo[]>('cli:list')
}

export function getClaudeVersion(): Promise<string> {
  return ipc.invoke<string>('cli:claude:version')
}

export function getCodexVersion(): Promise<string> {
  return ipc.invoke<string>('cli:codex:version')
}

export function getGeminiVersion(preferredPath?: string): Promise<string> {
  return ipc.invoke<string>('cli:gemini:version', preferredPath)
}

export function getPiVersion(preferredPath?: string): Promise<string> {
  return ipc.invoke<string>('cli:pi:version', preferredPath)
}

export function getOmpVersion(preferredPath?: string): Promise<string> {
  return ipc.invoke<string>('cli:omp:version', preferredPath)
}

export function getGrokVersion(preferredPath?: string): Promise<string> {
  return ipc.invoke<string>('cli:grok:version', preferredPath)
}

export function getHermesVersion(preferredPath?: string): Promise<string> {
  return ipc.invoke<string>('cli:hermes:version', preferredPath)
}
