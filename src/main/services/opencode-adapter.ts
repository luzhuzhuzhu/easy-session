import { exec } from 'child_process'
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

  async getCliPath(): Promise<string> {
    if (this.customPath) return this.customPath
    const cmd = process.platform === 'win32' ? 'where opencode' : 'which opencode'
    return new Promise((resolve, reject) => {
      exec(cmd, (error, stdout) => {
        if (error) return reject(new Error('OpenCode CLI not found in PATH'))
        resolve(stdout.trim().split('\n')[0])
      })
    })
  }

  async getVersion(): Promise<string> {
    const executable = this.getExecutable()
    return new Promise((resolve, reject) => {
      exec(`"${executable}" --version`, (error, stdout) => {
        if (error) return reject(new Error('Failed to get OpenCode version'))
        resolve(stdout.trim())
      })
    })
  }

  async getVersionWithPath(preferredPath?: string): Promise<string> {
    const executable = this.getExecutable(preferredPath)
    return new Promise((resolve, reject) => {
      exec(`"${executable}" --version`, (error, stdout) => {
        if (error) return reject(new Error('Failed to get OpenCode version'))
        resolve(stdout.trim())
      })
    })
  }

  startSession(projectPath: string, options?: OpenCodeSessionOptions): string {
    const id = `opencode-${randomUUID()}`
    const args: string[] = this.buildArgs(options)
    const executable = this.getExecutable(options?.cliPath)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
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
    if (options?.model) args.push('--model', options.model)
    if (options?.agent) args.push('--agent', options.agent)
    if (options?.prompt) args.push('--prompt', options.prompt)

    const executable = this.getExecutable(options?.cliPath)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
    return id
  }

  continueLastSession(projectPath: string, options?: OpenCodeSessionOptions, fork?: boolean): string {
    const id = `opencode-${randomUUID()}`
    const args: string[] = ['--continue']

    if (fork) args.push('--fork')
    if (options?.model) args.push('--model', options.model)
    if (options?.agent) args.push('--agent', options.agent)
    if (options?.prompt) args.push('--prompt', options.prompt)

    const executable = this.getExecutable(options?.cliPath)
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
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
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  getConfigPaths(): { global: string; project: (p: string) => string } {
    const home = homedir()
    return {
      global: join(home, '.config', 'opencode', 'config.json'),
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
    const executable = this.getExecutable(preferredPath)
    const command = `"${executable}" session list --format json --max-count ${Math.max(1, maxCount)}`
    const targetPath = this.normalizePath(projectPath)

    return new Promise((resolve) => {
      exec(command, { cwd: projectPath || undefined, maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
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

  private buildArgs(options?: OpenCodeSessionOptions): string[] {
    const args: string[] = []

    if (options?.model) args.push('--model', options.model)
    if (options?.agent) args.push('--agent', options.agent)
    if (options?.prompt) args.push('--prompt', options.prompt)

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
