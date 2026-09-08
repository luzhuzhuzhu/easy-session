import { describe, expect, it } from 'vitest'
import { buildWindowsBusPipePath } from '../src/main/services/agent-bus/bus-server'

describe('Agent Bus pipe path', () => {
  it('builds a valid Windows named pipe path without leaking the token', () => {
    const path = buildWindowsBusPipePath('12345678-1234-4abc-8def-1234567890ab')

    expect(path).toBe('\\\\.\\pipe\\easysession-bus-1234567812344abc8def1234567890ab')
    expect(path.startsWith('\\\\.\\pipe\\')).toBe(true)
  })
})
