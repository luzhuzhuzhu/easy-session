import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { ProcessInfo, ProcessOutput } from './types'

export type OutputListener = (id: string, data: string, stream: 'stdout' | 'stderr') => void
export type ExitListener = (id: string, code: number | null) => void

interface OutputBufferState {
  chunks: string[]
  bytes: number
}

export class CliManager {
  private static readonly GIT_BASH_CANDIDATES = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
  ]

  private static readonly MAX_BUFFER_BYTES = 1 * 1024 * 1024

  private processes = new Map<string, pty.IPty>()
  private processInfo = new Map<string, ProcessInfo>()
  private outputBuffers = new Map<string, OutputBufferState>()
  private outputListeners = new Set<OutputListener>()
  private exitListeners = new Set<ExitListener>()

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

  private resolveGitBashPath(): string | undefined {
    return CliManager.GIT_BASH_CANDIDATES.find((p) => existsSync(p))
  }

  private resolveWindowsCommand(command: string): string {
    if (command.includes('\\') || command.includes('/') || command.includes(':')) {
      return command
    }

    const lower = command.toLowerCase()
    if (lower.endsWith('.exe') || lower.endsWith('.cmd') || lower.endsWith('.bat') || lower.endsWith('.com')) {
      return command
    }

    const pathEnv = process.env.PATH || ''
    const pathList = pathEnv.split(';').filter(Boolean)
    const extCandidates = ['.exe', '.cmd', '.bat', '.com', '']

    for (const dir of pathList) {
      for (const ext of extCandidates) {
        const candidate = join(dir, `${command}${ext}`)
        if (existsSync(candidate)) {
          return candidate
        }
      }
    }

    return command
  }

  private buildSpawnEnv(command: string): Record<string, string> {
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === 'string')
    ) as Record<string, string>

    env.TERM = env.TERM || 'xterm-256color'

    if (process.platform === 'win32') {
      env.PYTHONIOENCODING = env.PYTHONIOENCODING || 'utf-8'
      env.FORCE_COLOR = env.FORCE_COLOR || '1'

      if (command.includes('claude') && !env.CLAUDE_CODE_GIT_BASH_PATH) {
        const gitBashPath = this.resolveGitBashPath()
        if (gitBashPath) {
          env.CLAUDE_CODE_GIT_BASH_PATH = gitBashPath
        }
      }
    }

    return env
  }

  spawn(id: string, command: string, args: string[], options?: { cwd?: string }): ProcessInfo {
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
      env: this.buildSpawnEnv(command)
    })

    const info: ProcessInfo = {
      id,
      pid: child.pid,
      cliType: command.includes('codex') ? 'codex' : 'claude',
      command,
      args,
      status: 'running',
      exitCode: null,
      startTime: Date.now()
    }

    this.processes.set(id, child)
    this.processInfo.set(id, info)
    this.outputBuffers.set(id, { chunks: [], bytes: 0 })

    child.onData((data: string) => {
      this.appendToBuffer(id, data)
      const output: ProcessOutput = { id, stream: 'stdout', data, timestamp: Date.now() }
      this.sendToRenderer('cli:output', output)
      this.outputListeners.forEach((fn) => {
        fn(id, data, 'stdout')
      })
    })

    child.onExit(({ exitCode }) => {
      info.status = 'exited'
      info.exitCode = exitCode
      info.endTime = Date.now()
      this.processes.delete(id)
      this.processInfo.delete(id)
      this.outputBuffers.delete(id)
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
