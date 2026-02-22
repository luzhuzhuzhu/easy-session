import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, utimesSync } from 'fs'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

const mocked = vi.hoisted(() => ({
  home: ''
}))

vi.mock('os', () => ({
  homedir: () => mocked.home
}))

import { CodexAdapter } from '../src/main/services/codex-adapter'

function writeSessionMetaFile(
  home: string,
  id: string,
  cwd: string,
  timestamp: string,
  mtimeMs: number
): void {
  const filePath = join(home, '.codex', 'sessions', '2026', '02', '19', `rollout-${id}.jsonl`)
  mkdirSync(dirname(filePath), { recursive: true })
  const firstLine = JSON.stringify({
    type: 'session_meta',
    payload: { id, cwd, timestamp }
  })
  writeFileSync(filePath, `${firstLine}\n`, 'utf8')

  const mtime = new Date(mtimeMs)
  utimesSync(filePath, mtime, mtime)
}

describe('CodexAdapter.findSessionIdByProjectPath', () => {
  let tempHome: string
  let adapter: CodexAdapter

  beforeEach(() => {
    tempHome = join(process.cwd(), '.tmp-tests', `codex-adapter-${randomUUID()}`)
    mocked.home = tempHome
    adapter = new CodexAdapter({} as any)
  })

  afterEach(() => {
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('should return null when targetStartMs is missing', () => {
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    writeSessionMetaFile(
      tempHome,
      '11111111-1111-1111-1111-111111111111',
      'D:/repo/project-a',
      '2026-02-19T12:00:02.000Z',
      target + 2_000
    )

    const result = adapter.findSessionIdByProjectPath('D:/repo/project-a')
    expect(result).toBeNull()
  })

  it('should return the session id when there is exactly one candidate in the time window', () => {
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    writeSessionMetaFile(
      tempHome,
      '22222222-2222-2222-2222-222222222222',
      'D:/repo/project-a',
      '2026-02-19T12:00:03.000Z',
      target + 3_000
    )
    writeSessionMetaFile(
      tempHome,
      '33333333-3333-3333-3333-333333333333',
      'D:/repo/project-a',
      '2026-02-19T12:05:00.000Z',
      target + 5 * 60_000
    )

    const result = adapter.findSessionIdByProjectPath('D:/repo/project-a', target, 10_000)
    expect(result).toBe('22222222-2222-2222-2222-222222222222')
  })

  it('should return null when multiple different ids are in the same time window', () => {
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    writeSessionMetaFile(
      tempHome,
      '44444444-4444-4444-4444-444444444444',
      'D:/repo/project-a',
      '2026-02-19T12:00:02.000Z',
      target + 2_000
    )
    writeSessionMetaFile(
      tempHome,
      '55555555-5555-5555-5555-555555555555',
      'D:/repo/project-a',
      '2026-02-19T11:59:59.000Z',
      target - 1_000
    )

    const result = adapter.findSessionIdByProjectPath('D:/repo/project-a', target, 10_000)
    expect(result).toBe('55555555-5555-5555-5555-555555555555')
  })

  it('should return null when nearest candidates are too close to distinguish', () => {
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    writeSessionMetaFile(
      tempHome,
      '66666666-6666-6666-6666-666666666666',
      'D:/repo/project-a',
      '2026-02-19T12:00:00.200Z',
      target + 200
    )
    writeSessionMetaFile(
      tempHome,
      '77777777-7777-7777-7777-777777777777',
      'D:/repo/project-a',
      '2026-02-19T12:00:00.550Z',
      target + 550
    )

    const result = adapter.findSessionIdByProjectPath('D:/repo/project-a', target, 10_000)
    expect(result).toBeNull()
  })
})
