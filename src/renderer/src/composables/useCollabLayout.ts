import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDragReorder } from '@/composables/useDragReorder'

// 协作页可定制布局：面板显隐/排序/尺寸的状态、持久化与拖拽，从 CollaborationView 抽出。
// 页面级局部状态用 composable 比全局 store 更贴切。
type PanelGroup = 'top' | 'detail'
interface PanelConfig {
  id: string
  visible: boolean
  size: number
}

export function useCollabLayout() {
  const { t } = useI18n()

const LAYOUT_STORAGE_KEY = 'easy-session:collab:layout'
const PANEL_MIN_SIZE: Record<string, number> = {
  members: 170,
  board: 320,
  detail: 300,
  taskDetail: 110,
  preview: 120,
  chat: 120
}
const DEFAULT_TOP_PANELS: PanelConfig[] = [
  { id: 'members', visible: true, size: 220 },
  { id: 'board', visible: true, size: 600 },
  { id: 'detail', visible: true, size: 460 }
]
const DEFAULT_DETAIL_PANELS: PanelConfig[] = [
  { id: 'taskDetail', visible: true, size: 320 },
  { id: 'preview', visible: true, size: 240 },
  { id: 'chat', visible: true, size: 240 }
]

const topPanels = ref<PanelConfig[]>(clonePanels(DEFAULT_TOP_PANELS))
const detailPanels = ref<PanelConfig[]>(clonePanels(DEFAULT_DETAIL_PANELS))
const layoutMenuOpen = ref(false)
let persistTimer: ReturnType<typeof setTimeout> | null = null

function clonePanels(panels: PanelConfig[]): PanelConfig[] {
  return panels.map((panel) => ({ ...panel }))
}

// 对损坏/未知存储值回退默认；保留已知 panel 的显隐与尺寸，新增 panel 默认可见。
function sanitizeGroup(stored: unknown, defaults: PanelConfig[]): PanelConfig[] {
  if (!Array.isArray(stored)) return clonePanels(defaults)
  const defById = new Map(defaults.map((d) => [d.id, d]))
  const result: PanelConfig[] = []
  const seen = new Set<string>()
  for (const item of stored) {
    if (!item || typeof item !== 'object') continue
    const id = (item as PanelConfig).id
    const def = typeof id === 'string' ? defById.get(id) : undefined
    if (!def || seen.has(id)) continue
    seen.add(id)
    const visible = (item as PanelConfig).visible
    const size = (item as PanelConfig).size
    result.push({
      id,
      visible: typeof visible === 'boolean' ? visible : def.visible,
      size: typeof size === 'number' && size > 0 ? size : def.size
    })
  }
  for (const def of defaults) {
    if (!seen.has(def.id)) result.push({ ...def })
  }
  if (!result.some((panel) => panel.visible) && result[0]) result[0].visible = true
  return result
}

function loadLayout(): void {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as { top?: unknown; detail?: unknown }
    topPanels.value = sanitizeGroup(parsed.top, DEFAULT_TOP_PANELS)
    detailPanels.value = sanitizeGroup(parsed.detail, DEFAULT_DETAIL_PANELS)
  } catch {
    // 损坏值：保持默认布局。
  }
}

function persistLayout(): void {
  try {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ top: topPanels.value, detail: detailPanels.value })
    )
  } catch {
    // localStorage 不可用时静默忽略。
  }
}

// 同步加载，使首帧即用持久化布局。
loadLayout()

const visibleTopPanes = computed(() =>
  topPanels.value
    .filter((panel) => panel.visible)
    .map((panel) => ({ key: panel.id, size: panel.size, minSize: PANEL_MIN_SIZE[panel.id] }))
)
const visibleDetailPanes = computed(() =>
  detailPanels.value
    .filter((panel) => panel.visible)
    .map((panel) => ({ key: panel.id, size: panel.size, minSize: PANEL_MIN_SIZE[panel.id] }))
)
const topVisibleCount = computed(() => topPanels.value.filter((panel) => panel.visible).length)
const detailVisibleCount = computed(() => detailPanels.value.filter((panel) => panel.visible).length)

