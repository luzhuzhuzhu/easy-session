import { describe, expect, it, vi } from 'vitest'
import { HermesCandidatesUnsupportedError } from '../src/main/services/native-session-candidates'
import { discoverNativeSessions } from '../src/main/services/native-session-discovery'

const candidate = {
  id: 'native-1',
  title: 'Persisted session',
  titleSource: 'session-title' as const
}

describe('native session discovery service', () => {
  it('uses the registry for unsupported CLIs before dispatching', async () => {
    const collectorFactory = vi.fn()

    await expect(discoverNativeSessions('terminal', 'D:/repo', undefined, {
      candidateCollectorFor: collectorFactory
    })).resolves.toMatchObject({ status: 'unsupported', candidates: [] })
    await expect(discoverNativeSessions('unknown', 'D:/repo', undefined, {
      candidateCollectorFor: collectorFactory
    })).resolves.toMatchObject({ status: 'unsupported', candidates: [] })
    expect(collectorFactory).not.toHaveBeenCalled()
  })

  it('returns empty without dispatch when projectPath is missing', async () => {
    const collectorFactory = vi.fn()

    await expect(discoverNativeSessions('claude', '   ', undefined, {
      candidateCollectorFor: collectorFactory
    })).resolves.toEqual({ status: 'empty', candidates: [] })
    expect(collectorFactory).not.toHaveBeenCalled()
  })

  it('maps generic collector results to ready or empty envelopes', async () => {
    const collector = vi.fn().mockResolvedValueOnce([candidate]).mockResolvedValueOnce([])
    const collectorFactory = vi.fn(() => collector)

    await expect(discoverNativeSessions('claude', ' D:/repo ', ' tool ', {
      candidateCollectorFor: collectorFactory
    })).resolves.toEqual({ status: 'ready', candidates: [candidate] })
    expect(collector).toHaveBeenNthCalledWith(1, 'D:/repo', 'tool', 40)

    await expect(discoverNativeSessions('claude', 'D:/repo', undefined, {
      candidateCollectorFor: collectorFactory
    })).resolves.toEqual({ status: 'empty', candidates: [] })
  })

  it('dispatches OpenCode and Codex adapters in the same service', async () => {
    const openCodeAdapter = { collectSessionCandidatesByPath: vi.fn().mockResolvedValue([candidate]) }
    const codexAdapter = { collectSessionCandidatesByPath: vi.fn().mockResolvedValue([]) }
    const collectorFactory = vi.fn()

    await expect(discoverNativeSessions('opencode', 'D:/repo', 'C:/opencode.exe', {
      openCodeAdapter,
      codexAdapter,
      candidateCollectorFor: collectorFactory
    }, 7)).resolves.toMatchObject({ status: 'ready' })
    expect(openCodeAdapter.collectSessionCandidatesByPath).toHaveBeenCalledWith('D:/repo', 'C:/opencode.exe', 7)

    await expect(discoverNativeSessions('codex', 'D:/repo', 'ignored', {
      openCodeAdapter,
      codexAdapter,
      candidateCollectorFor: collectorFactory
    }, 8)).resolves.toEqual({ status: 'empty', candidates: [] })
    expect(codexAdapter.collectSessionCandidatesByPath).toHaveBeenCalledWith('D:/repo', 8)
    expect(collectorFactory).not.toHaveBeenCalled()
  })

  it('maps Hermes unsupported errors to unsupported', async () => {
    const collector = vi.fn().mockRejectedValue(new HermesCandidatesUnsupportedError('SQLite unavailable'))

    await expect(discoverNativeSessions('hermes', 'D:/repo', undefined, {
      candidateCollectorFor: () => collector
    })).resolves.toEqual({ status: 'unsupported', candidates: [], message: 'SQLite unavailable' })
  })

  it('maps all other failures to a stack-free error envelope', async () => {
    const secret = new Error('private path C:/Users/name/state.json')
    secret.stack = 'SECRET STACK'
    const collector = vi.fn().mockRejectedValue(secret)

    const result = await discoverNativeSessions('grok', 'D:/repo', undefined, {
      candidateCollectorFor: () => collector
    })

    expect(result).toEqual({
      status: 'error',
      candidates: [],
      message: 'Failed to discover native sessions'
    })
    expect(JSON.stringify(result)).not.toContain('SECRET')
    expect(JSON.stringify(result)).not.toContain('private path')
  })
})
