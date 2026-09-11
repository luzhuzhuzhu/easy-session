import { execFile } from 'child_process'
import { open, readFile, readdir, stat } from 'fs/promises'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'
import type { CliType } from '../../shared/cli-types'
import type { NativeSessionCandidate } from '../../shared/native-session-candidates'
import {
  candidateTimestamp,
  cleanCandidateText,
  parseJsonLines,
  readBoundedText
} from './native-session-candidate-utils'

const MAX_FILES = 600
const MAX_PREFIX_BYTES = 64 * 1024
const GROK_LIST_TIMEOUT_MS = 5_000
const GROK_LIST_MAX_BUFFER = 512 * 1024

function normalizePath(value: string): string {
  const normalized = resolve(value).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

async function readPrefix(filePath: string, maxBytes = MAX_PREFIX_BYTES): Promise<string> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function listJsonlFiles(root: string, recursive: boolean): Promise<string[]> {
  const files: string[] = []
  const queue = [root]
  while (queue.length && files.length < MAX_FILES) {
    const current = queue.shift()!
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name)
      if (entry.isDirectory()) {
        if (recursive) queue.push(fullPath)
        continue
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.jsonl')) files.push(fullPath)
      if (files.length >= MAX_FILES) break
    }
  }
  return files
}

async function listProjectJsonlFiles(root: string): Promise<string[]> {
  const files: string[] = []
  let projectDirs
  try {
    projectDirs = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
  } catch {
    return files
  }
  for (const dir of projectDirs) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith('.jsonl')) files.push(join(dir, entry.name))
      if (files.length >= MAX_FILES) return files
    }
  }
  return files
}

function parseLines(prefix: string): Record<string, unknown>[] {
  return parseJsonLines(prefix)
}

function textFromMessage(message: unknown): string {
  if (typeof message === 'string') return message
  if (!message || typeof message !== 'object') return ''
  const content = (message as { content?: unknown }).content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const part = item as { type?: unknown; text?: unknown }
      return part.type === 'text' && typeof part.text === 'string' ? part.text : ''
    })
    .filter(Boolean)
    .join(' ')
}

function cleanPrompt(value: string, maxCodePoints = 120): string {
  return cleanCandidateText(value, maxCodePoints)
}

function parseUpdated(value: unknown): number {
  return candidateTimestamp(value)
}

function geminiRoot(): string {
  return process.env.GEMINI_CLI_HOME?.trim() || join(homedir(), '.gemini')
}

function firstGeminiUserPrompt(messages: unknown): string {
  if (!Array.isArray(messages)) return ''
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    const record = message as { type?: unknown; content?: unknown }
    if (record.type !== 'user') continue
    const prompt = cleanPrompt(textFromMessage({ content: record.content }))
    if (prompt && !prompt.startsWith('<session_context>')) return prompt
  }
  return ''
}

async function readGeminiProjectPath(bucketPath: string, root: string): Promise<string> {
  try {
    const marker = (await readFile(join(bucketPath, '.project_root'), 'utf8')).trim()
    if (marker) return marker
  } catch {
    // Newer Gemini CLI versions map project roots in projects.json instead of requiring a marker.
  }

  try {
    const registry = JSON.parse(await readFile(join(root, 'projects.json'), 'utf8')) as unknown
    if (!registry || typeof registry !== 'object' || Array.isArray(registry)) return ''
    const projects = (registry as { projects?: unknown }).projects
    if (!projects || typeof projects !== 'object' || Array.isArray(projects)) return ''
    const bucket = basename(bucketPath)
    return Object.entries(projects as Record<string, unknown>)
      .find(([, shortId]) => typeof shortId === 'string' && shortId === bucket)?.[0] || ''
  } catch {
    return ''
  }
}

