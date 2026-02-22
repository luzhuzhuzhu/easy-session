import { mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { DataStore } from '../src/main/services/data-store'

async function createTempPath(filename: string): Promise<{ dir: string; filePath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'easysession-datastore-'))
  return { dir, filePath: join(dir, filename) }
}

describe('DataStore', () => {
  it('flush resolves quickly when queue is empty', async () => {
    const { dir, filePath } = await createTempPath('empty-flush.json')

    try {
      const store = new DataStore<Record<string, unknown>>(filePath)
      const startedAt = Date.now()
      await store.flush()
      expect(Date.now() - startedAt).toBeLessThan(200)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('returns parse position diagnostics when JSON is corrupted', async () => {
    const { dir, filePath } = await createTempPath('corrupted.json')

    try {
      const invalidJson = '{\n  "a": 1,\n  "b":,\n  "c": 3\n}\n'
      await writeFile(filePath, invalidJson, 'utf-8')

      const store = new DataStore<Record<string, unknown>>(filePath)
      const result = await store.load()

      expect(result.data).toBeNull()
      expect(result.error).toBe('corrupted')
      expect(result.parseError).toBeDefined()
      expect(result.parseError?.message.length).toBeGreaterThan(0)
      expect(result.parseError?.line).toBeGreaterThan(0)
      expect(result.parseError?.column).toBeGreaterThan(0)
      expect(result.parseError?.snippet).toContain('^')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('keeps file valid under concurrent save calls', async () => {
    const { dir, filePath } = await createTempPath('queue.json')

    try {
      const store = new DataStore<{ value: number }>(filePath)

      await Promise.all(
        Array.from({ length: 20 }, (_, i) => store.save({ value: i }))
      )
      await store.flush()

      const raw = await readFile(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as { value: number }
      expect(parsed.value).toBe(19)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
