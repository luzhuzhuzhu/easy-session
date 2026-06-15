import { readFile, writeFile, mkdir } from 'fs/promises'
import { basename, dirname } from 'path'
import { watch, FSWatcher } from 'fs'
import {
  CLAUDE_GLOBAL_CONFIG,
  CODEX_CONFIG,
  OPENCODE_GLOBAL_CONFIG,
  claudeProjectConfig
} from './config-paths'

export class ConfigService {
  private watchers = new Map<string, FSWatcher>()
  private watchTimers = new Map<string, NodeJS.Timeout>()
  private static readonly WATCH_DEBOUNCE_MS = 300

  async readJsonFile(filePath: string): Promise<object> {
    try {
      const content = await readFile(filePath, 'utf-8')
      return JSON.parse(content)
    } catch {
      return {}
    }
  }

  async writeJsonFile(filePath: string, data: object): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
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

  getCodexConfig(): Promise<object> {
    return this.readJsonFile(CODEX_CONFIG)
  }

  setCodexConfig(config: object): Promise<void> {
    return this.writeJsonFile(CODEX_CONFIG, config)
  }

  getOpenCodeConfig(): Promise<object> {
    return this.readJsonFile(OPENCODE_GLOBAL_CONFIG)
  }

  setOpenCodeConfig(config: object): Promise<void> {
    return this.writeJsonFile(OPENCODE_GLOBAL_CONFIG, config)
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
