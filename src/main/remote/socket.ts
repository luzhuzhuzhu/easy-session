import type { Server as SocketIOServer, Socket } from 'socket.io'
import type {
  RemoteDependencies,
  SessionInputPayload,
  SessionResizePayload,
  SessionSubscribePayload,
  SessionWritePayload,
  SocketAck
} from './types'

interface SetupSocketBridgeOptions {
  io: SocketIOServer
  deps: RemoteDependencies
  idleTimeoutMs: number
  logger: Pick<Console, 'info' | 'warn' | 'error'>
}

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

  const outputUnsubscribe = deps.outputManager.subscribe((event) => {
    io.to(sessionRoom(event.sessionId)).emit('session:output', event)
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
      handleSubscribe(socket, deps, payload, ack)
    })

    socket.on('session:unsubscribe', (payload: SessionSubscribePayload, ack?: (result: SocketAck) => void) => {
      handleUnsubscribe(socket, payload, ack)
    })

    socket.on('session:input', (payload: SessionInputPayload, ack?: (result: SocketAck) => void) => {
      handleInput(socket, deps, payload, ack)
    })

    socket.on('session:write', (payload: SessionWritePayload, ack?: (result: SocketAck) => void) => {
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
    outputUnsubscribe()
    statusUnsubscribe()
    io.removeAllListeners('connection')
    lastActivityBySocket.clear()
  }
}
