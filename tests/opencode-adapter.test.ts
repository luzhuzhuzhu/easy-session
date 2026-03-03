import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocked = vi.hoisted(() => ({
  exec: vi.fn()
}))

vi.mock('child_process', () => ({
  exec: mocked.exec
}))

import { OpenCodeAdapter } from '../src/main/services/opencode-adapter'

describe('OpenCodeAdapter.extractSessionIdFromOutput', () => {
  const adapter = new OpenCodeAdapter({} as any)

  it('should extract session id from exit summary with short -s flag', () => {
    const output = `
E:\\easy-session>opencode

  Session   Build project pipeline
  Continue  opencode -s ses_34ebf18e8ffeQSN2prliKpaecx
`

    const result = adapter.extractSessionIdFromOutput(output)
    expect(result).toBe('ses_34ebf18e8ffeQSN2prliKpaecx')
  })

  it('should prefer latest ses_ id when multiple hints exist', () => {
    const output = [
      'Session ID: temp_123456',
      'Continue opencode --session ses_old00001',
      'Continue opencode -s ses_new00002'
    ].join('\n')

    const result = adapter.extractSessionIdFromOutput(output)
    expect(result).toBe('ses_new00002')
  })

  it('should return null when no session hint exists', () => {
    const result = adapter.extractSessionIdFromOutput('hello world')
    expect(result).toBeNull()
  })
})

describe('OpenCodeAdapter.findSessionIdByProjectPath', () => {
  let adapter: OpenCodeAdapter

  beforeEach(() => {
    mocked.exec.mockReset()
    adapter = new OpenCodeAdapter({} as any)
  })

  it('should choose the closest session to target start time under the same project path', async () => {
    const targetStart = Date.parse('2026-03-03T12:00:00.000Z')
    const payload = {
      sessions: [
        { id: 'ses_old', cwd: 'E:/easy-session', updatedAt: '2026-03-03T11:40:00.000Z' },
        { id: 'ses_best', cwd: 'E:/easy-session', updatedAt: '2026-03-03T12:00:02.000Z' },
        { id: 'ses_other_path', cwd: 'E:/another', updatedAt: '2026-03-03T12:00:01.000Z' }
      ]
    }

    mocked.exec.mockImplementation((_cmd: string, _opts: unknown, cb: (...args: any[]) => void) => {
      cb(null, JSON.stringify(payload), '')
    })

    const found = await adapter.findSessionIdByProjectPath(
      'E:/easy-session',
      undefined,
      80,
      targetStart,
      120_000
    )

    expect(found).toBe('ses_best')
  })

  it('should return null when no candidate is within skew window', async () => {
    const targetStart = Date.parse('2026-03-03T12:00:00.000Z')
    const payload = {
      sessions: [
        { id: 'ses_far', cwd: 'E:/easy-session', updatedAt: '2026-03-03T10:00:00.000Z' }
      ]
    }

    mocked.exec.mockImplementation((_cmd: string, _opts: unknown, cb: (...args: any[]) => void) => {
      cb(null, JSON.stringify(payload), '')
    })

    const found = await adapter.findSessionIdByProjectPath(
      'E:/easy-session',
      undefined,
      80,
      targetStart,
      60_000
    )

    expect(found).toBeNull()
  })

  it('should prefer start or created time over updatedAt to avoid binding old sessions', async () => {
    const targetStart = Date.parse('2026-03-03T12:00:00.000Z')
    const payload = {
      sessions: [
        {
          id: 'ses_old',
          cwd: 'E:/easy-session',
          createdAt: '2026-03-03T11:30:00.000Z',
          updatedAt: '2026-03-03T12:00:01.000Z'
        },
        {
          id: 'ses_new',
          cwd: 'E:/easy-session',
          createdAt: '2026-03-03T12:00:02.000Z',
          updatedAt: '2026-03-03T12:00:03.000Z'
        }
      ]
    }

    mocked.exec.mockImplementation((_cmd: string, _opts: unknown, cb: (...args: any[]) => void) => {
      cb(null, JSON.stringify(payload), '')
    })

    const found = await adapter.findSessionIdByProjectPath(
      'E:/easy-session',
      undefined,
      80,
      targetStart,
      120_000
    )

    expect(found).toBe('ses_new')
  })

  it('should parse nested time.created/time.updated from OpenCode session schema', async () => {
    const targetStart = Date.parse('2026-03-03T12:00:00.000Z')
    const payload = {
      sessions: [
        {
          id: 'ses_old',
          directory: 'E:/easy-session',
          time: { created: '2026-03-03T11:30:00.000Z', updated: '2026-03-03T12:05:00.000Z' }
        },
        {
          id: 'ses_new',
          directory: 'E:/easy-session',
          time: { created: '2026-03-03T12:00:01.000Z', updated: '2026-03-03T12:00:02.000Z' }
        }
      ]
    }

    mocked.exec.mockImplementation((_cmd: string, _opts: unknown, cb: (...args: any[]) => void) => {
      cb(null, JSON.stringify(payload), '')
    })

    const found = await adapter.findSessionIdByProjectPath(
      'E:/easy-session',
      undefined,
      80,
      targetStart,
      120_000
    )

    expect(found).toBe('ses_new')
  })

  it('should reject candidates without timestamp in strict mode', async () => {
    const targetStart = Date.parse('2026-03-03T12:00:00.000Z')
    const payload = {
      sessions: [
        { id: 'ses_no_time', directory: 'E:/easy-session' }
      ]
    }

    mocked.exec.mockImplementation((_cmd: string, _opts: unknown, cb: (...args: any[]) => void) => {
      cb(null, JSON.stringify(payload), '')
    })

    const found = await adapter.findSessionIdByProjectPath(
      'E:/easy-session',
      undefined,
      80,
      targetStart,
      60_000,
      true
    )

    expect(found).toBeNull()
  })

  it('should parse top-level created/updated fields from opencode session list', async () => {
    const targetStart = 1772502354000
    const payload = [
      {
        id: 'ses_old',
        directory: 'E:/easy-session',
        created: 1772501307809,
        updated: 1772501311309
      },
      {
        id: 'ses_new',
        directory: 'E:/easy-session',
        created: 1772502353702,
        updated: 1772502357228
      }
    ]

    mocked.exec.mockImplementation((_cmd: string, _opts: unknown, cb: (...args: any[]) => void) => {
      cb(null, JSON.stringify(payload), '')
    })

    const found = await adapter.findSessionIdByProjectPath(
      'E:/easy-session',
      undefined,
      80,
      targetStart,
      Number.MAX_SAFE_INTEGER,
      true
    )

    expect(found).toBe('ses_new')
  })
})
