export type NativeSessionCandidateTitleSource =
  | 'session-title'
  | 'summary'
  | 'first-user-message'
  | 'fallback'

export interface NativeSessionCandidatePayload {
  id?: unknown
  title?: unknown
  titleSource?: unknown
  content?: unknown
  updated?: unknown
  projectPath?: unknown
}

export interface NativeSessionCandidate {
  id: string
  title: string
  titleSource: NativeSessionCandidateTitleSource
  content?: string
  updated?: number
  projectPath?: string
}

export type NativeSessionDiscoveryStatus = 'ready' | 'empty' | 'unsupported' | 'error'

export interface NativeSessionDiscoveryResult {
  status: NativeSessionDiscoveryStatus
  candidates: NativeSessionCandidate[]
  message?: string
}

const TITLE_SOURCES = new Set<NativeSessionCandidateTitleSource>([
  'session-title',
  'summary',
  'first-user-message',
  'fallback'
])

function trimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

function normalizeCandidate(value: unknown, fallbackTitle?: string): NativeSessionCandidate | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined

  const raw = value as Record<string, unknown>
  const id = trimmedString(raw.id)
  if (!id) return undefined

  const suppliedTitle = trimmedString(raw.title)
  const suppliedContent = trimmedString(raw.content)
  const title = suppliedTitle ?? suppliedContent ?? fallbackTitle ?? id

  let titleSource: NativeSessionCandidateTitleSource
  if (TITLE_SOURCES.has(raw.titleSource as NativeSessionCandidateTitleSource)) {
    titleSource = raw.titleSource as NativeSessionCandidateTitleSource
  } else if (!suppliedTitle && suppliedContent) {
    titleSource = 'first-user-message'
  } else if (!suppliedTitle) {
    titleSource = 'fallback'
  } else if (suppliedContent === suppliedTitle) {
    titleSource = 'first-user-message'
  } else {
    titleSource = 'session-title'
  }

  const candidate: NativeSessionCandidate = { id, title, titleSource }
  if (suppliedContent && suppliedContent !== title) candidate.content = suppliedContent
  if (typeof raw.updated === 'number' && Number.isFinite(raw.updated) && raw.updated > 0) {
    candidate.updated = raw.updated
  }

  const projectPath = trimmedString(raw.projectPath)
  if (projectPath) candidate.projectPath = projectPath

  return candidate
}

function normalizeCandidates(value: unknown, fallbackTitle?: string): NativeSessionCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    const normalized = normalizeCandidate(candidate, fallbackTitle)
    return normalized ? [normalized] : []
  })
}

function statusForCandidates(candidates: NativeSessionCandidate[]): 'ready' | 'empty' {
  return candidates.length > 0 ? 'ready' : 'empty'
}

/**
 * Decodes both the discovery envelope and the legacy bare candidate array.
 * Malformed payloads become an explicit error rather than masquerading as an
 * empty discovery result.
 */
export function normalizeNativeSessionDiscoveryPayload(
  payload: unknown,
  fallbackTitle?: string
): NativeSessionDiscoveryResult {
  const normalizedFallbackTitle = trimmedString(fallbackTitle)

  if (Array.isArray(payload)) {
    const candidates = normalizeCandidates(payload, normalizedFallbackTitle)
    return { status: statusForCandidates(candidates), candidates }
  }

  if (!payload || typeof payload !== 'object') {
    return { status: 'error', candidates: [], message: 'Invalid native session discovery payload' }
  }

  const envelope = payload as Record<string, unknown>
  const message = trimmedString(envelope.message)
  const candidates = normalizeCandidates(envelope.candidates, normalizedFallbackTitle)

  if (envelope.status === 'unsupported' || envelope.status === 'error') {
    return {
      status: envelope.status,
      candidates: [],
      ...(message ? { message } : {})
    }
  }

  if (envelope.status === 'ready' || envelope.status === 'empty') {
    return {
      status: statusForCandidates(candidates),
      candidates,
      ...(message ? { message } : {})
    }
  }

  return {
    status: 'error',
    candidates: [],
    message: message ?? 'Invalid native session discovery payload'
  }
}
