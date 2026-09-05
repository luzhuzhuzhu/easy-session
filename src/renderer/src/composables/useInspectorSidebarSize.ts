import { computed, ref, type Ref } from 'vue'

// STAB-11：Inspector 侧栏（history stage / 常驻侧栏）的悬停展开/自动收起、
// 尺寸 clamp、拖拽 resize 与冷却期。从 InspectorPanel.vue 拆出，行为零变化。

export interface InspectorSidebarOptions {
  autoCollapseEnabled: () => boolean
  isHistoryTab: () => boolean
  isCompactPanel: () => boolean
  actualPanelWidth: Ref<number>
  panelWidth: Ref<number>
  bodyHeight: () => number
}

export function useInspectorSidebarSize(options: InspectorSidebarOptions) {
  const SIDEBAR_WIDTH_KEY = 'easysession.inspector.sidebar-width'
  const SIDEBAR_HEIGHT_KEY = 'easysession.inspector.sidebar-height'
  const SIDEBAR_MIN_WIDTH = 180
  const HISTORY_STAGE_MIN_WIDTH = 96
  const SIDEBAR_MAX_WIDTH = 420
  const SIDEBAR_DEFAULT_WIDTH = 220
  const SIDEBAR_MIN_HEIGHT = 132
  const SIDEBAR_MAX_HEIGHT = 320
  const SIDEBAR_DEFAULT_HEIGHT = 180

  const sidebarWidth = ref(readStoredSidebarWidth())
  const sidebarHeight = ref(readStoredSidebarHeight())
  const sidebarHovered = ref(false)
  const sidebarPointerInside = ref(false)
  const sidebarResizeLocked = ref(false)

  let hoverCloseTimer: number | null = null
  let resizeCooldownTimer: number | null = null
  let stopResize: (() => void) | null = null

  function readStoredSidebarWidth(): number {
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_KEY))
    if (!Number.isFinite(stored)) return SIDEBAR_DEFAULT_WIDTH
    return Math.min(SIDEBAR_MAX_WIDTH, Math.max(HISTORY_STAGE_MIN_WIDTH, Math.round(stored)))
  }

  function readStoredSidebarHeight(): number {
    const stored = Number(window.localStorage.getItem(SIDEBAR_HEIGHT_KEY))
    if (!Number.isFinite(stored)) return SIDEBAR_DEFAULT_HEIGHT
    return Math.min(SIDEBAR_MAX_HEIGHT, Math.max(SIDEBAR_MIN_HEIGHT, Math.round(stored)))
  }

  function persistSidebarWidth(): void {
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
  }

  function persistSidebarHeight(): void {
    window.localStorage.setItem(SIDEBAR_HEIGHT_KEY, String(sidebarHeight.value))
  }

  function clearHoverCloseTimer(): void {
    if (hoverCloseTimer == null) return
    window.clearTimeout(hoverCloseTimer)
    hoverCloseTimer = null
  }

  function clearResizeCooldownTimer(): void {
    if (resizeCooldownTimer == null) return
    window.clearTimeout(resizeCooldownTimer)
    resizeCooldownTimer = null
  }

  function scheduleAutoCollapse(delay = 390): void {
    if (!options.autoCollapseEnabled() || sidebarResizeLocked.value) return
    clearHoverCloseTimer()
    hoverCloseTimer = window.setTimeout(() => {
      if (!sidebarPointerInside.value) {
        sidebarHovered.value = false
      }
      hoverCloseTimer = null
    }, delay)
  }

  function handlePointerEnter(): void {
    if (!options.autoCollapseEnabled()) return
    sidebarPointerInside.value = true
    clearHoverCloseTimer()
    clearResizeCooldownTimer()
    sidebarHovered.value = true
  }

  function handlePointerLeave(): void {
    if (!options.autoCollapseEnabled()) return
    sidebarPointerInside.value = false
    scheduleAutoCollapse()
  }

  function clampSidebarWidth(width: number): number {
    const minWidth = options.isHistoryTab() ? HISTORY_STAGE_MIN_WIDTH : SIDEBAR_MIN_WIDTH
    const panelBoundsWidth = options.actualPanelWidth.value || options.panelWidth.value
    const maxByPanel = Math.max(
      minWidth,
      Math.min(SIDEBAR_MAX_WIDTH, panelBoundsWidth - 180)
    )
    return Math.min(maxByPanel, Math.max(minWidth, Math.round(width)))
  }

  function clampSidebarHeight(height: number): number {
    const bodyBoundsHeight = options.bodyHeight()
    const maxByBody = bodyBoundsHeight > 0
      ? Math.max(SIDEBAR_MIN_HEIGHT, Math.min(SIDEBAR_MAX_HEIGHT, bodyBoundsHeight - 160))
      : SIDEBAR_MAX_HEIGHT
    return Math.min(maxByBody, Math.max(SIDEBAR_MIN_HEIGHT, Math.round(height)))
  }

  function handleAutoCollapseToggle(checked: boolean): {
    resetHover: () => void
    restoreHover: () => void
  } {
    if (checked) {
      sidebarPointerInside.value = false
      sidebarHovered.value = false
      return { resetHover: () => {}, restoreHover: () => {} }
    }
    clearHoverCloseTimer()
    clearResizeCooldownTimer()
    sidebarHovered.value = true
    return { resetHover: () => {}, restoreHover: () => {} }
  }

  function startSidebarResize(event: PointerEvent, panelOpen: boolean, sidebarVisible: boolean): void {
    if (!panelOpen) return
    if (!options.isHistoryTab() && !sidebarVisible) return

    event.preventDefault()
    event.stopPropagation()
    if (!options.isHistoryTab()) {
      sidebarResizeLocked.value = true
      sidebarPointerInside.value = true
      handlePointerEnter()
    }

    const startX = event.clientX
    const startY = event.clientY
    const compact = options.isCompactPanel()
    const startSize = options.isHistoryTab()
      ? (compact ? clampSidebarHeight(sidebarHeight.value) : clampSidebarWidth(sidebarWidth.value))
      : compact
        ? clampSidebarHeight(sidebarHeight.value)
        : clampSidebarWidth(sidebarWidth.value)

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (options.isHistoryTab()) {
        if (options.isCompactPanel()) {
          sidebarHeight.value = clampSidebarHeight(startSize + (moveEvent.clientY - startY))
        } else {
          sidebarWidth.value = clampSidebarWidth(startSize + (moveEvent.clientX - startX))
        }
        return
      }
      if (options.isCompactPanel()) {
        sidebarHeight.value = clampSidebarHeight(startSize + (moveEvent.clientY - startY))
        return
      }
      sidebarWidth.value = clampSidebarWidth(startSize + (moveEvent.clientX - startX))
    }

    const handlePointerUp = () => {
      if (options.isHistoryTab()) {
        if (options.isCompactPanel()) persistSidebarHeight()
        else persistSidebarWidth()
      } else if (options.isCompactPanel()) {
        persistSidebarHeight()
      } else {
        persistSidebarWidth()
      }
      if (!options.isHistoryTab()) {
        sidebarResizeLocked.value = false
        clearResizeCooldownTimer()
        resizeCooldownTimer = window.setTimeout(() => {
          if (!sidebarPointerInside.value) {
            scheduleAutoCollapse(480)
          }
          resizeCooldownTimer = null
        }, 630)
      }
      cleanupResize()
    }

    const cleanupResize = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      stopResize = null
    }

    stopResize?.()
    stopResize = cleanupResize
    document.body.style.userSelect = 'none'
    document.body.style.cursor = options.isCompactPanel() ? 'row-resize' : 'col-resize'
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }

  const effectiveSidebarWidth = computed(() => clampSidebarWidth(sidebarWidth.value))
  const effectiveSidebarHeight = computed(() => clampSidebarHeight(sidebarHeight.value))

  function dispose(): void {
    stopResize?.()
    clearHoverCloseTimer()
    clearResizeCooldownTimer()
  }

  return {
    sidebarWidth,
    sidebarHeight,
    sidebarHovered,
    sidebarPointerInside,
    sidebarResizeLocked,
    effectiveSidebarWidth,
    effectiveSidebarHeight,
    persistSidebarWidth,
    persistSidebarHeight,
    clearHoverCloseTimer,
    clearResizeCooldownTimer,
    scheduleAutoCollapse,
    handlePointerEnter,
    handlePointerLeave,
    clampSidebarWidth,
    clampSidebarHeight,
    handleAutoCollapseToggle,
    startSidebarResize,
    dispose
  }
}

export type InspectorSidebarSize = ReturnType<typeof useInspectorSidebarSize>
