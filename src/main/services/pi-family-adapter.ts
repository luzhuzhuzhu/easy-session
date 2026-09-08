import { randomUUID } from 'crypto'
import { exec } from 'child_process'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import type { CliType } from '../../shared/cli-types'
import type { PiSessionOptions } from './types'

// 「pi 系」adapter 基类：pi 与 omp（oh-my-pi）同源，启动参数仅 resume 形态不同。
// 公共 flags：--model、--thinking、--approval-mode、-c/--continue。
export class PiFamilyAdapter {
  protected cliManager: CliManager
  private appendSystemPrompt: string | null = null
  private readonly idPrefix: string
  private readonly cliType: CliType
  private readonly command: string
  private readonly versionLabel: string

  constructor(
    cliManager: CliManager,
    opts: { idPrefix: 'pi' | 'omp'; command: string; versionLabel: string }
  ) {
    this.cliManager = cliManager
    this.idPrefix = opts.idPrefix
    this.cliType = opts.idPrefix
    this.command = opts.command
    this.versionLabel = opts.versionLabel
  }

  // 由 AgentBus 装配时注入：让 pi 系会话启动即知道可用 es 与其他会话协作。
  setAppendSystemPrompt(text: string | null): void {
    this.appendSystemPrompt = text && text.trim() ? text : null
  }

  private busArgs(customArgs: string[]): string[] {
    if (!this.appendSystemPrompt) return []
    if (customArgs.includes('--append-system-prompt')) return []
    return ['--append-system-prompt', this.appendSystemPrompt]
  }

  getVersionWithPath(preferredPath?: string): Promise<string> {
    const target = preferredPath && preferredPath.trim() ? preferredPath.trim() : this.command
    return new Promise((resolve, reject) => {
      exec(`"${target}" --version`, { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error(`Failed to get ${this.versionLabel} version`))
        resolve(String(stdout).trim())
      })
    })
  }

  startSession(projectPath: string, options?: PiSessionOptions, resumeId?: string): string {
    const id = `${this.idPrefix}-${randomUUID()}`
    const args: string[] = this.buildArgs(options, resumeId)
    const executable = this.resolveExecutable(options)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined, cliType: this.cliType })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  // resumeId 优先（显式绑定 > 续最近一次 > 全新会话）
  protected buildArgs(options: PiSessionOptions | undefined, resumeId?: string): string[] {
    const args: string[] = []
    const custom = normalizeCustomCliArgs(options?.customArgs)

    if (resumeId) {
      args.push(...this.resumeArgs(resumeId))
    } else if (options?.continueLast) {
      args.push(...this.continueArgs())
    }
    if (options?.model) args.push('--model', options.model)
    if (options?.thinking) args.push('--thinking', options.thinking)
    if (options?.approvalMode) args.push('--approval-mode', options.approvalMode)
    args.push(...this.busArgs(custom))
    args.push(...custom)
    return args
  }

  // pi: --session <path|id>；omp: --resume <id 前缀>。由子类提供。
  protected resumeArgs(_resumeId: string): string[] {
    return []
  }

  protected continueArgs(): string[] {
    return ['--continue']
  }

  protected resolveExecutable(options?: PiSessionOptions): string {
    const customPath = (options as { cliPath?: string } | undefined)?.cliPath
    return customPath && customPath.trim() ? customPath.trim() : this.command
  }
}

// badlogic/pi-mono 的 pi CLI：--session <path|UUID 前缀> 接续指定会话。
export class PiAdapter extends PiFamilyAdapter {
  constructor(cliManager: CliManager) {
    super(cliManager, { idPrefix: 'pi', command: 'pi', versionLabel: 'Pi' })
  }

  protected resumeArgs(resumeId: string): string[] {
    return ['--session', resumeId]
  }
}

// acidsugarx/oh-my-pi 的 omp CLI：-r/--resume <ID 前缀>，-c 续最近会话。
export class OmpAdapter extends PiFamilyAdapter {
  constructor(cliManager: CliManager) {
    super(cliManager, { idPrefix: 'omp', command: 'omp', versionLabel: 'OMP' })
  }

  protected resumeArgs(resumeId: string): string[] {
    return ['--resume', resumeId]
  }
}
