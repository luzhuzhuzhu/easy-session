import { createServer, type Server as HttpServer } from 'http'
import { randomUUID } from 'crypto'
import { hostname } from 'os'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import pino from 'pino'
import pinoHttp from 'pino-http'
import { Server as SocketIOServer, type Socket } from 'socket.io'
import packageJson from '../../../package.json'
import { createRestAuthMiddleware, validateSocketToken } from './auth'
import { loadRemoteRuntimeConfig, fingerprintToken } from './config'
import { createMemoryRateLimitMiddleware } from './rate-limit'
import { registerRemoteRoutes } from './routes'
import { setupRemoteSocketBridge } from './socket'
import type { RemoteDependencies, RemoteServerInfo, RemoteRuntimeConfig } from './types'

function assignRequestId(req: Request, _res: Response, next: NextFunction): void {
  const headerId = req.headers['x-request-id']
  const requestId =
    typeof headerId === 'string' && headerId.trim().length > 0 ? headerId.trim() : randomUUID()
  ;(req as any).__requestId = requestId
  next()
}

// trust proxy 收敛（P0#4）：默认 false —— 不信任 X-Forwarded-For，req.ip 取直连对端，
// 杜绝公网暴露时轮换 XFF 绕过限流。确有可信反代时可用 env 显式放开（跳数/loopback/CIDR）。
function resolveTrustProxy(): boolean | number | string {
  const raw = process.env.EASYSESSION_REMOTE_TRUST_PROXY
  if (raw === undefined || raw.trim() === '') return false
  const trimmed = raw.trim()
  if (trimmed.toLowerCase() === 'false') return false
  if (trimmed.toLowerCase() === 'true') return true
  const hops = Number.parseInt(trimmed, 10)
  if (Number.isFinite(hops) && hops >= 0 && String(hops) === trimmed) return hops
  return trimmed
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    const host = url.hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
  } catch {
    return false
  }
}

// CORS 收敛：不反射任意来源。无 Origin（同源页面 / curl / 移动端等非浏览器客户端）放行；
// 跨源仅放行 loopback 与 env 显式配置的来源，其余不回 ACAO，由浏览器拦截。
function buildCorsOriginChecker(): (
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void
) => void {
  const allowList = (process.env.EASYSESSION_REMOTE_CORS_ORIGINS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  return (origin, cb) => {
    if (!origin) return cb(null, true)
    const normalized = origin.trim().toLowerCase()
    if (allowList.includes(normalized) || isLoopbackOrigin(normalized)) return cb(null, true)
    cb(null, false)
  }
}

function normalizeHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return typeof value === 'string' ? value : undefined
}

function describeSocketAuth(socket: Socket): {
  tokenProvided: boolean
  tokenVia: 'auth' | 'header' | 'none'
  tokenFingerprint?: string
  userAgent?: string
  origin?: string
  address?: string
} {
  const handshakeTokenRaw = socket.handshake.auth?.token
  const headerAuthorization = socket.handshake.headers.authorization

  if (typeof handshakeTokenRaw === 'string' && handshakeTokenRaw.trim()) {
    return {
      tokenProvided: true,
      tokenVia: 'auth',
      tokenFingerprint: fingerprintToken(handshakeTokenRaw.trim()),
      userAgent: normalizeHeaderValue(socket.handshake.headers['user-agent']),
      origin: normalizeHeaderValue(socket.handshake.headers.origin),
      address: socket.handshake.address
    }
  }

  if (typeof headerAuthorization === 'string' && headerAuthorization.trim()) {
    const token = headerAuthorization.trim().toLowerCase().startsWith('bearer ')
      ? headerAuthorization.trim().slice(7).trim()
      : headerAuthorization.trim()
    return {
      tokenProvided: token.length > 0,
      tokenVia: 'header',
      tokenFingerprint: token ? fingerprintToken(token) : undefined,
      userAgent: normalizeHeaderValue(socket.handshake.headers['user-agent']),
      origin: normalizeHeaderValue(socket.handshake.headers.origin),
      address: socket.handshake.address
    }
  }

  return {
    tokenProvided: false,
    tokenVia: 'none',
    userAgent: normalizeHeaderValue(socket.handshake.headers['user-agent']),
    origin: normalizeHeaderValue(socket.handshake.headers.origin),
    address: socket.handshake.address
  }
}

