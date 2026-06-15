import { describe, expect, it } from 'vitest'
import { reorderVisibleWithinFull } from '../src/renderer/src/features/sessions/keyboard-reorder'

describe('reorderVisibleWithinFull', () => {
  it('moves an item down within a fully-visible list', () => {
    const result = reorderVisibleWithinFull(['a', 'b', 'c'], ['a', 'b', 'c'], 'a', 1)
    expect(result).toEqual(['b', 'a', 'c'])
  })

  it('moves an item up within a fully-visible list', () => {
    const result = reorderVisibleWithinFull(['a', 'b', 'c'], ['a', 'b', 'c'], 'c', -1)
    expect(result).toEqual(['a', 'c', 'b'])
  })

  it('returns null at the visible edges', () => {
    expect(reorderVisibleWithinFull(['a', 'b'], ['a', 'b'], 'a', -1)).toBeNull()
    expect(reorderVisibleWithinFull(['a', 'b'], ['a', 'b'], 'b', 1)).toBeNull()
  })

  it('returns null when the moved id is not visible', () => {
    expect(reorderVisibleWithinFull(['a', 'b', 'c'], ['a', 'c'], 'b', 1)).toBeNull()
  })

  // The regression this test guards: a CLI-type filter hides some entries, so the
  // visible order is a subset. Reordering must keep the hidden entries in the
  // persisted order instead of dropping them.
  it('preserves filtered-out (hidden) entries when reordering down', () => {
    const persisted = ['a', 'h1', 'b', 'h2', 'c'] // h1/h2 are filtered out
    const visible = ['a', 'b', 'c']
    const result = reorderVisibleWithinFull(persisted, visible, 'b', 1)
    // b moves after its visible neighbour c; h1/h2 remain present.
    expect(result).toEqual(['a', 'h1', 'h2', 'c', 'b'])
    expect(result).toContain('h1')
    expect(result).toContain('h2')
  })

  it('preserves filtered-out (hidden) entries when reordering up', () => {
    const persisted = ['a', 'h1', 'b', 'h2', 'c']
    const visible = ['a', 'b', 'c']
    const result = reorderVisibleWithinFull(persisted, visible, 'b', -1)
    // b moves before its visible neighbour a; hidden entries kept.
    expect(result).toEqual(['b', 'a', 'h1', 'h2', 'c'])
    expect(result).toContain('h1')
    expect(result).toContain('h2')
  })

  it('absorbs visible ids not yet present in the persisted order without loss', () => {
    const persisted = ['a', 'b'] // c was never sorted yet
    const visible = ['a', 'b', 'c']
    const result = reorderVisibleWithinFull(persisted, visible, 'c', -1)
    expect(result).toEqual(['a', 'c', 'b'])
    expect(result).toHaveLength(3)
  })

  it('initializes from the visible list when nothing is persisted', () => {
    const result = reorderVisibleWithinFull([], ['x', 'y', 'z'], 'y', 1)
    expect(result).toEqual(['x', 'z', 'y'])
  })
})
