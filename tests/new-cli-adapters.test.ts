import { describe, expect, it, vi, beforeEach } from 'vitest'

const { spawnSpy } = vi.hoisted(() => ({ spawnSpy: vi.fn(() => `newcli-${Math.random().toString(36).slice(2)}`) }))

vi.mock('../src/main/services/cli-manager', () => ({
  CliManager: class {
    onOutput = vi.fn()
    spawn = spawnSpy
    write = vi.fn(() => true)
  }
}))

import { PiAdapter, OmpAdapter } from '../src/main/services/pi-family-adapter'
import { GrokAdapter } from '../src/main/services/grok-adapter'
import { HermesAdapter } from '../src/main/services/hermes-adapter'
import { GenericIdSessionLifecycle } from '../src/main/services/generic-id-session-lifecycle'
import { CLI_REGISTRY, getProbeableCliIds, getCliRegistryEntry } from '../src/main/ipc/cli-registry'

// 新 CLI（pi/omp/grok/hermes）一等支持——adapter/lifecycle/registry 单测。
describe('pi family adapters', () => {
  beforeEach(() => spawnSpy.mockClear())

  it('pi spawns with --session resume and model flags', () => {
    const adapter = new PiAdapter({ spawn: spawnSpy } as never)
    adapter.startSession('/tmp/proj', { model: 'opus', resumeId: 'abc123' }, 'abc123')
    const [, command, args, opts] = spawnSpy.mock.calls[0]
    expect(command).toBe('pi')
    expect(args).toContain('--session')
    expect(args[args.indexOf('--session') + 1]).toBe('abc123')
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe('opus')
    expect(opts).toEqual({ cwd: '/tmp/proj', cliType: 'pi' })
  })

  it('omp spawns with --resume and --continue flags', () => {
    const adapter = new OmpAdapter({ spawn: spawnSpy } as never)
    adapter.startSession('/tmp/proj', { continueLast: true }, undefined)
    const [, command, args] = spawnSpy.mock.calls[0]
    expect(command).toBe('omp')
    expect(args).toContain('--continue')
    expect(args).not.toContain('--resume')
    spawnSpy.mockClear()
    adapter.startSession('/tmp/proj', {}, 'abc-uuid')
    const [, , args2] = spawnSpy.mock.calls[0]
    expect(args2).toContain('--resume')
    expect(args2[args2.indexOf('--resume') + 1]).toBe('abc-uuid')
  })

  it('pi family passes thinking and approval-mode', () => {
    const adapter = new OmpAdapter({ spawn: spawnSpy } as never)
    adapter.startSession('/tmp/proj', { thinking: 'high', approvalMode: 'yolo' })
    const [, , args] = spawnSpy.mock.calls[0]
    expect(args).toContain('--thinking')
    expect(args[args.indexOf('--thinking') + 1]).toBe('high')
    expect(args).toContain('--approval-mode')
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('yolo')
  })
})

describe('grok adapter', () => {
  beforeEach(() => spawnSpy.mockClear())

  it('spawns with resume/model/permission-mode/effort', () => {
    const adapter = new GrokAdapter({ spawn: spawnSpy } as never)
    adapter.startSession('/tmp/proj', {
      model: 'grok-4',
      permissionMode: 'auto',
      effort: 'high'
    }, 'sess-9')
    const [, command, args] = spawnSpy.mock.calls[0]
    expect(command).toBe('grok')
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('sess-9')
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe('grok-4')
    expect(args).toContain('--permission-mode')
    expect(args[args.indexOf('--permission-mode') + 1]).toBe('auto')
    expect(args).toContain('--effort')
    expect(args[args.indexOf('--effort') + 1]).toBe('high')
  })

  it('continueLast spawns --continue without --resume', () => {
    const adapter = new GrokAdapter({ spawn: spawnSpy } as never)
    adapter.startSession('/tmp/proj', { continueLast: true })
    const [, , args] = spawnSpy.mock.calls[0]
    expect(args).toContain('--continue')
    expect(args).not.toContain('--resume')
  })
})

