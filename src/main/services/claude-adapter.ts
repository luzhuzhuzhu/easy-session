import { cliVersion, findCliExecutable } from './cli-runtime'
import { resolveCliConfigPath } from './config-paths'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import type { ClaudeSessionOptions } from './types'

export class ClaudeAdapter {
  private cliManager: CliManager
  private appendSystemPrompt: string | null = null

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  // 由 AgentBus 装配时注入：让 claude 启动即知道可用 es 与其他会话协作。
  setAppendSystemPrompt(text: string | null): void {
    this.appendSystemPrompt = text && text.trim() ? text : null
  }

  private busArgs(customArgs: string[]): string[] {
    if (!this.appendSystemPrompt) return []
    // 用户自定义参数里已带 --append-system-prompt 时不再叠加，避免重复传旗标。
    if (customArgs.includes('--append-system-prompt')) return []
    return ['--append-system-prompt', this.appendSystemPrompt]
  }

  async getCliPath(): Promise<string> {
    const path = findCliExecutable('claude')
    if (!path) throw new Error('CLI_NOT_FOUND: claude')
    return path
  }

  getVersion(preferredPath?: string): Promise<string> {
    return cliVersion('claude', preferredPath)
  }

  startSession(projectPath: string, options?: ClaudeSessionOptions, claudeSessionId?: string): string {
    const id = `claude-${randomUUID()}`
    const args: string[] = []

    if (claudeSessionId) args.push('--session-id', claudeSessionId)
    if (options?.model) args.push('--model', options.model)
    if (options?.allowedTools) {
      for (const tool of options.allowedTools) {
        args.push('--allowed-tools', tool)
      }
    }
    const custom = normalizeCustomCliArgs(options?.customArgs)
    args.push(...this.busArgs(custom))
    args.push(...custom)

    const executable = options?.cliPath?.trim() || 'claude'
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
    return id
  }

  resumeSession(projectPath: string, options?: ClaudeSessionOptions, claudeSessionId?: string): string {
    if (!claudeSessionId) throw new Error('claudeSessionId is required for resume')
    const id = `claude-${randomUUID()}`
    const args: string[] = ['--resume', claudeSessionId]

    if (options?.model) args.push('--model', options.model)
    if (options?.allowedTools) {
      for (const tool of options.allowedTools) {
        args.push('--allowed-tools', tool)
      }
    }
    const custom = normalizeCustomCliArgs(options?.customArgs)
    args.push(...this.busArgs(custom))
    args.push(...custom)

    const executable = options?.cliPath?.trim() || 'claude'
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  getConfigPaths(): { global: string; project: (p: string) => string } {
    return {
      global: resolveCliConfigPath('claude'),
      project: (p: string) => join(p, '.claude', 'settings.json')
    }
  }
}
