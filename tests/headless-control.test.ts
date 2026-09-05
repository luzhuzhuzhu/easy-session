// SEC-12：HeadlessControlServer 行为测试——分帧/粘包、鉴权、空闲超时、错误 token
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConnection, type Server as NetServer } from 'net'
import { HeadlessControlServer, generateControlToken } from '../src/main/lifecycle/headless-control'

async function startServer(opts: { token?: string; onShutdown: () => void }): Promise<{ port: number; close: () => void }> {
  const server = new HeadlessControlServer({ port: 0, requestShutdown: opts.onShutdown, token: opts.token })
  // port 0 由 OS 分配：HeadlessControlServer 直接 listen 传入端口，0 合法
  server.listen()
  // 等待监听
  await new Promise((resolve) => setTimeout(resolve, 50))
  // 通过内部 server 取实际端口
  const internal = (server as unknown as { server: NetServer | null }).server
  const address = internal?.address()
  if (!address || typeof address === 'string') throw new Error('no address')
  return { port: address.port, close: () => server.dispose() }
}

interface ConnResult {
  replies: string[]
}

function sendLines(port: number, payload: string): Promise<ConnResult> {
  return new Promise((resolve, reject) => {
    const conn = createConnection({ port, host: '127.0.0.1' }, () => {
      conn.write(payload)
    })
    const replies: string[] = []
    conn.on('data', (d: Buffer) => {
      replies.push(d.toString('utf8'))
      conn.end()
    })
    conn.on('close', () => resolve({ replies }))
    conn.on('error', reject)
    setTimeout(() => {
      conn.destroy()
      resolve({ replies })
    }, 1500)
  })
}

describe('HeadlessControlServer', () => {
  let cleanup: (() => void) | null = null

  afterEach(() => {
    cleanup?.()
    cleanup = null
    vi.restoreAllMocks()
  })

  it('handles fragmented commands (qu + it across packets) via line framing', async () => {
    let shutdowns = 0
    const { port, close } = await startServer({ token: undefined, onShutdown: () => (shutdowns += 1) })
    cleanup = close
    const result = await new Promise<ConnResult>((resolve, reject) => {
      const conn = createConnection({ port, host: '127.0.0.1' }, () => {
        conn.write('qu')
        setTimeout(() => conn.write('it\n'), 30)
      })
      const replies: string[] = []
      conn.on('data', (d: Buffer) => replies.push(d.toString('utf8')))
      conn.on('close', () => resolve({ replies }))
      conn.on('error', reject)
      setTimeout(() => resolve({ replies }), 1500)
    })
    expect(result.replies.join('')).toContain('ok:quit')
    expect(shutdowns).toBe(1)
  })

  it('rejects commands with a bad token and never shuts down', async () => {
    let shutdowns = 0
    const { port, close } = await startServer({ token: 'secret-token', onShutdown: () => (shutdowns += 1) })
    cleanup = close
    const bad = await sendLines(port, 'wrong-token\nquit\n')
    expect(bad.replies.join('')).toContain('error:auth')
    expect(shutdowns).toBe(0)
  })

  it('accepts token:command form with correct token', async () => {
    let shutdowns = 0
    const token = 'abc123'
    const { port, close } = await startServer({ token, onShutdown: () => (shutdowns += 1) })
    cleanup = close
    const ok = await sendLines(port, `${token}:ping\n`)
    expect(ok.replies.join('')).toContain('pong')
    expect(shutdowns).toBe(0)
  })

  it('rejects bare command when token is required', async () => {
    let shutdowns = 0
    const { port, close } = await startServer({ token: 'abc123', onShutdown: () => (shutdowns += 1) })
    cleanup = close
    const res = await sendLines(port, 'ping\n')
    expect(res.replies.join('')).not.toContain('pong')
    expect(shutdowns).toBe(0)
  })

  it('destroys oversized first lines', async () => {
    let shutdowns = 0
    const { port, close } = await startServer({ token: undefined, onShutdown: () => (shutdowns += 1) })
    cleanup = close
    const res = await sendLines(port, 'x'.repeat(600) + '\n')
    expect(res.replies.join('')).toBe('')
    expect(shutdowns).toBe(0)
  })

  it('generateControlToken returns 32 hex chars', () => {
    expect(generateControlToken()).toMatch(/^[0-9a-f]{32}$/)
  })
})
