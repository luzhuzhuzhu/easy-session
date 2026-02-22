import { randomUUID } from 'crypto'
import { open, readFile, mkdir, rename, rm, copyFile } from 'fs/promises'
import { dirname, normalize, resolve } from 'path'

export interface LoadResult<T> {
  data: T | null
  error?: 'not_found' | 'corrupted' | 'read_error'
  parseError?: JsonParseErrorInfo
  /** 数据是否从 .bak 备份恢复 */
  restoredFromBackup?: boolean
}

export interface JsonParseErrorInfo {
  message: string
  position?: number
  line?: number
  column?: number
  snippet?: string
}

export class DataStore<T> {
  private static readonly JSON_POSITION_REGEX = /position\s+(\d+)/i
  private static saveTails = new Map<string, Promise<void>>()
  private static readonly RENAME_RETRY_LIMIT = 2
  private readonly queueKey: string

  private readonly backupPath: string

  constructor(private filePath: string) {
    this.queueKey = DataStore.toQueueKey(filePath)
    this.backupPath = `${filePath}.bak`
  }

  private static toQueueKey(filePath: string): string {
    const normalizedPath = normalize(resolve(filePath))
    return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
  }

  private enqueueSave(task: () => Promise<void>): Promise<void> {
    const prev = DataStore.saveTails.get(this.queueKey) ?? Promise.resolve()
    let tracked: Promise<void> = Promise.resolve()

    tracked = prev
      .catch(() => undefined)
      .then(task)
      .finally(() => {
        if (DataStore.saveTails.get(this.queueKey) === tracked) {
          DataStore.saveTails.delete(this.queueKey)
        }
      })

    DataStore.saveTails.set(this.queueKey, tracked)
    return tracked
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((done) => setTimeout(done, ms))
  }

  private static async writeDurable(path: string, payload: string): Promise<void> {
    const handle = await open(path, 'w')
    try {
      await handle.writeFile(payload, 'utf-8')
      await handle.sync()
    } finally {
      await handle.close()
    }
  }

  private static isRenameRetryable(code: string | undefined): boolean {
    return code === 'EEXIST' || code === 'EPERM' || code === 'EBUSY'
  }

  private async replaceWithFallback(tempPath: string, payload: string): Promise<void> {
    for (let attempt = 0; attempt <= DataStore.RENAME_RETRY_LIMIT; attempt += 1) {
      try {
        await rename(tempPath, this.filePath)
        return
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code
        const retryable = DataStore.isRenameRetryable(code)

        if (retryable && attempt < DataStore.RENAME_RETRY_LIMIT) {
          await DataStore.sleep(30 * (attempt + 1))
          continue
        }

        if (retryable) {
          await DataStore.writeDurable(this.filePath, payload)
          await rm(tempPath, { force: true }).catch(() => undefined)
          return
        }

        await rm(tempPath, { force: true }).catch(() => undefined)
        throw err
      }
    }
  }

  private static clampPosition(content: string, position: number): number {
    if (!Number.isFinite(position)) return 0
    return Math.max(0, Math.min(content.length, Math.floor(position)))
  }

  private static toLineColumn(content: string, position: number): { line: number; column: number } {
    const safePosition = DataStore.clampPosition(content, position)
    const before = content.slice(0, safePosition)
    const line = before.split('\n').length
    const lineStart = before.lastIndexOf('\n') + 1
    const column = safePosition - lineStart + 1
    return { line, column }
  }

  private static buildSnippet(content: string, position: number): string {
    const safePosition = DataStore.clampPosition(content, position)

    const lineStart = content.lastIndexOf('\n', Math.max(0, safePosition - 1)) + 1
    const nextLineBreak = content.indexOf('\n', safePosition)
    const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak
    const rawLine = content.slice(lineStart, lineEnd)

    const maxViewLength = 160
    const inLineOffset = safePosition - lineStart
    const viewStart = Math.max(0, inLineOffset - 80)
    const viewEnd = Math.min(rawLine.length, viewStart + maxViewLength)
    const visibleLine = rawLine.slice(viewStart, viewEnd).replace(/\t/g, '  ')

    const caretOffset = Math.max(0, inLineOffset - viewStart)
    const pointer = `${' '.repeat(caretOffset)}^`
    return `${visibleLine}\n${pointer}`
  }

  private static buildJsonParseError(content: string, err: unknown): JsonParseErrorInfo {
    const message = err instanceof Error ? err.message : String(err)
    const detail: JsonParseErrorInfo = { message }

    const matched = DataStore.JSON_POSITION_REGEX.exec(message)
    if (!matched) return detail

    const position = Number(matched[1])
    if (!Number.isFinite(position)) return detail

    detail.position = DataStore.clampPosition(content, position)
    const { line, column } = DataStore.toLineColumn(content, position)
    detail.line = line
    detail.column = column
    detail.snippet = DataStore.buildSnippet(content, position)

    return detail
  }

  private async loadFile(path: string): Promise<LoadResult<T>> {
    let content: string
    try {
      content = await readFile(path, 'utf-8')
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return { data: null, error: 'not_found' }
      console.error(`[DataStore] read failed ${path}:`, err)
      return { data: null, error: 'read_error' }
    }

    if (!content.trim()) return { data: null, error: 'not_found' }

    try {
      return { data: JSON.parse(content) as T }
    } catch (err) {
      const parseError = DataStore.buildJsonParseError(content, err)
      console.error(`[DataStore] JSON parse failed ${path}:`, parseError)
      return { data: null, error: 'corrupted', parseError }
    }
  }

  async load(): Promise<LoadResult<T>> {
    const result = await this.loadFile(this.filePath)
    if (result.data) return result

    // 主文件损坏或不可读时，尝试从备份恢复
    if (result.error === 'corrupted' || result.error === 'read_error') {
      const backup = await this.loadFile(this.backupPath)
      if (backup.data) {
        console.warn(`[DataStore] 从备份恢复: ${this.backupPath}`)
        return { data: backup.data, restoredFromBackup: true }
      }
    }

    return result
  }

  async save(data: T): Promise<void> {
    const payload = JSON.stringify(data, null, 2)

    await this.enqueueSave(async () => {
      await mkdir(dirname(this.filePath), { recursive: true })

      // 保存前将当前文件备份为 .bak
      await copyFile(this.filePath, this.backupPath).catch(() => undefined)

      const tempPath = `${this.filePath}.tmp-${process.pid}-${randomUUID()}`
      await DataStore.writeDurable(tempPath, payload)
      await this.replaceWithFallback(tempPath, payload)
    })
  }

  async flush(): Promise<void> {
    while (true) {
      const tail = DataStore.saveTails.get(this.queueKey)
      if (!tail) {
        return
      }

      await tail
    }
  }
}
