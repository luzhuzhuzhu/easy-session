import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing SessionOutputManager
vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [
      { webContents: { send: vi.fn() } }
    ])
  }
}))

import { SessionOutputManager } from '../src/main/services/session-output'
import { Protocol } from '../src/main/services/protocol'
import { BrowserWindow } from 'electron'

describe('SessionOutputManager', () => {
  let manager: SessionOutputManager

  beforeEach(() => {
    manager = new SessionOutputManager()
    vi.clearAllMocks()
  })

  it('should append and retrieve output', () => {
    manager.appendOutput('s1', 'hello', 'stdout')
    const history = manager.getHistory('s1')
    expect(history).toHaveLength(1)
    expect(history[0].text).toBe('hello')
    expect(history[0].stream).toBe('stdout')
  })

  it('should return empty array for unknown session', () => {
    expect(manager.getHistory('unknown')).toEqual([])
  })

  it('should limit history with lines parameter', () => {
    manager.appendOutput('s1', 'a', 'stdout')
    manager.appendOutput('s1', 'b', 'stdout')
    manager.appendOutput('s1', 'c', 'stdout')
    expect(manager.getHistory('s1', 2)).toHaveLength(2)
    expect(manager.getHistory('s1', 2)[0].text).toBe('b')
  })

  it('should clear history', () => {
    manager.appendOutput('s1', 'data', 'stdout')
    manager.clearHistory('s1')
    expect(manager.getHistory('s1')).toEqual([])
  })

  it('should remove session', () => {
    manager.appendOutput('s1', 'data', 'stdout')
    manager.removeSession('s1')
    expect(manager.getHistory('s1')).toEqual([])
  })

  it('should send session:output to renderer', () => {
    const mockWin = { webContents: { send: vi.fn() } }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

    manager.appendOutput('s1', 'test', 'stdout')

    expect(mockWin.webContents.send).toHaveBeenCalledWith(
      'session:output',
      expect.objectContaining({ sessionId: 's1', data: 'test', stream: 'stdout' })
    )
  })

  it('should detect and forward protocol messages', () => {
    const mockWin = { webContents: { send: vi.fn() } }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

    const protocolMsg = Protocol.formatMessage(
      { role: 'leader', cliType: 'claude' },
      { role: 'worker', cliType: 'codex' },
      'command',
      'do something'
    )

    manager.appendOutput('s1', protocolMsg, 'stdout')

    const calls = mockWin.webContents.send.mock.calls
    const protocolCall = calls.find((c: any[]) => c[0] === 'protocol:message')
    expect(protocolCall).toBeDefined()
    expect(protocolCall![1].sessionId).toBe('s1')
    expect(protocolCall![1].message.type).toBe('command')
  })

  it('should not forward non-protocol messages as protocol', () => {
    const mockWin = { webContents: { send: vi.fn() } }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([mockWin as any])

    manager.appendOutput('s1', 'regular output', 'stdout')

    const calls = mockWin.webContents.send.mock.calls
    const protocolCall = calls.find((c: any[]) => c[0] === 'protocol:message')
    expect(protocolCall).toBeUndefined()
  })
})
