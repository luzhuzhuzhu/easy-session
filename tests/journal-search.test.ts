// UX-9：跨会话输出全文搜索单测
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionOutputManager } from '../src/main/services/session-output'

describe('searchJournals', () => {
  let dir: string
  let manager: SessionOutputManager

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'es-journal-search-'))
    manager = new SessionOutputManager()
    manager.setJournalDir(dir)
  })

  afterEach(async () => {
    manager.setJournalDir(null)
    await rm(dir, { recursive: true, force: true })
  })

  it('finds matches in exited-session journal files', async () => {
    const { writeFile } = await import('fs/promises')
    await writeFile(join(dir, 'dead-1.log'), 'line one\nBUILD FAILED at step 3\nline three\n', 'utf8')
    await writeFile(join(dir, 'dead-2.log'), 'nothing interesting\n', 'utf8')

    const results = await manager.searchJournals('failed', {
      sessionNames: new Map([['dead-1', { name: 'build agent', type: 'claude' }]])
    })

    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('dead-1')
    expect(results[0].name).toBe('build agent')
    expect(results[0].matches[0].line).toContain('BUILD FAILED')
    expect(results[0].matches[0].fromMemory).toBe(false)
  })

  it('is case-insensitive and respects limitPerSession', async () => {
    const { writeFile } = await import('fs/promises')
    const lines = Array.from({ length: 20 }, (_, i) => `error line ${i}`)
    await writeFile(join(dir, 'many.log'), lines.join('\n') + '\n', 'utf8')

    const results = await manager.searchJournals('ERROR', { limitPerSession: 3 })
    expect(results).toHaveLength(1)
    expect(results[0].matches).toHaveLength(3)
  })

  it('returns empty for blank queries', async () => {
    expect(await manager.searchJournals('   ')).toEqual([])
  })

  it('searches memory buffers of running sessions', async () => {
    manager.appendOutput('live-1', 'deploy step 2 ERROR occurred\n', 'stdout')

    const results = await manager.searchJournals('error')
    expect(results).toHaveLength(1)
    expect(results[0].sessionId).toBe('live-1')
    expect(results[0].matches[0].fromMemory).toBe(true)
  })
})
