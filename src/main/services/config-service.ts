import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import { basename, dirname } from 'path'
import { watch, FSWatcher } from 'fs'
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml'
import { parseAllDocuments } from 'yaml'
import {
  CLAUDE_GLOBAL_CONFIG,
  CODEX_CONFIG,
  OPENCODE_GLOBAL_CONFIG,
  claudeProjectConfig,
  getCliConfigDescriptor,
  isEditableCliType,
  type CliConfigPathContext,
  type ConfigFormat,
  type EditableCliType
} from './config-paths'
import { writeFileAtomic } from './atomic-write'

export interface ConfigDocument {
  cliType: EditableCliType
  path: string
  format: ConfigFormat
  exists: boolean
  content: string
  revision: string | null
}

export class ConfigServiceError extends Error {
  constructor(
    public readonly code:
      | 'CONFIG_INVALID_CLI'
      | 'CONFIG_INVALID_CONTENT'
      | 'CONFIG_TOO_LARGE'
      | 'CONFIG_INVALID_SYNTAX'
      | 'CONFIG_CONFLICT',
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ConfigServiceError'
  }
}

export class ConfigService {
  static readonly MAX_CONFIG_BYTES = 1024 * 1024

  private watchers = new Map<string, FSWatcher>()
  private watchTimers = new Map<string, NodeJS.Timeout>()
  private static readonly WATCH_DEBOUNCE_MS = 300

  constructor(private readonly pathContext?: CliConfigPathContext) {}

