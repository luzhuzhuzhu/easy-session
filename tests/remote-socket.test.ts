import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { io as ioClient, type Socket } from 'socket.io-client'
import { setupRemoteSocketBridge } from '../src/main/remote/socket'
import type { RemoteDependencies } from '../src/main/remote/types'
import type { SessionOutputEvent } from '../src/main/services/session-output'
import type { SessionStatusChangeEvent } from '../src/main/services/session-manager'

async function startSocketServer(
  deps: RemoteDependencies
): Promise<{ url: string; io: SocketIOServer; close: () => Promise<void> }> {
  const httpServer = createServer()
  const io = new SocketIOServer(httpServer, { transports: ['websocket'] })
  const cleanupBridge = setupRemoteSocketBridge({
    io,
    deps,
    idleTimeoutMs: 60_000,
    logger: console
  })

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()))
  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to start socket server')
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    io,
    close: async () => {
      cleanupBridge()
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

function connectClient(url: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(url, { transports: ['websocket'] })
    client.on('connect', () => resolve(client))
    client.on('connect_error', reject)
  })
}

describe('remote socket bridge', () => {
  let client: Socket | null = null
  let closeServer: (() => Promise<void>) | null = null

  afterEach(async () => {
    client?.disconnect()
    client = null
    if (closeServer) {
      await closeServer()
      closeServer = null
    }
  })

  it('should support subscribe/input/resize and forward output/status', async () => {
    let outputListener: ((event: SessionOutputEvent) => void) | null = null
    let statusListener: ((event: SessionStatusChangeEvent) => void) | null = null

    const deps: RemoteDependencies = {
      outputManager: {
        getHistory: vi.fn(() => [
          { text: 'history-1\n', stream: 'stdout', timestamp: Date.now(), seq: 1 }
        ]),
        subscribe: vi.fn((fn: (event: SessionOutputEvent) => void) => {
          outputListener = fn
          return () => {
            outputListener = null
          }
        })
      } as any,
      sessionManager: {
        getSession: vi.fn((id: string) =>
          id === 's1'
            ? {
                id: 's1',
                status: 'running',
                processId: 'proc-s1'
              }
            : undefined
        ),
        writeRaw: vi.fn(() => true),
        sendInput: vi.fn(() => true),
        resizeTerminal: vi.fn(),
        subscribeStatus: vi.fn((fn: (event: SessionStatusChangeEvent) => void) => {
          statusListener = fn
          return () => {
            statusListener = null
          }
        })
      } as any,
      projectManager: {} as any
    }

    const server = await startSocketServer(deps)
    closeServer = server.close
    client = await connectClient(server.url)

    const outputs: any[] = []
    const statuses: any[] = []
    client.on('session:output', (event) => outputs.push(event))
    client.on('session:status', (event) => statuses.push(event))

    const subscribeAck = await new Promise<any>((resolve) => {
      client!.emit('session:subscribe', { sessionId: 's1', historyLines: 100 }, (ack: any) => resolve(ack))
    })
    expect(subscribeAck.ok).toBe(true)
    expect(outputs.some((item) => item.data === 'history-1\n')).toBe(true)
    expect(statuses.some((item) => item.sessionId === 's1')).toBe(true)

    const inputAck = await new Promise<any>((resolve) => {
      client!.emit('session:input', { sessionId: 's1', input: 'ls' }, (ack: any) => resolve(ack))
    })
    expect(inputAck.ok).toBe(true)
    expect((deps.sessionManager.writeRaw as any).mock.calls[0][0]).toBe('s1')
    expect((deps.sessionManager.writeRaw as any).mock.calls[0][1]).toBe('ls\r')

    const writeAck = await new Promise<any>((resolve) => {
      client!.emit('session:write', { sessionId: 's1', data: 'raw-data' }, (ack: any) => resolve(ack))
    })
    expect(writeAck.ok).toBe(true)
    expect((deps.sessionManager.writeRaw as any).mock.calls[1]).toEqual(['s1', 'raw-data'])

    const resizeAck = await new Promise<any>((resolve) => {
      client!.emit('session:resize', { sessionId: 's1', cols: 120, rows: 40 }, (ack: any) => resolve(ack))
    })
    expect(resizeAck.ok).toBe(true)
    expect((deps.sessionManager.resizeTerminal as any).mock.calls[0]).toEqual(['s1', 120, 40])

    outputListener?.({
      sessionId: 's1',
      data: 'live-output\n',
      stream: 'stdout',
      timestamp: Date.now(),
      seq: 2
    })
    statusListener?.({ sessionId: 's1', status: 'stopped' as any })

    await new Promise((resolve) => setTimeout(resolve, 40))
    expect(outputs.some((item) => item.data === 'live-output\n')).toBe(true)
    expect(statuses.some((item) => item.status === 'stopped')).toBe(true)
  })

  it('should allow subscribe without history replay when historyLines is zero', async () => {
    const deps: RemoteDependencies = {
      outputManager: {
        getHistory: vi.fn(() => [
          { text: 'history-1\n', stream: 'stdout', timestamp: Date.now(), seq: 1 }
        ]),
        subscribe: vi.fn(() => () => undefined)
      } as any,
      sessionManager: {
        getSession: vi.fn((id: string) =>
          id === 's1'
            ? {
                id: 's1',
                status: 'running',
                processId: 'proc-s1'
              }
            : undefined
        ),
        writeRaw: vi.fn(() => true),
        resizeTerminal: vi.fn(),
        subscribeStatus: vi.fn(() => () => undefined)
      } as any,
      projectManager: {} as any
    }

    const server = await startSocketServer(deps)
    closeServer = server.close
    client = await connectClient(server.url)

    const outputs: any[] = []
    client.on('session:output', (event) => outputs.push(event))

    const subscribeAck = await new Promise<any>((resolve) => {
      client!.emit('session:subscribe', { sessionId: 's1', historyLines: 0 }, (ack: any) => resolve(ack))
    })

    expect(subscribeAck.ok).toBe(true)
    expect(outputs).toHaveLength(0)
    expect((deps.outputManager.getHistory as any).mock.calls.length).toBe(0)
  })
})
