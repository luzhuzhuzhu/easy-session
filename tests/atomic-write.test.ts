// STAB-1：原子写助手单元测试（中断安全 + 备份 + 重试回退）
import { mkdtemp, readFile, readdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { writeFileAtomic } from '../src/main/services/atomic-write'

describe('writeFileAtomic', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'es-atomic-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('writes content atomically and creates the file', async () => {
    const file = join(dir, 'nested', 'config.json')
    await writeFileAtomic(file, '{"a":1}')
    expect(await readFile(file, 'utf-8')).toBe('{"a":1}')
  })

  it('leaves previous content intact when rename fails permanently with non-retryable error', async () => {
    const file = join(dir, 'f.json')
    await writeFile(file, 'old', 'utf-8')
    // 直接 mock 模块内使用的 rename：atomic-write 通过命名导入绑定 fs/promises，
    // vi.doMock 后需用动态 import 重新加载被测模块才能生效。
    vi.doMock('fs/promises', async (importOriginal) => {
      const actual = await importOriginal<typeof import('fs/promises')>()
      return {
        ...actual,
        default: actual,
        rename: async () => {
          throw Object.assign(new Error('nope'), { code: 'ENOTDIR' })
        }
      }
    })
    vi.doMock('../src/main/services/logger', () => ({
      createLogger: () => ({ warn: () => {}, info: () => {}, error: () => {} })
    }))
    const { writeFileAtomic: atomicWithBrokenRename } = await import('../src/main/services/atomic-write?broken-rename')
    await expect(atomicWithBrokenRename(file, 'new')).rejects.toThrow('nope')
    // 旧文件不被半成品破坏
    expect(await readFile(file, 'utf-8')).toBe('old')
    vi.doUnmock('fs/promises')
    vi.doUnmock('../src/main/services/logger')
  })

  it('creates a .bak backup of previous content', async () => {
    const file = join(dir, 'g.json')
    await writeFileAtomic(file, 'v1')
    await writeFileAtomic(file, 'v2')
    expect(await readFile(`${file}.bak`, 'utf-8')).toBe('v1')
    expect(await readFile(file, 'utf-8')).toBe('v2')
    // 不留 tmp 残留
    const files = await readdir(dir)
    expect(files.every((f) => !f.includes('.tmp-'))).toBe(true)
  })

  it('first write (no prior file) works without backup', async () => {
    const file = join(dir, 'h.json')
    await writeFileAtomic(file, 'first')
    expect(await readFile(file, 'utf-8')).toBe('first')
    expect(await readdir(dir)).not.toContain('h.json.bak')
  })

  it('survives rapid successive writes with valid final content', async () => {
    const file = join(dir, 'race.json')
    await Promise.all(Array.from({ length: 12 }, (_, i) => writeFileAtomic(file, `v${i}`)))
    const final = await readFile(file, 'utf-8')
    expect(final).toMatch(/^v\d+$/)
  })
})
