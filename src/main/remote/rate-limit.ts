import type { Request, Response, NextFunction } from 'express'
import type { RemoteErrorBody } from './types'

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  windowMs: number
  max: number
  // 内存桶硬上限（可选，默认 50k）：暴露出来便于测试用小桶覆盖驱逐路径。
  maxEntries?: number
}

function buildError(requestId: string): RemoteErrorBody {
  return {
    code: 'RATE_LIMITED',
    message: 'Too many requests',
    requestId
  }
}

// 内存桶硬上限：防止有人轮换 path 把桶撑大耗尽内存。
const DEFAULT_MAX_BUCKET_ENTRIES = 50_000

export function createMemoryRateLimitMiddleware(options: RateLimitOptions) {
  const bucket = new Map<string, RateLimitEntry>()
  let lastSweepAt = 0
  const sweepIntervalMs = Math.max(options.windowMs, 30_000)
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_BUCKET_ENTRIES

  // 周期性清理已过期条目，避免内存桶随不同 key 无限增长。
  const sweepExpired = (now: number): void => {
    if (now - lastSweepAt < sweepIntervalMs) return
    lastSweepAt = now
    for (const [key, entry] of bucket) {
      if (now >= entry.resetAt) bucket.delete(key)
    }
  }

  // 为新 key 腾位：先清过期；仍满则只驱逐「未在生效限流」(count<max) 的条目，
  // 且优先驱逐最接近过期者。绝不驱逐已达 max 的在force条目 —— 否则攻击者可借轮换 path
  // 撑爆桶把自己（已被限流的活跃条目）挤掉、重置计数从而绕过限流。
  // 若全是在force条目则拒绝为新 key 增长（返回 false，新 key 不入桶），既有限流不受影响。
  const makeRoomForNewKey = (now: number): boolean => {
    if (bucket.size < maxEntries) return true
    for (const [key, entry] of bucket) {
      if (now >= entry.resetAt) bucket.delete(key)
    }
    if (bucket.size < maxEntries) return true
    let victimKey: string | undefined
    let victimResetAt = Number.POSITIVE_INFINITY
    for (const [key, entry] of bucket) {
      if (entry.count >= options.max) continue // 跳过在force限流条目，绝不驱逐
      if (entry.resetAt < victimResetAt) {
        victimResetAt = entry.resetAt
        victimKey = key
      }
    }
    if (victimKey !== undefined) {
      bucket.delete(victimKey)
      return true
    }
    return false
  }

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now()
    sweepExpired(now)
    const requestId = (req.headers['x-request-id'] as string | undefined) || 'n/a'
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const key = `${ip}:${req.method}:${req.path}`
    const entry = bucket.get(key)

    if (!entry || now >= entry.resetAt) {
      // 桶满且无可驱逐条目时不追踪该新 key（直接放行），既有限流条目一律保留。
      if (makeRoomForNewKey(now)) {
        bucket.set(key, { count: 1, resetAt: now + options.windowMs })
      }
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
