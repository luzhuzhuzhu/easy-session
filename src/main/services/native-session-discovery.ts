import type { CliType } from '../../shared/cli-types'
import {
  normalizeNativeSessionDiscoveryPayload,
  type NativeSessionCandidatePayload,
  type NativeSessionDiscoveryResult
} from '../../shared/native-session-candidates'
import { supportsNativeSessionDiscovery } from '../ipc/cli-registry'
import {
  candidateCollectorFor,
  HermesCandidatesUnsupportedError,
  type CandidateCollector
} from './native-session-candidates'

interface CandidateAdapter {
  collectSessionCandidatesByPath(
    projectPath: string,
    preferredPath?: string,
    maxCount?: number
  ): Promise<NativeSessionCandidatePayload[]>
}

interface CodexCandidateAdapter {
  collectSessionCandidatesByPath(
    projectPath: string,
    maxCount?: number
  ): Promise<NativeSessionCandidatePayload[]>
}

export interface NativeSessionDiscoveryAdapters {
  openCodeAdapter?: CandidateAdapter
  codexAdapter?: CodexCandidateAdapter
  /** Optional seam for focused tests or alternate main-process collector sets. */
  candidateCollectorFor?: (cliType: CliType) => CandidateCollector | null
}

const EMPTY_RESULT: NativeSessionDiscoveryResult = { status: 'empty', candidates: [] }

function unsupported(message = 'Native session discovery is not supported for this CLI'): NativeSessionDiscoveryResult {
  return { status: 'unsupported', candidates: [], message }
}

/**
 * Main-process discovery boundary shared by local IPC and remote service wiring.
 * It owns capability checks, collector dispatch, and the public error envelope.
 */
export async function discoverNativeSessions(
  cliType: string,
  projectPath: string | undefined,
  preferredPath: string | undefined,
  adapters: NativeSessionDiscoveryAdapters = {},
  maxCount = 40
): Promise<NativeSessionDiscoveryResult> {
  if (!supportsNativeSessionDiscovery(cliType)) return unsupported()

  const normalizedProjectPath = typeof projectPath === 'string' ? projectPath.trim() : ''
  if (!normalizedProjectPath) return EMPTY_RESULT

  const normalizedPreferredPath =
    typeof preferredPath === 'string' && preferredPath.trim() ? preferredPath.trim() : undefined
  const limit = Math.min(100, Math.max(1, Math.trunc(maxCount) || 40))

  try {
    let candidates: NativeSessionCandidatePayload[]
    if (cliType === 'opencode') {
      if (!adapters.openCodeAdapter) return unsupported()
      candidates = await adapters.openCodeAdapter.collectSessionCandidatesByPath(
        normalizedProjectPath,
        normalizedPreferredPath,
        limit
      )
    } else if (cliType === 'codex') {
      if (!adapters.codexAdapter) return unsupported()
      candidates = await adapters.codexAdapter.collectSessionCandidatesByPath(normalizedProjectPath, limit)
    } else {
      const collector = (adapters.candidateCollectorFor ?? candidateCollectorFor)(cliType as CliType)
      if (!collector) return unsupported()
      candidates = await collector(normalizedProjectPath, normalizedPreferredPath, limit)
    }

    const normalized = normalizeNativeSessionDiscoveryPayload(candidates)
    return normalized.status === 'ready' ? normalized : EMPTY_RESULT
  } catch (error) {
    if (error instanceof HermesCandidatesUnsupportedError) {
      return unsupported(error.message)
    }
    return {
      status: 'error',
      candidates: [],
      message: 'Failed to discover native sessions'
    }
  }
}
