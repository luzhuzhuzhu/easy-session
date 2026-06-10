import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import { resolveShellPath } from './shell-detector'
import type { TerminalSessionOptions } from './types'

// shell 首段输出（提示符）出现后再等一小段时间开始注入启动命令
const STARTUP_SETTLE_DELAY_MS = 300
// 一直没有输出时的兜底等待（慢速 WSL/pwsh 初始化）
const STARTUP_MAX_WAIT_MS = 5_000
const STARTUP_COMMAND_INTERVAL_MS = 150

interface PendingStartup {
  timer: ReturnType<typeof setTimeout> | null
  unsubscribe: (() => void) | null
}

export class TerminalAdapter {
  private cliManager: CliManager
  private pendingStartups = new Map<string, PendingStartup>()

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
    this.cliManager.onExit((id) => this.cancelStartupCommands(id))
  }

  startSession(projectPath: string, options?: TerminalSessionOptions): string {
    const id = `terminal-${randomUUID()}`
    const shellPath = resolveShellPath(options?.shell)
    const args = normalizeCustomCliArgs(options?.shellArgs)

    this.cliManager.spawn(id, shellPath, args, {
      cwd: projectPath || undefined,
      cliType: 'terminal'
    })

    this.scheduleStartupCommands(id, options?.startupCommands)
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\r')
  }

  cancelStartupCommands(processId: string): void {
    const pending = this.pendingStartups.get(processId)
    if (!pending) return
    if (pending.timer) clearTimeout(pending.timer)
    pending.unsubscribe?.()
    this.pendingStartups.delete(processId)
  }

  // 等 shell 出现首段输出（提示符就绪）后链式注入启动命令；
  // 每条命令写入成功才安排下一条，进程退出/写入失败/会话取消时整链终止。
  private scheduleStartupCommands(processId: string, commands?: string[]): void {
    if (!Array.isArray(commands)) return
    const pending = commands.map((c) => c.trim()).filter(Boolean)
    if (pending.length === 0) return

    const state: PendingStartup = { timer: null, unsubscribe: null }
    this.pendingStartups.set(processId, state)

    const writeNext = (index: number): void => {
      state.timer = null
      if (index >= pending.length) {
        this.pendingStartups.delete(processId)
        return
      }

      const ok = this.cliManager.write(processId, pending[index] + '\r')
      if (!ok || index + 1 >= pending.length) {
        this.pendingStartups.delete(processId)
        return
      }

      state.timer = setTimeout(() => writeNext(index + 1), STARTUP_COMMAND_INTERVAL_MS)
    }

    let begun = false
    const begin = (delay: number): void => {
      if (begun) return
      begun = true
      state.unsubscribe?.()
      state.unsubscribe = null
      if (state.timer) clearTimeout(state.timer)
      state.timer = setTimeout(() => writeNext(0), delay)
    }

    state.unsubscribe = this.cliManager.onOutput((id) => {
      if (id === processId) begin(STARTUP_SETTLE_DELAY_MS)
    })
    state.timer = setTimeout(() => begin(0), STARTUP_MAX_WAIT_MS)
  }
}
