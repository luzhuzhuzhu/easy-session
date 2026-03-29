import { computed, ref } from 'vue'
import type { AppSettings } from '@/stores/settings'
import type { InstanceCapabilities, SessionRef, UnifiedSession } from '@/models/unified-resource'
import type { ProjectSessionGroup, SessionTreeSessionItem } from '@/features/sessions/session-tree'

type SettingsStoreLike = {
  settings: AppSettings
  update(partial: Partial<AppSettings>): Promise<void>
}

type SessionsStoreLike = {
  getUnifiedSession(globalSessionKey: string): UnifiedSession | null | undefined
  destroySessionRef(sessionRef: SessionRef): Promise<void>
}

type WorkspaceLayoutLike = {
  activePaneId: string
}

type WorkspaceStoreLike = {
  layout: WorkspaceLayoutLike
  splitPane(paneId: string, direction: 'horizontal' | 'vertical'): void
  openSessionRefInActivePane(sessionRef: SessionRef): void
  openSessionRefInPane(sessionRef: SessionRef, paneId: string): void
}

type ToastLike = {
  success(message: string): void
  error(message: string): void
}

type UseSessionTreeInteractionsOptions = {
  t: (key: string, params?: Record<string, unknown>) => string
  toast: ToastLike
  settingsStore: SettingsStoreLike
  sessionsStore: SessionsStoreLike
  workspaceStore: WorkspaceStoreLike
  instancesStore: {
    getInstance(id: string): { capabilities: InstanceCapabilities } | null | undefined
  }
  toSessionRef: (session: Pick<UnifiedSession, 'instanceId' | 'sessionId' | 'globalSessionKey'>) => SessionRef
  buildProjectGroupKey: (instanceId: string, projectPath: string) => string
  openRenameDialog: (session: SessionTreeSessionItem) => void
  openIconPicker: (session: SessionTreeSessionItem) => void
  startSession: (sessionRef: SessionRef) => Promise<void>
  pauseSession: (sessionRef: SessionRef) => Promise<void>
  restartSession: (sessionRef: SessionRef) => Promise<void>
}

