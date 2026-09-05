import { describe, expect, it, vi, beforeEach } from 'vitest'

const { spawnSpy } = vi.hoisted(() => ({ spawnSpy: vi.fn(() => `gemini-${Math.random().toString(36).slice(2)}`) }))

vi.mock('../src/main/services/cli-manager', () => ({
  CliManager: class {
    onOutput = vi.fn()
    spawn = spawnSpy
    write = vi.fn(() => true)
  }
}))

import { GeminiAdapter } from '../src/main/services/gemini-adapter'
import { GeminiSessionLifecycle } from '../src/main/services/gemini-session-lifecycle'

// FEAT-3：Gemini CLI 一等支持——adapter/lifecycle 单测。
describe('gemini adapter (FEAT-3)', () => {
  let adapter: GeminiAdapter

  beforeEach(() => {
    spawnSpy.mockClear()
    adapter = new GeminiAdapter({ spawn: spawnSpy } as never)
  })

  it('spawns gemini with model and approval mode', () => {
    adapter.startSession('/tmp/proj', { model: 'gemini-2.5-pro', approvalMode: 'auto_edit' })
    expect(spawnSpy).toHaveBeenCalledTimes(1)
    const [, command, args, opts] = spawnSpy.mock.calls[0]
    expect(command).toBe('gemini')
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe('gemini-2.5-pro')
    expect(args).toContain('--approval-mode')
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('auto_edit')
    expect(opts).toEqual({ cwd: '/tmp/proj' })
  })

  it('resume path passes --resume <id>', () => {
    adapter.startSession('/tmp/proj', {}, 'sess-123')
    const [, , args] = spawnSpy.mock.calls[0]
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('sess-123')
  })
})

describe('gemini session lifecycle (FEAT-3)', () => {
  it('creates a gemini session with running state', () => {
    const adapter = new GeminiAdapter({ spawn: spawnSpy } as never)
    const output = { appendOutput: vi.fn() }
    const lifecycle = new GeminiSessionLifecycle(adapter, output as never)
    const session = lifecycle.create('es-1', 'Gemini-001', {
      type: 'gemini',
      projectPath: '/tmp/proj',
      options: { model: 'gemini-2.5-flash' }
    })
    expect(session.type).toBe('gemini')
    expect(session.status).toBe('running')
    expect(session.geminiSessionId).toBeNull()
    expect(session.options.model).toBe('gemini-2.5-flash')
  })

  it('flags invalid resume id on session-not-found output', () => {
    const adapter = new GeminiAdapter({ spawn: spawnSpy } as never)
    const appendOutput = vi.fn()
    const lifecycle = new GeminiSessionLifecycle(adapter, { appendOutput } as never)
    const session = lifecycle.create('es-1', 'Gemini-001', { type: 'gemini', projectPath: '/tmp' })
    session.geminiSessionId = 'dead-id'
    lifecycle.handleOutput(session, 'Error: No conversation found with session ID dead-id')
    expect((session as { invalidSessionId?: boolean }).invalidSessionId).toBe(true)
    expect(appendOutput).toHaveBeenCalled()
  })
})
