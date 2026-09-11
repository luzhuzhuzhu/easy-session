import { describe, expect, it } from 'vitest'
import { getWorkspaceDropPlacement } from '../src/renderer/src/utils/workspace-drop'

const rect = { left: 100, top: 50, width: 400, height: 200 }

describe('workspace drop placement', () => {
  it('uses a bounded 24% edge zone and chooses the nearest edge', () => {
    expect(getWorkspaceDropPlacement(rect, 102, 51)).toBe('top')
    expect(getWorkspaceDropPlacement(rect, 110, 145)).toBe('left')
    expect(getWorkspaceDropPlacement(rect, 490, 145)).toBe('right')
    expect(getWorkspaceDropPlacement(rect, 300, 245)).toBe('bottom')
    expect(getWorkspaceDropPlacement(rect, 300, 150)).toBe('center')
  })

  it('clamps edge zones for very small and large panes', () => {
    expect(getWorkspaceDropPlacement({ left: 0, top: 0, width: 80, height: 80 }, 20, 40)).toBe('left')
    expect(getWorkspaceDropPlacement({ left: 0, top: 0, width: 2000, height: 1000 }, 150, 500)).toBe('center')
    expect(getWorkspaceDropPlacement({ left: 0, top: 0, width: 2000, height: 1000 }, 119, 500)).toBe('left')
  })

  it('returns center for invalid geometry or coordinates', () => {
    expect(getWorkspaceDropPlacement({ left: 0, top: 0, width: 0, height: 100 }, 0, 0)).toBe('center')
    expect(getWorkspaceDropPlacement(rect, Number.NaN, 100)).toBe('center')
  })
})
