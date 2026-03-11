import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const results: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...await collectFiles(fullPath))
      continue
    }
    results.push(fullPath)
  }

  return results
}

describe('desktop remote token storage regression', () => {
  it('does not persist remote tokens with localStorage in desktop renderer or preload code', async () => {
    const roots = ['src/renderer/src', 'src/preload']
    const offenders: string[] = []

    for (const root of roots) {
      const files = await collectFiles(root)
      for (const file of files) {
        const content = await readFile(file, 'utf-8')
        if (content.includes('localStorage')) {
          offenders.push(file.replace(/\\/g, '/'))
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
