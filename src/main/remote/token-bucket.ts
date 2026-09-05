// 简易令牌桶限流器：供 WebSocket 事件通道与两级 REST 限流共用。
// 与 REST 侧的窗口计数（rate-limit.ts）不同，WS 交互是持续流式的，
// 令牌桶更能贴合「稳态速率受限、允许小突发」的真实终端输入模式。
interface TokenBucketOptions {
  // 桶容量（最大突发量）
  capacity: number
  // 每秒补充令牌数（稳态速率）
  refillPerSecond: number
}

interface TokenBucketState {
  tokens: number
  lastRefillAt: number
}

export class TokenBucketLimiter {
  private buckets = new Map<string, TokenBucketState>()
  private lastSweepAt = Date.now()

  constructor(private options: TokenBucketOptions) {}

  /**
   * 取 1 个令牌。返回 true = 放行；false = 已被限流。
   */
  tryTake(key: string, now: number = Date.now()): boolean {
    this.sweepIfNeeded(now)
    let bucket = this.buckets.get(key)
    if (!bucket) {
      bucket = { tokens: this.options.capacity, lastRefillAt: now }
      this.buckets.set(key, bucket)
    }
    const elapsedSec = (now - bucket.lastRefillAt) / 1000
    if (elapsedSec > 0) {
      bucket.tokens = Math.min(this.options.capacity, bucket.tokens + elapsedSec * this.options.refillPerSecond)
      bucket.lastRefillAt = now
    }
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }

  // 周期清理长期不活跃的桶，防止 key（socket id）无限增长。
  private sweepIfNeeded(now: number): void {
    if (now - this.lastSweepAt < 60_000) return
    this.lastSweepAt = now
    const idleThresholdMs = Math.max(120_000, (this.options.capacity / this.options.refillPerSecond) * 4_000)
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.lastRefillAt > idleThresholdMs) this.buckets.delete(key)
    }
  }

  clear(): void {
    this.buckets.clear()
  }
}
