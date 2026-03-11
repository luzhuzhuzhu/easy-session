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
  private logger = pino({ name: 'easysession-remote' })

  constructor(
    private deps: RemoteDependencies,
    private userDataPath: string
  ) {}

  private async createApp(config: RemoteRuntimeConfig): Promise<Express> {
    const app = express()
    app.disable('x-powered-by')
    app.set('trust proxy', true)
    const corsOptions = {
      origin: true,
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
        contentSecurityPolicy: false
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
      const message = err instanceof Error ? err.message : String(err)
      this.logger.error({ err, requestId }, '[remote] unhandled route error')
      res.status(500).json({
        code: 'INTERNAL_ERROR',
        message,
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
        origin: true,
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
