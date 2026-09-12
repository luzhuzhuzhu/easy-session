import { describe, expect, it } from 'vitest'
import { splitOutputBatch } from '../src/shared/session-output-batch'

describe('coalesced output contract', () => {
  it('deduplicates the overlapping prefix using per-chunk sequences', () => {
    const events = splitOutputBatch({ data: 'old\r\nnew\r\n', seq: 81, chunkLengths: [5, 5], sessionId: 'a' })
    expect(events.map(({ data, seq }) => ({ data, seq }))).toEqual([
      { data: 'old\r\n', seq: 80 }, { data: 'new\r\n', seq: 81 }
    ])
    expect(events.filter(event => event.seq! > 80).map(event => event.data).join('')).toBe('new\r\n')
    expect(events.every(event => event.sessionId === 'a')).toBe(true)
  })

  it('preserves Unicode and partial ANSI sequences without adding characters', () => {
    const chunks = ['\x1b[', '31m\u4e2d\u{1f642}', '\r', '\n']
    const events = splitOutputBatch({ data: chunks.join(''), seq: 4, chunkLengths: chunks.map(chunk => chunk.length) })
    expect(events.map(event => event.data)).toEqual(chunks)
    expect(events.map(event => event.seq)).toEqual([1, 2, 3, 4])
  })

  it.each([
    { data: 'raw' },
    { data: 'raw', seq: 4 },
    { data: 'raw', seq: 4, chunkLengths: [3] },
    { data: 'raw', seq: 4, chunkLengths: [1, 1] },
    { data: 'raw', seq: 1, chunkLengths: [1, 2] },
    { data: 'raw', seq: 4, chunkLengths: [-1, 4] }
  ])('keeps legacy or invalid metadata lossless: %j', (event) => {
    expect(splitOutputBatch(event)).toEqual([event])
  })
})
