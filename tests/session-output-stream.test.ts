import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionApi = vi.hoisted(() => ({
  onSessionOutput: vi.fn()
}))

vi.mock('@/api/session', () => sessionApi)
vi.mock('@/api/local-session', () => sessionApi)

describe('session output stream', () => {
  beforeEach(() => {
    sessionApi.onSessionOutput.mockReset()
  })

  it('routes local output events by globalSessionKey', async () => {
    let bridgeListener: ((event: { sessionId: string; data: string; stream: 'stdout' | 'stderr'; timestamp: number }) => void) | null =
      null
    sessionApi.onSessionOutput.mockImplementation((listener) => {
      bridgeListener = listener
      return () => {
        bridgeListener = null
      }
    })

    const { subscribeSessionOutput } = await import('../src/renderer/src/services/session-output-stream')

    const eventsA: string[] = []
    const eventsB: string[] = []

    const unlistenA = subscribeSessionOutput(
      {
        instanceId: 'local',
        sessionId: 'session-a',
        globalSessionKey: 'local:session-a'
      },
      (event) => eventsA.push(event.data)
    )
    const unlistenB = subscribeSessionOutput('session-b', (event) => eventsB.push(event.data))

    bridgeListener?.({
      sessionId: 'session-a',
      data: 'hello-a',
      stream: 'stdout',
      timestamp: 1
    })
    bridgeListener?.({
      sessionId: 'session-b',
      data: 'hello-b',
      stream: 'stdout',
      timestamp: 2
    })

    expect(eventsA).toEqual(['hello-a'])
    expect(eventsB).toEqual(['hello-b'])

    unlistenA()
    unlistenB()
  })
})