  async readJsonFile(filePath: string): Promise<object> {
    try {
      const content = await readFile(filePath, 'utf-8')
      const parsed: unknown = JSON.parse(content)
      return this.requireObject(parsed, 'JSON')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }

  // STAB-1：CLI 配置是用户自己的文件，崩溃/断电不能留半成品——统一走 tmp+fsync+rename 原子写。
  async writeJsonFile(filePath: string, data: object): Promise<void> {
    await writeFileAtomic(filePath, JSON.stringify(data, null, 2))
  }

  async readConfig(cliType: EditableCliType): Promise<ConfigDocument> {
    const descriptor = this.resolveDescriptor(cliType)
    const filePath = descriptor.resolvePath(this.pathContext)

    try {
      const content = await readFile(filePath, 'utf-8')
      return {
        cliType: descriptor.cliType,
        path: filePath,
        format: descriptor.format,
        exists: true,
        content,
        revision: this.createRevision(content)
      }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return {
        cliType: descriptor.cliType,
        path: filePath,
        format: descriptor.format,
        exists: false,
        content: '',
        revision: null
      }
    }
  }

  async writeConfig(
    cliType: EditableCliType,
    content: string,
    expectedRevision?: string | null
  ): Promise<ConfigDocument> {
    const descriptor = this.resolveDescriptor(cliType)
    this.validateContent(content, descriptor.format)

    const current = await this.readConfig(descriptor.cliType)
    if (expectedRevision !== undefined && expectedRevision !== current.revision) {
      throw new ConfigServiceError(
        'CONFIG_CONFLICT',
        `配置文件已被其他程序修改：${current.path}`
      )
    }

    if (!current.exists && !descriptor.allowCreate) {
      throw new ConfigServiceError('CONFIG_INVALID_CONTENT', `不允许创建配置文件：${current.path}`)
    }

    await writeFileAtomic(current.path, content)
    return {
      ...current,
      exists: true,
      content,
      revision: this.createRevision(content)
    }
  }

  getClaudeGlobalConfig(): Promise<object> {
    return this.readJsonFile(CLAUDE_GLOBAL_CONFIG)
  }

  setClaudeGlobalConfig(config: object): Promise<void> {
    return this.writeJsonFile(CLAUDE_GLOBAL_CONFIG, config)
  }

  getClaudeProjectConfig(projectPath: string): Promise<object> {
    return this.readJsonFile(claudeProjectConfig(projectPath))
  }

  setClaudeProjectConfig(projectPath: string, config: object): Promise<void> {
    return this.writeJsonFile(claudeProjectConfig(projectPath), config)
  }

  async getCodexConfig(): Promise<object> {
    try {
      const content = await readFile(CODEX_CONFIG, 'utf-8')
      return parseToml(content)
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
      throw error
    }
  }

  async setCodexConfig(config: object): Promise<void> {
    await writeFileAtomic(CODEX_CONFIG, stringifyToml(config))
  }

  getOpenCodeConfig(): Promise<object> {
    return this.readJsonFile(OPENCODE_GLOBAL_CONFIG)
  }

  setOpenCodeConfig(config: object): Promise<void> {
    return this.writeJsonFile(OPENCODE_GLOBAL_CONFIG, config)
  }

  private resolveDescriptor(cliType: EditableCliType) {
    if (!isEditableCliType(cliType)) {
      throw new ConfigServiceError('CONFIG_INVALID_CLI', `不支持的 CLI 配置：${String(cliType)}`)
    }
    return getCliConfigDescriptor(cliType)
  }

  private createRevision(content: string): string {
    return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`
  }

  private requireObject(value: unknown, format: string): object {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConfigServiceError(
        'CONFIG_INVALID_SYNTAX',
        `${format} 配置的顶层必须是对象`
      )
    }
    return value
  }

  private validateContent(content: unknown, format: ConfigFormat): void {
    if (typeof content !== 'string') {
      throw new ConfigServiceError('CONFIG_INVALID_CONTENT', '配置内容必须是字符串')
    }
    if (Buffer.byteLength(content, 'utf8') > ConfigService.MAX_CONFIG_BYTES) {
      throw new ConfigServiceError(
        'CONFIG_TOO_LARGE',
        `配置内容不能超过 ${ConfigService.MAX_CONFIG_BYTES} 字节`
      )
    }

    try {
      if (format === 'json') {
        this.requireObject(JSON.parse(content), 'JSON')
        return
      }
      if (format === 'toml') {
        parseToml(content)
        return
      }

      const documents = parseAllDocuments(content, { schema: 'core', uniqueKeys: true })
      if (documents.length > 1) {
        throw new ConfigServiceError('CONFIG_INVALID_SYNTAX', 'YAML 配置只能包含一个文档')
      }
      const document = documents[0]
      if (!document) return
      if (document.errors.length > 0) throw document.errors[0]
      const parsed: unknown = document.toJS({ maxAliasCount: 100 })
      if (parsed !== null) this.requireObject(parsed, 'YAML')
    } catch (error: unknown) {
      if (error instanceof ConfigServiceError) throw error
      throw new ConfigServiceError(
        'CONFIG_INVALID_SYNTAX',
        `${format.toUpperCase()} 配置语法无效：${error instanceof Error ? error.message : String(error)}`,
        { cause: error }
      )
    }
  }

  private retryTimers = new Map<string, NodeJS.Timeout>()
  private static readonly RETRY_INTERVAL_MS = 3000
  private static readonly MAX_RETRIES = 10

  watchConfig(filePath: string, callback: (path: string) => void): void {
    if (this.watchers.has(filePath)) return
    this.tryWatch(filePath, callback, 0)
  }

  private tryWatch(filePath: string, callback: (path: string) => void, attempt: number): void {
    if (this.watchers.has(filePath)) return
    // 监听父目录而非单文件：Windows 下编辑器/写入常用「写临时文件 + 原子 rename 替换」，
    // 单文件 watcher 会在 rename 后静默失效；监听目录并按文件名过滤可持续捕获变更。
    const dir = dirname(filePath)
    const base = basename(filePath)
    try {
      const watcher = watch(dir, (eventType, filename) => {
        // filename 为 null（部分平台不提供）时保守触发；否则只响应目标文件。
        if (filename !== null && basename(filename.toString()) !== base) return
        if (eventType === 'change' || eventType === 'rename') {
          const prev = this.watchTimers.get(filePath)
          if (prev) {
            clearTimeout(prev)
          }

          const timer = setTimeout(() => {
            this.watchTimers.delete(filePath)
            callback(filePath)
          }, ConfigService.WATCH_DEBOUNCE_MS)

          this.watchTimers.set(filePath, timer)
        }
      })
      this.watchers.set(filePath, watcher)
    } catch {
      // 目录不存在时定时重试，直到目录创建或达到最大重试次数
      if (attempt < ConfigService.MAX_RETRIES) {
        const retryTimer = setTimeout(() => {
          this.retryTimers.delete(filePath)
          this.tryWatch(filePath, callback, attempt + 1)
        }, ConfigService.RETRY_INTERVAL_MS)
        this.retryTimers.set(filePath, retryTimer)
      }
    }
  }

  unwatchConfig(filePath: string): void {
    const watcher = this.watchers.get(filePath)
    const timer = this.watchTimers.get(filePath)
    const retryTimer = this.retryTimers.get(filePath)
    if (retryTimer) {
      clearTimeout(retryTimer)
      this.retryTimers.delete(filePath)
    }
    if (timer) {
      clearTimeout(timer)
      this.watchTimers.delete(filePath)
    }
    if (watcher) {
      watcher.close()
      this.watchers.delete(filePath)
    }
  }

  unwatchAll(): void {
    for (const [, retryTimer] of this.retryTimers) {
      clearTimeout(retryTimer)
    }
    this.retryTimers.clear()
    for (const [path] of this.watchers) {
      this.unwatchConfig(path)
    }
  }
}
