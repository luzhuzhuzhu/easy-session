import { exec } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import type { ClaudeSessionOptions } from './types'

export class ClaudeAdapter {
  private cliManager: CliManager

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  getCliPath(): Promise<string> {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude'
    return new Promise((resolve, reject) => {
      exec(cmd, (error, stdout) => {
        if (error) return reject(new Error('Claude CLI not found in PATH'))
        resolve(stdout.trim().split('\n')[0])
      })
    })
  }

  getVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      exec('claude --version', (error, stdout) => {
        if (error) return reject(new Error('Failed to get Claude version'))
        resolve(stdout.trim())
      })
    })
  }

  startSession(projectPath: string, options?: ClaudeSessionOptions, claudeSessionId?: string): string {
    const id = `claude-${randomUUID()}`
    const args: string[] = []

    if (claudeSessionId) args.push('--session-id', claudeSessionId)
    if (options?.model) args.push('--model', options.model)
    if (options?.maxTurns) args.push('--max-turns', String(options.maxTurns))
    if (options?.allowedTools) {
      for (const tool of options.allowedTools) {
        args.push('--allowed-tools', tool)
      }
    }

    this.cliManager.spawn(id, 'claude', args, { cwd: projectPath || undefined })
    return id
  }

  resumeSession(projectPath: string, options?: ClaudeSessionOptions, claudeSessionId?: string): string {
    if (!claudeSessionId) throw new Error('claudeSessionId is required for resume')
    const id = `claude-${randomUUID()}`
    const args: string[] = ['--resume', claudeSessionId]

    if (options?.model) args.push('--model', options.model)
    if (options?.maxTurns) args.push('--max-turns', String(options.maxTurns))
    if (options?.allowedTools) {
      for (const tool of options.allowedTools) {
        args.push('--allowed-tools', tool)
      }
    }

    this.cliManager.spawn(id, 'claude', args, { cwd: projectPath || undefined })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  getConfigPaths(): { global: string; project: (p: string) => string } {
    const home = homedir()
    return {
      global: join(home, '.claude', 'settings.json'),
      project: (p: string) => join(p, '.claude', 'settings.json')
    }
  }
}
