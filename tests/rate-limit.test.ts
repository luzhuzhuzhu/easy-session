import { describe, expect, it } from 'vitest'
import { createMemoryRateLimitMiddleware } from '../src/main/remote/rate-limit'

type MW = ReturnType<typeof createMemoryRateLimitMiddleware>

function run(mw: MW, ip: string, path: string, method = 'POST'): { nexted: boolean; statusCode: number } {
  const req = { headers: {}, ip, socket: { remoteAddress: ip }, method, path } as any
  let statusCode = 200
  let nexted = false
  const res = {
    setHeader: () => {},
    status: (code: number) => {
      statusCode = code
      return res
    },
    json: () => {}
  } as any
  mw(req, res, () => {
    nexted = true
  })
  return { nexted, statusCode }
}

describe('memory rate limit middleware', () => {
  it('按 key 限流：超过 max 返回 429', () => {
    const mw = createMemoryRateLimitMiddleware({ windowMs: 60_000, max: 2 })
    expect(run(mw, 'c1', '/a').nexted).toBe(true) // count 1
    expect(run(mw, 'c1', '/a').nexted).toBe(true) // count 2 (== max)
    const third = run(mw, 'c1', '/a')
    expect(third.nexted).toBe(false)
    expect(third.statusCode).toBe(429)
    // 不同 key 不受影响
    expect(run(mw, 'c1', '/b').nexted).toBe(true)
    expect(run(mw, 'c2', '/a').nexted).toBe(true)
  })

  it('撑满桶时已达 max 的活跃条目不被驱逐/重置（防限流绕过）', () => {
    const mw = createMemoryRateLimitMiddleware({ windowMs: 60_000, max: 2, maxEntries: 4 })
    // 受害者（即攻击自身的真限流条目）打到 max
    run(mw, 'victim', '/auth') // count 1
    run(mw, 'victim', '/auth') // count 2 (== max)
    expect(run(mw, 'victim', '/auth').statusCode).toBe(429) // 已被限流

    // 攻击者轮换 path 反复撑爆桶（cap=4）
    for (let i = 0; i < 50; i += 1) {
      run(mw, 'atk', `/p${i}`)
    }

    // 关键：victim 的在force限流条目未被挤掉/重置，仍应被限流
    expect(run(mw, 'victim', '/auth').statusCode).toBe(429)
  })

  it('桶满且全为在force条目时拒绝为新 key 增长但放行，既有限流不受影响', () => {
    const mw = createMemoryRateLimitMiddleware({ windowMs: 60_000, max: 1, maxEntries: 2 })
    run(mw, 'a', '/x') // count 1 (== max)
    run(mw, 'b', '/y') // count 1 (== max)，桶满
    expect(run(mw, 'a', '/x').statusCode).toBe(429)
    expect(run(mw, 'b', '/y').statusCode).toBe(429)

    // 新 key：桶满且 a/b 都在force → 无可驱逐 → 不入桶但放行
    const fresh = run(mw, 'c', '/z')
    expect(fresh.nexted).toBe(true)

    // a 仍被限流（未被新 key 挤掉）
    expect(run(mw, 'a', '/x').statusCode).toBe(429)
  })
})
