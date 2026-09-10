import { exec } from 'child_process'
import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { randomUUID } from 'crypto'
import { CliManager } from './cli-manager'
import { normalizeCustomCliArgs } from './cli-args'
import {
  candidateTimestamp,
  cleanCandidateText,
  findJsonLine,
  parseJsonLines,
  readBoundedPrefix,
  type NativeSessionTitleSource
} from './native-session-candidate-utils'
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
      exec(cmd, { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error('Codex CLI not found in PATH'))
        resolve(stdout.trim().split('\n')[0])
      })
    })
  }

  getVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      exec('codex --version', { timeout: 5000 }, (error, stdout) => {
        if (error) return reject(new Error('Failed to get Codex version'))
        resolve(stdout.trim())
      })
    })
  }

  startSession(projectPath: string, options?: CodexSessionOptions): string {
    const id = `codex-${randomUUID()}`
    const args: string[] = this.buildCommonArgs(options)

    const executable = options?.cliPath?.trim() || 'codex'
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
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

    const executable = options?.cliPath?.trim() || 'codex'
    this.cliManager.spawn(id, executable, args, { cwd: projectPath || undefined })
    return id
  }

  sendCommand(sessionId: string, command: string): boolean {
    return this.cliManager.write(sessionId, command + '\n')
  }

  getConfigPaths(): { global: string } {
    return {
      global: join(this.codexRoot(), 'config.json')
    }
  }

  private codexRoot(): string {
    return process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  }

  async collectSessionCandidatesByPath(
    projectPath: string,
    maxCount = 40
  ): Promise<Array<{ id: string; title: string; content?: string; titleSource: NativeSessionTitleSource; updated: number; projectPath: string }>> {
    const codexRoot = this.codexRoot()
    const root = join(codexRoot, 'sessions')
    if (!existsSync(root)) return []

    const limit = Math.min(100, Math.max(1, Math.trunc(maxCount) || 40))
    const normalizedProjectPath = this.normalizePath(projectPath)
    const [files, indexRecords, historyRecords] = await Promise.all([
      this.collectRecentSessionFiles(root),
      this.readOptionalJsonl(join(codexRoot, 'session_index.jsonl'), 512 * 1024),
      this.readOptionalJsonl(join(codexRoot, 'history.jsonl'), 1024 * 1024)
    ])
    const indexById = new Map<string, { title: string; updated: number }>()
    for (const record of indexRecords) {
      const id = this.stringField(record, ['id', 'session_id', 'sessionId'])
      if (!id) continue
      const title = cleanCandidateText(this.stringField(record, ['thread_name', 'threadName']), 120)
      const updated = Math.max(...['updated_at', 'updatedAt', 'timestamp', 'ts'].map((key) => candidateTimestamp(record[key])))
      const previous = indexById.get(id)
      if (!previous || updated >= previous.updated) indexById.set(id, { title: title || previous?.title || '', updated })
    }
    const historyById = new Map<string, { content: string; updated: number }>()
    for (const record of historyRecords) {
      const id = this.stringField(record, ['session_id', 'sessionId', 'id'])
      if (!id) continue
      const content = cleanCandidateText(this.stringField(record, ['text', 'content']))
      const updated = Math.max(...['ts', 'timestamp', 'updated_at', 'updatedAt'].map((key) => candidateTimestamp(record[key])))
      const previous = historyById.get(id)
      if (!previous) historyById.set(id, { content, updated })
      else historyById.set(id, { content: previous.content || content, updated: Math.max(previous.updated, updated) })
    }

    const candidates: Array<{ id: string; title: string; content?: string; titleSource: NativeSessionTitleSource; updated: number; projectPath: string }> = []
    const seen = new Set<string>()
    for (const file of files) {
      const session = await this.readSessionCandidate(file.path)
      if (!session || this.normalizePath(session.cwd) !== normalizedProjectPath || seen.has(session.id)) continue
      seen.add(session.id)
      const index = indexById.get(session.id)
      const history = historyById.get(session.id)
      const content = session.content || history?.content || ''
      const title = index?.title || content || 'Codex session'
      candidates.push({
        id: session.id,
        title,
        content: content || undefined,
        titleSource: index?.title ? 'session-title' : content ? 'first-user-message' : 'fallback',
        updated: Math.max(session.startedAt ?? 0, file.mtimeMs, index?.updated ?? 0, history?.updated ?? 0),
        projectPath: session.cwd
      })
    }

    return candidates
      .sort((a, b) => b.updated - a.updated || a.id.localeCompare(b.id))
      .slice(0, limit)
  }

  async findSessionIdByProjectPath(projectPath: string, targetStartMs?: number, maxSkewMs = 120_000): Promise<string | null> {
    const root = join(this.codexRoot(), 'sessions')
    if (!existsSync(root)) return null

    // Never fall back to "latest". We only accept an exact start-time anchored match.
    if (typeof targetStartMs !== 'number' || !Number.isFinite(targetStartMs)) {
      return null
    }

    const normalizedProjectPath = this.normalizePath(projectPath)
    const recentFiles = await this.collectRecentSessionFiles(root)
    const candidates: Array<{ id: string; distMs: number; mtimeMs: number }> = []

    for (const file of recentFiles) {
      const meta = await this.readSessionMeta(file.path)
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

  private async collectRecentSessionFiles(root: string): Promise<Array<{ path: string; mtimeMs: number }>> {
    const stack: string[] = [root]
    const files: Array<{ path: string; mtimeMs: number }> = []

    while (stack.length > 0) {
      const dir = stack.pop()!
      let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
      try {
        entries = await readdir(dir, { withFileTypes: true, encoding: 'utf8' })
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
          mtimeMs = (await stat(fullPath)).mtimeMs
        } catch {
          continue
        }
        files.push({ path: fullPath, mtimeMs })
      }
    }

    files.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return files.slice(0, 600)
  }

  private async readOptionalJsonl(filePath: string, maxBytes: number): Promise<Record<string, unknown>[]> {
    try {
      return parseJsonLines(await readBoundedPrefix(filePath, maxBytes))
    } catch {
      return []
    }
  }

  private stringField(record: Record<string, unknown>, fields: readonly string[]): string {
    return fields
      .map((field) => typeof record[field] === 'string' ? record[field].trim() : '')
      .find(Boolean) || ''
  }

  private isSubagentSource(source: unknown): boolean {
    if (typeof source === 'string') return /subagent|guardian/i.test(source)
    if (!source || typeof source !== 'object' || Array.isArray(source)) return false
    return Object.keys(source as Record<string, unknown>).some((key) => /subagent|guardian/i.test(key)) ||
      Object.values(source as Record<string, unknown>).some((value) => this.isSubagentSource(value))
  }

  private codexUserContent(record: Record<string, unknown>): string {
    if (record.type !== 'response_item' || !record.payload || typeof record.payload !== 'object') return ''
    const payload = record.payload as Record<string, unknown>
    if (payload.type !== 'message' || payload.role !== 'user' || !Array.isArray(payload.content)) return ''
    return cleanCandidateText(payload.content.map((part) => {
      if (!part || typeof part !== 'object') return ''
      const item = part as Record<string, unknown>
      return item.type === 'input_text' && typeof item.text === 'string' ? item.text : ''
    }).filter(Boolean).join(' '))
  }

  private async readSessionCandidate(filePath: string): Promise<{ id: string; cwd: string; startedAt?: number; content: string } | null> {
    try {
      const meta = await this.readSessionMeta(filePath)
      if (!meta) return null
      const userRecord = await findJsonLine(filePath, (record) => Boolean(this.codexUserContent(record)), 1024 * 1024)
      return { ...meta, content: userRecord ? this.codexUserContent(userRecord) : '' }
    } catch {
      return null
    }
  }

  private async readSessionMeta(filePath: string): Promise<{ id: string; cwd: string; startedAt?: number } | null> {
    try {
      const first = parseJsonLines(await readBoundedPrefix(filePath, 64 * 1024))[0]
      if (first?.type !== 'session_meta' || !first.payload || typeof first.payload !== 'object') return null
      const payload = first.payload as Record<string, unknown>
      const id = typeof payload.id === 'string' ? payload.id.trim() : ''
      const cwd = typeof payload.cwd === 'string' ? payload.cwd.trim() : ''
      if (!id || !cwd || this.isSubagentSource(payload.source)) return null
      const timestamp = candidateTimestamp(payload.timestamp)
      return { id, cwd, startedAt: timestamp || undefined }
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
      args.push(...normalizeCustomCliArgs(options?.customArgs))
      return args
    }

    const resolvedLegacy = this.resolveLegacyPermissions(options?.approvalMode)
    if (resolvedLegacy) {
      args.push('--sandbox', resolvedLegacy.sandbox, '--ask-for-approval', resolvedLegacy.approval)
      args.push(...normalizeCustomCliArgs(options?.customArgs))
      return args
    }

    if (options?.sandboxMode) {
      args.push('--sandbox', options.sandboxMode)
    }

    const approvalMode = this.normalizeApprovalMode(options?.approvalMode)
    if (approvalMode) {
      args.push('--ask-for-approval', approvalMode)
    }

    args.push(...normalizeCustomCliArgs(options?.customArgs))

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
