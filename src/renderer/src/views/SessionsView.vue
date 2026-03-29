<template>
  <div class="sessions-page" :class="{ 'top-layout': isTopLayout }">
    <SessionTopList
      v-if="isTopLayout"
      :project-session-tree="projectSessionTree"
      :active-global-session-key="sessionsStore.activeGlobalSessionKey"
      :filter-type="filterType"
      :is-list-collapsed="isListCollapsed"
      :is-top-layout="isTopLayout"
      :desktop-remote-mount-enabled="settingsStore.settings.desktopRemoteMountEnabled"
      :refreshing-remote-data="refreshingRemoteData"
      :on-create="openCreateDialog"
      :on-refresh-remote="handleRefreshRemoteData"
      :on-toggle-list-position="toggleListPosition"
      :on-toggle-list-collapsed="toggleListCollapsed"
      :on-session-click="handleSessionClick"
      :on-session-drag-start="handleSessionDragStart"
      :on-session-drag-over="handleSessionDragOver"
      :on-session-drop="handleSessionDrop"
      :on-session-drag-end="handleSessionDragEnd"
      :on-session-context-menu="openContextMenu"
      :on-top-project-drag-start="handleTopProjectDragStart"
      :on-top-project-drag-over="handleTopProjectDragOver"
      :on-top-project-drop="handleTopProjectDrop"
      :on-top-project-drag-end="handleTopProjectDragEnd"
      @update:filter-type="filterType = $event"
    />

    <div class="sessions-main-area">
      <aside v-if="!isTopLayout" class="session-list-panel" :class="{ collapsed: isListCollapsed }">
        <SessionSidebarControls
          :is-list-collapsed="isListCollapsed"
          :filter-type="filterType"
          :desktop-remote-mount-enabled="settingsStore.settings.desktopRemoteMountEnabled"
          :refreshing-remote-data="refreshingRemoteData"
          @create="openCreateDialog()"
          @refresh-remote="handleRefreshRemoteData"
          @update:filter-type="filterType = $event"
        />

        <template v-if="!isListCollapsed">
          <div class="session-tree-host">
            <SessionSidebarTree
              :nodes="sidebarTreeNodes"
              :active-global-session-key="sessionsStore.activeGlobalSessionKey"
              :expanded-instances="expandedInstanceMap"
              :expanded-projects="expandedProjectMap"
              :on-toggle-instance="toggleInstanceExpand"
              :on-toggle-project="toggleProjectExpand"
              :on-project-drag-start="handleProjectDragStart"
              :on-project-drag-over="handleProjectDragOver"
              :on-project-drop="handleProjectDrop"
              :on-project-drag-end="handleProjectDragEnd"
              :on-open-create-dialog="openCreateDialogFromGroup"
              :on-open-project="openProject"
              :on-session-click="handleSessionClick"
              :on-session-drag-start="handleSessionDragStart"
              :on-session-drag-over="handleSessionDragOver"
              :on-session-drop="handleSessionDrop"
              :on-session-drag-end="handleSessionDragEnd"
              :on-session-context-menu="openContextMenu"
            />
          </div>
        </template>
        <div v-else class="session-items compact">
        <template v-for="group in projectSessionTree" :key="group.key">
          <div v-if="group.sessions.length > 0" class="compact-group-label" :title="group.projectName">
            {{ group.projectName.charAt(0) }}
          </div>
          <button
            v-for="s in group.sessions"
            :key="s.id"
            class="session-item compact"
            :class="{ active: sessionsStore.activeGlobalSessionKey === s.id }"
            draggable="true"
            @click="handleSessionClick(s)"
            @dragstart="handleSessionDragStart($event, s)"
            @dragover.prevent="handleSessionDragOver($event, group.key)"
            @drop="handleSessionDrop($event, group.key, s.id)"
            @dragend="handleSessionDragEnd"
            @contextmenu.prevent="openContextMenu($event, s)"
          >
            <span v-if="s.icon" class="session-icon">{{ s.icon }}</span>
            <span v-else class="type-badge" :class="s.type">{{ s.type === 'claude' ? 'C' : s.type === 'codex' ? 'X' : 'O' }}</span>
            <span class="status-dot" :class="s.status"></span>
          </button>
        </template>
        </div>

        <SessionSidebarFooterControls
          :is-list-collapsed="isListCollapsed"
          :is-top-layout="isTopLayout"
          @toggle-list-position="toggleListPosition"
          @toggle-list-collapsed="toggleListCollapsed"
        />
      </aside>

      <main class="session-detail-panel">
        <WorkspacePaneTree
          class="workspace-root"
          node-path="root"
          :node="workspaceLayout.root"
          :tabs-index="workspaceLayout.tabs"
          :resolved-tabs-index="workspaceStore.resolvedTabs"
          :sessions-by-global-key="sessionsByGlobalKey"
          :pane-zoom-percent-by-id="paneZoomPercentById"
          :active-pane-id="workspaceLayout.activePaneId"
          :can-close-panes="workspaceStore.paneCount > 1"
          :pane-ids="workspaceStore.paneIds"
          @focus-pane="handleFocusPane"
          @set-active-tab="handleSetPaneTab"
          @split-pane="handleSplitPane"
          @close-pane="handleClosePane"
          @close-tab="handleClosePaneTab"
          @move-tab="handleMoveTab"
          @split-and-move-tab="handleSplitAndMoveTab"
          @close-other-tabs="handleCloseOtherTabs"
          @close-tabs-right="handleCloseTabsRight"
          @toggle-tab-pin="handleToggleTabPin"
          @resize-split="handleResizeSplit"
          @even-split-pane="handleEvenSplitPane"
          @open-session-drop="handleOpenSessionDrop"
          @undo-layout="handleUndoLayout"
          @reset-layout="handleResetWorkspace"
          @start-session="handleStart"
          @pause-session="handlePause"
          @restart-session="handleRestart"
          @destroy-session="handleDestroy"
          @clear-output="sessionsStore.clearSessionOutputRef($event)"
          @set-pane-zoom="handleSetPaneZoom"
          @reset-pane-zoom="handleResetPaneZoom"
          @swap-pane-tabs="handleSwapPaneTabs"
        />
      </main>

      <InspectorPanel class="inspector-panel-shell" />
    </div>

    <CreateSessionDialog
      :visible="showCreateDialog"
      :default-project-path="createDialogProjectPath"
      :target-instance-id="createDialogTargetInstanceId"
      :target-project-id="createDialogTargetProjectId"
      :target-project-path="createDialogTargetProjectPath"
      :lock-project-path="createDialogLockProjectPath"
      :activate-on-create="false"
      @cancel="closeCreateDialog"
      @created="handleCreateDialogCreated"
    />

    <SessionActionLayer
      :context-menu-visible="contextMenu.visible"
      :context-menu-x="contextMenu.x"
      :context-menu-y="contextMenu.y"
      :context-session="contextMenu.session"
      :context-session-capabilities="contextSessionCapabilities"
      :show-rename-dialog="showRenameDialog"
      :rename-input="renameInput"
      :show-wake-dialog="showWakeDialog"
      :pending-wake-session="pendingWakeSession"
      :wake-skip-reminder="wakeSkipReminder"
      :show-icon-picker="showIconPicker"
      :icon-emoji-list="iconEmojiList"
      :icon-picker-session-icon="iconPickerSessionIcon"
      @close-context="contextMenu.visible = false"
      @open-in-pane="handleOpenInPaneContext"
      @split-open="handleSplitOpenContext"
      @start-context="handleStartContext"
      @pause-context="handlePauseContext"
      @restart-context="handleRestartContext"
      @rename="handleRenameFromContext"
      @change-icon="handleChangeIconFromContext"
      @destroy-context="handleDestroyContext"
      @update:rename-input="renameInput = $event"
      @close-rename="closeRenameDialog"
      @confirm-rename="confirmRename"
      @update:wake-skip-reminder="wakeSkipReminder = $event"
      @close-wake="closeWakeDialog"
      @confirm-wake="confirmWakeSession"
      @close-icon-picker="closeIconPicker"
      @pick-icon="confirmIconPick"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSessionsPageCoordination } from '@/composables/useSessionsPageCoordination'
