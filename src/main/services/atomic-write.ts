// 原子 JSON/文本写入助手（STAB-1）：与 DataStore 同级的落盘安全标准，
// 供绕过 DataStore 的「用户自己的配置文件」写入路径共用——
// CLI 全局配置（~/.claude/settings.json 等）、app-settings.json、项目 prompt。
// 崩溃/断电时宁可保留旧文件 + 单代备份，绝不留半成品覆盖原文件。
import { open, mkdir, rename, rm, copyFile } from 'fs/promises'
import { dirname } from 'path'
import { randomUUID } from 'crypto'
import { createLogger } from './logger'

const log = createLogger('atomic-write')

const RENAME_RETRY_LIMIT = 8

function isRenameRetryable(code: string | undefined): boolean {
  // Windows：EBUSY/EPERM = 文件被占用（杀毒/索引/同步盘）；EACCES 部分场景同样瞬时
  return code === 'EBUSY' || code === 'EPERM' || code === 'EACCES'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function writeDurable(path: string, payload: string): Promise<void> {
  const handle = await open(path, 'w')
  try {
    await handle.writeFile(payload, 'utf-8')
    await handle.sync()
  } finally {
    await handle.close()
  }
}

/**
 * 原子写入文本：tmp + fsync + rename（EBUSY/EPERM 重试，重试耗尽回退直接写）。
 * 写前将旧文件复制为 `<file>.bak` 一代备份（复制失败仅告警）。
 */
export async function writeFileAtomic(filePath: string, payload: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })

  // 单代备份：上一次成功内容。备份走 tmp+rename，避免半成品备份覆盖好备份。
  const backupPath = `${filePath}.bak`
  const backupTemp = `${backupPath}.tmp-${process.pid}-${randomUUID()}`
  try {
    await copyFile(filePath, backupTemp)
    await rename(backupTemp, backupPath)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      log.warn({ err }, `[atomic-write] 备份失败，保留既有备份 ${backupPath}`)
    }
    await rm(backupTemp, { force: true }).catch(() => undefined)
  }

  const tempPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`
  await writeDurable(tempPath, payload)
  for (let attempt = 0; attempt <= RENAME_RETRY_LIMIT; attempt += 1) {
    try {
      await rename(tempPath, filePath)
      return
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (isRenameRetryable(code) && attempt < RENAME_RETRY_LIMIT) {
        await sleep(30 * (attempt + 1))
        continue
      }
      if (isRenameRetryable(code)) {
        // 重试耗尽：退化为直接写（不原子，但保证不丢数据；比 rename 失败抛错丢配置强）
        await writeDurable(filePath, payload)
        await rm(tempPath, { force: true }).catch(() => undefined)
        return
      }
      await rm(tempPath, { force: true }).catch(() => undefined)
      throw err
    }
  }
}

export function writeJsonAtomicSyncStringify(data: object): string {
  return JSON.stringify(data, null, 2)
}
