export interface TerminalWheelIntent {
  deltaY: number
  ctrlKey: boolean
  metaKey: boolean
}

/**
 * Upward wheel input is an explicit request to inspect scrollback. Pause before
 * xterm emits its scroll event so continuous output cannot win the race and
 * snap the viewport back to the bottom.
 */
export function shouldPauseAutoScrollForWheel(event: TerminalWheelIntent): boolean {
  return event.deltaY < 0 && !event.ctrlKey && !event.metaKey
}
