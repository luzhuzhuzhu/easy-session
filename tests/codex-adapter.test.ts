import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, utimesSync, realpathSync } from 'fs'
// vi.mock('os') 拦截了整个 os 模块；真实 tmpdir 需在 mock 建立前快照。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const tmpdirUnsafe: () => string = require('os').tmpdir
import { dirname, join } from 'path'
import { tmpdir } from 'os'
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
  mtimeMs: number,
  records: unknown[] = [],
  source?: unknown,
  codexRoot = join(home, '.codex')
): void {
  const filePath = join(codexRoot, 'sessions', '2026', '02', '19', `rollout-${id}.jsonl`)
  mkdirSync(dirname(filePath), { recursive: true })
  const firstLine = JSON.stringify({
    type: 'session_meta',
    payload: { id, cwd, timestamp, source }
  })
  writeFileSync(filePath, `${[firstLine, ...records.map((record) => JSON.stringify(record))].join('\n')}\n`, 'utf8')

  const mtime = new Date(mtimeMs)
  utimesSync(filePath, mtime, mtime)
}

describe('CodexAdapter.findSessionIdByProjectPath', () => {
  let tempHome: string
  let adapter: CodexAdapter
  let previousCodexHome: string | undefined

  beforeEach(() => {
    tempHome = join(tmpdirUnsafe(), `codex-adapter-${randomUUID()}`)
    mocked.home = tempHome
    previousCodexHome = process.env.CODEX_HOME
    adapter = new CodexAdapter({} as any)
  })

  afterEach(() => {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodexHome
    rmSync(tempHome, { recursive: true, force: true })
  })

  it('should return null when targetStartMs is missing', async () => {
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    writeSessionMetaFile(
      tempHome,
      '11111111-1111-1111-1111-111111111111',
      'D:/repo/project-a',
      '2026-02-19T12:00:02.000Z',
      target + 2_000
    )

    const result = await adapter.findSessionIdByProjectPath('D:/repo/project-a')
    expect(result).toBeNull()
  })

  it('should return the session id when there is exactly one candidate in the time window', async () => {
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

    const result = await adapter.findSessionIdByProjectPath('D:/repo/project-a', target, 10_000)
    expect(result).toBe('22222222-2222-2222-2222-222222222222')
  })

  it('should choose the closest id when multiple different ids are in the same time window', async () => {
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

    const result = await adapter.findSessionIdByProjectPath('D:/repo/project-a', target, 10_000)
    expect(result).toBe('55555555-5555-5555-5555-555555555555')
  })

  it('should return null when nearest candidates are too close to distinguish', async () => {
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    writeSessionMetaFile(tempHome, '66666666-6666-4666-8666-666666666666', 'D:/repo/project-a', '2026-02-19T12:00:00.200Z', target + 200)
    writeSessionMetaFile(tempHome, '77777777-7777-4777-8777-777777777777', 'D:/repo/project-a', '2026-02-19T12:00:00.550Z', target + 550)

    expect(await adapter.findSessionIdByProjectPath('D:/repo/project-a', target, 10_000)).toBeNull()
  })

  it('collects native thread names and real user content while excluding synthetic and subagent sessions', async () => {
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    const mainId = '88888888-8888-4888-8888-888888888888'
    const subagentId = '99999999-9999-4999-8999-999999999999'
    writeSessionMetaFile(tempHome, mainId, 'D:/repo/project-a', '2026-02-19T12:00:00.000Z', target, [
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>ignore</environment_context>' }] } },
      { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Implement the native picker' }] } }
    ])
    writeSessionMetaFile(tempHome, subagentId, 'D:/repo/project-a', '2026-02-19T12:01:00.000Z', target + 60_000, [], { subagent: 'reviewer' })
    const codexRoot = join(tempHome, '.codex')
    writeFileSync(join(codexRoot, 'session_index.jsonl'), [
      JSON.stringify({ id: mainId, thread_name: 'Old title', updated_at: '2026-02-19T12:02:00.000Z' }),
      JSON.stringify({ id: mainId, thread_name: 'Native resume repair', updated_at: '2026-02-19T12:03:00.000Z' })
    ].join('\n'))

    const result = await adapter.collectSessionCandidatesByPath('D:/repo/project-a')

    expect(result).toEqual([expect.objectContaining({
      id: mainId,
      title: 'Native resume repair',
      content: 'Implement the native picker',
      titleSource: 'session-title',
      updated: Date.parse('2026-02-19T12:03:00.000Z')
    })])
  })

  it('uses CODEX_HOME for config, sessions, index, history, and session lookup', async () => {
    const codexRoot = join(tempHome, 'custom-codex')
    const target = Date.parse('2026-02-19T12:00:00.000Z')
    const id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    process.env.CODEX_HOME = codexRoot
    writeSessionMetaFile(tempHome, id, 'D:/repo/project-a', '2026-02-19T12:00:01.000Z', target + 1_000, [], undefined, codexRoot)
    writeFileSync(join(codexRoot, 'session_index.jsonl'), JSON.stringify({
      id, thread_name: 'Custom root title', updated_at: '2026-02-19T12:00:02.000Z'
    }))
    writeFileSync(join(codexRoot, 'history.jsonl'), JSON.stringify({
      session_id: id, ts: 1_771_502_600, text: 'Custom root prompt'
    }))

    expect(adapter.getConfigPaths()).toEqual({ global: join(codexRoot, 'config.json') })
    expect(await adapter.findSessionIdByProjectPath('D:/repo/project-a', target, 10_000)).toBe(id)
    expect(await adapter.collectSessionCandidatesByPath('D:/repo/project-a')).toEqual([
      expect.objectContaining({ id, title: 'Custom root title', content: 'Custom root prompt' })
    ])
  })

  it('scans beyond 64 KiB to find the first valid rollout user message', async () => {
    const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    const synthetic = { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: `<system-reminder>${'x'.repeat(70 * 1024)}</system-reminder>` }] } }
    const real = { type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Prompt after the old prefix limit' }] } }
    writeSessionMetaFile(tempHome, id, 'D:/repo/project-a', '2026-02-19T12:00:00.000Z', 100, [synthetic, real])

    expect(await adapter.collectSessionCandidatesByPath('D:/repo/project-a')).toEqual([
      expect.objectContaining({ id, title: 'Prompt after the old prefix limit', content: 'Prompt after the old prefix limit' })
    ])
  })

  it('falls back to bounded Codex history user text', async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    writeSessionMetaFile(tempHome, id, 'D:/repo/project-a', '2026-02-19T12:00:00.000Z', 100)
    writeFileSync(join(tempHome, '.codex', 'history.jsonl'), [
      JSON.stringify({ session_id: id, ts: 1_771_502_500, text: '<session_context>ignore</session_context>' }),
      JSON.stringify({ session_id: id, ts: 1_771_502_600, text: 'History prompt' })
    ].join('\n'))

    expect(await adapter.collectSessionCandidatesByPath('D:/repo/project-a')).toEqual([
      expect.objectContaining({ id, title: 'History prompt', content: 'History prompt', titleSource: 'first-user-message', updated: 1_771_502_600_000 })
    ])
  })
})
