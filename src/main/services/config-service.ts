import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname } from 'path'
import { watch, FSWatcher } from 'fs'
import {
  CLAUDE_GLOBAL_CONFIG,
  CODEX_CONFIG,
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

  watchConfig(filePath: string, callback: (path: string) => void): void {
    if (this.watchers.has(filePath)) return
    try {
      const watcher = watch(filePath, (eventType) => {
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
      // file may not exist yet, ignore
    }
  }

  unwatchConfig(filePath: string): void {
    const watcher = this.watchers.get(filePath)
    const timer = this.watchTimers.get(filePath)
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
    for (const [path] of this.watchers) {
      this.unwatchConfig(path)
    }
  }
}
