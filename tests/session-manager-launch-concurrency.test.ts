import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))
import { SessionManager } from '../src/main/services/session-manager'
import { CodexSessionLifecycle } from '../src/main/services/codex-session-lifecycle'

function setup() {
  vi.useFakeTimers()
  let processNumber = 0
  const adapter = {
    startSession: vi.fn(() => `process-${++processNumber}`),
    resumeSession: vi.fn(() => `process-${++processNumber}`),
    findSessionIdByProjectPath: vi.fn(async () => null)
  }
  const cli = { onOutput: vi.fn(), onExit: vi.fn(), kill: vi.fn(), resize: vi.fn() }
  const output = { getHistory: vi.fn(() => []), appendOutput: vi.fn(), removeSession: vi.fn(),
    removeJournal: vi.fn(async () => {}), writeJournal: vi.fn(async () => {}) }
  const lifecycle = new CodexSessionLifecycle(adapter as any, output as any)
  const manager = new SessionManager(cli as any, {} as any, lifecycle, output as any)
  const session = manager.createSession({ type: 'codex', projectPath: 'D:/audit' })
  manager.pauseSession(session.id)
  adapter.startSession.mockClear()
  cli.kill.mockClear()
  let resolveLookup!: (value: null) => void
  const lookup = new Promise<null>(resolve => { resolveLookup = resolve })
  adapter.findSessionIdByProjectPath.mockReturnValue(lookup)
  return { manager, adapter, cli, session, resolveLookup, lifecycle, output }
}
afterEach(() => vi.useRealTimers())

async function settleContinuations() {
  for (let i = 0; i < 8; i++) await Promise.resolve()
}

