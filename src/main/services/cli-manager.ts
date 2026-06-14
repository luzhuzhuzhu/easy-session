import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { homedir } from 'os'
import { delimiter as pathDelimiter } from 'path'
import { TextDecoder } from 'util'
import iconv from 'iconv-lite'
import { findExecutableInPath, findGitBashPath } from './shell-detector'
import type { CliType, ProcessInfo, ProcessOutput } from './types'
import type { RemoteNetworkSettingsManager } from './remote-network-settings-manager'

export type OutputListener = (id: string, data: string, stream: 'stdout' | 'stderr') => void
export type ExitListener = (id: string, code: number | null) => void

// 由 AgentBus 提供：返回需注入到 PTY 的 bus 环境变量与 es shim 目录。
export type AgentBusEnvProvider = (
  processId: string
) => { vars: Record<string, string>; shimDir: string } | null

interface OutputBufferState {
  chunks: string[]
  bytes: number
}

interface OutputDecoderState {
  mode: 'utf8' | 'gb18030'
  utf8Decoder: TextDecoder
}

function redactProxyUrl(rawValue: string | null): string | null {
  if (!rawValue) return null
  try {
    const parsed = new URL(rawValue)
    if (parsed.username || parsed.password) {
      parsed.username = parsed.username ? '***' : ''
      parsed.password = parsed.password ? '***' : ''
    }
    return parsed.toString().replace(/\/$/, '')
  } catch {
    return rawValue
  }
}

export class CliManager {
  private static readonly MAX_BUFFER_BYTES = 1 * 1024 * 1024

  private processes = new Map<string, pty.IPty>()
  private processInfo = new Map<string, ProcessInfo>()
  private outputBuffers = new Map<string, OutputBufferState>()
  private outputDecoders = new Map<string, OutputDecoderState>()
  private outputListeners = new Set<OutputListener>()
  private exitListeners = new Set<ExitListener>()
  private remoteNetworkSettingsManager: RemoteNetworkSettingsManager | null = null
  private agentBusEnvProvider: AgentBusEnvProvider | null = null

  setAgentBusEnvProvider(provider: AgentBusEnvProvider | null): void {
    this.agentBusEnvProvider = provider
  }

  onOutput(listener: OutputListener): () => void {
    this.outputListeners.add(listener)
    return () => this.offOutput(listener)
  }

  offOutput(listener: OutputListener): void {
    this.outputListeners.delete(listener)
  }

  onExit(listener: ExitListener): () => void {
    this.exitListeners.add(listener)
    return () => this.offExit(listener)
  }

  offExit(listener: ExitListener): void {
    this.exitListeners.delete(listener)
  }

  setRemoteNetworkSettingsManager(manager: RemoteNetworkSettingsManager | null): void {
    this.remoteNetworkSettingsManager = manager
  }

