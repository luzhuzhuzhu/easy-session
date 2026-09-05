// SEC-3：WS 令牌桶限流 + token-bucket 单元测试
import { describe, expect, it } from 'vitest'
import { TokenBucketLimiter } from '../src/main/remote/token-bucket'

describe('TokenBucketLimiter', () => {
  it('allows a burst up to capacity then blocks until refill', () => {
    const limiter = new TokenBucketLimiter({ capacity: 3, refillPerSecond: 1 })
    const t0 = 1_000_000
    expect(limiter.tryTake('k', t0)).toBe(true)
    expect(limiter.tryTake('k', t0)).toBe(true)
    expect(limiter.tryTake('k', t0)).toBe(true)
    expect(limiter.tryTake('k', t0)).toBe(false)
    // 1 秒后补 1 个令牌
    expect(limiter.tryTake('k', t0 + 1_000)).toBe(true)
    expect(limiter.tryTake('k', t0 + 1_100)).toBe(false)
  })

  it('tracks keys independently', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 1 })
    const t0 = 1_000_000
    expect(limiter.tryTake('a', t0)).toBe(true)
    expect(limiter.tryTake('a', t0)).toBe(false)
    expect(limiter.tryTake('b', t0)).toBe(true)
  })

  it('does not refill beyond capacity', () => {
    const limiter = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 10 })
    const t0 = 1_000_000
    // 长时间空闲后容量封顶为 2
    expect(limiter.tryTake('k', t0 + 600_000)).toBe(true)
    expect(limiter.tryTake('k', t0 + 600_000)).toBe(true)
    expect(limiter.tryTake('k', t0 + 600_000)).toBe(false)
  })

  it('clear() resets all buckets', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 0.001 })
    const t0 = 1_000_000
    expect(limiter.tryTake('k', t0)).toBe(true)
    expect(limiter.tryTake('k', t0)).toBe(false)
    limiter.clear()
    expect(limiter.tryTake('k', t0)).toBe(true)
  })
})