async function parseGeminiSessionFile(filePath: string): Promise<Record<string, unknown> | null> {
  if (filePath.toLowerCase().endsWith('.jsonl')) {
    const records = parseLines(await readPrefix(filePath))
    const ids = new Set(records.map((record) => typeof record.sessionId === 'string' ? record.sessionId.trim() : '').filter(Boolean))
    if (ids.size !== 1) return null
    const messages = records.flatMap((record) => {
      if (Array.isArray(record.messages)) return record.messages
      return record.type === 'user' ? [record] : []
    })
    return {
      sessionId: [...ids][0],
      messages,
      startTime: records.map((record) => record.startTime).find((value) => parseUpdated(value) > 0),
      lastUpdated: Math.max(...records.flatMap((record) => [parseUpdated(record.lastUpdated), parseUpdated(record.timestamp)]))
    }
  }
  try {
    const value = JSON.parse(await readBoundedText(filePath, 1024 * 1024)) as unknown
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
  } catch {
    return null
  }
}

/**
 * Reads Gemini CLI's project-scoped chat records. A candidate is emitted only when both
 * the full resume UUID and the bucket's real project root are available from persisted metadata.
 */
export async function collectGeminiSessionCandidates(
  projectPath: string,
  root = geminiRoot()
): Promise<NativeSessionCandidate[]> {
  const target = normalizePath(projectPath)
  const tmpRoot = join(root, 'tmp')
  let buckets
  try {
    buckets = (await readdir(tmpRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory())
  } catch {
    return []
  }

  const candidates: NativeSessionCandidate[] = []
  const seen = new Set<string>()
  let scanned = 0
  for (const bucket of buckets) {
    if (scanned >= MAX_FILES) break
    const bucketPath = join(tmpRoot, bucket.name)
    const cwd = await readGeminiProjectPath(bucketPath, root)
    if (!cwd || normalizePath(cwd) !== target) continue

    let files
    try {
      files = (await readdir(join(bucketPath, 'chats'), { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /^session-.*\.jsonl?$/i.test(entry.name))
    } catch {
      continue
    }

    for (const file of files) {
      if (scanned++ >= MAX_FILES) break
      const filePath = join(bucketPath, 'chats', file.name)
      try {
        const record = await parseGeminiSessionFile(filePath)
        const id = typeof record?.sessionId === 'string' ? record.sessionId.trim() : ''
        if (!UUID_PATTERN.test(id) || seen.has(id)) continue
        const fileUpdated = (await stat(filePath)).mtimeMs
        const content = firstGeminiUserPrompt(record?.messages)
        const title = content
        candidates.push({
          id,
          title: title || 'Gemini session',
          content: content || undefined,
          titleSource: content ? 'first-user-message' : 'fallback',
          updated: Math.max(fileUpdated, parseUpdated(record?.lastUpdated), parseUpdated(record?.startTime)),
          projectPath: cwd
        })
        seen.add(id)
      } catch {
        continue
      }
    }
  }

  return candidates.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
}

export interface ClaudeSessionCandidatePaths {
  configRoot?: string
  projectsRoot?: string
  historyPath?: string
}

function claudeConfigRoot(): string {
  return process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), '.claude')
}

export function collectClaudeSessionCandidates(
  projectPath: string,
  projectsRoot?: string,
  historyPath?: string
): Promise<NativeSessionCandidate[]>
export function collectClaudeSessionCandidates(
  projectPath: string,
  paths?: ClaudeSessionCandidatePaths
): Promise<NativeSessionCandidate[]>
export async function collectClaudeSessionCandidates(
  projectPath: string,
  projectsRootOrPaths?: string | ClaudeSessionCandidatePaths,
  injectedHistoryPath?: string
): Promise<NativeSessionCandidate[]> {
  const usesLegacyPaths = typeof projectsRootOrPaths === 'string' || injectedHistoryPath !== undefined
  const configRoot = typeof projectsRootOrPaths === 'object'
    ? projectsRootOrPaths.configRoot?.trim() || claudeConfigRoot()
    : claudeConfigRoot()
  const projectsRoot = usesLegacyPaths
    ? typeof projectsRootOrPaths === 'string' ? projectsRootOrPaths : join(configRoot, 'projects')
    : projectsRootOrPaths?.projectsRoot?.trim() || join(configRoot, 'projects')
  const historyPath = usesLegacyPaths
    ? injectedHistoryPath || join(projectsRoot, '..', 'history.jsonl')
    : projectsRootOrPaths?.historyPath?.trim() || join(configRoot, 'history.jsonl')
  const target = normalizePath(projectPath)
  const files = await listProjectJsonlFiles(projectsRoot)
  const candidates: NativeSessionCandidate[] = []
  const seen = new Set<string>()

  for (const filePath of files) {
    let records: Record<string, unknown>[]
    let updated: number
    try {
      records = parseLines(await readPrefix(filePath))
      updated = (await stat(filePath)).mtimeMs
    } catch {
      continue
    }

    const idFromRecord = records.find((record) => typeof record.sessionId === 'string')?.sessionId as string | undefined
    const id = idFromRecord?.trim() || ''
    if (!id || seen.has(id)) continue

    const cwd = records
      .map((record) => (typeof record.cwd === 'string' ? record.cwd.trim() : ''))
      .find(Boolean)
    if (!cwd || normalizePath(cwd) !== target) continue

    const summary = records.find((record) => typeof record.summary === 'string')?.summary as string | undefined
    const aiTitleRecord = records.find((record) => record.type === 'ai-title' || typeof record.aiTitle === 'string')
    const aiTitle = typeof aiTitleRecord?.aiTitle === 'string'
      ? aiTitleRecord.aiTitle
      : typeof aiTitleRecord?.title === 'string' ? aiTitleRecord.title : ''
    const prompt = records
      .filter((record) => record.type === 'user' && record.isMeta !== true)
      .map((record) => cleanPrompt(textFromMessage(record.message), 240))
      .find(Boolean)
    const recordUpdated = records
      .map((record) => parseUpdated(record.timestamp))
      .filter((value) => value > 0)
      .pop() || 0
    const content = cleanPrompt(prompt || '', 240)
    const title = cleanPrompt(summary || aiTitle || content) || 'Claude session'
    candidates.push({
      id,
      title,
      content: content || undefined,
      titleSource: summary ? 'summary' : aiTitle ? 'session-title' : content ? 'first-user-message' : 'fallback',
      updated: Math.max(updated, recordUpdated),
      projectPath: cwd
    })
    seen.add(id)
  }

  try {
    const history = parseLines(await readPrefix(historyPath, 512 * 1024))
    for (const record of history) {
      const id = typeof record.sessionId === 'string' ? record.sessionId.trim() :
        typeof record.session_id === 'string' ? record.session_id.trim() : ''
      const cwd = typeof record.project === 'string' ? record.project.trim() :
        typeof record.projectPath === 'string' ? record.projectPath.trim() :
          typeof record.cwd === 'string' ? record.cwd.trim() : ''
      if (!id || seen.has(id) || !cwd || normalizePath(cwd) !== target) continue
      const content = cleanPrompt(
        typeof record.display === 'string' ? record.display : typeof record.text === 'string' ? record.text : '',
        240
      )
      const title = cleanPrompt(content) || 'Claude session'
      candidates.push({
        id,
        title,
        content: content || undefined,
        titleSource: content ? 'first-user-message' : 'fallback',
        updated: Math.max(parseUpdated(record.timestamp), parseUpdated(record.ts)),
        projectPath: cwd
      })
      seen.add(id)
    }
  } catch {
    // History is an optional fallback source.
  }

  return candidates.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0) || a.id.localeCompare(b.id))
}

