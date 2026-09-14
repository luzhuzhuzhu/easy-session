import { cliVersion } from './cli-runtime'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import type { GeminiSessionOptions } from './types'

// FEAT-3：Gemini CLI 一等支持。启动参数对齐 google-gemini/gemini-cli：
// `-m/--model`、`-a/--approval-mode default|auto_edit|yolo`、`--resume <sessionId>`。
export class GeminiAdapter {
  private cliManager: CliManager

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  // 由 AgentBus 装配时注入：让 gemini 启动即知道可用 es 与其他会话协作。
  // This CLI has no --append-system-prompt flag. AgentBus still supplies the es environment.
  getVersionWithPath(preferredPath?: string): Promise<string> {
    return cliVersion('gemini', preferredPath)
  }

  startSession(projectPath: string, options?: GeminiSessionOptions, geminiSessionId?: string): string {
    const id = `gemini-${randomUUID()}`
    const args: string[] = []

    if (geminiSessionId) args.push('--resume', geminiSessionId)
    if (options?.model) args.push('--model', options.model)
    if (options?.approvalMode) args.push('--approval-mode', options.approvalMode)
    const custom = normalizeCustomCliArgs(options?.customArgs)
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
