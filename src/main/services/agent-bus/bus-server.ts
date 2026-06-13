// AgentBusServer：本地 IPC 端点（Windows named pipe / POSIX unix socket，JSON-lines）。
// 同时负责把 es 客户端与 shim 落盘，并产出注入到 PTY 的环境变量。

import net from 'net'
import { tmpdir } from 'os'
import { join } from 'path'
import { promises as fs } from 'fs'
import type { AgentBroker } from './broker'
import { ES_CLIENT_SOURCE, buildWindowsShim, buildPosixShim } from './es-client-source'

const MAX_REQUEST_BYTES = 256 * 1024

export interface AgentBusEnv {
  EASYSESSION_BUS_PIPE: string
  EASYSESSION_BUS_TOKEN: string
  EASYSESSION_BUS_ELECTRON: string
  EASYSESSION_BUS_ENTRY: string
}

export class AgentBusServer {
  private server: net.Server | null = null
  private token: string
  private pipePath = ''
  private entryPath = ''
  private shimDir = ''
  private socketPath = '' // 仅 posix 用于退出清理

  constructor(
    private broker: AgentBroker,
    private opts: { userDataDir: string; electronPath: string; token: string }
  ) {
    this.token = opts.token
  }

  getToken(): string {
    return this.token
  }

  getShimDir(): string {
    return this.shimDir
  }

  getEnv(): AgentBusEnv {
    return {
      EASYSESSION_BUS_PIPE: this.pipePath,
      EASYSESSION_BUS_TOKEN: this.token,
      EASYSESSION_BUS_ELECTRON: this.opts.electronPath,
      EASYSESSION_BUS_ENTRY: this.entryPath
    }
  }

  isReady(): boolean {
    return !!this.server && !!this.pipePath
  }

  async init(): Promise<void> {
    const baseDir = join(this.opts.userDataDir, 'agent-bus')
    this.shimDir = join(baseDir, 'bin')
    this.entryPath = join(baseDir, 'es-client.cjs')
    await fs.mkdir(this.shimDir, { recursive: true })
    await fs.writeFile(this.entryPath, ES_CLIENT_SOURCE, 'utf-8')

    if (process.platform === 'win32') {
      // cmd / PowerShell 走 es.cmd；但 Claude Code 的 Bash 工具用 Git Bash(MSYS)，
      // 它不会把裸 `es` 解析到 `es.cmd`，必须再提供一个无扩展名的 sh shim（同 npm 的做法）。
      await fs.writeFile(join(this.shimDir, 'es.cmd'), buildWindowsShim(), 'utf-8')
      const bashShim = join(this.shimDir, 'es')
      await fs.writeFile(bashShim, buildPosixShim(), 'utf-8')
      try {
        await fs.chmod(bashShim, 0o755)
      } catch {
        /* Windows 下 chmod 能力有限，忽略 */
      }
      const short = this.token.replace(/-/g, '').slice(0, 12)
      this.pipePath = `\\\\.\\pipe\\easysession-bus-${short}`
    } else {
      const shimFile = join(this.shimDir, 'es')
      await fs.writeFile(shimFile, buildPosixShim(), 'utf-8')
      await fs.chmod(shimFile, 0o755)
      // unix socket 路径有长度限制（~104），放 tmpdir 保证短。
      const short = this.token.replace(/-/g, '').slice(0, 12)
      this.socketPath = join(tmpdir(), `easysession-bus-${short}.sock`)
      this.pipePath = this.socketPath
      try {
        await fs.unlink(this.socketPath)
      } catch {
        /* 不存在则忽略 */
      }
    }

    await this.listen()
  }

  private listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => this.handleConnection(socket))
      server.on('error', (err) => {
        console.error('[agent-bus] 服务监听失败:', err)
        reject(err)
      })
      server.listen(this.pipePath, () => {
        this.server = server
        console.info(`[agent-bus] 已监听 ${this.pipePath}`)
        resolve()
      })
    })
  }

  private handleConnection(socket: net.Socket): void {
    socket.setEncoding('utf-8')
    let buf = ''
    let done = false
    let dispatched = false // 一连接一请求：首行解析后不再处理后续数据，避免重复派发副作用。
    // 连接中止信号：客户端进程被杀（如 Bash 工具超时）时，让 broker 取消挂起的 recv --wait，
    // 避免 waiter 泄漏并把后续消息写进死 socket 而丢失。
    const abortCbs: Array<() => void> = []
    const abort = {
      aborted: false,
      onAbort(cb: () => void): void {
        if (this.aborted) cb()
        else abortCbs.push(cb)
      }
    }
    socket.on('close', () => {
      abort.aborted = true
      for (const cb of abortCbs) cb()
    })
    const finish = (payload: object): void => {
      if (done) return
      done = true
      try {
        socket.end(JSON.stringify(payload) + '\n')
      } catch {
        socket.destroy()
      }
    }
    socket.on('data', (chunk: string) => {
      if (done || dispatched) return
      buf += chunk
      if (Buffer.byteLength(buf, 'utf-8') > MAX_REQUEST_BYTES) {
        finish({ ok: false, stderr: '请求过大', exitCode: 1 })
        return
      }
      const nl = buf.indexOf('\n')
      if (nl === -1) return
      dispatched = true
      const line = buf.slice(0, nl)
      let req: { token: string; agent: string; argv: string[] }
      try {
        req = JSON.parse(line)
      } catch {
        finish({ ok: false, stderr: '请求格式错误', exitCode: 1 })
        return
      }
      this.broker
        .handle(req, abort)
        .then((res) => finish(res))
        .catch((err) => finish({ ok: false, stderr: String(err), exitCode: 1 }))
    })
    socket.on('error', () => socket.destroy())
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()))
      this.server = null
    }
    if (this.socketPath) {
      try {
        await fs.unlink(this.socketPath)
      } catch {
        /* 忽略 */
      }
    }
  }
}
