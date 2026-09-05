// STAB-7：journal 孤儿清理测试
import { mkdtemp, writeFile, readdir, rm } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SessionOutputManager } from '../src/main/services/session-output'

describe('reconcileJournals', () => {
  let dir: string
  let manager: SessionOutputManager

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'es-journal-reconcile-'))
    manager = new SessionOutputManager()
    manager.setJournalDir(dir)
  })

  afterEach(async () => {
    manager.setJournalDir(null)
    await rm(dir, { recursive: true, force: true })
  })

  it('removes journals of dead sessions and keeps alive ones', async () => {
    await writeFile(join(dir, 'alive-1.log'), 'keep me', 'utf8')
    await writeFile(join(dir, 'dead-1.log'), 'orphan', 'utf8')
    await writeFile(join(dir, 'dead-2.log'), 'orphan2', 'utf8')
    // 非 .log 文件不动
    await writeFile(join(dir, 'notes.txt'), 'misc', 'utf8')

    const removed = await manager.reconcileJournals(['alive-1'])

    expect(removed).toBe(2)
    const files = await readdir(dir)
    expect(files).toContain('alive-1.log')
    expect(files).toContain('notes.txt')
    expect(files).not.toContain('dead-1.log')
    expect(files).not.toContain('dead-2.log')
  })

  it('is a no-op when journal dir is empty or unset', async () => {
    expect(await manager.reconcileJournals([])).toBe(0)
    manager.setJournalDir(null)
    expect(await manager.reconcileJournals([])).toBe(0)
  })
})
