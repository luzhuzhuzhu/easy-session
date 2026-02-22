import { exec } from 'child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import type {
  CodexApprovalMode,
  CodexPermissionsMode,
  CodexSandboxMode,
  CodexSessionOptions,
  SupportedCodexApprovalMode,
  LegacyCodexApprovalMode
} from './types'

export class CodexAdapter {
  private cliManager: CliManager

  constructor(cliManager: CliManager) {
    this.cliManager = cliManager
  }

  getCliPath(): Promise<string> {
    const cmd = process.platform === 'win32' ? 'where codex' : 'which codex'
    return new Promise((resolve, reject) => {
      exec(cmd, (error, stdout) => {
        if (error) return reject(new Error('Codex CLI not found in PATH'))
        resolve(stdout.trim().split('\n')[0])
      })
    })
  }

  getVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      exec('codex --version', (error, stdout) => {
        if (error) return reject(new Error('Failed to get Codex version'))
        resolve(stdout.trim())
      })
    })
  }

  startSession(projectPath: string, options?: CodexSessionOptions): string {
    const id = `codex-${randomUUID()}`
    const args: string[] = this.buildCommonArgs(options)

    this.cliManager.spawn(id, 'codex', args, { cwd: projectPath || undefined })
    return id
  }

  resumeSession(projectPath: string, options?: CodexSessionOptions, codexSessionId?: string): string {
    if (!codexSessionId) {
      throw new Error('Codex session ID is required to resume a specific session')
    }

    const id = `codex-${randomUUID()}`
    const args: string[] = [
      ...this.buildCommonArgs(options),
      'resume',
      codexSessionId
    ]

    this.cliManager.spawn(id, 'codex', args, { cwd: projectPath || undefined })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  getConfigPaths(): { global: string } {
    return {
      global: join(homedir(), '.codex', 'config.json')
    }
  }

  findSessionIdByProjectPath(projectPath: string, targetStartMs?: number, maxSkewMs = 120_000): string | null {
    const root = join(homedir(), '.codex', 'sessions')
    if (!existsSync(root)) return null

    // Never fall back to "latest". We only accept an exact start-time anchored match.
    if (typeof targetStartMs !== 'number' || !Number.isFinite(targetStartMs)) {
      return null
    }

    const normalizedProjectPath = this.normalizePath(projectPath)
    const recentFiles = this.collectRecentSessionFiles(root)
    const candidates: Array<{ id: string; distMs: number; mtimeMs: number }> = []

    for (const file of recentFiles) {
      const meta = this.readSessionMeta(file.path)
      if (!meta) continue
      if (this.normalizePath(meta.cwd) !== normalizedProjectPath) continue
      const startedAt = meta.startedAt ?? file.mtimeMs
      // 方向约束：排除明显早于目标启动时间的旧会话（允许 2 秒时钟偏差）
      if (startedAt < targetStartMs - 2000) continue
      const distMs = Math.abs(startedAt - targetStartMs)
      if (distMs > maxSkewMs) continue
      candidates.push({
        id: meta.id,
        distMs,
        mtimeMs: file.mtimeMs
      })
    }

    if (candidates.length === 0) return null

    candidates.sort((a, b) => {
      if (a.distMs !== b.distMs) return a.distMs - b.distMs
      return b.mtimeMs - a.mtimeMs
    })
    const best = candidates[0]
    if (!best) return null

    // Ambiguous when multiple different IDs are almost equally close to target start time.
    const second = candidates.find((candidate) => candidate.id !== best.id)
    if (second) {
      if (second.distMs === best.distMs) return null
      if (second.distMs - best.distMs < 500) return null
    }

    return best.id
  }

  private normalizePath(pathValue: string): string {
    const resolved = resolve(pathValue || '.')
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }

  private collectRecentSessionFiles(root: string): Array<{ path: string; mtimeMs: number }> {
    const stack: string[] = [root]
    const files: Array<{ path: string; mtimeMs: number }> = []

    while (stack.length > 0) {
      const dir = stack.pop()!
      let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
      try {
        entries = readdirSync(dir, { withFileTypes: true, encoding: 'utf8' })
      } catch {
        continue
      }

      for (const entry of entries) {
        const fullPath = join(dir, entry.name)
        if (entry.isDirectory()) {
          stack.push(fullPath)
          continue
        }
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue

        let mtimeMs = 0
        try {
          mtimeMs = statSync(fullPath).mtimeMs
        } catch {
          continue
        }
        files.push({ path: fullPath, mtimeMs })
      }
    }

    files.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return files.slice(0, 600)
  }

  private readSessionMeta(filePath: string): { id: string; cwd: string; startedAt?: number } | null {
    try {
      const firstLine = readFileSync(filePath, 'utf8').split(/\r?\n/, 1)[0]
      if (!firstLine) return null

      const parsed = JSON.parse(firstLine) as {
        type?: string
        payload?: { id?: string; cwd?: string; timestamp?: string }
      }
      if (parsed.type !== 'session_meta') return null

      const id = parsed.payload?.id
      const cwd = parsed.payload?.cwd
      if (!id || !cwd) return null

      let startedAt: number | undefined
      const ts = parsed.payload?.timestamp
      if (typeof ts === 'string') {
        const epoch = Date.parse(ts)
        if (Number.isFinite(epoch)) startedAt = epoch
      }

      return { id, cwd, startedAt }
    } catch {
      return null
    }
  }

  private buildCommonArgs(options?: CodexSessionOptions): string[] {
    const args: string[] = []

    const inlineMode = options?.inlineMode ?? true
    if (inlineMode) {
      args.push('--no-alt-screen')
    }

    if (options?.model) {
      args.push('--model', options.model)
    }

    const permissionPreset = options?.permissionsMode
    if (permissionPreset) {
      const resolved = this.resolvePermissionsPreset(permissionPreset)
      args.push('--sandbox', resolved.sandbox, '--ask-for-approval', resolved.approval)
      return args
    }

    const resolvedLegacy = this.resolveLegacyPermissions(options?.approvalMode)
    if (resolvedLegacy) {
      args.push('--sandbox', resolvedLegacy.sandbox, '--ask-for-approval', resolvedLegacy.approval)
      return args
    }

    if (options?.sandboxMode) {
      args.push('--sandbox', options.sandboxMode)
    }

    const approvalMode = this.normalizeApprovalMode(options?.approvalMode)
    if (approvalMode) {
      args.push('--ask-for-approval', approvalMode)
    }

    return args
  }

  private normalizeApprovalMode(mode?: SupportedCodexApprovalMode): CodexApprovalMode | undefined {
    if (!mode) return undefined

    if (mode === 'suggest') return 'untrusted'
    if (mode === 'auto-edit') return 'on-request'
    if (mode === 'full-auto') return 'never'
    return mode
  }

  private resolvePermissionsPreset(mode: CodexPermissionsMode): { sandbox: CodexSandboxMode; approval: CodexApprovalMode } {
    if (mode === 'read-only') {
      return { sandbox: 'read-only', approval: 'on-request' }
    }

    if (mode === 'full-access') {
      return { sandbox: 'danger-full-access', approval: 'never' }
    }

    return { sandbox: 'workspace-write', approval: 'on-request' }
  }

  private resolveLegacyPermissions(mode?: SupportedCodexApprovalMode): { sandbox: CodexSandboxMode; approval: CodexApprovalMode } | null {
    if (!mode || !this.isLegacyApprovalMode(mode)) return null

    if (mode === 'suggest') {
      return { sandbox: 'read-only', approval: 'on-request' }
    }

    if (mode === 'full-auto') {
      return { sandbox: 'danger-full-access', approval: 'never' }
    }

    return { sandbox: 'workspace-write', approval: 'on-request' }
  }

  private isLegacyApprovalMode(mode: SupportedCodexApprovalMode): mode is LegacyCodexApprovalMode {
    return mode === 'suggest' || mode === 'auto-edit' || mode === 'full-auto'
  }
}
