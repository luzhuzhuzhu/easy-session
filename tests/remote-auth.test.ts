import { describe, it, expect } from 'vitest'
import express from 'express'
import { createServer } from 'http'
import { createRestAuthMiddleware, validateSocketToken } from '../src/main/remote/auth'

async function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to start test server')
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
    }
  }
}

describe('remote auth', () => {
  it('rest middleware should reject missing token and accept valid token', async () => {
    const token = 'a'.repeat(64)
    const app = express()
    app.use((req, _res, next) => {
      ;(req as any).__requestId = 'test-request-id'
      next()
    })
    app.use('/api', createRestAuthMiddleware(token))
    app.get('/api/health', (_req, res) => {
      res.json({ ok: true })
    })

    const server = await startServer(app)
    try {
      const unauthorizedResp = await fetch(`${server.baseUrl}/api/health`)
      expect(unauthorizedResp.status).toBe(401)

      const okResp = await fetch(`${server.baseUrl}/api/health`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(okResp.status).toBe(200)
    } finally {
      await server.close()
    }
  })

  it('rest middleware should allow unauthenticated OPTIONS preflight requests', async () => {
    const token = 'a'.repeat(64)
    const app = express()
    app.use((req, _res, next) => {
      ;(req as any).__requestId = 'test-request-id'
      next()
    })
    app.use('/api', createRestAuthMiddleware(token))
    app.options('/api/health', (_req, res) => {
      res.sendStatus(204)
    })

    const server = await startServer(app)
    try {
      const resp = await fetch(`${server.baseUrl}/api/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization'
        }
      })
      expect(resp.status).toBe(204)
    } finally {
      await server.close()
    }
  })

  it('socket token validation should support auth.token and authorization header', () => {
    const token = 'b'.repeat(64)
    const socketViaAuth = {
      handshake: {
        auth: { token },
        headers: {}
      }
    } as any
    expect(validateSocketToken(socketViaAuth, token)).toBe(true)

    const socketViaHeader = {
      handshake: {
        auth: {},
        headers: { authorization: `Bearer ${token}` }
      }
    } as any
    expect(validateSocketToken(socketViaHeader, token)).toBe(true)

    const badSocket = {
      handshake: {
        auth: { token: 'invalid' },
        headers: {}
      }
    } as any
    expect(validateSocketToken(badSocket, token)).toBe(false)
  })
})
