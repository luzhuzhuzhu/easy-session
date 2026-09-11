import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getLocalCandidatesMock } = vi.hoisted(() => ({
  getLocalCandidatesMock: vi.fn()
}))

vi.mock('../src/renderer/src/api/local-session', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/renderer/src/api/local-session')>()
  return {
    ...original,
    getNativeIdCandidates: getLocalCandidatesMock
  }
})

import { LocalGateway } from '../src/renderer/src/gateways/local-gateway'
import { RemoteGateway } from '../src/renderer/src/gateways/remote-gateway'
import type { RemoteInstance } from '../src/renderer/src/models/unified-resource'

const { socketRegistry, ioMock } = vi.hoisted(() => {
  type Listener = (...args: any[]) => void

  class FakeSocket {
    public emitted: Array<{ event: string; payload: unknown }> = []
    private readonly listeners = new Map<string, Set<Listener>>()

    on(event: string, listener: Listener): this {
      const current = this.listeners.get(event) ?? new Set<Listener>()
      current.add(listener)
      this.listeners.set(event, current)
      return this
    }

    emit(event: string, payload?: unknown, ack?: (response: { ok: boolean }) => void): this {
      this.emitted.push({ event, payload })
      if (typeof ack === 'function') {
        ack({ ok: true })
      }
      return this
    }

    trigger(event: string, payload?: unknown): void {
      for (const listener of this.listeners.get(event) ?? []) {
        listener(payload)
      }
    }

    removeAllListeners(): this {
      this.listeners.clear()
      return this
    }

    disconnect(): this {
      return this
    }
  }

  const registry = new Map<string, FakeSocket>()
  const mock = vi.fn((baseUrl: string) => {
    const socket = new FakeSocket()
    registry.set(baseUrl, socket)
    return socket
  })
  return {
    socketRegistry: registry,
    ioMock: mock
  }
})

vi.mock('socket.io-client', () => ({
  io: ioMock
}))

function createRemoteInstance(id: string, baseUrl: string): RemoteInstance {
  return {
    id,
    type: 'remote',
    name: id,
    baseUrl,
    enabled: true,
    authRef: id,
    status: 'online',
    lastCheckedAt: null,
    passthroughOnly: true,
    capabilities: {
      projectsList: true,
      projectRead: true,
      projectCreate: false,
      projectUpdate: false,
      projectRemove: false,
      projectOpen: false,
      projectSessionsList: true,
      projectDetect: true,
      sessionsList: true,
      sessionSubscribe: true,
      sessionInput: true,
      sessionResize: true,
      sessionOutputHistory: true,
      sessionCreate: false,
      sessionStart: false,
      sessionPause: false,
      sessionRestart: false,
      sessionDestroy: false,
      projectPromptRead: false,
      projectPromptWrite: false,
      localPathOpen: false
    },
    lastError: null,
    latencyMs: 42
  }
}

