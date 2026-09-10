import { describe, expect, it } from 'vitest'
import {
  normalizeNativeSessionDiscoveryPayload,
  type NativeSessionCandidate,
  type NativeSessionDiscoveryResult
} from '../src/shared/native-session-candidates'

describe('native session candidate contract', () => {
  it('preserves and trims a valid discovery envelope', () => {
    const result = normalizeNativeSessionDiscoveryPayload({
      status: 'ready',
      candidates: [{
        id: ' session-1 ',
        title: ' Release review ',
        titleSource: 'summary',
        content: ' Implement the release checklist ',
        updated: 1_789_000_000_000,
        projectPath: ' D:/easy-session '
      }],
      message: ' Found persisted sessions '
    })

    expect(result).toEqual({
      status: 'ready',
      candidates: [{
        id: 'session-1',
        title: 'Release review',
        titleSource: 'summary',
        content: 'Implement the release checklist',
        updated: 1_789_000_000_000,
        projectPath: 'D:/easy-session'
      }],
      message: 'Found persisted sessions'
    })
  })

  it('accepts a legacy bare array and infers ready status and title metadata', () => {
    expect(normalizeNativeSessionDiscoveryPayload([
      { id: 'legacy-title', title: ' Native title ' },
      { id: 'legacy-content', content: ' First user prompt ' },
      { id: 'legacy-fallback' }
    ], ' Unnamed CLI session ')).toEqual({
      status: 'ready',
      candidates: [
        { id: 'legacy-title', title: 'Native title', titleSource: 'session-title' },
        {
          id: 'legacy-content',
          title: 'First user prompt',
          titleSource: 'first-user-message'
        },
        { id: 'legacy-fallback', title: 'Unnamed CLI session', titleSource: 'fallback' }
      ]
    })
  })

  it('falls back to the id when no usable title, content, or fallback title exists', () => {
    expect(normalizeNativeSessionDiscoveryPayload([{ id: ' session-id ', title: ' ', content: '\n' }]))
      .toEqual({
        status: 'ready',
        candidates: [{ id: 'session-id', title: 'session-id', titleSource: 'fallback' }]
      })
  })

  it('filters non-object, non-string, and blank ids', () => {
    expect(normalizeNativeSessionDiscoveryPayload([
      null,
      'candidate',
      {},
      { id: 123, title: 'numeric id' },
      { id: '   ', title: 'blank id' },
      { id: 'valid' }
    ])).toEqual({
      status: 'ready',
      candidates: [{ id: 'valid', title: 'valid', titleSource: 'fallback' }]
    })
  })

  it('deduplicates equal trimmed title and content', () => {
    expect(normalizeNativeSessionDiscoveryPayload([
      {
        id: 'same',
        title: ' Same prompt ',
        content: '\nSame prompt\t'
      },
      {
        id: 'different',
        title: 'Session title',
        content: 'First prompt'
      }
    ])).toEqual({
      status: 'ready',
      candidates: [
        { id: 'same', title: 'Same prompt', titleSource: 'first-user-message' },
        {
          id: 'different',
          title: 'Session title',
          titleSource: 'session-title',
          content: 'First prompt'
        }
      ]
    })
  })

  it('keeps only finite positive updated values and nonblank project paths', () => {
    const result = normalizeNativeSessionDiscoveryPayload([
      { id: 'positive', updated: 0.5, projectPath: ' /repo ' },
      { id: 'zero', updated: 0, projectPath: ' ' },
      { id: 'negative', updated: -1 },
      { id: 'infinity', updated: Number.POSITIVE_INFINITY },
      { id: 'nan', updated: Number.NaN },
      { id: 'string', updated: '123' }
    ])

    expect(result.candidates).toEqual([
      { id: 'positive', title: 'positive', titleSource: 'fallback', updated: 0.5, projectPath: '/repo' },
      { id: 'zero', title: 'zero', titleSource: 'fallback' },
      { id: 'negative', title: 'negative', titleSource: 'fallback' },
      { id: 'infinity', title: 'infinity', titleSource: 'fallback' },
      { id: 'nan', title: 'nan', titleSource: 'fallback' },
      { id: 'string', title: 'string', titleSource: 'fallback' }
    ])
  })

  it('normalizes ready/empty invariants from the valid candidate count', () => {
    expect(normalizeNativeSessionDiscoveryPayload({
      status: 'ready',
      candidates: [{ id: '' }]
    })).toEqual({ status: 'empty', candidates: [] })

    expect(normalizeNativeSessionDiscoveryPayload({
      status: 'empty',
      candidates: [{ id: 'found', title: 'Found', titleSource: 'session-title' }]
    })).toEqual({
      status: 'ready',
      candidates: [{ id: 'found', title: 'Found', titleSource: 'session-title' }]
    })
  })

  it.each(['unsupported', 'error'] as const)('makes %s terminal and removes contradictory candidates', (status) => {
    expect(normalizeNativeSessionDiscoveryPayload({
      status,
      candidates: [{ id: 'contradiction', title: 'Should not leak' }],
      message: ' Not available '
    })).toEqual({ status, candidates: [], message: 'Not available' })
  })

  it('turns malformed or unknown payloads into an explicit error result', () => {
    const expected = {
      status: 'error',
      candidates: [],
      message: 'Invalid native session discovery payload'
    }

    expect(normalizeNativeSessionDiscoveryPayload(undefined)).toEqual(expected)
    expect(normalizeNativeSessionDiscoveryPayload('not-json-object')).toEqual(expected)
    expect(normalizeNativeSessionDiscoveryPayload({ candidates: [] })).toEqual(expected)
    expect(normalizeNativeSessionDiscoveryPayload({ status: 'pending', candidates: [] })).toEqual(expected)
  })

  it('exposes the required compile-time candidate and discovery fields', () => {
    const candidate: NativeSessionCandidate = {
      id: 'typed',
      title: 'Typed title',
      titleSource: 'fallback'
    }
    const discovery: NativeSessionDiscoveryResult = {
      status: 'ready',
      candidates: [candidate]
    }

    expect(discovery).toEqual({ status: 'ready', candidates: [candidate] })
  })
})
