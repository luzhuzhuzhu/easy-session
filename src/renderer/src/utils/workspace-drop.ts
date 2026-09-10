import type { WorkspaceDropPlacement } from '../api/workspace'

export interface WorkspaceDropRect {
  left: number
  top: number
  width: number
  height: number
}

const EDGE_RATIO = 0.24
const MIN_EDGE_PX = 24
const MAX_EDGE_PX = 120

function edgeSize(length: number): number {
  return Math.min(length / 2, Math.max(MIN_EDGE_PX, Math.min(MAX_EDGE_PX, length * EDGE_RATIO)))
}

export function getWorkspaceDropPlacement(
  rect: WorkspaceDropRect,
  clientX: number,
  clientY: number
): WorkspaceDropPlacement {
  const values = [rect.left, rect.top, rect.width, rect.height, clientX, clientY]
  if (!values.every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return 'center'

  const distances = [
    { placement: 'left' as const, distance: clientX - rect.left, limit: edgeSize(rect.width) },
    { placement: 'right' as const, distance: rect.left + rect.width - clientX, limit: edgeSize(rect.width) },
    { placement: 'top' as const, distance: clientY - rect.top, limit: edgeSize(rect.height) },
    { placement: 'bottom' as const, distance: rect.top + rect.height - clientY, limit: edgeSize(rect.height) }
  ]
    .filter(({ distance, limit }) => distance >= 0 && distance <= limit)
    .sort((a, b) => a.distance - b.distance)

  return distances[0]?.placement ?? 'center'
}
