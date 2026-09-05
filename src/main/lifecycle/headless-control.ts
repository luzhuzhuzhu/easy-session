// headless（引擎模式）控制服务器（SEC-12 + STAB-10）：
//  - 一次性 token 经 EASYSESSION_CONTROL_TOKEN 下发（宿主启动时生成注入），
//    无 token 的本地进程不能匿名关停引擎。
//  - 按行分帧解析（TCP 粘包/分段不再误判），空闲连接超时断开。
//  - 若宿主未注入 token（旧版本兼容），退化为「只允许 loopback + 日志告警」的
//    宽松模式，但绝不静默。
import { createServer, type Server as NetServer, type Socket } from 'net'
import { timingSafeEqual, randomUUID } from 'crypto'
import { createLogger } from '../services/logger'

const log = createLogger('headless-control')

const CONTROL_LINE_MAX = 256
const CONNECTION_TIMEOUT_MS = 30_000

export interface HeadlessControlServerOptions {
  port: number
  /** 优雅关停请求（应用内已去重） */
  requestShutdown: () => void
  /** 宿主注入的控制 token；缺省时进入宽松模式并告警 */
  token?: string
}

export class HeadlessControlServer {
  private server: NetServer | null = null
  private readonly connections = new Set<Socket>()

  constructor(private readonly options: HeadlessControlServerOptions) {}

  listen(): void {
    const server = createServer((socket) => this.handleConnection(socket))
    server.on('error', (err: NodeJS.ErrnoException) => {
      // 控制端口被占用不阻断引擎：宿主仍可退化为 kill 进程树的方式停机。
      log.warn({ err }, '[headless] control server failed to listen')
    })
    this.server = server
    server.listen(this.options.port, '127.0.0.1')
  }

  private handleConnection(socket: Socket): void {
    this.connections.add(socket)
    socket.setTimeout(CONNECTION_TIMEOUT_MS)
    socket.setEncoding('utf8')

    let buffer = ''

    const finish = (reply: string): void => {
      socket.end(reply)
    }

    socket.on('timeout', () => {
      log.info('[headless] idle control connection closed')
      socket.destroy()
    })

    socket.on('data', (chunk: string) => {
      buffer += chunk
      // 超长首行视为恶意/误连，直接断开
      if (buffer.length > CONTROL_LINE_MAX) {
        socket.destroy()
        return
      }
      let idx: number
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx).trim().toLowerCase()
        buffer = buffer.slice(idx + 1)
        this.handleLine(socket, line, finish)
        if (socket.destroyed || socket.writableEnded) return
      }
    })

    socket.on('close', () => this.connections.delete(socket))
    socket.on('error', () => this.connections.delete(socket))
  }

  private handleLine(_socket: Socket, rawLine: string, finish: (reply: string) => void): void {
    const token = this.options.token
    let line = rawLine

    if (token) {
      // 协议：单行 "<token>:<command>"。token 比对（timing-safe）通过后剥离前缀再解析命令。
      const sepIdx = rawLine.indexOf(':')
      const provided = sepIdx !== -1 ? rawLine.slice(0, sepIdx).trim() : ''
      if (!provided || !this.tokenMatches(provided, token)) {
        log.warn('[headless] control command rejected: bad or missing token')
        finish('error:auth\n')
        return
      }
      line = rawLine.slice(sepIdx + 1).trim().toLowerCase()
    } else {
      // 宽松模式：宿主未注入 token。loopback-only 已由 listen 地址保证，
      // 但必须在日志中显式暴露这一降级决定。
      log.warn(
        '[headless] EASYSESSION_CONTROL_TOKEN not set; accepting UNAUTHENTICATED control commands (loopback only)'
      )
    }

    if (line === 'quit' || line === 'shutdown') {
      finish('ok:quit\n')
      this.options.requestShutdown()
      return
    }
    if (line === 'ping') {
      finish('pong\n')
      return
    }
    if (line) {
      finish('unknown\n')
    }
  }

  private tokenMatches(provided: string, token: string): boolean {
    if (!provided) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(token)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }

  dispose(): void {
    for (const socket of this.connections) {
      socket.destroy()
    }
    this.connections.clear()
    try {
      this.server?.close()
    } catch {
      // 已关闭或从未监听成功，忽略
    }
    this.server = null
  }
}

/** 生成一次性控制 token（宿主未显式注入时由进程内部随机生成并打印提示用指纹） */
export function generateControlToken(): string {
  return randomUUID().replace(/-/g, '')
}
