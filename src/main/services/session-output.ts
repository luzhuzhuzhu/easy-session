import { BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile, rm, readdir } from 'fs/promises'
import { join } from 'path'
import { Protocol } from './protocol'
import { createLogger } from './logger'

const log = createLogger('output-journal')

export interface OutputLine {
  text: string
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq: number
}

export interface SessionOutputEvent {
  sessionId: string
  data: string
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq: number
}

const MAX_BUFFER_LINES = 50000
// 超过该长度的 chunk 跳过协议扫描（MB 级 chunk 全文 includes 扫描是刷屏时的主进程 CPU 热点）。
// 协议消息（[CCM-PROTOCOL v1]...）最大 64KB（parseMessage 硬限），更大的 chunk 不可能是协议消息。
const PROTOCOL_SCAN_MAX_LENGTH = 65536
// 单次 IPC 合帧窗口：把该时间窗内到达的 chunk 拼接后一次发送，大幅降低刷屏时的 IPC 频率。
const FLUSH_INTERVAL_MS = 16
// 输出日志（output journal）：每个会话退出/应用关闭时把最近 N 条落盘一份纯文本，
// 应用重启后内存缓冲为空，可从这里回灌，救急 terminal 会话的构建日志/报错现场。
const JOURNAL_LINES = 2000

interface PendingWindowPayload {
  chunks: string[]
  stream: 'stdout' | 'stderr'
  timestamp: number
  seq: number
  protocolMessages: unknown[]
  dirty: boolean
}

interface SessionBufferState {
  lines: OutputLine[]
  start: number
  size: number
  nextSeq: number
}

function createBufferState(): SessionBufferState {
  return {
    lines: [],
    start: 0,
    size: 0,
    nextSeq: 0
  }
}

export class SessionOutputManager {
  private buffers = new Map<string, SessionBufferState>()
  private listeners = new Set<(event: SessionOutputEvent) => void>()
  private pendingWindows = new Map<string, PendingWindowPayload>()
  private pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private journalDir: string | null = null
  private pendingJournalWrites = new Map<string, Promise<void>>()

  // 注入 userData 目录后启用 output journal；不注入（单测）时为纯内存行为。
  setJournalDir(dir: string | null): void {
    this.journalDir = dir
  }

  private journalPath(sessionId: string): string | null {
    if (!this.journalDir) return null
    return join(this.journalDir, `${sessionId}.log`)
  }

  // 把会话最近 N 条输出写成纯文本日志。返回 Promise 供退出流程等待落盘完成；
  // 失败仅记日志，不影响主流程。空缓冲返回已完成的 Promise 且不碰磁盘。
  // meta 写成首行 HTML 注释样式的元数据，肉眼可辨又不干扰 tail/grep 排查。
  writeJournal(sessionId: string, meta?: { name?: string; type?: string }): Promise<void> {
    const path = this.journalPath(sessionId)
    if (!path) return Promise.resolve()
    const lines = this.getHistory(sessionId, JOURNAL_LINES)
    if (lines.length === 0) return Promise.resolve()
    const header = meta?.name || meta?.type
      ? `<!-- easysession journal | session: ${sessionId}${meta?.name ? ` | name: ${meta.name}` : ''}${meta?.type ? ` | type: ${meta.type}` : ''} | saved: ${new Date().toISOString()} -->\n`
      : ''
    const text = header + lines.map((line) => line.text).join('')
    const writePromise = mkdir(this.journalDir!, { recursive: true })
      .then(() => writeFile(path, text, 'utf8'))
      .catch((err) => log.warn({ err }, `[journal] write failed for ${sessionId}`))
      .finally(() => {
        const current = this.pendingJournalWrites.get(sessionId)
        if (current === writePromise) this.pendingJournalWrites.delete(sessionId)
      })
    this.pendingJournalWrites.set(sessionId, writePromise)
    return writePromise
  }

