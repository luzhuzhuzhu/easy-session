import { ipc } from './ipc'
import type { CliType } from '@shared/cli-types'

export type ConfigCliType = Exclude<CliType, 'terminal'>

export interface ConfigDocument {
  cliType: ConfigCliType
  path: string
  format: string
  exists: boolean
  content: string
  revision: string | null
}

export function readCliConfig(cliType: ConfigCliType): Promise<ConfigDocument> {
  return ipc.invoke<ConfigDocument>('config:cli:read', cliType)
}

export function writeCliConfig(
  cliType: ConfigCliType,
  content: string,
  expectedRevision?: string | null
): Promise<ConfigDocument> {
  return ipc.invoke<ConfigDocument>('config:cli:write', cliType, content, expectedRevision)
}

export function readClaudeConfig(): Promise<object> {
  return ipc.invoke<object>('config:claude:read')
}

export function writeClaudeConfig(config: object): Promise<void> {
  return ipc.invoke<void>('config:claude:write', config)
}

export function readClaudeProjectConfig(projectPath: string): Promise<object> {
  return ipc.invoke<object>('config:claude:project:read', projectPath)
}

export function writeClaudeProjectConfig(projectPath: string, config: object): Promise<void> {
  return ipc.invoke<void>('config:claude:project:write', projectPath, config)
}

export function readCodexConfig(): Promise<object> {
  return ipc.invoke<object>('config:codex:read')
}

export function writeCodexConfig(config: object): Promise<void> {
  return ipc.invoke<void>('config:codex:write', config)
}

export function readOpenCodeConfig(): Promise<object> {
  return ipc.invoke<object>('config:opencode:read')
}

export function writeOpenCodeConfig(config: object): Promise<void> {
  return ipc.invoke<void>('config:opencode:write', config)
}

export function watchConfig(filePath: string): Promise<void> {
  return ipc.invoke<void>('config:watch:start', filePath)
}

export function unwatchConfig(filePath: string): Promise<void> {
  return ipc.invoke<void>('config:watch:stop', filePath)
}
