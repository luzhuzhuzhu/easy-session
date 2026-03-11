import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { io as ioClient, type Socket } from 'socket.io-client'

async function startPollingOnlySocketServer(): Promise<{
  url: string
  close: () => Promise<void>
}> {
  const httpServer = createServer()
  const io = new SocketIOServer(httpServer, {
    transports: ['polling'],
    cors: { origin: true }
  })

  io.on('connection', (socket) => {
    socket.emit('hello', { ok: true })
  })

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()))
  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to start polling-only socket server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => io.close(() => resolve()))
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()))
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        if (message.includes('Server is not running')) return
        throw err
      })
    }
  }
}

function connectWithOptions(url: string, options: Record<string, unknown>): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(url, {
      reconnection: false,
      timeout: 1500,
      ...options
    })

    socket.once('connect', () => resolve(socket))
    socket.once('connect_error', (err) => {
      socket.close()
      reject(err)
    })
  })
}

describe('socket.io transport fallback', () => {
  let closeServer: (() => Promise<void>) | null = null

  afterEach(async () => {
    if (closeServer) {
      await closeServer()
      closeServer = null
    }
  })

  it('should connect when polling is preferred and all transports are allowed', async () => {
    const server = await startPollingOnlySocketServer()
    closeServer = server.close

    const client = await connectWithOptions(server.url, {
      transports: ['polling', 'websocket'],
      tryAllTransports: true
    })

    expect(client.connected).toBe(true)
    expect(client.io.engine.transport.name).toBe('polling')
    client.close()
  })
})
