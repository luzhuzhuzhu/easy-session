import { computed, ref, type ComputedRef, type InjectionKey, type Ref } from 'vue'

// 协作页「真·自由 dock」：二叉树布局，leaf 承载单一固定面板（无 tab）。
// 借鉴 stores/workspace.ts 的 split/leaf 二叉树与拖放 dock 模式，但只管理面板 id。

export type DockDirection = 'horizontal' | 'vertical'
export interface DockLeaf {
  type: 'leaf'
  panelId: string
}
export interface DockSplit {
  type: 'split'
  direction: DockDirection
  ratio: number
  first: DockNode
  second: DockNode
}
export type DockNode = DockLeaf | DockSplit

export type DropZone = 'left' | 'right' | 'top' | 'bottom' | 'center'
export type EdgeZone = Exclude<DropZone, 'center'>

export interface DropTarget {
  panelId: string
  zone: DropZone
}

// 5 个一等可停靠面板（顺序用于布局菜单与默认显示）。
export const ALL_PANELS = ['members', 'board', 'taskDetail', 'preview', 'chat'] as const
export type PanelId = (typeof ALL_PANELS)[number]

const DOCK_STORAGE_KEY = 'easy-session:collab:dock'

export interface CollabDockApi {
  root: Ref<DockNode>
  draggingPanelId: Ref<string | null>
  dropTarget: Ref<DropTarget | null>
  visiblePanelIds: ComputedRef<string[]>
  hiddenPanelIds: ComputedRef<string[]>
  leafCount: ComputedRef<number>
  startDrag: (panelId: string) => void
  endDrag: () => void
  setDropTarget: (panelId: string, zone: DropZone) => void
  clearDropTarget: (panelId?: string) => void
  dropOnPanel: (targetPanelId: string, zone: DropZone) => void
  setRatio: (path: string, ratio: number) => void
  hidePanel: (panelId: string) => void
  showPanel: (panelId: string) => void
  resetLayout: () => void
}

export const COLLAB_DOCK_KEY: InjectionKey<CollabDockApi> = Symbol('collab-dock')

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0.1, Math.min(0.9, value))
}

function cloneTree(node: DockNode): DockNode {
  if (node.type === 'leaf') return { type: 'leaf', panelId: node.panelId }
  return {
    type: 'split',
    direction: node.direction,
    ratio: node.ratio,
    first: cloneTree(node.first),
    second: cloneTree(node.second)
  }
}

function defaultTree(): DockNode {
  // 默认 = 当前三区：members | board | 纵向[taskDetail, preview, chat]
  return {
    type: 'split',
    direction: 'horizontal',
    ratio: 0.2,
    first: { type: 'leaf', panelId: 'members' },
    second: {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.62,
      first: { type: 'leaf', panelId: 'board' },
      second: {
        type: 'split',
        direction: 'vertical',
        ratio: 0.42,
        first: { type: 'leaf', panelId: 'taskDetail' },
        second: {
          type: 'split',
          direction: 'vertical',
          ratio: 0.5,
          first: { type: 'leaf', panelId: 'preview' },
          second: { type: 'leaf', panelId: 'chat' }
        }
      }
    }
  }
}

function collectPanelIds(node: DockNode, acc: string[] = []): string[] {
  if (node.type === 'leaf') {
    acc.push(node.panelId)
    return acc
  }
  collectPanelIds(node.first, acc)
  collectPanelIds(node.second, acc)
  return acc
}

// 移除某面板的 leaf，并塌缩其所在 split（兄弟节点上提）。整棵都被移除时返回 null。
function removeLeaf(node: DockNode, panelId: string): DockNode | null {
  if (node.type === 'leaf') return node.panelId === panelId ? null : node
  const first = removeLeaf(node.first, panelId)
  const second = removeLeaf(node.second, panelId)
  if (first === null) return second
  if (second === null) return first
  if (first === node.first && second === node.second) return node
  return { type: 'split', direction: node.direction, ratio: node.ratio, first, second }
}

// 在 targetPanelId 的 leaf 处按方向分割，把 newPanelId 放到对应一侧。
function splitLeaf(node: DockNode, targetPanelId: string, zone: EdgeZone, newPanelId: string): DockNode {
  if (node.type === 'leaf') {
    if (node.panelId !== targetPanelId) return node
    const direction: DockDirection = zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical'
    const target: DockLeaf = { type: 'leaf', panelId: targetPanelId }
    const inserted: DockLeaf = { type: 'leaf', panelId: newPanelId }
    const newFirst = zone === 'left' || zone === 'top' ? inserted : target
    const newSecond = zone === 'left' || zone === 'top' ? target : inserted
    return { type: 'split', direction, ratio: 0.5, first: newFirst, second: newSecond }
  }
  return {
    type: 'split',
    direction: node.direction,
    ratio: node.ratio,
    first: splitLeaf(node.first, targetPanelId, zone, newPanelId),
    second: splitLeaf(node.second, targetPanelId, zone, newPanelId)
  }
}

function swapPanels(node: DockNode, a: string, b: string): DockNode {
  if (node.type === 'leaf') {
    if (node.panelId === a) return { type: 'leaf', panelId: b }
    if (node.panelId === b) return { type: 'leaf', panelId: a }
    return node
  }
  return {
    type: 'split',
    direction: node.direction,
    ratio: node.ratio,
    first: swapPanels(node.first, a, b),
    second: swapPanels(node.second, a, b)
  }
}

