import { computed } from 'vue'
import type { AppSettings } from '@/stores/settings'
import type { SessionRef } from '@/models/unified-resource'
import type { WorkspaceSplitDirection } from '@/api/workspace'

type ToastLike = {
  success(message: string): void
  error(message: string): void
}

type SettingsStoreLike = {
  settings: AppSettings
  update(partial: Partial<AppSettings>): Promise<void>
}

type WorkspaceStoreLike = {
  layout: {
    tabs: Record<string, { instanceId: string; sessionId: string; globalSessionKey: string }>
    activePaneId: string
  }
  paneIds: string[]
  focusPane(paneId: string): void
  setActiveTab(paneId: string, tabId: string): void
  splitPane(paneId: string, direction: WorkspaceSplitDirection): void
  closePane(paneId: string): void
  closeTab(paneId: string, tabId: string): void
  moveTabToPane(payload: { fromPaneId: string; toPaneId: string; tabId: string; toIndex?: number }): void
  splitPaneAndMoveTab(payload: {
    sourcePaneId: string
    targetPaneId: string
    tabId: string
    direction: WorkspaceSplitDirection
  }): void
  closeOtherTabs(paneId: string, tabId: string): void
  closeTabsToRight(paneId: string, tabId: string): void
  toggleTabPinned(tabId: string): void
  updateSplitRatio(path: string, ratio: number): void
  evenSplitForPane(paneId: string): void
  openSessionRefInPane(sessionRef: SessionRef, paneId: string): void
  swapPaneTabs(fromPaneId: string, toPaneId: string): void
  undoLayoutChange(): boolean
  hardReset(): Promise<void>
  activeSessionRef: SessionRef | null
}

type SessionsStoreLike = {
  setActiveSessionRef(sessionRef: SessionRef): void
  getUnifiedSession(globalSessionKey: string): unknown
}

type UseWorkspacePaneActionsOptions = {
  t: (key: string, params?: Record<string, unknown>) => string
  toast: ToastLike
  settingsStore: SettingsStoreLike
  workspaceStore: WorkspaceStoreLike
  sessionsStore: SessionsStoreLike
  reconcileWorkspaceSessions: () => void
}

const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 28

