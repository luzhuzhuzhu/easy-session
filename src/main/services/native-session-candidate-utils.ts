import { open, stat } from 'fs/promises'
import { StringDecoder } from 'string_decoder'

export type NativeSessionTitleSource = 'session-title' | 'summary' | 'first-user-message' | 'fallback'

export const MAX_CANDIDATE_TITLE_CODE_POINTS = 120
export const MAX_CANDIDATE_CONTENT_CODE_POINTS = 240

export async function readBoundedText(filePath: string, maxBytes: number): Promise<string> {
  const file = await stat(filePath)
  if (file.size > maxBytes) throw new Error('Candidate source exceeds size limit')
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(Math.min(maxBytes, Math.max(1, file.size)))
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function readBoundedPrefix(filePath: string, maxBytes: number): Promise<string> {
  const handle = await open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(maxBytes)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)
    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

export async function findJsonLine(
  filePath: string,
  predicate: (record: Record<string, unknown>) => boolean,
  maxBytes: number,
  chunkBytes = 64 * 1024
): Promise<Record<string, unknown> | null> {
  const handle = await open(filePath, 'r')
  const decoder = new StringDecoder('utf8')
  let pending = ''
  let position = 0

  const parseLine = (line: string): Record<string, unknown> | null => {
    if (!line.trim()) return null
    try {
      const value = JSON.parse(line) as unknown
      return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
    } catch {
      return null
    }
  }

  try {
    while (position < maxBytes) {
      const buffer = Buffer.alloc(Math.min(chunkBytes, maxBytes - position))
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position)
      if (bytesRead === 0) break
      position += bytesRead
      pending += decoder.write(buffer.subarray(0, bytesRead))

      let newlineIndex: number
      while ((newlineIndex = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0, newlineIndex).replace(/\r$/, '')
        pending = pending.slice(newlineIndex + 1)
        const record = parseLine(line)
        if (record && predicate(record)) return record
      }
    }

    pending += decoder.end()
    const record = parseLine(pending.replace(/\r$/, ''))
    return record && predicate(record) ? record : null
  } finally {
    await handle.close()
  }
}

export function parseJsonLines(text: string): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    try {
      const value = JSON.parse(line) as unknown
      if (value && typeof value === 'object' && !Array.isArray(value)) records.push(value as Record<string, unknown>)
    } catch {
      // A bounded prefix may end in a partial record.
    }
  }
  return records
}

export function cleanCandidateText(value: string, maxCodePoints = MAX_CANDIDATE_CONTENT_CODE_POINTS): string {
  const stripped = value
    .replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>/gi, '')
    .replace(/<command-(?:name|message)>[\s\S]*?<\/command-(?:name|message)>/gi, '')
    .replace(/<(?:session_context|environment_context|system-reminder|agent_context)>[\s\S]*?<\/(?:session_context|environment_context|system-reminder|agent_context)>/gi, '')
    .replace(/\[easysession[^\]]*\][\s\S]*/i, '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const truncated = Array.from(stripped).slice(0, Math.max(0, maxCodePoints)).join('')
  return /^\/\S+$/.test(truncated) ? '' : truncated
}

export function candidateTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 0 && value < 100_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (value.trim() && Number.isFinite(numeric)) return candidateTimestamp(numeric)
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

export function distinctCandidateContent(title: string, content: string): string | undefined {
  const cleaned = cleanCandidateText(content)
  return cleaned && cleaned !== title ? cleaned : undefined
}
