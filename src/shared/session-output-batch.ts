/** Optional boundaries for a coalesced IPC frame; seq identifies its last chunk. */
export interface SequencedOutputBatch {
  data: string
  seq?: number
  /** Consecutive chunks, measured in JS string (UTF-16) code units. */
  chunkLengths?: number[]
}

/** Expand at the IPC boundary so all consumers see the same history sequence units. */
export function splitOutputBatch<T extends SequencedOutputBatch>(event: T): T[] {
  const lengths = event.chunkLengths
  if (!lengths || lengths.length <= 1 || !Number.isSafeInteger(event.seq)) return [event]
  const endSeq = event.seq!
  if (endSeq < lengths.length || lengths.some((length) => !Number.isSafeInteger(length) || length < 0)) {
    return [event]
  }
  if (lengths.reduce((sum, length) => sum + length, 0) !== event.data.length) return [event]

  let offset = 0
  return lengths.map((length, index) => {
    const data = event.data.slice(offset, offset + length)
    offset += length
    return { ...event, data, seq: endSeq - lengths.length + index + 1, chunkLengths: undefined }
  })
}