function piRoot(): string {
  return process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), '.pi', 'agent')
}

function ompRoots(): string[] {
  const roots = new Set<string>()
  const explicit = process.env.PI_CODING_AGENT_DIR?.trim()
  if (explicit) roots.add(explicit)
  const profile = process.env.OMP_PROFILE?.trim() || process.env.PI_PROFILE?.trim()
  if (profile) roots.add(join(homedir(), '.omp', 'profiles', profile, 'agent'))
  roots.add(join(homedir(), '.omp', 'agent'))
  return [...roots]
}

async function collectPiFamily(
  cliType: 'pi' | 'omp',
  projectPath: string,
  roots: string[]
): Promise<NativeSessionCandidate[]> {
  const target = normalizePath(projectPath)
  const candidates: NativeSessionCandidate[] = []
  const seen = new Set<string>()

  for (const root of roots) {
    const sessionRoot = join(root, 'sessions')
    const files = await listJsonlFiles(sessionRoot, false)
    // listJsonlFiles(false) only sees files directly under sessions; Pi/OMP store one bucket per directory.
    let bucketDirs: string[]
    try {
      bucketDirs = (await readdir(sessionRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(sessionRoot, entry.name))
    } catch {
      bucketDirs = []
    }
    const bucketFiles = (await Promise.all(bucketDirs.map((bucket) => listJsonlFiles(bucket, false)))).flat()
    for (const filePath of [...files, ...bucketFiles].slice(0, MAX_FILES)) {
      let records: Record<string, unknown>[]
      let updated: number
      try {
        records = parseLines(await readPrefix(filePath, 32 * 1024))
        updated = (await stat(filePath)).mtimeMs
      } catch {
        continue
      }

      const headerIndex = records.findIndex((record) => record.type === 'session' && typeof record.id === 'string')
      if (headerIndex < 0) continue
      const header = records[headerIndex]
      const cwd = typeof header.cwd === 'string' ? header.cwd.trim() : ''
      if (!cwd || normalizePath(cwd) !== target) continue
      const id = String(header.id).trim()
      if (!id || seen.has(id)) continue

      const titleSlot = cliType === 'omp'
        ? records.find((record) => record.type === 'title' && typeof record.title === 'string')
        : undefined
      const title = typeof titleSlot?.title === 'string'
        ? titleSlot.title.trim()
        : typeof header.title === 'string'
          ? header.title.trim()
          : ''
      const content = records
        .filter((record) => record.type === 'message' || record.type === 'user' || record.role === 'user')
        .map((record) => cleanPrompt(textFromMessage(record.message ?? record.content)))
        .find(Boolean)
      const cleanedTitle = cleanPrompt(title)
      candidates.push({
        id,
        title: cleanedTitle || content || `${cliType === 'pi' ? 'Pi' : 'OMP'} session`,
        content: content || undefined,
        titleSource: cleanedTitle ? 'session-title' : content ? 'first-user-message' : 'fallback',
        updated: Math.max(updated, parseUpdated(header.timestamp)),
        projectPath: cwd
      })
      seen.add(id)
    }
  }

  return candidates.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
}

export async function collectPiSessionCandidates(projectPath: string, roots: string[] = [piRoot()]): Promise<NativeSessionCandidate[]> {
  return collectPiFamily('pi', projectPath, roots)
}

export async function collectOmpSessionCandidates(projectPath: string, roots: string[] = ompRoots()): Promise<NativeSessionCandidate[]> {
  return collectPiFamily('omp', projectPath, roots)
}

interface SqliteStatement {
  all(...params: unknown[]): unknown[]
}

interface ReadonlySqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): SqliteStatement
  close(): void
}

