import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtemp, readFile, rm, readdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

import { SessionOutputManager } from '../src/main/services/session-output'

describe('SessionOutputManager journal lifecycle', () => {
  let manager: SessionOutputManager
  let journalDir: string

  beforeEach(async () => {
    journalDir = await mkdtemp(join(tmpdir(), 'es-journal-'))
    manager = new SessionOutputManager()
    manager.setJournalDir(journalDir)
    vi.useFakeTimers()
  })

  afterEach(async () => {
    vi.useRealTimers()
    await rm(journalDir, { recursive: true, force: true })
  })

  it('should write journal on demand and persist recent output', async () => {
    manager.appendOutput('s1', 'build failed\n', 'stderr')

    const done = manager.writeJournal('s1', { name: 'build-bot', type: 'terminal' })
    expect(done).toBeInstanceOf(Promise)
    await done

    const text = await readFile(join(journalDir, 's1.log'), 'utf8')
    expect(text).toContain('build failed')
    // 元数据头：肉眼可辨会话名/类型/落盘时间
    expect(text).toContain('easysession journal')
    expect(text).toContain('name: build-bot')
    expect(text).toContain('type: terminal')
  })

  it('should not touch disk when buffer is empty', async () => {
    await manager.writeJournal('s-empty')
    const files = await readdir(journalDir)
    expect(files).toHaveLength(0)
  })

  it('flushJournals waits for all in-flight writes', async () => {
    manager.appendOutput('a', 'aaa\n', 'stdout')
    manager.appendOutput('b', 'bbb\n', 'stdout')

    manager.writeJournal('a')
    manager.writeJournal('b')
    await manager.flushJournals()

    expect(await readFile(join(journalDir, 'a.log'), 'utf8')).toContain('aaa')
    expect(await readFile(join(journalDir, 'b.log'), 'utf8')).toContain('bbb')
  })

  it('removeSession deletes journal without resurrecting it from in-flight write', async () => {
    manager.appendOutput('s1', 'old output\n', 'stdout')
    manager.writeJournal('s1')

    // 写入仍在途时就删除会话：等在途写入结束后文件应被清掉，而不是被晚到的写入重建
    manager.removeSession('s1')
    await manager.flushJournals()

    const files = await readdir(journalDir)
    expect(files).toHaveLength(0)
  })

  it('should rehydrate empty buffer from journal on startup', async () => {
    manager.appendOutput('s1', 'last screen content\n', 'stdout')
    await manager.writeJournal('s1')

    // 模拟应用重启：新的空 manager 回灌 journal
    const fresh = new SessionOutputManager()
    fresh.setJournalDir(journalDir)
    await fresh.restoreJournal('s1')

    const history = fresh.getHistory('s1')
    expect(history.map((line) => line.text).join('')).toContain('last screen content')
  })
})