describe('RemoteGateway', () => {
  beforeEach(() => {
    ioMock.mockClear()
    socketRegistry.clear()
    getLocalCandidatesMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('normalizes the transitional local IPC discovery payload', async () => {
    getLocalCandidatesMock.mockResolvedValue([{
      id: ' local-1 ',
      title: ' Local title ',
      titleSource: 'summary',
      content: ' Local full content ',
      updated: 1_788_000_000_000,
      projectPath: ' D:/local-repo '
    }])

    const gateway = new LocalGateway()
    await expect(gateway.getNativeIdCandidates('local', 'claude', 'D:/local-repo')).resolves.toEqual({
      status: 'ready',
      candidates: [{
        id: 'local-1',
        title: 'Local title',
        titleSource: 'summary',
        content: 'Local full content',
        updated: 1_788_000_000_000,
        projectPath: 'D:/local-repo'
      }]
    })
  })

  it('supports multiple session subscriptions on the same remote instance without output mixing', async () => {
    const gateway = new RemoteGateway(createRemoteInstance('remote-1', 'https://remote-1.example.com'), 't'.repeat(64))
    const eventsA: string[] = []
    const eventsB: string[] = []

    const unsubscribeA = gateway.subscribeOutput('remote-1', 'session-a', (event) => {
      eventsA.push(`${event.sessionId}:${event.data}`)
    })
    const unsubscribeB = gateway.subscribeOutput('remote-1', 'session-b', (event) => {
      eventsB.push(`${event.sessionId}:${event.data}`)
    })

    await Promise.resolve()

    const socket = socketRegistry.get('https://remote-1.example.com')
    expect(socket).toBeTruthy()
    expect(socket?.emitted.filter((item) => item.event === 'session:subscribe')).toHaveLength(2)

    socket?.trigger('session:output', {
      sessionId: 'session-a',
      data: 'hello-a',
      stream: 'stdout',
      timestamp: 1
    })
    socket?.trigger('session:output', {
      sessionId: 'session-b',
      data: 'hello-b',
      stream: 'stdout',
      timestamp: 2
    })

    expect(eventsA).toEqual(['session-a:hello-a'])
    expect(eventsB).toEqual(['session-b:hello-b'])

    unsubscribeA()
    unsubscribeB()
  })

  it('isolates same sessionId across different remote instances', async () => {
    const gatewayOne = new RemoteGateway(createRemoteInstance('remote-1', 'https://remote-1.example.com'), 'a'.repeat(64))
    const gatewayTwo = new RemoteGateway(createRemoteInstance('remote-2', 'https://remote-2.example.com'), 'b'.repeat(64))
    const instanceOneEvents: string[] = []
    const instanceTwoEvents: string[] = []

    const unsubscribeOne = gatewayOne.subscribeOutput('remote-1', 'shared-session', (event) => {
      instanceOneEvents.push(event.globalSessionKey)
    })
    const unsubscribeTwo = gatewayTwo.subscribeOutput('remote-2', 'shared-session', (event) => {
      instanceTwoEvents.push(event.globalSessionKey)
    })

    await Promise.resolve()

    socketRegistry.get('https://remote-1.example.com')?.trigger('session:output', {
      sessionId: 'shared-session',
      data: 'from-remote-1',
      stream: 'stdout',
      timestamp: 1
    })
    socketRegistry.get('https://remote-2.example.com')?.trigger('session:output', {
      sessionId: 'shared-session',
      data: 'from-remote-2',
      stream: 'stdout',
      timestamp: 2
    })

    expect(instanceOneEvents).toEqual(['remote-1:shared-session'])
    expect(instanceTwoEvents).toEqual(['remote-2:shared-session'])

    unsubscribeOne()
    unsubscribeTwo()
  })

  it('returns actionable Cloudflare guidance when the remote endpoint responds with 530', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('<html>origin down</html>', {
          status: 530,
          headers: { 'Content-Type': 'text/html' }
        })
      })
    )

    const gateway = new RemoteGateway(
      createRemoteInstance('remote-1', 'https://gentle-river.trycloudflare.com'),
      't'.repeat(64)
    )

    await expect(gateway.listProjects('remote-1')).rejects.toThrow(/Cloudflare Quick Tunnel/)
  })

  it('supports remote project and session lifecycle REST operations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString()

        if (url.endsWith('/api/projects') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              data: {
                id: 'p2',
                name: 'new-project',
                path: 'D:/repo/new-project',
                createdAt: 1,
                lastOpenedAt: 2,
                pathExists: true
              },
              requestId: 'r1'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (url.endsWith('/api/projects/p1/sessions')) {
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: 's1',
                  name: 'remote-session',
                  icon: null,
                  type: 'claude',
                  projectId: 'p1',
                  projectPath: 'D:/repo/demo',
                  status: 'running',
                  createdAt: 1,
                  lastStartAt: 2,
                  totalRunMs: 3,
                  lastRunMs: 4,
                  lastActiveAt: 5,
                  processId: 'pid-1',
                  options: {},
                  parentId: null,
                  claudeSessionId: null
                }
              ],
              requestId: 'r2'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (url.endsWith('/api/sessions') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              data: {
                id: 's2',
                name: 'created-session',
                icon: null,
                type: 'claude',
                projectId: 'p1',
                projectPath: 'D:/repo/demo',
                status: 'idle',
                createdAt: 6,
                lastActiveAt: 7,
                processId: null,
                options: {},
                parentId: null,
                claudeSessionId: null
              },
              requestId: 'r3'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (url.endsWith('/api/sessions/s2/archive') && init?.method === 'PUT') {
          return new Response(
            JSON.stringify({
              data: {
                id: 's2', name: 'created-session', icon: null, type: 'claude', projectId: 'p1',
                projectPath: 'D:/repo/demo', status: 'stopped', createdAt: 6, lastActiveAt: 9,
                processId: null, options: {}, parentId: null, claudeSessionId: null, archivedAt: 9
              },
              requestId: 'r5'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }

        if (url.endsWith('/api/sessions/s2/start') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              data: {
                id: 's2',
                name: 'created-session',
                icon: null,
                type: 'claude',
                projectId: 'p1',
                projectPath: 'D:/repo/demo',
                status: 'running',
                createdAt: 6,
                lastStartAt: 8,
                lastActiveAt: 8,
                processId: 'pid-2',
                options: {},
                parentId: null,
                claudeSessionId: null
              },
              requestId: 'r4'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          )
        }

        throw new Error(`Unexpected url: ${url}`)
      })
    )

    const gateway = new RemoteGateway(createRemoteInstance('remote-1', 'https://remote-1.example.com'), 't'.repeat(64))
    const createdProject = await gateway.createProject('remote-1', {
      path: 'D:/repo/new-project',
      name: 'new-project'
    })
    const projectSessions = await gateway.listProjectSessions('remote-1', 'p1')
    const createdSession = await gateway.createSession('remote-1', {
      type: 'claude',
      projectId: 'p1',
      name: 'created-session'
    })
    const startedSession = await gateway.startSession('remote-1', 's2')
    const archivedSession = await gateway.setSessionArchived('remote-1', 's2', true)

    expect(createdProject.projectId).toBe('p2')
    expect(projectSessions[0]?.projectId).toBe('p1')
    expect(createdSession.sessionId).toBe('s2')
    expect(startedSession?.status).toBe('running')
    expect(archivedSession?.archivedAt).toBe(9)
  })

  it.each([
    {
      name: 'legacy bare array',
      payload: [{
        id: 'legacy-1',
        title: ' Legacy title ',
        content: ' Full legacy prompt ',
        updated: 1_789_000_000_000,
        projectPath: ' D:/repo '
      }],
      expectedTitleSource: 'session-title'
    },
    {
      name: 'new discovery envelope',
      payload: {
        status: 'ready',
        candidates: [{
          id: 'new-1',
          title: ' Summary title ',
          titleSource: 'summary',
          content: ' Full prompt ',
          updated: 1_790_000_000_000,
          projectPath: ' D:/new-repo '
        }]
      },
      expectedTitleSource: 'summary'
    }
  ])('normalizes $name on the direct REST path', async ({ payload, expectedTitleSource }) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: payload,
      requestId: 'candidate-request'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const gateway = new RemoteGateway(
      createRemoteInstance('remote-1', 'https://remote-1.example.com'),
      't'.repeat(64)
    )
    const result = await gateway.getNativeIdCandidates(
      'remote-1',
      'claude',
      'D:/repo',
      'C:/bin/claude.exe'
    )

    expect(result.status).toBe('ready')
    expect(result.candidates[0]).toMatchObject({
      content: expect.any(String),
      updated: expect.any(Number),
      projectPath: expect.any(String),
      titleSource: expectedTitleSource
    })
  })

  it('maps a missing direct REST candidate endpoint to unsupported', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 'NOT_FOUND',
      message: 'Not found',
      requestId: 'candidate-request'
    }), { status: 404, headers: { 'Content-Type': 'application/json' } })))

    const gateway = new RemoteGateway(
      createRemoteInstance('remote-1', 'https://remote-1.example.com'),
      't'.repeat(64)
    )

    await expect(gateway.getNativeIdCandidates('remote-1', 'claude', 'D:/repo')).resolves.toEqual({
      status: 'unsupported',
      candidates: [],
      message: 'The remote instance does not support native session discovery'
    })
  })

  it('returns false instead of throwing when writing to a stopped remote session', async () => {
    const gateway = new RemoteGateway(
      createRemoteInstance('remote-1', 'https://remote-1.example.com'),
      't'.repeat(64)
    )

    const unsubscribe = gateway.subscribeStatus('remote-1', () => {})
    await Promise.resolve()

    const createdSocket = socketRegistry.get('https://remote-1.example.com')
    expect(createdSocket).toBeTruthy()

    const originalEmit = createdSocket!.emit.bind(createdSocket!)
    createdSocket!.emit = ((event: string, payload?: unknown, ack?: (response: { ok: boolean; message?: string }) => void) => {
      if (event === 'session:write' && typeof ack === 'function') {
        ack({ ok: false, message: 'Session is not running: s-stopped' })
        return createdSocket!
      }
      return originalEmit(event, payload, ack as any)
    }) as typeof createdSocket.emit

    await expect(gateway.writeRaw('remote-1', 's-stopped', 'hello')).resolves.toBe(false)
    unsubscribe()
  })

  it('unwraps the deleted flag for direct remote session destruction', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      data: { deleted: false },
      requestId: 'destroy-request'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const gateway = new RemoteGateway(
      createRemoteInstance('remote-1', 'https://remote-1.example.com'),
      't'.repeat(64)
    )

    await expect(gateway.destroySession('remote-1', 'missing')).resolves.toBe(false)
  })

})
