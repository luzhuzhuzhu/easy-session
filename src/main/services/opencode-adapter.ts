import { exec, execFile } from 'child_process'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import type { OpenCodeSessionOptions } from './types'

const OPENCODE_SESSION_HINT_PATTERNS = [
  /(?:--session|-s)\s+([A-Za-z0-9_-]{6,128})/gi,
  /session(?:\s+id)?\s*[:=]\s*([A-Za-z0-9_-]{6,128})/gi,
  /\/s\/([A-Za-z0-9_-]{6,128})/gi
]
const OPENCODE_SESSION_ID_FALLBACK_PATTERN = /\b(ses_[A-Za-z0-9_-]{6,128})\b/gi
const OPENCODE_SESSION_DISCOVERY_MAX_SKEW_MS = 5 * 60_000

export class OpenCodeAdapter {
  private cliManager: CliManager
  private customPath: string | null = null

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  setCustomPath(path: string | null): void {
    this.customPath = path || null
  }

  private getExecutable(preferredPath?: string): string {
    if (preferredPath) return preferredPath
    if (this.customPath) return this.customPath
    return 'opencode'
  }

  private getDiscoveryExecutable(preferredPath?: string): string {
    return this.getExecutable(preferredPath)
  }

  private execSessionList(
    executable: string,
    cwd: string,
    maxCount: number,
    callback: (error: Error | null, stdout: string) => void
  ): void {
    const args = ['session', 'list', '--format', 'json', '--max-count', String(Math.max(1, maxCount))]
    // execFile avoids shell parsing, preserving configured executable paths that contain spaces.
    execFile(executable, args, { cwd: cwd || undefined, maxBuffer: 10 * 1024 * 1024, timeout: 8000 }, (error, stdout) => {
      callback(error, String(stdout ?? ''))
    })
  }

