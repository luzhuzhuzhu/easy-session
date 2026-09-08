import { exec } from 'child_process'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import type { GeminiSessionOptions } from './types'

// FEAT-3：Gemini CLI 一等支持。启动参数对齐 google-gemini/gemini-cli：
// `-m/--model`、`-a/--approval-mode default|auto_edit|yolo`、`--resume <sessionId>`。
export class GeminiAdapter {
  private cliManager: CliManager
  private appendSystemPrompt: string | null = null

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  // 由 AgentBus 装配时注入：让 gemini 启动即知道可用 es 与其他会话协作。
  setAppendSystemPrompt(text: string | null): void {
    this.appendSystemPrompt = text && text.trim() ? text : null
  }

  private busArgs(customArgs: string[]): string[] {
    if (!this.appendSystemPrompt) return []
    if (customArgs.includes('--append-system-prompt')) return []
    return ['--append-system-prompt', this.appendSystemPrompt]
  }

  getVersionWithPath(preferredPath?: string): Promise<string> {
    const target = preferredPath && preferredPath.trim() ? preferredPath.trim() : 'gemini'
    return new Promise((resolve, reject) => {
      exec(`"${target}" --version`, { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error('Failed to get Gemini version'))
        resolve(String(stdout).trim())
      })
    })
  }

  startSession(projectPath: string, options?: GeminiSessionOptions, geminiSessionId?: string): string {
    const id = `gemini-${randomUUID()}`
    const args: string[] = []

    if (geminiSessionId) args.push('--resume', geminiSessionId)
    if (options?.model) args.push('--model', options.model)
    if (options?.approvalMode) args.push('--approval-mode', options.approvalMode)
    const custom = normalizeCustomCliArgs(options?.customArgs)
    args.push(...this.busArgs(custom))
    args.push(...custom)

    const executable = options?.cliPath?.trim() || 'gemini'
    this.cliManager.spawn(id, executable, args, {
      cwd: projectPath || undefined
    })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }
}