function mergeVisibleOrder(panels: PanelConfig[], orderedVisibleKeys: string[]): PanelConfig[] {
  // 把新的可见顺序放回完整顺序的可见槽位，隐藏项原样保留（参考 reorderVisibleWithinFull）。
  const byId = new Map(panels.map((panel) => [panel.id, panel]))
  let vi = 0
  return panels.map((panel) => (panel.visible ? byId.get(orderedVisibleKeys[vi++]) ?? panel : panel))
}

const {
  draggingKey: topDragKey,
  overKey: topOverKey,
  onDragStart: topDragStart,
  onDragOver: topDragOver,
  onDragLeave: topDragLeave,
  onDrop: topDrop,
  onDragEnd: topDragEnd
} = useDragReorder<PanelConfig>({
  getItems: () => topPanels.value.filter((panel) => panel.visible),
  keyOf: (panel) => panel.id,
  onReorder: (keys) => {
    topPanels.value = mergeVisibleOrder(topPanels.value, keys)
  }
})

const {
  draggingKey: detailDragKey,
  overKey: detailOverKey,
  onDragStart: detailDragStart,
  onDragOver: detailDragOver,
  onDragLeave: detailDragLeave,
  onDrop: detailDrop,
  onDragEnd: detailDragEnd
} = useDragReorder<PanelConfig>({
  getItems: () => detailPanels.value.filter((panel) => panel.visible),
  keyOf: (panel) => panel.id,
  onReorder: (keys) => {
    detailPanels.value = mergeVisibleOrder(detailPanels.value, keys)
  }
})

function panelDnDClass(group: PanelGroup, id: string): Record<string, boolean> {
  const dragKey = group === 'top' ? topDragKey.value : detailDragKey.value
  const overKey = group === 'top' ? topOverKey.value : detailOverKey.value
  return { dragging: dragKey === id, dropping: overKey === id && dragKey !== id }
}

function applyPaneSizes(panelsRef: typeof topPanels, sizes: Array<{ key: string; size: number }>): void {
  const sizeById = new Map(sizes.map((entry) => [entry.key, entry.size]))
  panelsRef.value = panelsRef.value.map((panel) =>
    sizeById.has(panel.id) ? { ...panel, size: sizeById.get(panel.id) as number } : panel
  )
}

function onTopResize(sizes: Array<{ key: string; size: number }>): void {
  applyPaneSizes(topPanels, sizes)
}

function onDetailResize(sizes: Array<{ key: string; size: number }>): void {
  applyPaneSizes(detailPanels, sizes)
}

function togglePanel(group: PanelGroup, id: string): void {
  const panelsRef = group === 'top' ? topPanels : detailPanels
  const panels = panelsRef.value
  const target = panels.find((panel) => panel.id === id)
  if (!target) return
  // 至少保留一个可见 panel，避免空白。
  if (target.visible && panels.filter((panel) => panel.visible).length <= 1) return
  panelsRef.value = panels.map((panel) => (panel.id === id ? { ...panel, visible: !panel.visible } : panel))
}

function resetLayout(): void {
  topPanels.value = clonePanels(DEFAULT_TOP_PANELS)
  detailPanels.value = clonePanels(DEFAULT_DETAIL_PANELS)
}

function panelLabel(id: string): string {
  return t(`collab.panel.${id}`)
}

watch(
  [topPanels, detailPanels],
  () => {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(persistLayout, 200)
  },
  { deep: true }
)

  // 卸载时冲刷待持久化布局（原在 CollaborationView 的 onUnmounted 内）。
  onUnmounted(() => {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistLayout()
    }
  })

  return {
    topPanels,
    detailPanels,
    layoutMenuOpen,
    visibleTopPanes,
    visibleDetailPanes,
    topVisibleCount,
    detailVisibleCount,
    panelDnDClass,
    onTopResize,
    onDetailResize,
    togglePanel,
    resetLayout,
    panelLabel,
    topDragStart,
    topDragOver,
    topDragLeave,
    topDrop,
    topDragEnd,
    detailDragStart,
    detailDragOver,
    detailDragLeave,
    detailDrop,
    detailDragEnd
  }
}