export type ReadonlySqliteOpener = (filePath: string) => Promise<ReadonlySqliteDatabase>

export class HermesCandidatesUnsupportedError extends Error {
  constructor(message = 'Hermes session discovery requires read-only node:sqlite support') {
    super(message)
    this.name = 'HermesCandidatesUnsupportedError'
  }
}

async function openReadonlySqlite(filePath: string): Promise<ReadonlySqliteDatabase> {
  let sqlite: typeof import('node:sqlite')
  try {
    sqlite = await import('node:sqlite')
  } catch {
    throw new HermesCandidatesUnsupportedError()
  }
  const database = new sqlite.DatabaseSync(filePath, { readOnly: true })
  database.exec('PRAGMA query_only = ON')
  return database
}

const HERMES_REQUIRED_SESSION_COLUMNS = ['id', 'title', 'cwd', 'started_at', 'last_activity_at']
const HERMES_REQUIRED_MESSAGE_COLUMNS = ['id', 'session_id', 'role', 'content', 'timestamp', 'active']

function sqliteColumns(database: ReadonlySqliteDatabase, table: 'sessions' | 'messages'): Set<string> {
  return new Set(database.prepare(`PRAGMA table_info(${table})`).all()
    .map((row) => row && typeof row === 'object' ? (row as { name?: unknown }).name : undefined)
    .filter((name): name is string => typeof name === 'string'))
}