export function useSessionTreeInteractions(options: UseSessionTreeInteractionsOptions) {
  const contextMenu = ref({ visible: false, x: 0, y: 0, session: null as SessionTreeSessionItem | null })
  const sessionDragState = ref<{ sessionId: string; projectKey: string } | null>(null)
  const projectDragState = ref<{ group: ProjectSessionGroup } | null>(null)
  const topProjectDragState = ref<{ group: ProjectSessionGroup } | null>(null)

  const contextSessionCapabilities = computed<InstanceCapabilities | null>(() => {
    const session = contextMenu.value.session
    if (!session) return null
    return options.instancesStore.getInstance(session.instanceId)?.capabilities ?? null
  })

  function handleSessionDragStart(event: DragEvent, session: SessionTreeSessionItem): void {
    if (!event.dataTransfer) return
    const sessionData = {
      sessionId: session.sessionId,
      instanceId: session.instanceId,
      globalSessionKey: session.globalSessionKey
    }
    event.dataTransfer.setData('application/x-easysession-session', JSON.stringify(sessionData))
    event.dataTransfer.setData(
      'application/x-easysession-session-reorder',
      JSON.stringify({ globalSessionKey: session.globalSessionKey })
    )
    event.dataTransfer.effectAllowed = 'move'

    const path = session.projectPath || ''
    const key = options.buildProjectGroupKey(session.instanceId, path)
    sessionDragState.value = { sessionId: session.id, projectKey: key }
  }

  function handleSessionDragOver(event: DragEvent, projectKey: string): void {
    if (!event.dataTransfer) return
    const sessionReorderRaw = event.dataTransfer.getData('application/x-easysession-session-reorder')
    if (!sessionReorderRaw) return

    try {
      const sessionData = JSON.parse(sessionReorderRaw) as { globalSessionKey?: string }
      const session = sessionData.globalSessionKey
        ? options.sessionsStore.getUnifiedSession(sessionData.globalSessionKey)
        : null
      if (!session) return

      const sessionPath = options.buildProjectGroupKey(session.instanceId, session.projectPath || '')
      if (sessionPath !== projectKey) {
        event.dataTransfer.dropEffect = 'none'
        return
      }

      event.dataTransfer.dropEffect = 'move'
    } catch {
      event.dataTransfer.dropEffect = 'none'
    }
  }

  function handleSessionDrop(event: DragEvent, projectKey: string, targetSessionId: string): void {
    event.preventDefault()
    event.stopPropagation()
    if (!event.dataTransfer) return
    const sessionReorderRaw = event.dataTransfer.getData('application/x-easysession-session-reorder')
    if (!sessionReorderRaw) return

    try {
      const sessionData = JSON.parse(sessionReorderRaw) as { globalSessionKey?: string }
      const draggedSessionId = sessionData.globalSessionKey
      if (!draggedSessionId || draggedSessionId === targetSessionId) return

      const session = options.sessionsStore.getUnifiedSession(draggedSessionId)
      if (!session) return

      const sessionPath = options.buildProjectGroupKey(session.instanceId, session.projectPath || '')
      if (sessionPath !== projectKey) return

      const currentOrder = options.settingsStore.settings.manualSessionOrder[projectKey] || []
      const filteredOrder = currentOrder.filter((id) => id !== draggedSessionId)
      const targetIndex = filteredOrder.indexOf(targetSessionId)

      if (targetIndex === -1) {
        filteredOrder.push(draggedSessionId)
      } else {
        filteredOrder.splice(targetIndex, 0, draggedSessionId)
      }

      const newOrder = { ...options.settingsStore.settings.manualSessionOrder, [projectKey]: filteredOrder }
      void options.settingsStore.update({ manualSessionOrder: newOrder })
    } catch {
      // ignore invalid drag payload
    } finally {
      sessionDragState.value = null
    }
  }

  function handleSessionDragEnd(): void {
    sessionDragState.value = null
  }

  function handleProjectDragStart(event: DragEvent, group: ProjectSessionGroup): void {
    if (!event.dataTransfer) return
    event.dataTransfer.setData('application/x-easysession-project-reorder', JSON.stringify({ projectKey: group.key }))
    event.dataTransfer.effectAllowed = 'move'
    projectDragState.value = { group }
  }

  function handleProjectDragOver(event: DragEvent): void {
    if (!event.dataTransfer) return
    const projectReorderRaw = event.dataTransfer.getData('application/x-easysession-project-reorder')
    if (!projectReorderRaw) return
    event.dataTransfer.dropEffect = 'move'
  }

  function handleProjectDrop(event: DragEvent, targetProjectKey: string): void {
    event.preventDefault()
    event.stopPropagation()
    if (!event.dataTransfer) return
    const projectReorderRaw = event.dataTransfer.getData('application/x-easysession-project-reorder')
    if (!projectReorderRaw) return

    try {
      const projectData = JSON.parse(projectReorderRaw) as { projectKey: string }
      const draggedProjectKey = projectData.projectKey
      if (draggedProjectKey === targetProjectKey) return

      const currentOrder = options.settingsStore.settings.manualProjectOrder || []
      const filteredOrder = currentOrder.filter((key) => key !== draggedProjectKey)
      const targetIndex = filteredOrder.indexOf(targetProjectKey)

      if (targetIndex === -1) {
        filteredOrder.push(draggedProjectKey)
      } else {
        filteredOrder.splice(targetIndex, 0, draggedProjectKey)
      }

      void options.settingsStore.update({ manualProjectOrder: filteredOrder })
    } catch {
      // ignore invalid drag payload
    } finally {
      projectDragState.value = null
    }
  }

  function handleProjectDragEnd(): void {
    projectDragState.value = null
  }

  function handleTopProjectDragStart(event: DragEvent, group: ProjectSessionGroup): void {
    if (!event.dataTransfer) return
    event.dataTransfer.setData('application/x-easysession-project-reorder', JSON.stringify({ projectKey: group.key }))
    event.dataTransfer.effectAllowed = 'move'
    topProjectDragState.value = { group }
  }

  function handleTopProjectDragOver(event: DragEvent): void {
    if (!event.dataTransfer) return
    const projectReorderRaw = event.dataTransfer.getData('application/x-easysession-project-reorder')
    if (!projectReorderRaw) return
    event.dataTransfer.dropEffect = 'move'
  }

  function handleTopProjectDrop(event: DragEvent, targetProjectKey: string): void {
    event.preventDefault()
    event.stopPropagation()
    if (!event.dataTransfer) return
    const projectReorderRaw = event.dataTransfer.getData('application/x-easysession-project-reorder')
    if (!projectReorderRaw) return

    try {
      const projectData = JSON.parse(projectReorderRaw) as { projectKey: string }
      const draggedProjectKey = projectData.projectKey
      if (draggedProjectKey === targetProjectKey) return

      const currentOrder = options.settingsStore.settings.manualProjectOrder || []
      const filteredOrder = currentOrder.filter((key) => key !== draggedProjectKey)
      const targetIndex = filteredOrder.indexOf(targetProjectKey)

      if (targetIndex === -1) {
        filteredOrder.push(draggedProjectKey)
      } else {
        filteredOrder.splice(targetIndex, 0, draggedProjectKey)
      }

      void options.settingsStore.update({ manualProjectOrder: filteredOrder })
    } catch {
      // ignore invalid drag payload
    } finally {
      topProjectDragState.value = null
    }
  }

  function handleTopProjectDragEnd(): void {
    topProjectDragState.value = null
  }

  function openContextMenu(event: MouseEvent, session: SessionTreeSessionItem): void {
    contextMenu.value = { visible: true, x: event.clientX, y: event.clientY, session }
  }

  function handleOpenInPaneContext(): void {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (!session) return
    const sessionRef = options.toSessionRef(session)
    options.workspaceStore.openSessionRefInActivePane(sessionRef)
  }

  function handleSplitOpenContext(direction: 'horizontal' | 'vertical'): void {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (!session) return

    const sessionRef = options.toSessionRef(session)
    const activePaneId = options.workspaceStore.layout.activePaneId
    options.workspaceStore.splitPane(activePaneId, direction)
    const targetPaneId = options.workspaceStore.layout.activePaneId
    options.workspaceStore.openSessionRefInPane(sessionRef, targetPaneId)
  }

  async function destroySessionWithConfirm(sessionRef: SessionRef): Promise<void> {
    if (!confirm(options.t('session.confirmDestroy'))) return
    try {
      await options.sessionsStore.destroySessionRef(sessionRef)
      options.toast.success(options.t('toast.sessionDestroyed'))
    } catch (error: unknown) {
      options.toast.error(options.t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  async function handleDestroyContext(): Promise<void> {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (session) {
      await destroySessionWithConfirm(options.toSessionRef(session))
    }
  }

  async function handleStartContext(): Promise<void> {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (session) {
      await options.startSession(options.toSessionRef(session))
    }
  }

  async function handlePauseContext(): Promise<void> {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (session) {
      await options.pauseSession(options.toSessionRef(session))
    }
  }

  async function handleRestartContext(): Promise<void> {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (session) {
      await options.restartSession(options.toSessionRef(session))
    }
  }

  async function handleRenameFromContext(): Promise<void> {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (session) {
      options.openRenameDialog(session)
    }
  }

  function handleChangeIconFromContext(): void {
    const session = contextMenu.value.session
    contextMenu.value.visible = false
    if (session) {
      options.openIconPicker(session)
    }
  }

  return {
    contextMenu,
    contextSessionCapabilities,
    handleSessionDragStart,
    handleSessionDragOver,
    handleSessionDrop,
    handleSessionDragEnd,
    handleProjectDragStart,
    handleProjectDragOver,
    handleProjectDrop,
    handleProjectDragEnd,
    handleTopProjectDragStart,
    handleTopProjectDragOver,
    handleTopProjectDrop,
    handleTopProjectDragEnd,
    openContextMenu,
    handleOpenInPaneContext,
    handleSplitOpenContext,
    destroySessionWithConfirm,
    handleDestroyContext,
    handleStartContext,
    handlePauseContext,
    handleRestartContext,
    handleRenameFromContext,
    handleChangeIconFromContext
  }
}
