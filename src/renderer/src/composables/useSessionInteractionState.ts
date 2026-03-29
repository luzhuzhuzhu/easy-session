import { computed, nextTick, ref, type ComputedRef } from 'vue'
import type { AppSettings } from '@/stores/settings'
import type { SessionRef, UnifiedSession } from '@/models/unified-resource'
import type { ProjectSessionGroup, SessionTreeSessionItem } from '@/features/sessions/session-tree'

type ToastLike = {
  success(message: string): void
  error(message: string): void
}

type SessionStoreLike = {
  settings?: never
  fetchSessions(): Promise<unknown>
  fetchAllSessions(): Promise<unknown>
  fetchSessionsForInstance(instanceId: string): Promise<unknown>
  getSessionRefByGlobalKey(globalSessionKey: string): SessionRef | null
  getUnifiedSession(globalSessionKey: string): UnifiedSession | null | undefined
  renameSessionRef(sessionRef: SessionRef, name: string): Promise<unknown>
  updateSessionIconRef(sessionRef: SessionRef, emoji: string | null): Promise<unknown>
}

type ProjectStoreLike = {
  fetchProjects(): Promise<unknown>
  fetchAllProjects(): Promise<unknown>
  fetchProjectsForInstance(instanceId: string): Promise<unknown>
}

type InstancesStoreLike = {
  fetchInstances(): Promise<unknown>
}

type WorkspaceStoreLike = {
  openSessionRefInActivePane(sessionRef: SessionRef): void
}

type SettingsStoreLike = {
  settings: AppSettings
}

type CreateDialogPayload = {
  instanceId: string
  sessionId: string
  globalSessionKey: string
}

type CreateDialogOptions = {
  instanceId?: string
  projectId?: string
  projectPath?: string
  lockProjectPath?: boolean
}

type UseSessionInteractionStateOptions = {
  t: (key: string, params?: Record<string, unknown>) => string
  toast: ToastLike
  localInstanceId: string
  sessionsStore: SessionStoreLike
  projectsStore: ProjectStoreLike
  instancesStore: InstancesStoreLike
  workspaceStore: WorkspaceStoreLike
  settingsStore: SettingsStoreLike
  activeSessionForDialog: ComputedRef<UnifiedSession | null>
  toSessionRef: (session: Pick<UnifiedSession, 'instanceId' | 'sessionId' | 'globalSessionKey'>) => SessionRef
  applyRouteSessionSelection: () => void
  reconcileWorkspaceSessions: () => void
  updateSessionUiSettings: (partial: Partial<AppSettings>) => Promise<void>
  startSessionByRef: (sessionRef: SessionRef) => Promise<void>
}