function assertHermesSchema(database: ReadonlySqliteDatabase): void {
  const sessions = sqliteColumns(database, 'sessions')
  const messages = sqliteColumns(database, 'messages')
  if (!HERMES_REQUIRED_SESSION_COLUMNS.every((column) => sessions.has(column)) ||
      !HERMES_REQUIRED_MESSAGE_COLUMNS.every((column) => messages.has(column))) {
    throw new HermesCandidatesUnsupportedError('Unsupported Hermes state.db schema')
  }
}

function flattenHermesContent(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/^\x00+/, '')
  const rawJson = normalized.startsWith('json:')
    ? normalized.slice('json:'.length)
    : normalized.trim().startsWith('[') || normalized.trim().startsWith('{') ? normalized : ''
  if (!rawJson) return normalized
  try {
    const decoded = JSON.parse(rawJson) as unknown
    if (typeof decoded === 'string') return decoded
    const flatten = (item: unknown): string => {
      if (typeof item === 'string') return item
      if (!item || typeof item !== 'object') return ''
      if (Array.isArray(item)) return item.map(flatten).filter(Boolean).join(' ')
      const record = item as { text?: unknown; content?: unknown }
      if (typeof record.text === 'string') return record.text
      return flatten(record.content)
    }
    return flatten(decoded)
  } catch {
    return ''
  }
}

function hermesTimestampMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value * 1000 : 0
}

