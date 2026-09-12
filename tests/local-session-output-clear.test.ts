import { beforeEach, describe, expect, it, vi } from 'vitest'
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('../src/renderer/src/api/ipc', () => ({ ipc: { invoke } }))
import { clearOutput, getOutputHistory, type OutputLine } from '../src/renderer/src/api/local-session'

beforeEach(() => invoke.mockReset())

describe('history reads across an output clear', () => {
  it('does not reuse an old in-flight read or let its finally delete a newer read', async () => {
    let finishOld!: (history: OutputLine[]) => void
    let finishNew!: (history: OutputLine[]) => void
    invoke.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
    const old = getOutputHistory('s-clear', 12000)
    invoke.mockResolvedValueOnce(10)
    expect(await clearOutput('s-clear')).toBe(10)
    invoke.mockImplementationOnce(() => new Promise(resolve => { finishNew = resolve }))
    const newer = getOutputHistory('s-clear', 12000)
    expect(newer).not.toBe(old)
    finishOld([])
    await old
    expect(getOutputHistory('s-clear', 12000)).toBe(newer)
    finishNew([{ text: 'new', seq: 11, timestamp: 1, stream: 'stdout' }])
    expect(await newer).toHaveLength(1)
    expect(invoke).toHaveBeenCalledTimes(3)
  })

  it('invalidates only the cleared session, not reads belonging to other panes', async () => {
    let finishOther!: (history: OutputLine[]) => void
    invoke.mockImplementationOnce(() => new Promise(resolve => { finishOther = resolve }))
    const other = getOutputHistory('other-pane', 12000)
    invoke.mockResolvedValueOnce(0)
    await clearOutput('cleared-pane')
    expect(getOutputHistory('other-pane', 12000)).toBe(other)
    finishOther([])
    await other
  })
})