import { useSessionInteractionState } from '@/composables/useSessionInteractionState'
import { useSessionTreeInteractions } from '@/composables/useSessionTreeInteractions'
import { useWorkspacePaneActions } from '@/composables/useWorkspacePaneActions'
import { useSessionsStore } from '@/stores/sessions'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore, type AppSettings } from '@/stores/settings'
import { useWorkspaceStore } from '@/stores/workspace'
import { useInstancesStore } from '@/stores/instances'
import { useInspectorStore } from '@/stores/inspector'
import { useToast } from '@/composables/useToast'
import CreateSessionDialog from '@/components/CreateSessionDialog.vue'
import InspectorPanel from '@/components/InspectorPanel.vue'
import SessionActionLayer from '@/components/SessionActionLayer.vue'
import SessionSidebarControls from '@/components/SessionSidebarControls.vue'
import SessionSidebarFooterControls from '@/components/SessionSidebarFooterControls.vue'
import SessionTopList from '@/components/SessionTopList.vue'
import SessionSidebarTree from '@/components/SessionSidebarTree.vue'
import WorkspacePaneTree from '@/components/WorkspacePaneTree.vue'
import {
  buildProjectGroupKey,
  createInstanceTreeBuilder,
  createProjectSessionTreeBuilder,
  createSessionSidebarTreeFlattener,
  type InstanceTreeGroup,
  type ProjectMeta,
  type ProjectSessionGroup,
  type SessionSidebarTreeNode,
  type SessionTreeSessionItem
} from '@/features/sessions/session-tree'
import {
  LOCAL_INSTANCE_ID,
  type SessionRef,
  type UnifiedSession
} from '@/models/unified-resource'
import { buildProjectRouteLocation } from '@/utils/project-routing'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const sessionsStore = useSessionsStore()
const projectsStore = useProjectsStore()
const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()
const instancesStore = useInstancesStore()
useInspectorStore()
const toast = useToast()