export async function collectHermesSessionCandidates(
  projectPath: string,
  stateDbPath = join(homedir(), '.hermes', 'state.db'),
  maxCount = 40,
  opener: ReadonlySqliteOpener = openReadonlySqlite
): Promise<NativeSessionCandidate[]> {
  const target = normalizePath(projectPath)
  const limit = Math.min(100, Math.max(1, Math.trunc(maxCount) || 40))
  let database: ReadonlySqliteDatabase | undefined

  try {
    database = await opener(stateDbPath)
    assertHermesSchema(database)
    const cwdPredicate = process.platform === 'win32'
      ? "LOWER(REPLACE(RTRIM(s.cwd, '/\\'), '/', '\\')) = ?"
      : "RTRIM(s.cwd, '/') = ?"
    const rows = database.prepare(`
      SELECT s.id, s.title, s.cwd, s.started_at, s.last_activity_at,
        (SELECT HEX(m.content) FROM messages m
          WHERE m.session_id = s.id AND m.role = 'user' AND m.active = 1
          ORDER BY m.id ASC LIMIT 1) AS first_user_content_hex,
        (SELECT MAX(m.timestamp) FROM messages m
          WHERE m.session_id = s.id AND m.active = 1) AS last_message_at
      FROM sessions s
      WHERE s.cwd IS NOT NULL AND TRIM(s.cwd) <> '' AND ${cwdPredicate}
      ORDER BY COALESCE(s.last_activity_at, s.started_at) DESC, s.started_at DESC, s.id DESC
      LIMIT ?
    `).all(target, limit)

    const candidates: NativeSessionCandidate[] = []
    const seen = new Set<string>()
    for (const value of rows) {
      if (!value || typeof value !== 'object') continue
      const row = value as Record<string, unknown>
      const id = typeof row.id === 'string' ? row.id.trim() : ''
      const cwd = typeof row.cwd === 'string' ? row.cwd.trim() : ''
      if (!id || !cwd || seen.has(id) || normalizePath(cwd) !== target) continue
      const hermesHex = typeof row.first_user_content_hex === 'string' ? row.first_user_content_hex : ''
      const rawHermesContent = hermesHex && /^[0-9a-f]+$/i.test(hermesHex)
        ? Buffer.from(hermesHex, 'hex').toString('utf8')
        : row.first_user_content
      const content = cleanPrompt(flattenHermesContent(rawHermesContent))
      const storedTitle = cleanPrompt(typeof row.title === 'string' ? row.title : '')
      const title = storedTitle || content || 'Hermes session'
      candidates.push({
        id,
        title,
        content: content || (storedTitle ? undefined : title),
        titleSource: storedTitle ? 'session-title' : content ? 'first-user-message' : 'fallback',
        updated: Math.max(
          hermesTimestampMs(row.last_activity_at),
          hermesTimestampMs(row.last_message_at),
          hermesTimestampMs(row.started_at)
        ),
        projectPath: cwd
      })
      seen.add(id)
      if (candidates.length >= limit) break
    }
    return candidates
  } catch (error) {
    if (error instanceof HermesCandidatesUnsupportedError) throw error
    // Missing/unreadable/corrupt local state must not break the resume form.
    return []
  } finally {
    try {
      database?.close()
    } catch {
      // Ignore close failures from a damaged database handle.
    }
  }
}

export type GrokSessionListRunner = (
  executable: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number; windowsHide: boolean }
) => Promise<{ stdout: string; stderr: string }>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const GROK_HEADER_PATTERN = /^SESSION ID\s{2,}CREATED\s{2,}UPDATED\s{2,}STATUS(?:\s{2,}SUMMARY)?\s*$/
const GROK_SUMMARY_HEADER_PATTERN = /^\s{2}SUMMARY\s*$/
const GROK_LABEL_PATTERN = /^Label: (?:\(no label\)|[^\s].*)$/
const GROK_STATUS_VALUES = new Set(['local', 'remote', 'both', 'synced', 'unsynced', 'completed', 'future', 'phase', 'removed', 'session', 'ab', 'pool', 'manual', 'alive', 'dead'])
const GROK_ROW_PATTERN = /^(?<id>[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\s{2,}(?<created>\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:Z| ?UTC)?)?)\s{2,}(?<updated>\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?(?:Z| ?UTC)?)?)\s{2,}(?<status>[a-z]+)(?:\s{2,}(?<summary>\S(?:.*\S)?))?\s*$/i
const GROK_SUMMARY_ROW_PATTERN = /^\s{2}(?<summary>\S(?:.*\S)?)\s*$/

function runGrokSessionList(
  executable: string,
  args: string[],
  options: { cwd: string; timeout: number; maxBuffer: number; windowsHide: boolean }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolveResult, reject) => {
    execFile(executable, args, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(error.killed ? 'Grok session listing timed out' : 'Failed to list Grok sessions'))
        return
      }
      resolveResult({ stdout: String(stdout), stderr: String(stderr) })
    })
  })
}

