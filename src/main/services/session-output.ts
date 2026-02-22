import { BrowserWindow } from 'electron'
import { Protocol } from './protocol'

export interface OutputLine {
  text: string
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq: number
}

const MAX_BUFFER_LINES = 50000

interface SessionBufferState {
  lines: OutputLine[]
  start: number
  size: number
  nextSeq: number
}

function createBufferState(): SessionBufferState {
  return {
    lines: new Array<OutputLine>(MAX_BUFFER_LINES),
    start: 0,
    size: 0,
    nextSeq: 0
  }
}

export class SessionOutputManager {
  private buffers = new Map<string, SessionBufferState>()

  private ensureBuffer(sessionId: string): SessionBufferState {
    let state = this.buffers.get(sessionId)
    if (!state) {
      state = createBufferState()
      this.buffers.set(sessionId, state)
    }
    return state
  }

  private appendLine(state: SessionBufferState, line: OutputLine): void {
    if (state.size < MAX_BUFFER_LINES) {
      const index = (state.start + state.size) % MAX_BUFFER_LINES
      state.lines[index] = line
      state.size += 1
      return
    }

    state.lines[state.start] = line
    state.start = (state.start + 1) % MAX_BUFFER_LINES
  }

  private toArray(state: SessionBufferState, limit?: number): OutputLine[] {
    if (state.size === 0) return []

    const count = typeof limit === 'number' ? Math.min(Math.max(limit, 0), state.size) : state.size
    if (count === 0) return []

    const skip = state.size - count
    const result: OutputLine[] = []

    for (let i = skip; i < state.size; i += 1) {
      const index = (state.start + i) % MAX_BUFFER_LINES
      result.push(state.lines[index])
    }

    return result
  }

  appendOutput(sessionId: string, data: string, stream: 'stdout' | 'stderr'): void {
    const state = this.ensureBuffer(sessionId)
    const now = Date.now()
    state.nextSeq += 1

    const line: OutputLine = {
      text: data,
      stream,
      timestamp: now,
      seq: state.nextSeq
    }

    this.appendLine(state, line)

    let protocolPayload: { sessionId: string; message: unknown; timestamp: number } | null = null
    if (Protocol.isProtocolMessage(data)) {
      const parsed = Protocol.parseMessage(data)
      if (parsed) {
        protocolPayload = {
          sessionId,
          message: parsed,
          timestamp: now
        }
      }
    }

    const outputPayload = {
      sessionId,
      data,
      stream,
      timestamp: now,
      seq: state.nextSeq
    }

    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) return

    windows.forEach((win) => {
      if (protocolPayload) {
        win.webContents.send('protocol:message', protocolPayload)
      }
      win.webContents.send('session:output', outputPayload)
    })
  }

  getHistory(sessionId: string, lines?: number): OutputLine[] {
    const state = this.buffers.get(sessionId)
    if (!state) return []

    return this.toArray(state, lines)
  }

  clearHistory(sessionId: string): void {
    this.buffers.set(sessionId, createBufferState())
  }

  removeSession(sessionId: string): void {
    this.buffers.delete(sessionId)
  }
}