type SessionListItem = SessionTreeSessionItem

function toSessionRef(session: Pick<UnifiedSession, 'instanceId' | 'sessionId' | 'globalSessionKey'>): SessionRef {
  return {
    instanceId: session.instanceId,
    sessionId: session.sessionId,
    globalSessionKey: session.globalSessionKey
  }
}

const filterType = ref('')
const projectSessionTreeBuilder = createProjectSessionTreeBuilder()
const instanceTreeBuilder = createInstanceTreeBuilder()
const flattenSidebarTree = createSessionSidebarTreeFlattener()

function createSessionListItemProjector() {
  const cache = new Map<string, SessionListItem>()

  return (sessions: UnifiedSession[]): SessionListItem[] => {
    const activeKeys = new Set<string>()
    const next: SessionListItem[] = []

    for (const session of sessions) {
      const key = session.globalSessionKey
      activeKeys.add(key)
      const cached =
        cache.get(key) ??
        {
          ...session,
          id: key
        }

      Object.assign(cached, session)
      cached.id = key
      cache.set(key, cached)
      next.push(cached)
    }

    for (const key of [...cache.keys()]) {
      if (!activeKeys.has(key)) {
        cache.delete(key)
      }
    }

    return next
  }
}

function createProjectMetaProjector() {
  const cache = new Map<string, ProjectMeta>()

  return (projects: typeof projectsStore.unifiedProjects.value): ProjectMeta[] => {
    const activeKeys = new Set<string>()
    const next = [...projects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((project) => {
        activeKeys.add(project.globalProjectKey)
        const cached =
          cache.get(project.globalProjectKey) ?? {
            globalProjectKey: project.globalProjectKey,
            projectId: project.projectId,
            instanceId: project.instanceId,
            name: project.name,
            path: project.path,
            lastOpenedAt: project.lastOpenedAt,
            source: project.source
          }

        cached.globalProjectKey = project.globalProjectKey
        cached.projectId = project.projectId
        cached.instanceId = project.instanceId
        cached.name = project.name
        cached.path = project.path
        cached.lastOpenedAt = project.lastOpenedAt
        cached.source = project.source
        cache.set(project.globalProjectKey, cached)
        return cached
      })

    for (const key of [...cache.keys()]) {
      if (!activeKeys.has(key)) {
        cache.delete(key)
      }
    }

    return next
  }
}

const projectSessionItems = createSessionListItemProjector()
const projectMetaItems = createProjectMetaProjector()

const filteredSessions = computed(() => {
  const items = projectSessionItems(sessionsStore.unifiedSessions)
  if (!filterType.value) return items
  return items.filter((s) => s.type === filterType.value)
})

const projectMetaIndex = computed(() => {
  const sorted = projectMetaItems(projectsStore.unifiedProjects)

  const byKey = new Map<string, ProjectMeta>()
  for (const project of sorted) {
    byKey.set(buildProjectGroupKey(project.instanceId, project.path), project)
  }

  return { sorted, byKey }
})

const projectSessionTree = computed<ProjectSessionGroup[]>(() => {
  return projectSessionTreeBuilder({
    filteredSessions: filteredSessions.value,
    sortedProjects: projectMetaIndex.value.sorted,
    projectByKey: projectMetaIndex.value.byKey,
    instancesById: instancesStore.instanceIndex,
    includeEmptyProjects: !filterType.value,
    smartSessionsEnabled:
      settingsStore.settings.smartPriorityEnabled &&
      (settingsStore.settings.smartPriorityScope === 'sessions' ||
        settingsStore.settings.smartPriorityScope === 'both'),
    smartProjectsEnabled:
      settingsStore.settings.smartPriorityEnabled &&
      (settingsStore.settings.smartPriorityScope === 'projects' ||
        settingsStore.settings.smartPriorityScope === 'both'),
    mode: settingsStore.settings.smartPriorityMode,
    now: Date.now(),
    manualSessionOrder: settingsStore.settings.manualSessionOrder || {},
    manualProjectOrder: settingsStore.settings.manualProjectOrder || [],
    unmanagedProjectLabel: t('session.unmanagedProject')
  })
})

const instanceTree = computed<InstanceTreeGroup[]>(() => {
  return instanceTreeBuilder(instancesStore.instances, projectSessionTree.value)
})

const sidebarTreeNodes = computed<SessionSidebarTreeNode[]>(() => {
  return flattenSidebarTree(
    instanceTree.value,
    expandedInstanceMap.value,
    expandedProjectMap.value
  )
})

const workspaceLayout = computed(() => workspaceStore.layout)
const sessionsByGlobalKey = computed(() => {
  return sessionsStore.sessionIndexByGlobalKey
})

const activeSessionForDialog = computed(() => {
  const activeSession = workspaceStore.activeSessionRef
    ? sessionsStore.getUnifiedSession(workspaceStore.activeSessionRef.globalSessionKey)
    : sessionsStore.activeUnifiedSession
  if (!activeSession || activeSession.instanceId !== LOCAL_INSTANCE_ID) return null
  return activeSession
})

function applyRouteSessionSelection() {
  const queryGlobalSessionKey =
    typeof route.query.globalSessionKey === 'string' ? route.query.globalSessionKey : ''
  if (queryGlobalSessionKey) {
    const sessionRef = sessionsStore.getSessionRefByGlobalKey(queryGlobalSessionKey)
    if (sessionRef) {
      sessionsStore.setActiveSessionRef(sessionRef)
      if (!workspaceStore.focusSessionRef(sessionRef)) {
        workspaceStore.openSessionRefInActivePane(sessionRef)
      }
      return
    }
  }

  const querySessionId = typeof route.query.sessionId === 'string' ? route.query.sessionId : ''
  if (querySessionId) {
    const exists = sessionsStore.sessions.some((session) => session.id === querySessionId)
    if (exists) {
      const sessionRef = sessionsStore.getSessionRef(querySessionId)
      sessionsStore.setActiveSessionRef(sessionRef)
      if (!workspaceStore.focusSessionRef(sessionRef)) {
        workspaceStore.openSessionInActivePane(querySessionId)
      }
      return
    }
  }

  const fallbackSessionRef =
    workspaceStore.activeSessionRef ??
    sessionsStore.activeSessionRef ??
    (sessionsStore.unifiedSessions[0] ? toSessionRef(sessionsStore.unifiedSessions[0]) : null)
  if (!fallbackSessionRef) return

  sessionsStore.setActiveSessionRef(fallbackSessionRef)
  if (!workspaceStore.focusSessionRef(fallbackSessionRef)) {
    workspaceStore.openSessionRefInActivePane(fallbackSessionRef)
  }
}

function reconcileWorkspaceSessions() {
  const validGlobalSessionKeys = sessionsStore.unifiedSessions.map((session) => session.globalSessionKey)
  const fallbackSessionRef =
    sessionsStore.activeSessionRef ??
    (sessionsStore.unifiedSessions[0] ? toSessionRef(sessionsStore.unifiedSessions[0]) : undefined)
  const preserveInstanceIds = new Set(
    instancesStore.remoteInstances
      .filter((instance) => instance.status !== 'online')
      .map((instance) => instance.id)
  )

  if (!settingsStore.settings.desktopRemoteMountEnabled) {
    for (const tab of Object.values(workspaceStore.layout.tabs)) {
      if (tab.instanceId !== LOCAL_INSTANCE_ID) {
        preserveInstanceIds.add(tab.instanceId)
      }
    }
  }

  workspaceStore.reconcileSessionRefs(validGlobalSessionKeys, {
    fallbackSessionRef,
    preserveInstanceIds: [...preserveInstanceIds]
  })

  if (workspaceStore.activeSessionRef) {
    sessionsStore.setActiveSessionRef(workspaceStore.activeSessionRef)
  }
}

const {
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
} = useSessionInteractionState({
  t,
  toast,
  localInstanceId: LOCAL_INSTANCE_ID,
  sessionsStore,
  projectsStore,
  instancesStore,
  workspaceStore,
  settingsStore,
  activeSessionForDialog,
  toSessionRef,
  applyRouteSessionSelection,
  reconcileWorkspaceSessions,
  updateSessionUiSettings,
  startSessionByRef: (sessionRef) => startSessionByRef(sessionRef)
})

const {
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
} = useSessionTreeInteractions({
  t,
  toast,
  settingsStore,
  sessionsStore,
  workspaceStore,
  instancesStore,
  toSessionRef,
  buildProjectGroupKey,
  openRenameDialog,
  openIconPicker,
  startSession: (sessionRef) => startSessionByRef(sessionRef),
  pauseSession: (sessionRef) => pauseSessionByRef(sessionRef),
  restartSession: (sessionRef) => restartSessionByRef(sessionRef)
})

const isTopLayout = computed(() => settingsStore.settings.sessionsListPosition === 'top')
const isListCollapsed = computed(() => settingsStore.settings.sessionsPanelCollapsed)
const {
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
} = useWorkspacePaneActions({
  t,
  toast,
  settingsStore,
  workspaceStore,
  sessionsStore,
  reconcileWorkspaceSessions
})

const {
  expandedProjectMap,
  expandedInstanceMap,
  toggleProjectExpand,
  toggleInstanceExpand
} = useSessionsPageCoordination({
  route,
  router,
  sessionsStore,
  workspaceStore,
  settingsStore,
  instancesStore,
  projectSessionTree,
  instanceTree,
  applyRouteSessionSelection,
  reconcileWorkspaceSessions,
  openCreateDialog: () => openCreateDialog(),
  reloadSessionTree: () => reloadSessionTree(),
  pruneTerminalFontSizeByPane
})

function openProject(group: ProjectSessionGroup) {
  if (!group.canOpenProjectDetail || !group.projectId) return
  void router.push(
    buildProjectRouteLocation({
      instanceId: group.instanceId,
      projectId: group.projectId,
      globalProjectKey: `${group.instanceId}:${group.projectId}`
    })
  )
}

async function updateSessionUiSettings(partial: Partial<AppSettings>) {
  try {
    await settingsStore.update(partial)
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function toggleListPosition() {
  const next: AppSettings['sessionsListPosition'] = settingsStore.settings.sessionsListPosition === 'left' ? 'top' : 'left'
  await updateSessionUiSettings({ sessionsListPosition: next })
}

async function toggleListCollapsed() {
  await updateSessionUiSettings({ sessionsPanelCollapsed: !settingsStore.settings.sessionsPanelCollapsed })
}

async function restartSessionByRef(sessionRef: SessionRef, showSuccess = true) {
  try {
    await sessionsStore.restartSessionRef(sessionRef)
    if (showSuccess) toast.success(t('toast.sessionRestarted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function startSessionByRef(sessionRef: SessionRef, showSuccess = true) {
  try {
    await sessionsStore.startSessionRef(sessionRef)
    if (showSuccess) toast.success(t('toast.sessionStarted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function pauseSessionByRef(sessionRef: SessionRef, showSuccess = true) {
  try {
    await sessionsStore.pauseSessionRef(sessionRef)
    if (showSuccess) toast.success(t('toast.sessionPaused'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleSessionClick(session: SessionListItem) {
  const sessionRef = toSessionRef(session)
  if (!workspaceStore.focusSessionRef(sessionRef)) {
    workspaceStore.openSessionRefInActivePane(sessionRef)
  }
  sessionsStore.setActiveSessionRef(sessionRef)
  await maybeHandleDormantSession(session)
}

async function handleStart(sessionRef: SessionRef) {
  await startSessionByRef(sessionRef)
}

async function handlePause(sessionRef: SessionRef) {
  await pauseSessionByRef(sessionRef)
}

async function handleRestart(sessionRef: SessionRef) {
  await restartSessionByRef(sessionRef)
}

async function handleDestroy(sessionRef: SessionRef) {
  await destroySessionWithConfirm(sessionRef)
}

</script>

<style scoped lang="scss">
.sessions-page {
  display: flex;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.sessions-page.top-layout {
  flex-direction: column;
}

.sessions-main-area {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  overflow: hidden;
}

.empty-list {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.session-detail-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  padding: 4px;
}

.inspector-panel-shell {
  flex-shrink: 0;
}

.workspace-root {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
}

// btn, btn-sm, btn-primary, btn-danger 已在 global.scss 中定义
// context-overlay, context-menu, context-item 已在 global.scss 中定义
// dialog-overlay, dialog, dialog-input, dialog-hint, dialog-actions 已在 global.scss 中定义
</style>
