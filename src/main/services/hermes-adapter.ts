import { randomUUID } from 'crypto'
import { cliVersion } from './cli-runtime'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import type { HermesSessionOptions } from './types'

// Hermes Agent（NousResearch，npm hermes-agent 桥）：
// --resume <session_id|latest>、-c/--continue、--model "provider/model"、
// chat -q 非交互。会话存储 ~/.hermes/state.db（SQLite）。
export class HermesAdapter {
  private cliManager: CliManager

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  // This CLI has no --append-system-prompt flag. AgentBus still supplies the es environment.
  getVersionWithPath(preferredPath?: string): Promise<string> {
    return cliVersion('hermes', preferredPath)
  }

  startSession(projectPath: string, options?: HermesSessionOptions, resumeId?: string): string {
    const id = `hermes-${randomUUID()}`
    const args: string[] = []
    const custom = normalizeCustomCliArgs(options?.customArgs)

    if (resumeId) args.push('--resume', resumeId)
    else if (options?.continueLast) args.push('--continue')
    if (options?.model) args.push('--model', options.model)
    args.push(...custom)

    const executable = this.resolveExecutable(options)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined, cliType: 'hermes' })
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
