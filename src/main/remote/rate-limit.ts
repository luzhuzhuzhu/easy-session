import type { Request, Response, NextFunction } from 'express'
import type { RemoteErrorBody } from './types'

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  windowMs: number
  max: number
}

function buildError(requestId: string): RemoteErrorBody {
  return {
    code: 'RATE_LIMITED',
    message: 'Too many requests',
    requestId
  }
}

export function createMemoryRateLimitMiddleware(options: RateLimitOptions) {
  const bucket = new Map<string, RateLimitEntry>()

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    const requestId = (req.headers['x-request-id'] as string | undefined) || 'n/a'
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const key = `${ip}:${req.method}:${req.path}`
    const entry = bucket.get(key)

    if (!entry || now >= entry.resetAt) {
      bucket.set(key, { count: 1, resetAt: now + options.windowMs })
      next()
      return
    }

    if (entry.count >= options.max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000))
      res.setHeader('Retry-After', String(retryAfterSec))
      res.status(429).json(buildError(requestId))
      return
    }

    entry.count += 1
    next()
  }
}
