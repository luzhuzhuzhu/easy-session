/**
 * Keyboard-reorder core, shared by session and project keyboard reordering
 * (Alt+ArrowUp / Alt+ArrowDown). Kept dependency-free so it can be unit-tested
 * in isolation.
 *
 * `visibleOrder` is only what the tree currently renders, which may be a subset
 * when a CLI-type filter is active. Persisting that subset directly would wipe
 * filtered-out entries from the saved order. Instead — like the mouse-drag path
 * — we operate on the full persisted order and move just the one id relative to
 * its *visible* neighbour, leaving hidden (filtered-out) entries untouched.
 *
 * Returns the new full order, or null when nothing should change (the id is not
 * visible, or it is already at the visible edge in that direction).
 */
export function reorderVisibleWithinFull(
  persisted: string[],
  visibleOrder: string[],
  movedId: string,
  direction: -1 | 1
): string[] | null {
  const visibleIndex = visibleOrder.indexOf(movedId)
  if (visibleIndex < 0) return null
  const neighborIndex = visibleIndex + direction
  if (neighborIndex < 0 || neighborIndex >= visibleOrder.length) return null
  const neighborId = visibleOrder[neighborIndex]

  // Base on the persisted full order, appending any visible ids not yet tracked
  // (e.g. never-sorted new sessions) so nothing is lost.
  const full = [...persisted]
  const seen = new Set(persisted)
  for (const id of visibleOrder) {
    if (!seen.has(id)) {
      full.push(id)
      seen.add(id)
    }
  }

  const fromIndex = full.indexOf(movedId)
  if (fromIndex < 0 || full.indexOf(neighborId) < 0) return null

  full.splice(fromIndex, 1)
  const neighborPos = full.indexOf(neighborId)
  const insertAt = direction > 0 ? neighborPos + 1 : neighborPos
  full.splice(insertAt, 0, movedId)
  return full
}