  private sendToRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) return

    windows.forEach((win) => {
      win.webContents.send(channel, data)
    })
  }

  private appendToBuffer(id: string, data: string): void {
    const state = this.outputBuffers.get(id)
    if (!state) return

    state.chunks.push(data)
    state.bytes += Buffer.byteLength(data, 'utf-8')

    while (state.bytes > CliManager.MAX_BUFFER_BYTES && state.chunks.length > 0) {
      const removed = state.chunks.shift()
      if (!removed) continue
      state.bytes -= Buffer.byteLength(removed, 'utf-8')
    }
  }

  private ensureOutputDecoder(id: string): OutputDecoderState {
    let state = this.outputDecoders.get(id)
    if (!state) {
      state = {
        mode: 'utf8',
        utf8Decoder: new TextDecoder('utf-8', { fatal: true })
      }
      this.outputDecoders.set(id, state)
    }
    return state
  }

  private decodePtyOutput(id: string, data: string | Buffer): string {
    if (typeof data === 'string') return data

    const state = this.ensureOutputDecoder(id)
    if (state.mode === 'gb18030') {
      return iconv.decode(data, 'gb18030')
    }

    try {
      return state.utf8Decoder.decode(data, { stream: true })
    } catch {
      state.mode = 'gb18030'
      state.utf8Decoder = new TextDecoder('utf-8', { fatal: true })
      return iconv.decode(data, 'gb18030')
    }
  }

  private flushOutputDecoder(id: string): string {
    const state = this.outputDecoders.get(id)
    if (!state || state.mode !== 'utf8') return ''

    try {
      return state.utf8Decoder.decode()
    } catch {
      return ''
    }
  }

  private resolveWindowsCommand(command: string): string {
    if (command.includes('\\') || command.includes('/') || command.includes(':')) {
      return command
    }

    const lower = command.toLowerCase()
    if (lower.endsWith('.exe') || lower.endsWith('.cmd') || lower.endsWith('.bat') || lower.endsWith('.com')) {
      return command
    }

    return findExecutableInPath(command) ?? command
  }

  // 把 es shim 目录前置进 PATH（Windows 下 PATH 键大小写不定，需大小写不敏感查找）。
  private prependPath(env: Record<string, string>, shimDir: string): void {
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
    const current = env[key]
    env[key] = current ? `${shimDir}${pathDelimiter}${current}` : shimDir
  }

  private buildSpawnEnv(command: string, processId: string): Record<string, string> {
    const baseEnv = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>

    const networkState = this.remoteNetworkSettingsManager
      ? this.remoteNetworkSettingsManager.buildCliEnvironment(baseEnv)
      : null
    const networkEnv = networkState ? networkState.env : { ...baseEnv }
    const env = networkEnv

    env.TERM = env.TERM || 'xterm-256color'

    if (process.platform === 'win32') {
      env.PYTHONIOENCODING = env.PYTHONIOENCODING || 'utf-8'
      env.FORCE_COLOR = env.FORCE_COLOR || '1'

      if (command.includes('claude') && !env.CLAUDE_CODE_GIT_BASH_PATH) {
        const gitBashPath = findGitBashPath()
        if (gitBashPath) {
          env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
        }
      }
    }

    if (networkState) {
      const injectedKeys = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'NO_PROXY'].filter(
        (key) => !!env[key]
      )
      console.info(
        `[cli-network] command=${command} proxyMode=${networkState.state.proxyMode} proxyUrl=${redactProxyUrl(networkState.state.proxyUrl) ?? '-'} injectedKeys=${injectedKeys.join(',') || 'none'}`
      )
    }

    // 注入 agent bus：es shim 进 PATH + 连接所需的 pipe/token/身份。
    if (this.agentBusEnvProvider) {
      const bundle = this.agentBusEnvProvider(processId)
      if (bundle) {
        Object.assign(env, bundle.vars)
        this.prependPath(env, bundle.shimDir)
      }
    }

    return env
  }

  spawn(
    id: string,
    command: string,
    args: string[],
    options?: { cwd?: string; cliType?: CliType }
  ): ProcessInfo {
    if (this.processes.has(id)) {
      throw new Error(`Process with id "${id}" already exists`)
    }

    const isWin = process.platform === 'win32'
    const executable = isWin ? this.resolveWindowsCommand(command) : command
    const executableArgs = args

    const child = pty.spawn(executable, executableArgs, {
      name: 'xterm-256color',
      cols: 120,
      rows: 30,
      cwd: options?.cwd || process.env.HOME || process.env.USERPROFILE || homedir(),
      env: this.buildSpawnEnv(command, id),
      encoding: null
    })

    const lowerCommand = command.toLowerCase()
    const cliType: CliType =
      options?.cliType ??
      (lowerCommand.includes('opencode')
        ? 'opencode'
        : lowerCommand.includes('codex')
          ? 'codex'
          : 'claude')

    const info: ProcessInfo = {
      id,
      pid: child.pid,
      cliType,
      command,
      args,
      status: 'running',
      exitCode: null,
      startTime: Date.now()
    }

    this.processes.set(id, child)
    this.processInfo.set(id, info)
    this.outputBuffers.set(id, { chunks: [], bytes: 0 })

    const rawChild = child as pty.IPty & {
      onData: (listener: (data: string | Buffer) => void) => { dispose(): void }
    }

    rawChild.onData((rawData: string | Buffer) => {
      const data = this.decodePtyOutput(id, rawData)
      if (!data) return
      this.appendToBuffer(id, data)
      const output: ProcessOutput = { id, stream: 'stdout', data, timestamp: Date.now() }
      this.sendToRenderer('cli:output', output)
      // 终端会话输出是任意 shell 内容（ping/npm 等都会出现 timeout 字样），
      // 不参与 CLI 网络失败诊断，避免污染 lastFailureCli 状态
      if (this.remoteNetworkSettingsManager && cliType !== 'terminal') {
        const analysis = this.remoteNetworkSettingsManager.analyzeCliFailure(data)
        if (analysis.matched && analysis.category) {
          const reason = analysis.reason
            ? `${analysis.reason}：${data.trim()}`.trim()
            : data.trim()
          void this.remoteNetworkSettingsManager.recordCliFailure(info.cliType, reason, analysis.category)
        }
      }
      this.outputListeners.forEach((fn) => {
        fn(id, data, 'stdout')
      })
    })

    child.onExit(({ exitCode }) => {
      const trailingOutput = this.flushOutputDecoder(id)
      if (trailingOutput) {
        this.appendToBuffer(id, trailingOutput)
        const output: ProcessOutput = { id, stream: 'stdout', data: trailingOutput, timestamp: Date.now() }
        this.sendToRenderer('cli:output', output)
        this.outputListeners.forEach((fn) => {
          fn(id, trailingOutput, 'stdout')
        })
      }
      info.status = 'exited'
      info.exitCode = exitCode
      info.endTime = Date.now()
      this.processes.delete(id)
      this.processInfo.delete(id)
      this.outputBuffers.delete(id)
      this.outputDecoders.delete(id)
      this.sendToRenderer('cli:exit', { id, code: exitCode })
      this.exitListeners.forEach((fn) => {
        fn(id, exitCode)
      })
    })

    return info
  }

  kill(id: string): boolean {
    const child = this.processes.get(id)
    if (!child) return false
    child.kill()
    // 防御性清理：Windows ConPTY 下 onExit 可能不触发
    this.processes.delete(id)
    this.processInfo.delete(id)
    this.outputBuffers.delete(id)
    this.outputDecoders.delete(id)
    return true
  }

  killAll(): void {
    const ids = Array.from(this.processes.keys())
    for (const id of ids) {
      this.kill(id)
    }
  }

  write(id: string, input: string): boolean {
    const child = this.processes.get(id)
    if (!child) return false
    child.write(input)
    return true
  }

  resize(id: string, cols: number, rows: number): void {
    const child = this.processes.get(id)
    if (child) child.resize(cols, rows)
  }

  getProcess(id: string): ProcessInfo | undefined {
    return this.processInfo.get(id)
  }

  listProcesses(): ProcessInfo[] {
    return Array.from(this.processInfo.values()).filter((p) => p.status === 'running')
  }
}
