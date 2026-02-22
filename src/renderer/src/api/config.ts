import { ipc } from './ipc'

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

export function watchConfig(filePath: string): Promise<void> {
  return ipc.invoke<void>('config:watch:start', filePath)
}

export function unwatchConfig(filePath: string): Promise<void> {
  return ipc.invoke<void>('config:watch:stop', filePath)
}
