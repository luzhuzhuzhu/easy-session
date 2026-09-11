import type { OutputLine } from '@/api/session'

export function getOutputHistoryLastSeq(history: OutputLine[]): number {
  let maxSeq = 0
  for (const line of history) {
    const seq = typeof line.seq === 'number' && Number.isFinite(line.seq)
      ? Math.max(0, Math.floor(line.seq))
      : maxSeq + 1
    if (seq > maxSeq) maxSeq = seq
  }
  return maxSeq
}

export function shouldReplaceCachedHistory(params: {
  cachedLength: number
  cachedLastSeq: number
  fetchedLength: number
  fetchedLastSeq: number
}): boolean {
  return params.fetchedLastSeq > params.cachedLastSeq ||
    (params.fetchedLastSeq === params.cachedLastSeq && params.fetchedLength > params.cachedLength)
}