  async getCliPath(): Promise<string> {
    if (this.customPath) return this.customPath
    const cmd = process.platform === 'win32' ? 'where opencode' : 'which opencode'
    return new Promise((resolve, reject) => {
      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error('OpenCode CLI not found in PATH'))
        resolve(stdout.trim().split('\n')[0])
      })
    })
  }

  async getVersion(): Promise<string> {
    const executable = this.getExecutable()
    return new Promise((resolve, reject) => {
      exec(`"${executable}" --version`, { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error('Failed to get OpenCode version'))
        resolve(stdout.trim())
      })
    })
  }

  async getVersionWithPath(preferredPath?: string): Promise<string> {
    const executable = this.getExecutable(preferredPath)
    return new Promise((resolve, reject) => {
      exec(`"${executable}" --version`, { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error('Failed to get OpenCode version'))
        resolve(stdout.trim())
      })
    })
  }

  startSession(projectPath: string, options?: OpenCodeSessionOptions): string {
    const id = `opencode-${randomUUID()}`
    const args: string[] = this.buildArgs(options)
    const executable = this.getExecutable(options?.cliPath)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined, cliType: 'opencode' })
    return id
  }

  resumeSession(
    projectPath: string,
    options: OpenCodeSessionOptions | undefined,
    sessionId: string,
    fork?: boolean
  ): string {
    const id = `opencode-${randomUUID()}`
    const args: string[] = ['--session', sessionId]

    if (fork) args.push('--fork')
    this.appendCommonRunArgs(args, options)

    const executable = this.getExecutable(options?.cliPath)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined, cliType: 'opencode' })
    return id
  }

  continueLastSession(projectPath: string, options?: OpenCodeSessionOptions, fork?: boolean): string {
    const id = `opencode-${randomUUID()}`
    const args: string[] = ['--continue']

    if (fork) args.push('--fork')
    this.appendCommonRunArgs(args, options)

    const executable = this.getExecutable(options?.cliPath)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined, cliType: 'opencode' })
    return id
  }

  attachSession(
    attachUrl: string,
    projectPath: string,
    options?: OpenCodeSessionOptions,
    sessionId?: string
  ): string {
    const id = `opencode-${randomUUID()}`
    // Use the original URL for execution; sanitization is only for logs.
    const args: string[] = ['attach', attachUrl]

    if (sessionId) args.push('--session', sessionId)
    if (options?.model) args.push('--model', options.model)
    if (options?.agent) args.push('--agent', options.agent)

    const executable = this.getExecutable(options?.cliPath)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined, cliType: 'opencode' })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  getConfigPaths(): { global: string; project: (p: string) => string } {
    const home = homedir()
    return {
      global: join(home, '.config', 'opencode', 'opencode.json'),
      project: (p: string) => join(p, 'opencode.json')
    }
  }

  async findSessionIdByProjectPath(
    projectPath: string,
    preferredPath?: string,
    maxCount = 80,
    targetStartMs?: number,
    maxSkewMs = OPENCODE_SESSION_DISCOVERY_MAX_SKEW_MS,
    requireTimestamp = false
  ): Promise<string | null> {
    const executable = this.getDiscoveryExecutable(preferredPath)
    const targetPath = this.normalizePath(projectPath)

    return new Promise((resolve) => {
      // 超时兜底：CLI 卡住（首次运行更新检查等）时 discovery 不能无限 pending，
      // 否则重试循环会堆积挂起子进程且阻塞启动链。
      this.execSessionList(executable, projectPath, maxCount, (error, stdout) => {
        if (error || !stdout) {
          resolve(null)
          return
        }

        try {
          const parsed = JSON.parse(stdout) as unknown
          const candidates = this.collectSessionCandidates(parsed)
          if (candidates.length === 0) {
            resolve(null)
            return
          }

          const matched = candidates
            .filter((item) => this.pathMatches(item.path, targetPath))
            .filter((item) => this.isWithinTimeWindow(item.timestamp, targetStartMs, maxSkewMs, requireTimestamp))
            .sort((a, b) => this.compareSessionCandidates(a, b, targetStartMs))

          resolve(matched[0]?.id ?? null)
        } catch {
          resolve(null)
        }
      })
    })
  }

  // resume ID 选择器数据源：列出该项目路径下的候选会话（id + 标题 + 时间），
  // 供用户在会话设置里挑一个绑定。不做时间窗过滤（人工选择场景，越全越好用）。
  async collectSessionCandidatesByPath(
    projectPath: string,
    preferredPath?: string,
    maxCount = 40
  ): Promise<Array<{ id: string; title: string; updated: number }>> {
    const executable = this.getDiscoveryExecutable(preferredPath)
    const targetPath = this.normalizePath(projectPath)

    return new Promise((resolve) => {
      this.execSessionList(executable, projectPath, maxCount, (error, stdout) => {
        if (error || !stdout) {
          resolve([])
          return
        }
        try {
          const parsed = JSON.parse(stdout) as unknown
          // 先扫一遍标题（id → title），供选择器展示
          const titles = new Map<string, string>()
          const walkTitles = (value: unknown): void => {
            if (!value || typeof value !== 'object') return
            if (Array.isArray(value)) {
              value.forEach(walkTitles)
              return
            }
            const obj = value as Record<string, unknown>
            const id = typeof obj.id === 'string' ? obj.id : typeof obj.sessionID === 'string' ? obj.sessionID : null
            const title = typeof obj.title === 'string' ? obj.title : ''
            if (id && title && !titles.has(id)) titles.set(id, title)
            Object.values(obj).forEach(walkTitles)
          }
          walkTitles(parsed)

          const seen = new Set<string>()
          const candidates = this.collectSessionCandidates(parsed)
            .filter((item) => this.pathMatches(item.path, targetPath))
            .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
            .sort((a, b) => b.timestamp - a.timestamp)
            .map((item) => ({
              id: item.id,
              title: titles.get(item.id) ?? 'OpenCode session',
              updated: item.timestamp,
              projectPath: item.path || undefined
            }))
          resolve(candidates)
        } catch {
          resolve([])
        }
      })
    })
  }

  extractSessionIdFromOutput(data: string): string | null {
    const hints: string[] = []

    for (const pattern of OPENCODE_SESSION_HINT_PATTERNS) {
      pattern.lastIndex = 0
      let match: RegExpExecArray | null = null
      while ((match = pattern.exec(data)) !== null) {
        hints.push(match[1])
      }
    }

    OPENCODE_SESSION_ID_FALLBACK_PATTERN.lastIndex = 0
    let fallback: RegExpExecArray | null = null
    while ((fallback = OPENCODE_SESSION_ID_FALLBACK_PATTERN.exec(data)) !== null) {
      hints.push(fallback[1])
    }

    if (hints.length === 0) return null

    const preferred = hints.filter((id) => id.toLowerCase().startsWith('ses_'))
    return (preferred.length > 0 ? preferred[preferred.length - 1] : hints[hints.length - 1]) || null
  }

  private appendCommonRunArgs(args: string[], options?: OpenCodeSessionOptions): void {
    if (options?.model) args.push('--model', options.model)
    if (options?.agent) args.push('--agent', options.agent)
    if (options?.prompt) args.push('--prompt', options.prompt)
    if (options?.auto) args.push('--auto')
    if (options?.mini) args.push('--mini')
    if (options?.noReplay) args.push('--no-replay')
    if (typeof options?.replayLimit === 'number') args.push('--replay-limit', String(options.replayLimit))
  }

  private buildArgs(options?: OpenCodeSessionOptions): string[] {
    const args: string[] = []
    this.appendCommonRunArgs(args, options)
    return args
  }

  sanitizeUrlForLog(url: string): string {
    try {
      const parsed = new URL(url)
      const host = parsed.host
      return host || '***'
    } catch {
      return '***'
    }
  }

  private normalizePath(p: string): string {
    const normalized = resolve(p).replace(/\\/g, '/').toLowerCase()
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
  }

  private pathMatches(candidate: string | null, target: string): boolean {
    if (!candidate) return false
    const normalizedCandidate = this.normalizePath(candidate)
    return normalizedCandidate === target
  }

  private parseTimestamp(input: unknown): number {
    if (typeof input === 'number' && Number.isFinite(input)) return input
    if (typeof input === 'string') {
      const asNum = Number(input)
      if (Number.isFinite(asNum)) return asNum
      const asDate = Date.parse(input)
      if (Number.isFinite(asDate)) return asDate
    }
    return 0
  }

  private isWithinTimeWindow(
    timestamp: number,
    targetStartMs?: number,
    maxSkewMs = OPENCODE_SESSION_DISCOVERY_MAX_SKEW_MS,
    requireTimestamp = false
  ): boolean {
    if (!Number.isFinite(targetStartMs)) return true
    if (!Number.isFinite(timestamp) || timestamp <= 0) return !requireTimestamp
    if (timestamp < (targetStartMs as number) - 2_000) return false
    return Math.abs(timestamp - (targetStartMs as number)) <= maxSkewMs
  }

  private compareSessionCandidates(
    a: { id: string; path: string | null; timestamp: number },
    b: { id: string; path: string | null; timestamp: number },
    targetStartMs?: number
  ): number {
    if (Number.isFinite(targetStartMs)) {
      const distA = this.distanceToTarget(a.timestamp, targetStartMs as number)
      const distB = this.distanceToTarget(b.timestamp, targetStartMs as number)
      if (distA !== distB) return distA - distB
    }

    const aHasSesPrefix = a.id.toLowerCase().startsWith('ses_') ? 1 : 0
    const bHasSesPrefix = b.id.toLowerCase().startsWith('ses_') ? 1 : 0
    if (aHasSesPrefix !== bHasSesPrefix) return bHasSesPrefix - aHasSesPrefix

    return b.timestamp - a.timestamp
  }

  private distanceToTarget(timestamp: number, targetStartMs: number): number {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return Number.POSITIVE_INFINITY
    return Math.abs(timestamp - targetStartMs)
  }

  private collectSessionCandidates(input: unknown): Array<{ id: string; path: string | null; timestamp: number }> {
    const results: Array<{ id: string; path: string | null; timestamp: number }> = []

    const walk = (value: unknown): void => {
      if (!value || typeof value !== 'object') return

      if (Array.isArray(value)) {
        value.forEach(walk)
        return
      }

      const obj = value as Record<string, unknown>

      const idFields = ['id', 'sessionID', 'sessionId'] as const
      const id = idFields
        .map((field) => (typeof obj[field] === 'string' ? (obj[field] as string).trim() : ''))
        .find((item) => item.length > 0) || null
      const pathFields = ['path', 'cwd', 'projectPath', 'project', 'directory'] as const
      const path = pathFields
        .map((field) => (typeof obj[field] === 'string' ? (obj[field] as string).trim() : ''))
        .find((item) => item.length > 0) || null

      const timeFields = [
        'startAt',
        'startedAt',
        'createdAt',
        'created',
        'timestamp',
        'lastUsedAt',
        'updatedAt',
        'updated'
      ] as const
      const directTimestamp = timeFields
        .map((field) => this.parseTimestamp(obj[field]))
        .find((item) => item > 0) || 0
      const nestedTime =
        obj.time && typeof obj.time === 'object' && !Array.isArray(obj.time)
          ? (obj.time as Record<string, unknown>)
          : null
      const nestedTimestamp = nestedTime
        ? [nestedTime.created, nestedTime.started, nestedTime.updated]
          .map((item) => this.parseTimestamp(item))
          .find((item) => item > 0) || 0
        : 0
      const timestamp = directTimestamp || nestedTimestamp

      if (id && path) {
        results.push({ id, path, timestamp })
      }

      Object.values(obj).forEach(walk)
    }

    walk(input)
    return results
  }
}
