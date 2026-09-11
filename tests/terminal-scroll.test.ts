import { describe, expect, it } from 'vitest'
import { shouldPauseAutoScrollForWheel } from '../src/renderer/src/utils/terminal-scroll'

describe('terminal auto-scroll policy', () => {
  it('pauses immediately when the user wheels upward without a zoom modifier', () => {
    expect(shouldPauseAutoScrollForWheel({ deltaY: -1, ctrlKey: false, metaKey: false })).toBe(true)
  })

  it('does not pause for downward scrolling or ctrl/meta zoom gestures', () => {
    expect(shouldPauseAutoScrollForWheel({ deltaY: 1, ctrlKey: false, metaKey: false })).toBe(false)
    expect(shouldPauseAutoScrollForWheel({ deltaY: -1, ctrlKey: true, metaKey: false })).toBe(false)
    expect(shouldPauseAutoScrollForWheel({ deltaY: -1, ctrlKey: false, metaKey: true })).toBe(false)
  })
})