export class RemoteGatewayServer {
  private httpServer: HttpServer | null = null
  private io: SocketIOServer | null = null
  private cleanupSocketBridge: (() => void) | null = null
  private runtimeConfig: RemoteRuntimeConfig | null = null
  // redact（P0#3）：移除日志中的鉴权/敏感请求头，避免 pino-http 把 Authorization Bearer 写进日志。
  private logger = pino({
    name: 'easysession-remote',
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]'
      ],
      remove: true
    }
  })

  constructor(
    private deps: RemoteDependencies,
    private userDataPath: string
  ) {}

  private async createApp(config: RemoteRuntimeConfig): Promise<Express> {
    const app = express()
    app.disable('x-powered-by')
    app.set('trust proxy', resolveTrustProxy())
    const corsOptions = {
      origin: buildCorsOriginChecker(),
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as string[],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'] as string[],
      optionsSuccessStatus: 204
    }

    app.use(assignRequestId)
    app.use(
      pinoHttp({
        logger: this.logger,
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error'
          if (res.statusCode >= 400) return 'warn'
          return 'info'
        }
      })
    )
    app.use(
      helmet({
        // 开启 CSP：与当前内联脚本/样式 + Google Fonts + 同源 xterm 资源 + socket.io 兼容。
        // （内联仍依赖 'unsafe-inline'，后续可由前端改 nonce 进一步收紧。）
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'", 'ws:', 'wss:'],
            // 本地默认走 http://127.0.0.1，不强升级 https，避免本地页面被 upgrade 破坏。
            upgradeInsecureRequests: null
          }
        }
      })
    )
    app.use(
      cors(corsOptions)
    )
    app.options('*', cors(corsOptions))
    app.use(express.json({ limit: '512kb' }))

    app.use('/api', createMemoryRateLimitMiddleware({ windowMs: config.rateLimitWindowMs, max: config.rateLimitMax }))
    app.use('/api', createRestAuthMiddleware(config.token))

    registerRemoteRoutes(app, this.deps, {
      defaultBaseUrl: config.baseUrl,
      passthroughOnly: config.passthroughOnly,
      serverName: 'EasySession',
      serverVersion: packageJson.version,
      platform: process.platform,
      machineName: hostname()
    })

    app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
      const requestId = ((req as any).__requestId as string | undefined) || 'n/a'
      // 完整错误（可能含内部异常信息与本机路径）只落服务端日志，不回传客户端，
      // 仅返回通用文案 + requestId 供关联排查。
      this.logger.error({ err, requestId }, '[remote] unhandled route error')
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        requestId
      })
    })

    return app
  }

  private listen(server: HttpServer, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => {
        server.off('error', reject)
        resolve()
      })
    })
  }

  isRunning(): boolean {
    return !!this.httpServer
  }

  async start(explicitConfig?: RemoteRuntimeConfig): Promise<RemoteServerInfo> {
    if (this.httpServer && this.runtimeConfig) {
      return {
        enabled: true,
        host: this.runtimeConfig.host,
        port: this.runtimeConfig.port,
        tokenFingerprint: fingerprintToken(this.runtimeConfig.token)
      }
    }

    const config = explicitConfig ?? (await loadRemoteRuntimeConfig(this.userDataPath))
    this.runtimeConfig = config

    if (!config.enabled) {
      this.logger.info('[remote] disabled via EASYSESSION_REMOTE_ENABLED')
      return { enabled: false }
    }

    const app = await this.createApp(config)
    const httpServer = createServer(app)
    const io = new SocketIOServer(httpServer, {
      transports: ['websocket', 'polling'],
      cors: {
        origin: buildCorsOriginChecker(),
        methods: ['GET', 'POST'],
        allowedHeaders: ['Authorization']
      }
    })

    io.use((socket, next) => {
      if (!validateSocketToken(socket, config.token)) {
        this.logger.warn(
          {
            ...describeSocketAuth(socket)
          },
          '[remote] socket auth rejected'
        )
        next(new Error('Unauthorized'))
        return
      }
      next()
    })

    this.cleanupSocketBridge = setupRemoteSocketBridge({
      io,
      deps: this.deps,
      idleTimeoutMs: config.idleTimeoutMs,
      logger: {
        info: (msg: string) => this.logger.info(msg),
        warn: (msg: string) => this.logger.warn(msg),
        error: (msg: string) => this.logger.error(msg)
      }
    })

    await this.listen(httpServer, config.host, config.port)

    this.httpServer = httpServer
    this.io = io

    const tokenFingerprint = fingerprintToken(config.token)
    this.logger.info(
      {
        host: config.host,
        port: config.port,
        passthroughOnly: config.passthroughOnly,
        tokenFingerprint,
        tokenSource: config.tokenSource,
        tokenFilePath: config.tokenFilePath
      },
      '[remote] server started'
    )

    return {
      enabled: true,
      host: config.host,
      port: config.port,
      tokenFingerprint
    }
  }

  async stop(): Promise<void> {
    this.cleanupSocketBridge?.()
    this.cleanupSocketBridge = null

    if (this.io) {
      await new Promise<void>((resolve) => this.io!.close(() => resolve()))
      this.io = null
    }

    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) {
            reject(err)
            return
          }
          resolve()
        })
      }).catch((err) => {
        this.logger.warn({ err }, '[remote] close http server failed')
      })
      this.httpServer = null
    }

    this.runtimeConfig = null
  }
}
