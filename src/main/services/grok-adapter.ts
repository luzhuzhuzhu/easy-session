import { randomUUID } from 'crypto'
import { exec } from 'child_process'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import type { GrokSessionOptions } from './types'

// Grok Build（x.ai 官方 grok CLI，npm @xai-official/grok）：
// -r/--resume <SESSION_ID|title>、-c 续当前目录最近会话、-m/--model、
// --permission-mode default|acceptEdits|auto|dontAsk|bypassPermissions|plan、
// --effort low..max。会话列表：`grok sessions list -n <N>`（纯文本表格，无 --json；
// provider 必须固定 cwd 并严格校验表头/列，未知版本格式按 unsupported/error 处理）。
export class GrokAdapter {
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
    const target = preferredPath && preferredPath.trim() ? preferredPath.trim() : 'grok'
    return new Promise((resolve, reject) => {
      exec(`"${target}" --version`, { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error('Failed to get Grok version'))
        resolve(String(stdout).trim())
      })
    })
  }

  startSession(projectPath: string, options?: GrokSessionOptions, resumeId?: string): string {
    const id = `grok-${randomUUID()}`
    const args: string[] = []
    const custom = normalizeCustomCliArgs(options?.customArgs)

    if (resumeId) args.push('--resume', resumeId)
    else if (options?.continueLast) args.push('--continue')
    if (options?.model) args.push('--model', options.model)
    if (options?.permissionMode) args.push('--permission-mode', options.permissionMode)
    if (options?.effort) args.push('--effort', options.effort)
    args.push(...this.busArgs(custom))
    args.push(...custom)

    const executable = this.resolveExecutable(options)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined, cliType: 'grok' })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  private resolveExecutable(options?: GrokSessionOptions): string {
    const customPath = (options as { cliPath?: string } | undefined)?.cliPath
    return customPath && customPath.trim() ? customPath.trim() : 'grok'
  }
}