  // 应用启动时把上一次的 journal 回灌进内存缓冲（历史 seq 重新从 1 编号，仅用于展示）。
  async restoreJournal(sessionId: string): Promise<void> {
    const path = this.journalPath(sessionId)
    if (!path) return
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      return
    }
    if (!text) return
    const state = this.ensureBuffer(sessionId)
    if (state.size > 0) return
    const chunkSize = 64 * 1024
    for (let offset = 0; offset < text.length; offset += chunkSize) {
      const chunk = text.slice(offset, offset + chunkSize)
      state.nextSeq += 1
      this.appendLine(state, {
        text: chunk,
        stream: 'stdout',
        timestamp: Date.now(),
        seq: state.nextSeq
      })
    }
  }

  async removeJournal(sessionId: string): Promise<void> {
    const path = this.journalPath(sessionId)
    if (!path) return
    await rm(path, { force: true }).catch(() => undefined)
  }

  // STAB-7：启动时清理孤儿 journal——会话已不存在（sessions.json 损坏恢复/删除流程中断）
  // 但 .log 残留在磁盘上。只删除 ids 显式给出的「活会话集合」之外的文件，防误删。
  async reconcileJournals(aliveSessionIds: Iterable<string>): Promise<number> {
    if (!this.journalDir) return 0
    let names: string[]
    try {
      names = await readdir(this.journalDir)
    } catch {
      return 0
    }
    const alive = new Set(aliveSessionIds)
    let removed = 0
    for (const name of names) {
      if (!name.endsWith('.log')) continue
      const sessionId = name.slice(0, -'.log'.length)
      if (alive.has(sessionId)) continue
      await rm(join(this.journalDir, name), { force: true }).catch(() => undefined)
      removed += 1
    }
    if (removed > 0) {
      log.info(`[journal] reconciled ${removed} orphan journal file(s)`)
    }
    return removed
  }

  // UX-9：跨会话输出全文搜索——扫描 journal 目录，返回含关键词的会话与命中行。
  // 内存缓冲优先（运行中会话），journal 兜底（已退出会话）。每会话最多返回 limit 行。
  async searchJournals(
    query: string,
    options?: { limitPerSession?: number; sessionNames?: Map<string, { name?: string; type?: string }> }
  ): Promise<
    Array<{ sessionId: string; name?: string; type?: string; matches: Array<{ line: string; fromMemory: boolean }> }>
  > {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return []
    const limitPerSession = Math.min(Math.max(options?.limitPerSession ?? 5, 1), 50)
    const results: Array<{
      sessionId: string
      name?: string
      type?: string
      matches: Array<{ line: string; fromMemory: boolean }>
    }> = []

    const sessionIds = new Set<string>()
    // 内存缓冲中的运行中会话
    for (const sessionId of this.buffers.keys()) sessionIds.add(sessionId)
    // journal 目录中的已退出会话
    if (this.journalDir) {
      try {
        for (const name of await readdir(this.journalDir)) {
          if (name.endsWith('.log')) sessionIds.add(name.slice(0, -'.log'.length))
        }
      } catch {
        /* 目录不存在则只搜内存 */
      }
    }

    for (const sessionId of sessionIds) {
      const meta = options?.sessionNames?.get(sessionId)
      const matches: Array<{ line: string; fromMemory: boolean }> = []

      // 1) 内存缓冲（运行中或本次启动后回灌的）
      const state = this.buffers.get(sessionId)
      if (state) {
        for (let i = 0; i < state.size && matches.length < limitPerSession; i += 1) {
          const line = state.lines[(state.start + i) % MAX_BUFFER_LINES]
          if (line && line.text.toLowerCase().includes(keyword)) {
            matches.push({ line: line.text.replace(/\n$/, ''), fromMemory: true })
          }
        }
      }

      // 2) journal 文件（退出会话或内存不足 2000 行历史的兜底）
      const path = this.journalPath(sessionId)
      if (path && matches.length < limitPerSession) {
        try {
          const text = await readFile(path, 'utf8')
          for (const line of text.split('\n')) {
            if (matches.length >= limitPerSession) break
            if (line.toLowerCase().includes(keyword)) {
              matches.push({ line, fromMemory: false })
            }
          }
        } catch {
          /* 无 journal，跳过 */
        }
      }

      if (matches.length > 0) {
        results.push({ sessionId, name: meta?.name, type: meta?.type, matches })
      }
    }
    return results
  }

  // 读取已停止会话的 journal 尾部（供 es output 等事后取证）。未启用 journal、
  // 文件不存在或内容为空时返回 null。行为与 restoreJournal 的行数语义一致：取尾部。
  async readJournalTail(sessionId: string, lines: number): Promise<string | null> {
    const path = this.journalPath(sessionId)
    if (!path) return null
    let text: string
    try {
      text = await readFile(path, 'utf8')
    } catch {
      return null
    }
    if (!text) return null
    if (text.length <= 0) return null
    // 按尾部行数截取：从末尾往前数 N 个换行。
    if (typeof lines === 'number' && Number.isFinite(lines) && lines > 0) {
      const keep: string[] = []
      let idx = text.length
      for (let i = 0; i < lines; i += 1) {
        const prev = text.lastIndexOf('\n', idx - 1)
        if (prev === -1) {
          keep.unshift(text.slice(0, idx))
          break
        }
        keep.unshift(text.slice(prev + 1, idx))
        idx = prev
        if (idx === 0) break
      }
      return keep.join('')
    }
    return text
  }

  private ensureBuffer(sessionId: string): SessionBufferState {
    let state = this.buffers.get(sessionId)
    if (!state) {
      state = createBufferState()
      this.buffers.set(sessionId, state)
    }
    return state
  }

  private appendLine(state: SessionBufferState, line: OutputLine): void {
    if (state.size < MAX_BUFFER_LINES) {
      state.lines.push(line)
      state.size += 1
      return
    }

    state.lines[state.start] = line
    state.start = (state.start + 1) % MAX_BUFFER_LINES
  }

  private toArray(state: SessionBufferState, limit?: number): OutputLine[] {
    if (state.size === 0) return []

    const count = typeof limit === 'number' ? Math.min(Math.max(limit, 0), state.size) : state.size
    if (count === 0) return []

    const skip = state.size - count
    const result: OutputLine[] = []

    for (let i = skip; i < state.size; i += 1) {
      const index = (state.start + i) % MAX_BUFFER_LINES
      result.push(state.lines[index])
    }

    return result
  }

  appendOutput(sessionId: string, data: string, stream: 'stdout' | 'stderr'): void {
    const state = this.ensureBuffer(sessionId)
    const now = Date.now()
    state.nextSeq += 1

    const line: OutputLine = {
      text: data,
      stream,
      timestamp: now,
      seq: state.nextSeq
    }

    this.appendLine(state, line)

    let protocolMessage: unknown | null = null
    if (data.length <= PROTOCOL_SCAN_MAX_LENGTH && Protocol.isProtocolMessage(data)) {
      const parsed = Protocol.parseMessage(data)
      if (parsed) protocolMessage = parsed
    }

    // Coalesce one IPC frame while retaining chunk boundaries for history/live deduplication.
    let pending = this.pendingWindows.get(sessionId)
    if (!pending || pending.stream !== stream) {
      if (pending) this.flushPendingWindow(sessionId)
      pending = {
        chunks: [],
        stream,
        timestamp: now,
        seq: state.nextSeq,
        protocolMessages: [],
        dirty: false
      }
      this.pendingWindows.set(sessionId, pending)
      if (this.pendingTimers.has(sessionId)) {
        clearTimeout(this.pendingTimers.get(sessionId)!)
        this.pendingTimers.delete(sessionId)
      }
    }

    pending.chunks.push(data)
    pending.stream = stream
    pending.timestamp = now
    pending.seq = state.nextSeq
    pending.dirty = true
    if (protocolMessage) pending.protocolMessages.push(protocolMessage)

    if (!this.pendingTimers.has(sessionId)) {
      const timer = setTimeout(() => {
        this.pendingTimers.delete(sessionId)
        this.flushPendingWindow(sessionId)
      }, FLUSH_INTERVAL_MS)
      timer.unref?.()
      this.pendingTimers.set(sessionId, timer)
    }

    const outputPayload = {
      sessionId,
      data,
      stream,
      timestamp: now,
      seq: state.nextSeq
    }

    for (const listener of this.listeners) {
      listener(outputPayload)
    }
  }

  // 把合帧窗口中的内容一次性广播（每窗口 protocol:message + session:output 各至多一次）。
  private flushPendingWindow(sessionId: string): void {
    const pending = this.pendingWindows.get(sessionId)
    this.pendingWindows.delete(sessionId)
    if (!pending || !pending.dirty) return

    // electron 不可用（单测环境 / app 退出后期）时静默丢弃，避免定时器触发 unhandled error。
    if (!BrowserWindow?.getAllWindows) return
    const windows = BrowserWindow.getAllWindows()
    if (windows.length === 0) return

    const mergedData = pending.chunks.join('')
    const outputPayload = {
      sessionId,
      data: mergedData,
      stream: pending.stream,
      timestamp: pending.timestamp,
      seq: pending.seq,
      // String lengths (UTF-16 code units), not byte counts. Keep the payload text
      // once while letting the renderer deduplicate individual source chunks.
      chunkLengths: pending.chunks.map((chunk) => chunk.length)
    }

    windows.forEach((win) => {
      for (const message of pending.protocolMessages) {
        win.webContents.send('protocol:message', {
          sessionId,
          message,
          timestamp: pending.timestamp
        })
      }
      win.webContents.send('session:output', outputPayload)
    })
  }

  removeSession(sessionId: string): void {
    const timer = this.pendingTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.pendingTimers.delete(sessionId)
    }
    this.pendingWindows.delete(sessionId)
    this.buffers.delete(sessionId)
    // 等待在途 journal 写入完成后再删文件，否则晚到的写入会把已删的文件重建出来。
    // 删除链条也记入 pendingJournalWrites，flushJournals 能等到清理真正完成。
    const pendingWrite = this.pendingJournalWrites.get(sessionId)
    if (pendingWrite) {
      const chain = pendingWrite
        .then(() => this.removeJournal(sessionId))
        .catch(() => undefined)
        .finally(() => {
          const current = this.pendingJournalWrites.get(sessionId)
          if (current === chain) this.pendingJournalWrites.delete(sessionId)
        })
      this.pendingJournalWrites.set(sessionId, chain)
    }
  }

  // 等待全部在途 journal 写入完成（应用退出前调用，保证关停不丢最后一屏输出）。
  async flushJournals(): Promise<void> {
    const writes = Array.from(this.pendingJournalWrites.values())
    await Promise.all(writes).catch(() => undefined)
  }

  getHistory(sessionId: string, lines?: number): OutputLine[] {
    const state = this.buffers.get(sessionId)
    if (!state) return []

    return this.toArray(state, lines)
  }

  clearHistory(sessionId: string): number {
    // 不重置 nextSeq：渲染端用 seq 做去重/丢弃，重置会让清空瞬间已应用的大 seq
    // 把之后的新输出全部当成"过期"丢掉（表现为清空后没有输出）。保持 seq 单调即可。
    const timer = this.pendingTimers.get(sessionId)
    if (timer) {
      clearTimeout(timer)
      this.pendingTimers.delete(sessionId)
    }
    this.pendingWindows.delete(sessionId)
    const state = this.buffers.get(sessionId)
    if (state) {
      state.lines = []
      state.start = 0
      state.size = 0
    }
    return state?.nextSeq ?? 0
  }

  subscribe(listener: (event: SessionOutputEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
}