function firstLeafPanelId(node: DockNode): string {
  return node.type === 'leaf' ? node.panelId : firstLeafPanelId(node.first)
}

// 去重 + 丢弃未知/缺失面板 id；split 缺一子则塌缩；ratio 钳制。损坏返回 null。
function sanitizeTree(raw: unknown, seen: Set<string>): DockNode | null {
  if (!raw || typeof raw !== 'object') return null
  const node = raw as {
    type?: unknown
    panelId?: unknown
    direction?: unknown
    ratio?: unknown
    first?: unknown
    second?: unknown
  }
  if (node.type === 'leaf') {
    const id = node.panelId
    if (typeof id !== 'string' || !ALL_PANELS.includes(id as PanelId) || seen.has(id)) return null
    seen.add(id)
    return { type: 'leaf', panelId: id }
  }
  if (node.type === 'split') {
    const first = sanitizeTree(node.first, seen)
    const second = sanitizeTree(node.second, seen)
    if (first && second) {
      const direction: DockDirection = node.direction === 'vertical' ? 'vertical' : 'horizontal'
      const ratio = typeof node.ratio === 'number' ? clampRatio(node.ratio) : 0.5
      return { type: 'split', direction, ratio, first, second }
    }
    return first ?? second
  }
  return null
}


function loadTree(): DockNode {
  try {
    const stored = localStorage.getItem(DOCK_STORAGE_KEY)
    if (!stored) return defaultTree()
    const parsed = JSON.parse(stored) as { root?: unknown }
    const tree = sanitizeTree(parsed.root, new Set<string>())
    return tree ?? defaultTree()
  } catch {
    return defaultTree()
  }
}

export function useCollabDock(): CollabDockApi {
  const root = ref<DockNode>(loadTree())
  const draggingPanelId = ref<string | null>(null)
  const dropTarget = ref<DropTarget | null>(null)
  // 最近交互的面板，showPanel 时优先在它旁边插入。
  let activePanelId: string | null = null
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const visiblePanelIds = computed(() => collectPanelIds(root.value))
  const hiddenPanelIds = computed(() => {
    const visible = new Set(visiblePanelIds.value)
    return ALL_PANELS.filter((id) => !visible.has(id))
  })
  const leafCount = computed(() => visiblePanelIds.value.length)

  function persist(): void {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      try {
        localStorage.setItem(DOCK_STORAGE_KEY, JSON.stringify({ root: root.value }))
      } catch {
        // localStorage 不可用时静默忽略。
      }
    }, 200)
  }

  function commit(next: DockNode): void {
    root.value = next
    persist()
  }

  function startDrag(panelId: string): void {
    draggingPanelId.value = panelId
    activePanelId = panelId
  }

  function endDrag(): void {
    draggingPanelId.value = null
    dropTarget.value = null
  }

  function setDropTarget(panelId: string, zone: DropZone): void {
    dropTarget.value = { panelId, zone }
  }

  function clearDropTarget(panelId?: string): void {
    if (panelId && dropTarget.value?.panelId !== panelId) return
    dropTarget.value = null
  }

  function dropOnPanel(targetPanelId: string, zone: DropZone): void {
    const dragId = draggingPanelId.value
    dropTarget.value = null
    if (!dragId) return
    if (zone === 'center') {
      if (dragId === targetPanelId) return
      commit(swapPanels(cloneTree(root.value), dragId, targetPanelId))
      return
    }
    if (dragId === targetPanelId) return
    const removed = removeLeaf(cloneTree(root.value), dragId)
    if (!removed) return
    commit(splitLeaf(removed, targetPanelId, zone, dragId))
    activePanelId = dragId
  }

  function setRatio(path: string, ratio: number): void {
    const segments = path.split('.').filter(Boolean)
    if (segments[0] !== 'root') return
    const next = cloneTree(root.value)
    let current: DockNode = next
    for (let i = 1; i < segments.length; i += 1) {
      if (current.type !== 'split') return
      current = segments[i] === 'first' ? current.first : current.second
    }
    if (current.type !== 'split') return
    current.ratio = clampRatio(ratio)
    commit(next)
  }

  function hidePanel(panelId: string): void {
    if (leafCount.value <= 1) return // 至少保留一个面板可见
    const next = removeLeaf(cloneTree(root.value), panelId)
    if (next) {
      if (activePanelId === panelId) activePanelId = null
      commit(next)
    }
  }

  function showPanel(panelId: string): void {
    if (!ALL_PANELS.includes(panelId as PanelId)) return
    if (visiblePanelIds.value.includes(panelId)) return
    const anchor = activePanelId && visiblePanelIds.value.includes(activePanelId)
      ? activePanelId
      : firstLeafPanelId(root.value)
    // 在锚点面板右侧分出新区承载该面板。
    commit(splitLeaf(cloneTree(root.value), anchor, 'right', panelId))
    activePanelId = panelId
  }

  function resetLayout(): void {
    activePanelId = null
    commit(defaultTree())
  }

  return {
    root,
    draggingPanelId,
    dropTarget,
    visiblePanelIds,
    hiddenPanelIds,
    leafCount,
    startDrag,
    endDrag,
    setDropTarget,
    clearDropTarget,
    dropOnPanel,
    setRatio,
    hidePanel,
    showPanel,
    resetLayout
  }
}