function parseGrokTimestamp(value: string): number {
  const normalized = value.endsWith(' UTC')
    ? `${value.slice(0, -4).replace(' ', 'T')}Z`
    : /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00Z`
      : value
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseGrokSessionListOutput(output: string, projectPath: string): NativeSessionCandidate[] {
  const text = output.replace(/\r\n/g, '\n').trim()
  if (text === 'No sessions found.') return []
  const lines = text.split('\n')
  const headerIndex = lines.findIndex((line) => GROK_HEADER_PATTERN.test(line))
  if (headerIndex < 0 || lines.slice(0, headerIndex).some((line) => line.trim() && !GROK_LABEL_PATTERN.test(line))) {
    throw new Error('Unsupported Grok sessions list format')
  }
  const splitSummary = GROK_SUMMARY_HEADER_PATTERN.test(lines[headerIndex + 1] || '')
  const rowLines = lines.slice(headerIndex + (splitSummary ? 2 : 1)).filter((line) => line.trim())

  const candidates: NativeSessionCandidate[] = []
  const seen = new Set<string>()
  for (let index = 0; index < rowLines.length;) {
    const line = rowLines[index]
    const match = GROK_ROW_PATTERN.exec(line)
    if (!match?.groups) throw new Error('Unsupported Grok sessions list format')
    const splitTitle = splitSummary ? GROK_SUMMARY_ROW_PATTERN.exec(rowLines[index + 1] || '')?.groups?.summary : undefined
    if (splitSummary && !splitTitle) throw new Error('Unsupported Grok sessions list format')
    const id = match.groups.id
    const updated = parseGrokTimestamp(match.groups.updated)
    const title = (match.groups.summary || splitTitle || '').trim()
    if (!UUID_PATTERN.test(id) || !GROK_STATUS_VALUES.has(match.groups.status.toLowerCase()) || !updated || !title || seen.has(id)) {
      throw new Error('Invalid Grok session list row')
    }
    candidates.push({ id, title: cleanPrompt(title), titleSource: 'summary', updated, projectPath })
    seen.add(id)
    index += splitSummary ? 2 : 1
  }
  return candidates.sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0))
}

export async function collectGrokSessionCandidates(
  projectPath: string,
  preferredPath?: string,
  maxCount = 40,
  runner: GrokSessionListRunner = runGrokSessionList
): Promise<NativeSessionCandidate[]> {
  const cwd = resolve(projectPath)
  const executable = preferredPath?.trim() || 'grok'
  const limit = Math.min(100, Math.max(1, Math.trunc(maxCount) || 40))
  const { stdout, stderr } = await runner(
    executable,
    ['sessions', 'list', '--limit', String(limit)],
    { cwd, timeout: GROK_LIST_TIMEOUT_MS, maxBuffer: GROK_LIST_MAX_BUFFER, windowsHide: true }
  )
  if (stderr.trim()) throw new Error('Grok sessions list wrote unexpected stderr output')
  return parseGrokSessionListOutput(stdout, cwd).slice(0, limit)
}

export type CandidateCollector = (projectPath: string, preferredPath?: string, maxCount?: number) => Promise<NativeSessionCandidate[]>

export function limitCandidates(collector: CandidateCollector, maxCount = 40): CandidateCollector {
  return async (projectPath, preferredPath, requested = maxCount) => {
    const result = await collector(projectPath, preferredPath, requested)
    return result.slice(0, Math.max(1, requested))
  }
}

export function candidateCollectorFor(cliType: CliType): CandidateCollector | null {
  if (cliType === 'claude') return (projectPath, _preferredPath, maxCount = 40) => collectClaudeSessionCandidates(projectPath).then((items) => items.slice(0, maxCount))
  if (cliType === 'gemini') return (projectPath, _preferredPath, maxCount = 40) => collectGeminiSessionCandidates(projectPath).then((items) => items.slice(0, maxCount))
  if (cliType === 'pi') return (projectPath, _preferredPath, maxCount = 40) => collectPiSessionCandidates(projectPath).then((items) => items.slice(0, maxCount))
  if (cliType === 'omp') return (projectPath, _preferredPath, maxCount = 40) => collectOmpSessionCandidates(projectPath).then((items) => items.slice(0, maxCount))
  if (cliType === 'grok') return collectGrokSessionCandidates
  if (cliType === 'hermes') return (projectPath, _preferredPath, maxCount = 40) => collectHermesSessionCandidates(projectPath, undefined, maxCount)
  return null
}

