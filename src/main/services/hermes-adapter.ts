import { randomUUID } from 'crypto'
import { exec } from 'child_process'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import type { HermesSessionOptions } from './types'

// Hermes Agent（NousResearch，npm hermes-agent 桥）：
// --resume <session_id|latest>、-c/--continue、--model "provider/model"、
// chat -q 非交互。会话存储 ~/.hermes/state.db（SQLite）。
export class HermesAdapter {
  private cliManager: CliManager
  private appendSystemPrompt: string | null = null

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  setAppendSystemPrompt(text: string | null): void {
    this.appendSystemPrompt = text && text.trim() ? text : null
  }

  private busArgs(customArgs: string[]): string[] {
    if (!this.appendSystemPrompt) return []
    if (customArgs.includes('--append-system-prompt')) return []
    return ['--append-system-prompt', this.appendSystemPrompt]
  }

  getVersionWithPath(preferredPath?: string): Promise<string> {
    const target = preferredPath && preferredPath.trim() ? preferredPath.trim() : 'hermes'
    return new Promise((resolve, reject) => {
      exec(`"${target}" --version`, { timeout: 8000 }, (error, stdout) => {
        if (error) return reject(new Error('Failed to get Hermes version'))
        resolve(String(stdout).trim())
      })
    })
  }

  startSession(projectPath: string, options?: HermesSessionOptions, resumeId?: string): string {
    const id = `hermes-${randomUUID()}`
    const args: string[] = []
    const custom = normalizeCustomCliArgs(options?.customArgs)

    if (resumeId) args.push('--resume', resumeId)
    else if (options?.continueLast) args.push('--continue')
    if (options?.model) args.push('--model', options.model)
    args.push(...this.busArgs(custom))
    args.push(...custom)

    const executable = this.resolveExecutable(options)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  private resolveExecutable(options?: HermesSessionOptions): string {
    const customPath = (options as { cliPath?: string } | undefined)?.cliPath
    return customPath && customPath.trim() ? customPath.trim() : 'hermes'
  }
}
