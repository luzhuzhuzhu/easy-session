import { ipc } from './ipc'

export type CliType = 'claude' | 'codex'

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

export function spawnCli(type: CliType, projectPath: string, options?: object): Promise<string> {
  return ipc.invoke<string>('cli:spawn', type, projectPath, options)
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
