import { exec } from 'child_process'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import type { OpenCodeSessionOptions } from './types'

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
    maxCount = 80
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
            .sort((a, b) => b.timestamp - a.timestamp)

          resolve(matched[0]?.id ?? null)
        } catch {
          resolve(null)
        }
      })
    })
  }

  extractSessionIdFromOutput(data: string): string | null {
    const patterns = [
      /(?:session(?:\s+id)?\s*[:=]\s*|--session\s+)([A-Za-z0-9_-]{6,128})/gi,
      /\/s\/([A-Za-z0-9_-]{6,128})/gi
    ]

    let found: string | null = null
    for (const pattern of patterns) {
      let match: RegExpExecArray | null = null
      while ((match = pattern.exec(data)) !== null) {
        found = match[1]
      }
    }
    return found
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

  private collectSessionCandidates(input: unknown): Array<{ id: string; path: string | null; timestamp: number }> {
    const results: Array<{ id: string; path: string | null; timestamp: number }> = []

    const walk = (value: unknown): void => {
      if (!value || typeof value !== 'object') return

      if (Array.isArray(value)) {
        value.forEach(walk)
        return
      }

      const obj = value as Record<string, unknown>

      const id = typeof obj.id === 'string' && obj.id.trim().length > 0 ? obj.id.trim() : null
      const pathFields = ['path', 'cwd', 'projectPath', 'project', 'directory'] as const
      const path = pathFields
        .map((field) => (typeof obj[field] === 'string' ? (obj[field] as string).trim() : ''))
        .find((item) => item.length > 0) || null
      const timeFields = ['updatedAt', 'lastUsedAt', 'createdAt', 'startAt', 'timestamp'] as const
      const timestamp = timeFields
        .map((field) => this.parseTimestamp(obj[field]))
        .find((item) => item > 0) || 0

      if (id && path) {
        results.push({ id, path, timestamp })
      }

      Object.values(obj).forEach(walk)
    }

    walk(input)
    return results
  }
}