export function useWorkspacePaneActions(options: UseWorkspacePaneActionsOptions) {
  function clampFontSize(size: number): number {
    if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE
    return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size)))
  }

  async function updateSessionUiSettings(partial: Partial<AppSettings>): Promise<void> {
    try {
      await options.settingsStore.update(partial)
    } catch (error: unknown) {
      options.toast.error(
        options.t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error))
      )
    }
  }

  function syncActiveSessionWithWorkspace(): void {
    if (options.workspaceStore.activeSessionRef) {
      options.sessionsStore.setActiveSessionRef(options.workspaceStore.activeSessionRef)
    }
  }

  const paneZoomPercentById = computed<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    const baseFontSize = clampFontSize(options.settingsStore.settings.terminalFontSize ?? DEFAULT_FONT_SIZE)
    const byPane = options.settingsStore.settings.terminalFontSizeByPane || {}
    for (const paneId of options.workspaceStore.paneIds) {
      const paneFontSize = clampFontSize(byPane[paneId] ?? baseFontSize)
      const percent = Math.round((paneFontSize / baseFontSize) * 100)
      result[paneId] = Math.max(50, Math.min(300, percent))
    }
    return result
  })

  function pruneTerminalFontSizeByPane(activePaneIds: string[]): void {
    const current = options.settingsStore.settings.terminalFontSizeByPane || {}
    if (Object.keys(current).length === 0) return

    const activePaneIdSet = new Set(activePaneIds)
    const next: Record<string, number> = {}
    let changed = false

    for (const [paneId, fontSize] of Object.entries(current)) {
      if (!activePaneIdSet.has(paneId)) {
        changed = true
        continue
      }
      next[paneId] = fontSize
    }

    if (!changed) return
    void updateSessionUiSettings({ terminalFontSizeByPane: next })
  }

  async function handleResetPaneZoom(paneId: string): Promise<void> {
    if (!paneId) return
    const current = options.settingsStore.settings.terminalFontSizeByPane || {}
    if (!(paneId in current)) return
    const next = { ...current }
    delete next[paneId]
    await updateSessionUiSettings({ terminalFontSizeByPane: next })
  }

  async function handleSetPaneZoom(payload: { paneId: string; percent: number }): Promise<void> {
    const paneId = payload.paneId
    if (!paneId) return
    const percent = Number(payload.percent)
    if (!Number.isFinite(percent) || percent <= 0) return

    const baseFontSize = clampFontSize(options.settingsStore.settings.terminalFontSize ?? DEFAULT_FONT_SIZE)
    const targetFontSize = clampFontSize((baseFontSize * percent) / 100)
    const current = options.settingsStore.settings.terminalFontSizeByPane || {}
    const next = { ...current }

    if (targetFontSize === baseFontSize) {
      if (!(paneId in next)) return
      delete next[paneId]
    } else {
      if (next[paneId] === targetFontSize) return
      next[paneId] = targetFontSize
    }
    await updateSessionUiSettings({ terminalFontSizeByPane: next })
  }

  function handleFocusPane(paneId: string): void {
    options.workspaceStore.focusPane(paneId)
    syncActiveSessionWithWorkspace()
  }

  function handleSetPaneTab(payload: { paneId: string; tabId: string }): void {
    options.workspaceStore.setActiveTab(payload.paneId, payload.tabId)
    const tab = options.workspaceStore.layout.tabs[payload.tabId]
    if (tab) {
      options.sessionsStore.setActiveSessionRef({
        instanceId: tab.instanceId,
        sessionId: tab.sessionId,
        globalSessionKey: tab.globalSessionKey
      })
    }
  }

  function handleSplitPane(payload: { paneId: string; direction: WorkspaceSplitDirection }): void {
    options.workspaceStore.splitPane(payload.paneId, payload.direction)
  }

  function handleClosePane(paneId: string): void {
    options.workspaceStore.closePane(paneId)
    syncActiveSessionWithWorkspace()
  }

  function handleClosePaneTab(payload: { paneId: string; tabId: string }): void {
    options.workspaceStore.closeTab(payload.paneId, payload.tabId)
    syncActiveSessionWithWorkspace()
  }

  function handleMoveTab(payload: { fromPaneId: string; toPaneId: string; tabId: string; toIndex?: number }): void {
    options.workspaceStore.moveTabToPane(payload)
    syncActiveSessionWithWorkspace()
  }

  function handleSplitAndMoveTab(payload: {
    sourcePaneId: string
    targetPaneId: string
    tabId: string
    direction: WorkspaceSplitDirection
  }): void {
    options.workspaceStore.splitPaneAndMoveTab(payload)
    syncActiveSessionWithWorkspace()
  }

  function handleCloseOtherTabs(payload: { paneId: string; tabId: string }): void {
    options.workspaceStore.closeOtherTabs(payload.paneId, payload.tabId)
    syncActiveSessionWithWorkspace()
  }

  function handleCloseTabsRight(payload: { paneId: string; tabId: string }): void {
    options.workspaceStore.closeTabsToRight(payload.paneId, payload.tabId)
    syncActiveSessionWithWorkspace()
  }

  function handleToggleTabPin(tabId: string): void {
    options.workspaceStore.toggleTabPinned(tabId)
  }

  function handleResizeSplit(payload: { path: string; ratio: number }): void {
    options.workspaceStore.updateSplitRatio(payload.path, payload.ratio)
  }

  function handleEvenSplitPane(paneId: string): void {
    options.workspaceStore.evenSplitForPane(paneId)
  }

  function handleOpenSessionDrop(payload: {
    sessionRef: SessionRef
    targetPaneId: string
    direction?: WorkspaceSplitDirection
  }): void {
    const exists = !!options.sessionsStore.getUnifiedSession(payload.sessionRef.globalSessionKey)
    if (!exists) return

    if (payload.direction) {
      options.workspaceStore.splitPane(payload.targetPaneId, payload.direction)
      const targetPaneId = options.workspaceStore.layout.activePaneId
      options.workspaceStore.openSessionRefInPane(payload.sessionRef, targetPaneId)
    } else {
      options.workspaceStore.openSessionRefInPane(payload.sessionRef, payload.targetPaneId)
    }

    syncActiveSessionWithWorkspace()
  }

  function handleSwapPaneTabs(payload: { fromPaneId: string; toPaneId: string }): void {
    options.workspaceStore.swapPaneTabs(payload.fromPaneId, payload.toPaneId)
    syncActiveSessionWithWorkspace()
  }

  function handleUndoLayout(): void {
    const undone = options.workspaceStore.undoLayoutChange()
    if (undone) {
      syncActiveSessionWithWorkspace()
    }
  }

  async function handleResetWorkspace(): Promise<void> {
    if (!confirm(options.t('session.confirmResetLayout'))) return
    await options.workspaceStore.hardReset()
    options.reconcileWorkspaceSessions()
    options.toast.success(options.t('toast.layoutReset'))
  }

  return {
    paneZoomPercentById,
    pruneTerminalFontSizeByPane,
    handleResetPaneZoom,
    handleSetPaneZoom,
    handleFocusPane,
    handleSetPaneTab,
    handleSplitPane,
    handleClosePane,
    handleClosePaneTab,
    handleMoveTab,
    handleSplitAndMoveTab,
    handleCloseOtherTabs,
    handleCloseTabsRight,
    handleToggleTabPin,
    handleResizeSplit,
    handleEvenSplitPane,
    handleOpenSessionDrop,
    handleSwapPaneTabs,
    handleUndoLayout,
    handleResetWorkspace
  }
}