describe('session lifecycle concurrency', () => {
  it('concurrent start requests must not spawn two processes', async () => {
    const { manager, adapter, session, resolveLookup } = setup()
    const first = manager.startSession(session.id)
    const second = manager.startSession(session.id)
    resolveLookup(null)
    await Promise.all([first, second])
    expect(adapter.startSession).toHaveBeenCalledTimes(1)
  })
  it('destroy while starting must not leave a late untracked process', async () => {
    const { manager, adapter, cli, session, resolveLookup } = setup()
    const start = manager.startSession(session.id)
    expect(manager.destroySession(session.id)).toBe(true)
    resolveLookup(null)
    await start
    await settleContinuations()
    const spawned = adapter.startSession.mock.results.map(result => result.value)
    const killed = cli.kill.mock.calls.map(call => call[0])
    expect(spawned.filter(id => !killed.includes(id))).toEqual([])
  })

  it('coalesces start and restart while discovery is pending', async () => {
    const { manager, adapter, session, resolveLookup } = setup()
    const first = manager.startSession(session.id)
    const restart = manager.restartSession(session.id)
    const third = manager.startSession(session.id)
    expect(first).toBe(restart)
    expect(third).toBe(first)
    resolveLookup(null)
    await Promise.all([first, restart, third])
    expect(adapter.startSession).toHaveBeenCalledTimes(1)
    expect(manager.getSessionIdByProcessId('process-2')).toBe(session.id)
  })

  it.each(['pause', 'destroy', 'shutdown', 'destroyAll'] as const)(
    '%s cancels the request immediately and prevents any later spawn', async (action) => {
      const { manager, adapter, session, resolveLookup } = setup()
      const start = manager.startSession(session.id)
      if (action === 'pause') manager.pauseSession(session.id)
      if (action === 'destroy') manager.destroySession(session.id)
      if (action === 'shutdown') manager.shutdownAll()
      if (action === 'destroyAll') manager.destroyAll()
      await expect(start).resolves.toBeNull() // Do not wait for the filesystem lookup.
      resolveLookup(null)
      await settleContinuations()
      expect(adapter.startSession).not.toHaveBeenCalled()
      if (action === 'pause' || action === 'shutdown') {
        expect(manager.getSession(session.id)).toMatchObject({ status: 'stopped', processId: null })
      } else {
        expect(manager.getSession(session.id)).toBeUndefined()
      }
      if (action === 'shutdown') await expect(manager.startSession(session.id)).resolves.toBeNull()
    }
  )

  it('rejects archive during startup and permits it once pause cancels startup', async () => {
    const { manager, session, resolveLookup, adapter } = setup()
    const start = manager.startSession(session.id)
    expect(manager.setSessionArchived(session.id, true)).toBeNull()
    manager.pauseSession(session.id)
    expect(manager.setSessionArchived(session.id, true)?.archivedAt).toBeTypeOf('number')
    resolveLookup(null)
    await start
    await settleContinuations()
    expect(adapter.startSession).not.toHaveBeenCalled()
    expect(manager.getSession(session.id)).toMatchObject({ status: 'stopped', processId: null, archivedAt: expect.any(Number) })
  })

  it('does not let an old cancelled launch overwrite a replacement launch', async () => {
    const { manager, session, resolveLookup, adapter, cli } = setup()
    const first = manager.startSession(session.id)
    manager.pauseSession(session.id)
    adapter.findSessionIdByProjectPath.mockResolvedValue(null)
    const second = await manager.startSession(session.id)
    expect(second?.processId).toBe('process-2')
    resolveLookup(null)
    await first
    await settleContinuations()
    expect(adapter.startSession).toHaveBeenCalledTimes(1)
    expect(manager.getSession(session.id)?.processId).toBe('process-2')
    expect(cli.kill).not.toHaveBeenCalledWith('process-2')
  })

  it('cleans up a late-spawning lifecycle even if it ignores cancellation', async () => {
    const { manager, session, lifecycle, cli } = setup()
    let finish!: () => void
    vi.spyOn(lifecycle, 'startProcess').mockImplementation(async draft => {
      await new Promise<void>(resolve => { finish = resolve })
      draft.processId = 'late-process'
      draft.status = 'running'
    })
    const start = manager.startSession(session.id)
    manager.destroySession(session.id)
    await expect(start).resolves.toBeNull()
    finish()
    await settleContinuations()
    expect(cli.kill).toHaveBeenCalledWith('late-process')
    expect(manager.getSessionIdByProcessId('late-process')).toBeUndefined()
    expect(manager.getSession(session.id)).toBeUndefined()
  })

  it('preserves edits made during discovery and releases a failed launch for retry', async () => {
    const { manager, session, resolveLookup, adapter } = setup()
    const start = manager.startSession(session.id)
    manager.renameSession(session.id, 'Renamed while starting')
    manager.updateSessionIcon(session.id, 'custom-icon')
    resolveLookup(null)
    await start
    expect(manager.getSession(session.id)).toMatchObject({ name: 'Renamed while starting', icon: 'custom-icon', status: 'running' })
    manager.pauseSession(session.id)
    adapter.startSession.mockImplementationOnce(() => { throw new Error('spawn failure') })
    await expect(manager.startSession(session.id)).resolves.toMatchObject({ status: 'error' })
    await expect(manager.startSession(session.id)).resolves.toMatchObject({ status: 'running' })
  })

  it('does not count a completed run twice when a pending restart is cancelled', async () => {
    const { manager, session, resolveLookup, adapter } = setup()
    resolveLookup(null)
    await manager.startSession(session.id)
    vi.setSystemTime(Date.now() + 1000)
    let finishLookup!: (value: null) => void
    adapter.findSessionIdByProjectPath.mockReturnValue(new Promise(resolve => { finishLookup = resolve }))
    const restarting = manager.restartSession(session.id)
    expect(manager.getSession(session.id)?.totalRunMs).toBe(1000)
    vi.setSystemTime(Date.now() + 500)
    manager.pauseSession(session.id)
    expect(manager.getSession(session.id)?.totalRunMs).toBe(1000)
    finishLookup(null)
    await restarting
    await settleContinuations()
  })

})
