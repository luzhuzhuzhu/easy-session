import type { Server as SocketIOServer, Socket } from 'socket.io'
import type {
  RemoteDependencies,
  SessionInputPayload,
  SessionResizePayload,
  SessionSubscribePayload,
  SessionWritePayload,
  SocketAck
} from './types'
import { TokenBucketLimiter } from './token-bucket'

interface SetupSocketBridgeOptions {
  io: SocketIOServer
  deps: RemoteDependencies
  idleTimeoutMs: number
  logger: Pick<Console, 'info' | 'warn' | 'error'>
}

// SEC-3：WS 事件限流（REST 限流对 socket 通道不生效）。input/write 是直写 PTY 的
// 通道，必须限速防洪泛/脚本化注入；subscribe 限的是历史回放风暴。
// 容量按人类终端交互节奏放大（粘贴/按住方向键），稳态速率远低于机器洪泛。
const INPUT_LIMITER = { capacity: 120, refillPerSecond: 40 }
const WRITE_LIMITER = { capacity: 240, refillPerSecond: 80 }
const SUBSCRIBE_LIMITER = { capacity: 10, refillPerSecond: 1 }

function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`
}

function ackOk(ack?: (result: SocketAck) => void): void {
  ack?.({ ok: true })
}

function ackErr(ack: ((result: SocketAck) => void) | undefined, message: string): void {
  ack?.({ ok: false, message })
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function handleSubscribe(
  socket: Socket,
  deps: RemoteDependencies,
  payload: SessionSubscribePayload,
  ack?: (result: SocketAck) => void
): void {
  if (!payload || typeof payload.sessionId !== 'string' || !payload.sessionId.trim()) {
    ackErr(ack, 'Invalid sessionId')
    return
  }
  const sessionId = payload.sessionId.trim()
  const session = deps.sessionManager.getSession(sessionId)
  if (!session) {
    ackErr(ack, `Session not found: ${sessionId}`)
    return
  }

  socket.join(sessionRoom(sessionId))
  const lines = isNonNegativeInt(payload.historyLines)
    ? Math.min(payload.historyLines, 2000)
    : 200
  if (lines > 0) {
    const history = deps.outputManager.getHistory(sessionId, lines)
    for (const line of history) {
      socket.emit('session:output', {
        sessionId,
        data: line.text,
        stream: line.stream,
        timestamp: line.timestamp,
        seq: line.seq
      })
    }
  }
  socket.emit('session:status', {
    sessionId,
    status: session.status
  })
  ackOk(ack)
}

function handleUnsubscribe(socket: Socket, payload: SessionSubscribePayload, ack?: (result: SocketAck) => void): void {
  if (!payload || typeof payload.sessionId !== 'string' || !payload.sessionId.trim()) {
    ackErr(ack, 'Invalid sessionId')
    return
  }
  socket.leave(sessionRoom(payload.sessionId.trim()))
  ackOk(ack)
}

// 授权前置：socket 必须先 subscribe（join 房间）才能对该会话做输入/写入/resize，
// 避免「一旦登录即可向任意运行中会话注入命令」。
// SEC-4 范围说明：RemoteDependencies 仅装配本地 sessionManager/projectManager/outputManager
// （见 server.ts），Web 端按构造即只能枚举/订阅本机实例的会话，不存在跨实例订阅面；
// 且远程登录持单一访问令牌（机器所有者级别），subscribe 即为实例级授权语义。
// 若未来暴露跨实例能力，必须先在此处增加实例级授权开关。
function ensureJoined(socket: Socket, sessionId: string, ack?: (result: SocketAck) => void): boolean {
  if (socket.rooms.has(sessionRoom(sessionId))) return true
  ackErr(ack, `Not subscribed to session: ${sessionId}`)
  return false
}

function handleInput(
  socket: Socket,
  deps: RemoteDependencies,
  payload: SessionInputPayload,
  ack?: (result: SocketAck) => void
): void {
  if (!payload || typeof payload.sessionId !== 'string' || typeof payload.input !== 'string') {
    ackErr(ack, 'Invalid payload')
    return
  }

  const sessionId = payload.sessionId.trim()
  if (!ensureJoined(socket, sessionId, ack)) return
  const session = deps.sessionManager.getSession(sessionId)
  if (!session) {
    ackErr(ack, `Session not found: ${sessionId}`)
    return
  }
  if (session.status !== 'running' || !session.processId) {
    ackErr(ack, `Session is not running: ${sessionId}`)
    return
  }

  // For remote terminal input we prefer CR as Enter to match PTY behavior.
  // Keep original input text (including spaces) and append Enter.
  const raw = payload.input
  const normalized = raw.endsWith('\r') || raw.endsWith('\n') ? raw : `${raw}\r`
  const ok = deps.sessionManager.writeRaw(sessionId, normalized)
  if (!ok) {
    ackErr(ack, 'Failed to write input to session PTY')
    return
  }
  ackOk(ack)
}

function handleWrite(
  socket: Socket,
  deps: RemoteDependencies,
  payload: SessionWritePayload,
  ack?: (result: SocketAck) => void
): void {
  if (!payload || typeof payload.sessionId !== 'string' || typeof payload.data !== 'string') {
    ackErr(ack, 'Invalid payload')
    return
  }

  const sessionId = payload.sessionId.trim()
  if (!ensureJoined(socket, sessionId, ack)) return
  const session = deps.sessionManager.getSession(sessionId)
  if (!session) {
    ackErr(ack, `Session not found: ${sessionId}`)
    return
  }
  if (session.status !== 'running' || !session.processId) {
    ackErr(ack, `Session is not running: ${sessionId}`)
    return
  }

  const ok = deps.sessionManager.writeRaw(sessionId, payload.data)
  if (!ok) {
    ackErr(ack, 'Failed to write raw data to session PTY')
    return
  }
  ackOk(ack)
}

function handleResize(
  socket: Socket,
  deps: RemoteDependencies,
  payload: SessionResizePayload,
  ack?: (result: SocketAck) => void
): void {
  if (
    !payload ||
    typeof payload.sessionId !== 'string' ||
    !isNonNegativeInt(payload.cols) ||
    !isNonNegativeInt(payload.rows) ||
    payload.cols < 1 ||
    payload.rows < 1
  ) {
    ackErr(ack, 'Invalid payload')
    return
  }
  const sessionId = payload.sessionId.trim()
  if (!ensureJoined(socket, sessionId, ack)) return
  const session = deps.sessionManager.getSession(sessionId)
  if (!session) {
    ackErr(ack, `Session not found: ${sessionId}`)
    return
  }
  if (session.status !== 'running' || !session.processId) {
    ackErr(ack, `Session is not running: ${sessionId}`)
    return
  }
  deps.sessionManager.resizeTerminal(sessionId, payload.cols, payload.rows)
  ackOk(ack)
}

export function setupRemoteSocketBridge(options: SetupSocketBridgeOptions): () => void {
  const { io, deps, idleTimeoutMs, logger } = options
  const lastActivityBySocket = new Map<string, number>()

  // SEC-3：per-socket 令牌桶。key 用 socket.id（每个连接独立配额）。
  const inputLimiter = new TokenBucketLimiter(INPUT_LIMITER)
  const writeLimiter = new TokenBucketLimiter(WRITE_LIMITER)
  const subscribeLimiter = new TokenBucketLimiter(SUBSCRIBE_LIMITER)

  // 远程输出合帧：把 16ms 窗口内同一会话的 chunk 拼成一次 emit，降低刷屏时
  // Socket.IO 的包频率（与桌面端 BrowserWindow IPC 的合帧策略一致）。
  const REMOTE_FLUSH_INTERVAL_MS = 16
  const pendingRemote = new Map<
    string,
    { chunks: string[]; stream: 'stdout' | 'stderr'; timestamp: number; seq: number }
  >()
  let remoteFlushTimer: ReturnType<typeof setTimeout> | null = null

  const flushRemotePending = (): void => {
    remoteFlushTimer = null
    if (pendingRemote.size === 0) return
    for (const [sessionId, pending] of pendingRemote) {
      pendingRemote.delete(sessionId)
      const merged = pending.chunks.join('')
      io.to(sessionRoom(sessionId)).emit('session:output', {
        sessionId,
        data: merged,
        stream: pending.stream,
        timestamp: pending.timestamp,
        seq: pending.seq
      })
    }
  }

  const outputUnsubscribe = deps.outputManager.subscribe((event) => {
    let pending = pendingRemote.get(event.sessionId)
    if (!pending) {
      pending = { chunks: [], stream: event.stream, timestamp: event.timestamp, seq: event.seq }
      pendingRemote.set(event.sessionId, pending)
    }
    pending.chunks.push(event.data)
    pending.stream = event.stream
    pending.timestamp = event.timestamp
    pending.seq = event.seq
    if (!remoteFlushTimer) {
      remoteFlushTimer = setTimeout(flushRemotePending, REMOTE_FLUSH_INTERVAL_MS)
      remoteFlushTimer.unref?.()
    }
  })

  const statusUnsubscribe = deps.sessionManager.subscribeStatus((event) => {
    io.to(sessionRoom(event.sessionId)).emit('session:status', event)
  })

  io.on('connection', (socket) => {
    const now = Date.now()
    lastActivityBySocket.set(socket.id, now)
    logger.info(`[remote] socket connected: ${socket.id}`)

    socket.onAny(() => {
      lastActivityBySocket.set(socket.id, Date.now())
    })

    socket.on('session:subscribe', (payload: SessionSubscribePayload, ack?: (result: SocketAck) => void) => {
      if (!subscribeLimiter.tryTake(socket.id)) {
        logger.warn(`[remote] subscribe rate limited: ${socket.id}`)
        ackErr(ack, 'Rate limited: too many subscribe requests')
        return
      }
      handleSubscribe(socket, deps, payload, ack)
    })

    socket.on('session:unsubscribe', (payload: SessionSubscribePayload, ack?: (result: SocketAck) => void) => {
      handleUnsubscribe(socket, payload, ack)
    })

    socket.on('session:input', (payload: SessionInputPayload, ack?: (result: SocketAck) => void) => {
      if (!inputLimiter.tryTake(socket.id)) {
        ackErr(ack, 'Rate limited: input too frequent')
        return
      }
      handleInput(socket, deps, payload, ack)
    })

    socket.on('session:write', (payload: SessionWritePayload, ack?: (result: SocketAck) => void) => {
      if (!writeLimiter.tryTake(socket.id)) {
        ackErr(ack, 'Rate limited: write too frequent')
        return
      }
      handleWrite(socket, deps, payload, ack)
    })

    socket.on('session:resize', (payload: SessionResizePayload, ack?: (result: SocketAck) => void) => {
      handleResize(socket, deps, payload, ack)
    })

    socket.on('disconnect', () => {
      lastActivityBySocket.delete(socket.id)
      logger.info(`[remote] socket disconnected: ${socket.id}`)
    })
  })

  const idleTimer = setInterval(() => {
    const now = Date.now()
    for (const [socketId, lastActivity] of lastActivityBySocket) {
      if (now - lastActivity <= idleTimeoutMs) continue
      const socket = io.sockets.sockets.get(socketId)
      if (!socket) {
        lastActivityBySocket.delete(socketId)
        continue
      }
      socket.emit('system:idle-timeout', { message: 'Disconnected due to inactivity' })
      socket.disconnect(true)
      lastActivityBySocket.delete(socketId)
    }
  }, Math.min(60_000, Math.max(5_000, Math.floor(idleTimeoutMs / 2))))
  idleTimer.unref?.()

  return () => {
    clearInterval(idleTimer)
    if (remoteFlushTimer) {
      clearTimeout(remoteFlushTimer)
      remoteFlushTimer = null
    }
    pendingRemote.clear()
    inputLimiter.clear()
    writeLimiter.clear()
    subscribeLimiter.clear()
    outputUnsubscribe()
    statusUnsubscribe()
    io.removeAllListeners('connection')
    lastActivityBySocket.clear()
  }
}