export function useSessionInteractionState(options: UseSessionInteractionStateOptions) {
  const showCreateDialog = ref(false)
  const createDialogProjectPath = ref('')
  const createDialogTargetInstanceId = ref<string>(options.localInstanceId)
  const createDialogTargetProjectId = ref<string | undefined>(undefined)
  const createDialogTargetProjectPath = ref('')
  const createDialogLockProjectPath = ref(false)

  const showRenameDialog = ref(false)
  const renameSessionId = ref<string | null>(null)
  const renameInput = ref('')

  const showWakeDialog = ref(false)
  const pendingWakeSession = ref<SessionTreeSessionItem | null>(null)
  const wakeSkipReminder = ref(false)

  const showIconPicker = ref(false)
  const iconPickerSessionId = ref<string | null>(null)
  const refreshingRemoteData = ref(false)

  const iconEmojiList = [
    '🤖', '🧠', '💡', '🔥', '⚡', '🚀', '🎯', '🛠️',
    '📦', '📁', '🔧', '🔍', '💻', '🖥️', '📝', '✏️',
    '🧪', '🔬', '🎨', '🌟', '⭐', '💎', '🏗️', '🔗',
    '📊', '📈', '🗂️', '🧩', '🎮', '🕹️', '🤝', '👾',
    '🐛', '🐍', '🦀', '🐳', '🐙', '🦊', '🐱', '🐶'
  ]

  const iconPickerSessionIcon = computed(() => {
    if (!iconPickerSessionId.value) return null
    return options.sessionsStore.getUnifiedSession(iconPickerSessionId.value)?.icon ?? null
  })

  function openCreateDialog(createOptions: CreateDialogOptions = {}): void {
    const instanceId = createOptions.instanceId ?? options.localInstanceId
    const projectPath =
      createOptions.projectPath ??
      (instanceId === options.localInstanceId ? options.activeSessionForDialog.value?.projectPath || '' : '')

    createDialogTargetInstanceId.value = instanceId
    createDialogTargetProjectId.value = createOptions.projectId
    createDialogTargetProjectPath.value = projectPath
    createDialogProjectPath.value = projectPath
    createDialogLockProjectPath.value = createOptions.lockProjectPath ?? false
    showCreateDialog.value = true
  }

  function openCreateDialogFromGroup(group: ProjectSessionGroup): void {
    openCreateDialog({
      instanceId: group.instanceId,
      projectId: group.projectId || undefined,
      projectPath: group.projectPath,
      lockProjectPath: true
    })
  }

  function closeCreateDialog(): void {
    showCreateDialog.value = false
    createDialogProjectPath.value = ''
    createDialogTargetInstanceId.value = options.localInstanceId
    createDialogTargetProjectId.value = undefined
    createDialogTargetProjectPath.value = ''
    createDialogLockProjectPath.value = false
  }

  async function handleCreateDialogCreated(payload?: CreateDialogPayload): Promise<void> {
    closeCreateDialog()
    if (payload) {
      await options.sessionsStore.fetchSessionsForInstance(payload.instanceId)
      await options.projectsStore.fetchProjectsForInstance(payload.instanceId)
    } else {
      await options.sessionsStore.fetchSessions()
      await options.projectsStore.fetchProjects()
    }

    options.reconcileWorkspaceSessions()
    await nextTick()

    if (payload) {
      const createdSessionRef = options.sessionsStore.getSessionRefByGlobalKey(payload.globalSessionKey)
      if (createdSessionRef) {
        options.workspaceStore.openSessionRefInActivePane(createdSessionRef)
        return
      }
    }

    options.applyRouteSessionSelection()
  }

  async function maybeHandleDormantSession(session: SessionTreeSessionItem): Promise<boolean> {
    if ((session.status !== 'idle' && session.status !== 'stopped') || session.instanceId !== options.localInstanceId) {
      return false
    }

    if (options.settingsStore.settings.sessionWakeConfirm) {
      pendingWakeSession.value = session
      wakeSkipReminder.value = false
      showWakeDialog.value = true
      return true
    }

    await options.startSessionByRef(options.toSessionRef(session))
    return true
  }

  function closeWakeDialog(): void {
    showWakeDialog.value = false
    pendingWakeSession.value = null
    wakeSkipReminder.value = false
  }

  async function confirmWakeSession(): Promise<void> {
    const session = pendingWakeSession.value
    const disableReminder = wakeSkipReminder.value
    closeWakeDialog()
    if (!session) return

    if (disableReminder && options.settingsStore.settings.sessionWakeConfirm) {
      await options.updateSessionUiSettings({ sessionWakeConfirm: false })
    }

    await options.startSessionByRef(options.toSessionRef(session))
  }

  function openRenameDialog(session: SessionTreeSessionItem): void {
    renameSessionId.value = session.id
    renameInput.value = session.name
    showRenameDialog.value = true
  }

  function closeRenameDialog(): void {
    showRenameDialog.value = false
    renameSessionId.value = null
    renameInput.value = ''
  }

  async function confirmRename(): Promise<void> {
    const id = renameSessionId.value
    const name = renameInput.value.trim()
    if (!id || !name) return

    const current = options.sessionsStore.getUnifiedSession(id)
    if (current && current.name === name) {
      closeRenameDialog()
      return
    }

    try {
      const sessionRef = options.sessionsStore.getSessionRefByGlobalKey(id)
      if (!sessionRef) return
      await options.sessionsStore.renameSessionRef(sessionRef, name)
      options.toast.success(options.t('toast.sessionRenamed'))
      closeRenameDialog()
    } catch (error: unknown) {
      options.toast.error(options.t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  function openIconPicker(session: SessionTreeSessionItem): void {
    iconPickerSessionId.value = session.id
    showIconPicker.value = true
  }

  function closeIconPicker(): void {
    showIconPicker.value = false
    iconPickerSessionId.value = null
  }

  async function confirmIconPick(emoji: string | null): Promise<void> {
    const id = iconPickerSessionId.value
    closeIconPicker()
    if (!id) return

    try {
      const sessionRef = options.sessionsStore.getSessionRefByGlobalKey(id)
      if (!sessionRef) return
      await options.sessionsStore.updateSessionIconRef(sessionRef, emoji)
    } catch (error: unknown) {
      options.toast.error(options.t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
    }
  }

  async function reloadSessionTree(config?: { showToast?: boolean }): Promise<void> {
    const showToast = config?.showToast ?? false
    const wasRefreshing = refreshingRemoteData.value
    refreshingRemoteData.value = true

    try {
      await options.instancesStore.fetchInstances()
      await Promise.all([
        options.sessionsStore.fetchAllSessions(),
        options.projectsStore.fetchAllProjects()
      ])
      options.reconcileWorkspaceSessions()
      options.applyRouteSessionSelection()
      if (showToast) {
        options.toast.success(options.t('toast.remoteRefreshed'))
      }
    } catch (error: unknown) {
      if (showToast) {
        options.toast.error(options.t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
      }
    } finally {
      if (!wasRefreshing) {
        refreshingRemoteData.value = false
      }
    }
  }

  async function handleRefreshRemoteData(): Promise<void> {
    if (refreshingRemoteData.value) return
    await reloadSessionTree({ showToast: true })
  }

  return {
    showCreateDialog,
    createDialogProjectPath,
    createDialogTargetInstanceId,
    createDialogTargetProjectId,
    createDialogTargetProjectPath,
    createDialogLockProjectPath,
    showRenameDialog,
    renameInput,
    showWakeDialog,
    pendingWakeSession,
    wakeSkipReminder,
    showIconPicker,
    refreshingRemoteData,
    iconEmojiList,
    iconPickerSessionIcon,
    openCreateDialog,
    openCreateDialogFromGroup,
    closeCreateDialog,
    handleCreateDialogCreated,
    maybeHandleDormantSession,
    closeWakeDialog,
    confirmWakeSession,
    openRenameDialog,
    closeRenameDialog,
    confirmRename,
    openIconPicker,
    closeIconPicker,
    confirmIconPick,
    reloadSessionTree,
    handleRefreshRemoteData
  }
}