describe('hermes adapter', () => {
  beforeEach(() => spawnSpy.mockClear())

  it('spawns with --resume and provider/model', () => {
    const adapter = new HermesAdapter({ spawn: spawnSpy } as never)
    adapter.startSession('/tmp/proj', { model: 'anthropic/claude-sonnet-4' }, '20260225_143052_a1b2c3')
    const [, command, args] = spawnSpy.mock.calls[0]
    expect(command).toBe('hermes')
    expect(args).toContain('--resume')
    expect(args[args.indexOf('--resume') + 1]).toBe('20260225_143052_a1b2c3')
    expect(args).toContain('--model')
    expect(args[args.indexOf('--model') + 1]).toBe('anthropic/claude-sonnet-4')
  })
})

describe('generic id lifecycle (pi/omp/grok/hermes)', () => {
  function makeLifecycle(type: 'pi' | 'omp' | 'grok' | 'hermes'): {
    lifecycle: GenericIdSessionLifecycle
    startSession: ReturnType<typeof vi.fn>
    appendOutput: ReturnType<typeof vi.fn>
  } {
    const startSession = vi.fn(() => `${type}-proc-1`)
    const adapter = { startSession }
    const appendOutput = vi.fn()
    const lifecycle = new GenericIdSessionLifecycle(adapter, { appendOutput } as never, type, type)
    return { lifecycle, startSession, appendOutput }
  }

  it('restarts with bound resume id after manual restart', () => {
    const { lifecycle, startSession } = makeLifecycle('grok')
    const session = lifecycle.create('es-1', 'Grok-001', { type: 'grok', projectPath: '/tmp' })
    ;(session as unknown as { grokSessionId: string }).grokSessionId = 'sess-42'
    void lifecycle.startProcess(session, Date.now())
    expect(startSession).toHaveBeenCalledWith('/tmp', expect.anything(), 'sess-42')
  })

  it('flags invalid resume id from output and auto-restarts once after exit', () => {
    const { lifecycle, appendOutput } = makeLifecycle('hermes')
    const session = lifecycle.create('es-1', 'Hermes-001', { type: 'hermes', projectPath: '/tmp' })
    ;(session as unknown as { hermesSessionId: string }).hermesSessionId = 'dead-id'
    lifecycle.handleOutput(session, 'Error: session not found: dead-id')
    expect((session as unknown as { invalidSessionId?: boolean }).invalidSessionId).toBe(true)
    expect(appendOutput).toHaveBeenCalled()
    expect(lifecycle.shouldAutoRestartAfterExit(session, 1)).toBe(true)
    // 清掉死 ID + 守卫复位
    expect((session as unknown as { hermesSessionId: string | null }).hermesSessionId).toBeNull()
    expect(lifecycle.shouldAutoRestartAfterExit(session, 1)).toBe(false)
  })

  it('does not restart when exit code is 0 or no invalid flag', () => {
    const { lifecycle } = makeLifecycle('pi')
    const session = lifecycle.create('es-1', 'Pi-001', { type: 'pi', projectPath: '/tmp' })
    expect(lifecycle.shouldAutoRestartAfterExit(session, 0)).toBe(false)
    expect(lifecycle.shouldAutoRestartAfterExit(session, 1)).toBe(false)
  })
})

describe('cli registry for new CLIs', () => {
  it('registers pi/omp/grok/hermes with settings path keys and schemas', () => {
    for (const id of ['pi', 'omp', 'grok', 'hermes']) {
      const entry = getCliRegistryEntry(id)
      expect(entry, `registry entry for ${id}`).toBeDefined()
      expect(entry?.settingsPathKey).toBe(`${id}Path`)
    }
    expect(getProbeableCliIds()).toEqual(
      expect.arrayContaining(['claude', 'codex', 'opencode', 'gemini', 'pi', 'omp', 'grok', 'hermes'])
    )
    expect(CLI_REGISTRY.length).toBe(9)
  })

  it('validates grok permissionMode enum via options schema', () => {
    const entry = getCliRegistryEntry('grok')
    const bad = entry?.optionsSchema.safeParse({ permissionMode: 'ultra' })
    expect(bad?.success).toBe(false)
    const good = entry?.optionsSchema.safeParse({ permissionMode: 'auto', resumeId: 'r-1' })
    expect(good?.success).toBe(true)
  })
})
