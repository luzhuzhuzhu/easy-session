import { describe, expect, it } from 'vitest'
import { getOutputHistoryLastSeq, shouldReplaceCachedHistory } from '../src/renderer/src/utils/terminal-history'

describe('terminal history reconciliation', () => {
  it('assigns monotonic fallback sequence positions to history without seq values', () => {
    expect(getOutputHistoryLastSeq([
      { text: 'a', stream: 'stdout', timestamp: 1 },
      { text: 'b', stream: 'stdout', timestamp: 2 }
    ])).toBe(2)
  })

  it('does not replace a warmer cache with an older backend snapshot', () => {
    expect(shouldReplaceCachedHistory({ cachedLength: 3, cachedLastSeq: 3, fetchedLength: 1, fetchedLastSeq: 1 })).toBe(false)
  })

  it('keeps a newer cache when an older response merely contains more rows', () => {
    expect(shouldReplaceCachedHistory({ cachedLength: 3, cachedLastSeq: 5, fetchedLength: 4, fetchedLastSeq: 4 })).toBe(false)
  })

  it('restores a larger requested history window even when the tail sequence is unchanged', () => {
    expect(shouldReplaceCachedHistory({ cachedLength: 12000, cachedLastSeq: 20000, fetchedLength: 20000, fetchedLastSeq: 20000 })).toBe(true)
  })
})
