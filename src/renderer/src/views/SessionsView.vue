<template>
  <div class="sessions-page" :class="{ 'top-layout': isTopLayout }">
    <section v-if="isTopLayout" class="session-top-panel" :class="{ collapsed: isListCollapsed }">
      <div class="top-inline-row">
        <button class="tool-btn" :title="$t('session.create')" @click="openCreateDialog()">+</button>
        <button
          v-if="settingsStore.settings.desktopRemoteMountEnabled"
          class="tool-btn"
          :title="$t('session.refreshRemote')"
          :disabled="refreshingRemoteData"
          @click="handleRefreshRemoteData"
        >
          {{ refreshingRemoteData ? '…' : 'R' }}
        </button>
        <select v-model="filterType" class="filter-select top-filter" :class="{ compact: isListCollapsed }">
          <option value="">{{ $t('session.filter') }}</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="opencode">OpenCode</option>
        </select>

        <div class="top-list-area">
          <div v-if="projectSessionTree.length === 0" class="top-empty-inline">{{ $t('session.noSessions') }}</div>
          <div v-else class="top-flow-row">
          <div
            v-for="group in projectSessionTree"
            :key="group.key"
            class="top-group-card"
            v-show="group.sessions.length > 0"
            draggable="true"
            @dragstart="handleTopProjectDragStart($event, group)"
            @dragover.prevent="handleTopProjectDragOver($event)"
            @drop="handleTopProjectDrop($event, group.key)"
            @dragend="handleTopProjectDragEnd"
          >
              <span class="top-group-label" :title="group.projectPath">{{ group.projectName }}</span>
              <span v-if="group.instanceId !== 'local'" class="top-group-label" :title="group.instanceName">{{ group.instanceName }}</span>
              <button
                v-for="s in group.sessions"
                :key="s.id"
                class="session-top-item"
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
                <span v-if="!isListCollapsed" class="top-item-name">{{ s.name }}</span>
                <span class="status-dot" :class="s.status"></span>
              </button>
            </div>
          </div>
        </div>

        <div class="top-actions">
          <button class="tool-btn" :title="$t('session.listPosition')" @click="toggleListPosition">{{ isTopLayout ? 'L' : 'T' }}</button>
          <button
            class="tool-btn"
            :title="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
            @click="toggleListCollapsed"
          >{{ isListCollapsed ? 'v' : '^' }}</button>
        </div>
      </div>
    </section>

    <div class="sessions-main-area">
      <aside v-if="!isTopLayout" class="session-list-panel" :class="{ collapsed: isListCollapsed }">
        <div v-if="!isListCollapsed" class="list-toolbar">
        <button class="btn btn-primary btn-sm" @click="openCreateDialog()">+ {{ $t('session.create') }}</button>
        <button
          v-if="settingsStore.settings.desktopRemoteMountEnabled"
          class="btn btn-sm"
          type="button"
          :disabled="refreshingRemoteData"
          @click="handleRefreshRemoteData"
        >
          {{ refreshingRemoteData ? $t('session.refreshingRemote') : $t('session.refreshRemote') }}
        </button>
        <select v-model="filterType" class="filter-select">
          <option value="">{{ $t('session.filter') }}</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="opencode">OpenCode</option>
        </select>
      </div>
      <div v-else class="collapsed-toolbar">
        <button class="collapsed-create-btn" :title="$t('session.create')" @click="openCreateDialog()">+</button>
        <button
          v-if="settingsStore.settings.desktopRemoteMountEnabled"
          class="collapsed-create-btn"
          :title="$t('session.refreshRemote')"
          :disabled="refreshingRemoteData"
          @click="handleRefreshRemoteData"
        >
          {{ refreshingRemoteData ? '…' : 'R' }}
        </button>
        <select v-model="filterType" class="collapsed-filter" :title="$t('session.filter')">
          <option value="">*</option>
          <option value="claude">C</option>
          <option value="codex">X</option>
          <option value="opencode">O</option>
        </select>
        </div>

        <template v-if="!isListCollapsed">
          <div class="session-tree">
          <div v-for="instanceGroup in instanceTree" :key="instanceGroup.key" class="instance-group">
            <div
              class="instance-node"
              :title="formatInstanceTooltip(instanceGroup)"
              @click="toggleInstanceExpand(instanceGroup.key)"
            >
              <span class="project-caret">{{ isInstanceExpanded(instanceGroup.key) ? 'v' : '>' }}</span>
              <div class="instance-body">
                <div class="instance-header">
                  <div class="instance-title-row">
                    <span class="instance-name" :title="instanceGroup.instanceName">{{ instanceGroup.instanceName }}</span>
                    <span
                      v-if="instanceGroup.instanceType === 'remote'"
                      class="instance-type-badge remote"
                    >
                      {{ formatInstanceType(instanceGroup.instanceType) }}
                    </span>
                    <span
                      v-if="instanceGroup.instanceType === 'remote'"
                      class="instance-status-badge"
                      :class="`status-${instanceGroup.instanceStatus}`"
                    >
                      {{ formatInstanceStatus(instanceGroup.instanceStatus) }}
                    </span>
                  </div>
                  <div class="instance-facts">
                    <span class="instance-count">{{ formatInstanceCounts(instanceGroup) }}</span>
                  </div>
                </div>
                <div v-if="showInstanceMeta(instanceGroup)" class="instance-meta">
                  <span
                    v-if="instanceGroup.instanceType === 'remote'"
                    class="instance-meta-pill"
                    :title="`${t('settings.remoteLatency')}: ${formatInstanceLatency(instanceGroup.instanceLatencyMs)}`"
                  >
                    {{ formatInstanceLatency(instanceGroup.instanceLatencyMs) }}
                  </span>
                  <span
                    v-if="instanceGroup.instanceLastError"
                    class="instance-meta-error"
                    :title="`${t('settings.remoteLastError')}: ${instanceGroup.instanceLastError}`"
                  >
                    {{ instanceGroup.instanceLastError }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="isInstanceExpanded(instanceGroup.key)" class="instance-projects">
              <div v-if="instanceGroup.projects.length === 0" class="project-empty">{{ $t('session.instanceEmpty') }}</div>
              <div
                v-for="group in instanceGroup.projects"
                :key="group.key"
                class="tree-group"
                draggable="true"
                @dragstart="handleProjectDragStart($event, group)"
                @dragover.prevent="handleProjectDragOver($event)"
                @drop="handleProjectDrop($event, group.key)"
                @dragend="handleProjectDragEnd"
              >
                <div class="project-node" @click="toggleProjectExpand(group.key)">
                  <span class="project-caret">{{ isProjectExpanded(group.key) ? 'v' : '>' }}</span>
                  <div class="project-body">
                    <div class="project-title-row">
                      <span class="project-name" :title="group.projectName">{{ group.projectName }}</span>
                      <span class="project-count">{{ group.sessions.length }}</span>
                    </div>
                    <span class="project-subtitle" :title="group.projectPath || group.instanceName">
                      {{ formatProjectSubtitle(group) }}
                    </span>
                  </div>
                  <div class="project-actions" @click.stop>
                    <button
                      v-if="group.canCreateSession"
                      class="project-action-btn"
                      :title="$t('session.create')"
                      @click="openCreateDialog({
                        instanceId: group.instanceId,
                        projectId: group.projectId || undefined,
                        projectPath: group.projectPath,
                        lockProjectPath: true
                      })"
                    >
                      +
                    </button>
                    <button
                      v-if="group.canOpenProjectDetail"
                      class="project-action-btn"
                      :title="$t('project.settings')"
                      @click="openProject(group)"
                    >
                      P
                    </button>
                  </div>
                </div>
                <div v-if="isProjectExpanded(group.key)" class="project-children">
                  <div v-if="group.sessions.length === 0" class="project-empty">{{ $t('session.noSessionsInProject') }}</div>
                  <button
                    v-for="s in group.sessions"
                    :key="s.id"
                    class="session-item tree-child"
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
                    <div class="item-info">
                      <span class="item-name">{{ s.name }}</span>
                      <span class="item-time">{{ formatTime(s.createdAt) }}</span>
                    </div>
                    <span class="status-dot" :class="s.status"></span>
                  </button>
                </div>
              </div>
            </div>
          </div>
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

        <div class="panel-footer">
        <button class="panel-btn" :title="$t('session.listPosition')" @click="toggleListPosition">{{ isTopLayout ? 'L' : 'T' }}</button>
        <button
          class="panel-btn"
          :title="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
          @click="toggleListCollapsed"
        >{{ isListCollapsed ? '>' : '<' }}</button>
        </div>
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

    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <button class="context-item" @click="handleOpenInPaneContext">{{ $t('session.openInFocusedPane') }}</button>
      <button class="context-item" @click="handleSplitOpenContext('horizontal')">{{ $t('session.splitRightOpen') }}</button>
      <button class="context-item" @click="handleSplitOpenContext('vertical')">{{ $t('session.splitDownOpen') }}</button>
      <button
        v-if="contextSessionCapabilities?.sessionStart && contextMenu.session?.status !== 'running'"
        class="context-item"
        @click="handleStartContext"
      >
        {{ $t('session.start') }}
      </button>
      <button
        v-if="contextSessionCapabilities?.sessionPause && contextMenu.session?.status === 'running'"
        class="context-item"
        @click="handlePauseContext"
      >
        {{ $t('session.pause') }}
      </button>
      <button v-if="contextSessionCapabilities?.sessionRestart" class="context-item" @click="handleRestartContext">{{ $t('session.restart') }}</button>
      <button v-if="contextMenu.session?.instanceId === 'local'" class="context-item" @click="handleRename">{{ $t('session.rename') }}</button>
      <button v-if="contextMenu.session?.instanceId === 'local'" class="context-item" @click="handleChangeIcon">{{ $t('session.changeIcon') }}</button>
      <button v-if="contextSessionCapabilities?.sessionDestroy" class="context-item danger" @click="handleDestroyContext">{{ $t('session.destroy') }}</button>
    </div>
    <div v-if="contextMenu.visible" class="context-overlay" @click="contextMenu.visible = false"></div>

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

    <div v-if="showRenameDialog" class="dialog-overlay" @click.self="closeRenameDialog">
      <div class="dialog">
        <h3>{{ $t('session.renameTitle') }}</h3>
        <input
          v-model="renameInput"
          class="dialog-input"
          :placeholder="$t('session.renameTitle')"
          @keydown.enter="confirmRename"
        />
        <div class="dialog-actions">
          <button class="btn btn-sm" @click="closeRenameDialog">{{ $t('session.dialog.cancel') }}</button>
          <button class="btn btn-sm btn-primary" :disabled="!renameInput.trim()" @click="confirmRename">{{ $t('session.dialog.confirm') }}</button>
        </div>
      </div>
    </div>

    <div v-if="showWakeDialog" class="dialog-overlay" @click.self="closeWakeDialog">
      <div class="dialog">
        <h3>{{ $t('session.wakeDialogTitle') }}</h3>
        <p class="dialog-hint">
          <span v-if="pendingWakeSession">{{ pendingWakeSession.name }} · </span>
          {{ $t('session.wakeDialogMessage') }}
        </p>
        <label class="dialog-check">
          <input v-model="wakeSkipReminder" type="checkbox" />
          <span>{{ $t('session.wakeDialogNoRemind') }}</span>
        </label>
        <div class="dialog-actions">
          <button class="btn btn-sm" @click="closeWakeDialog">{{ $t('session.dialog.cancel') }}</button>
          <button class="btn btn-sm btn-primary" @click="confirmWakeSession">{{ $t('session.wakeDialogStart') }}</button>
        </div>
      </div>
    </div>

    <div v-if="showIconPicker" class="dialog-overlay" @click.self="showIconPicker = false">
      <div class="dialog icon-picker-dialog">
        <h3>{{ $t('session.changeIcon') }}</h3>
        <div class="icon-grid">
          <button
            v-for="e in iconEmojiList" :key="e" class="icon-grid-cell"
            :class="{ selected: iconPickerSessionIcon === e }"
            @click="confirmIconPick(e)"
          >{{ e }}</button>
          <button class="icon-grid-cell clear-cell" @click="confirmIconPick(null)">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSessionsStore } from '@/stores/sessions'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore, type AppSettings } from '@/stores/settings'
import { useWorkspaceStore } from '@/stores/workspace'
import { useInstancesStore } from '@/stores/instances'
import { useInspectorStore } from '@/stores/inspector'
import { useToast } from '@/composables/useToast'
import CreateSessionDialog from '@/components/CreateSessionDialog.vue'
import InspectorPanel from '@/components/InspectorPanel.vue'
import WorkspacePaneTree from '@/components/WorkspacePaneTree.vue'
import type { WorkspaceSplitDirection } from '@/api/workspace'
import {
  buildInstanceTree,
  buildProjectGroupKey,
  buildProjectSessionTree,
  type InstanceTreeGroup,
  type ProjectMeta,
  type ProjectSessionGroup,
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

const showCreateDialog = ref(false)
const createDialogProjectPath = ref('')
const createDialogTargetInstanceId = ref<string>(LOCAL_INSTANCE_ID)
const createDialogTargetProjectId = ref<string | undefined>(undefined)
const createDialogTargetProjectPath = ref('')
const createDialogLockProjectPath = ref(false)
const showRenameDialog = ref(false)
const renameSessionId = ref<string | null>(null)
const renameInput = ref('')

const showWakeDialog = ref(false)
const pendingWakeSession = ref<SessionListItem | null>(null)
const wakeSkipReminder = ref(false)

const showIconPicker = ref(false)
const iconPickerSessionId = ref<string | null>(null)
const iconEmojiList = [
  '🤖','🧠','💡','🔥','⚡','🚀','🎯','🛠️',
  '📦','📁','🔧','🔍','💻','🖥️','📝','✏️',
  '🧪','🔬','🎨','🌟','⭐','💎','🏗️','🔗',
  '📊','📈','🗂️','🧩','🎮','🕹️','🤝','👾',
  '🐛','🐍','🦀','🐳','🐙','🦊','🐱','🐶'
]
const iconPickerSessionIcon = computed(() => {
  if (!iconPickerSessionId.value) return null
  return sessionsStore.getUnifiedSession(iconPickerSessionId.value)?.icon ?? null
})

function toSessionRef(session: Pick<UnifiedSession, 'instanceId' | 'sessionId' | 'globalSessionKey'>): SessionRef {
  return {
    instanceId: session.instanceId,
    sessionId: session.sessionId,
    globalSessionKey: session.globalSessionKey
  }
}

function toSessionListItem(session: UnifiedSession): SessionListItem {
  return {
    ...session,
    id: session.globalSessionKey
  }
}

function applyRouteSessionSelection() {
  const queryGlobalSessionKey =
    typeof route.query.globalSessionKey === 'string' ? route.query.globalSessionKey : ''
  if (queryGlobalSessionKey) {
    const sessionRef = sessionsStore.getSessionRefByGlobalKey(queryGlobalSessionKey)
    if (sessionRef) {
      sessionsStore.setActiveSessionRef(sessionRef)
      workspaceStore.openSessionRefInActivePane(sessionRef)
      return
    }
  }

  const querySessionId = typeof route.query.sessionId === 'string' ? route.query.sessionId : ''
  if (querySessionId) {
    const exists = sessionsStore.sessions.some((session) => session.id === querySessionId)
    if (exists) {
      sessionsStore.setActiveSession(querySessionId)
      workspaceStore.openSessionInActivePane(querySessionId)
      return
    }
  }

  const fallbackSessionRef =
    workspaceStore.activeSessionRef ??
    sessionsStore.activeSessionRef ??
    (sessionsStore.unifiedSessions[0] ? toSessionRef(sessionsStore.unifiedSessions[0]) : null)
  if (!fallbackSessionRef) return

  sessionsStore.setActiveSessionRef(fallbackSessionRef)
  workspaceStore.openSessionRefInActivePane(fallbackSessionRef)
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

watch(
  () => route.query.action,
  (action) => {
    if (action === 'create') {
      openCreateDialog()
      router.replace({ path: '/sessions' })
    }
  },
  { immediate: true }
)

const filterType = ref('')
const contextMenu = ref({ visible: false, x: 0, y: 0, session: null as SessionListItem | null })
const expandedProjectMap = ref<Record<string, boolean>>({})
const expandedInstanceMap = ref<Record<string, boolean>>({})
const refreshingRemoteData = ref(false)

const sessionDragState = ref<{ sessionId: string; projectKey: string } | null>(null)
const projectDragState = ref<{ group: ProjectSessionGroup } | null>(null)
const topProjectDragState = ref<{ group: ProjectSessionGroup } | null>(null)

const filteredSessions = computed(() => {
  const items = sessionsStore.unifiedSessions.map((session) => toSessionListItem(session))
  if (!filterType.value) return items
  return items.filter((s) => s.type === filterType.value)
})

const projectMetaIndex = computed(() => {
  const sorted: ProjectMeta[] = [...projectsStore.unifiedProjects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => ({
      globalProjectKey: project.globalProjectKey,
      projectId: project.projectId,
      instanceId: project.instanceId,
      name: project.name,
      path: project.path,
      lastOpenedAt: project.lastOpenedAt,
      source: project.source
    }))

  const byKey = new Map<string, ProjectMeta>()
  for (const project of sorted) {
    byKey.set(buildProjectGroupKey(project.instanceId, project.path), project)
  }

  return { sorted, byKey }
})

const projectSessionTree = computed<ProjectSessionGroup[]>(() => {
  return buildProjectSessionTree({
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
  return buildInstanceTree(instancesStore.instances, projectSessionTree.value)
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

const contextSessionCapabilities = computed(() => {
  const session = contextMenu.value.session
  if (!session) return null
  return instancesStore.getInstance(session.instanceId)?.capabilities ?? null
})

const isTopLayout = computed(() => settingsStore.settings.sessionsListPosition === 'top')
const isListCollapsed = computed(() => settingsStore.settings.sessionsPanelCollapsed)
const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 28

function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size)))
}

const paneZoomPercentById = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {}
  const baseFontSize = clampFontSize(settingsStore.settings.terminalFontSize ?? DEFAULT_FONT_SIZE)
  const byPane = settingsStore.settings.terminalFontSizeByPane || {}
  for (const paneId of workspaceStore.paneIds) {
    const paneFontSize = clampFontSize(byPane[paneId] ?? baseFontSize)
    const percent = Math.round((paneFontSize / baseFontSize) * 100)
    result[paneId] = Math.max(50, Math.min(300, percent))
  }
  return result
})

function pruneTerminalFontSizeByPane(activePaneIds: string[]): void {
  const current = settingsStore.settings.terminalFontSizeByPane || {}
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

watch(
  projectSessionTree,
  (groups) => {
    const next: Record<string, boolean> = { ...expandedProjectMap.value }
    const keys = new Set(groups.map((group) => group.key))
    for (const group of groups) {
      if (!(group.key in next)) {
        next[group.key] = true
      }
    }
    for (const key of Object.keys(next)) {
      if (!keys.has(key)) delete next[key]
    }
    expandedProjectMap.value = next
  },
  { immediate: true }
)

watch(
  instanceTree,
  (groups) => {
    const next: Record<string, boolean> = { ...expandedInstanceMap.value }
    const keys = new Set(groups.map((group) => group.key))
    for (const group of groups) {
      if (!(group.key in next)) {
        next[group.key] = true
      }
    }
    for (const key of Object.keys(next)) {
      if (!keys.has(key)) delete next[key]
    }
    expandedInstanceMap.value = next
  },
  { immediate: true }
)

watch(
  [() => settingsStore.loaded, () => workspaceStore.loaded, () => workspaceStore.paneIds.join('|')],
  ([settingsLoaded, workspaceLoaded]) => {
    if (!settingsLoaded || !workspaceLoaded) return
    pruneTerminalFontSizeByPane(workspaceStore.paneIds)
  },
  { immediate: true }
)

function isProjectExpanded(key: string): boolean {
  return expandedProjectMap.value[key] ?? true
}

function isInstanceExpanded(key: string): boolean {
  return expandedInstanceMap.value[key] ?? true
}

function toggleInstanceExpand(key: string): void {
  expandedInstanceMap.value[key] = !isInstanceExpanded(key)
}

function toggleProjectExpand(key: string) {
  expandedProjectMap.value[key] = !isProjectExpanded(key)
}

function formatInstanceType(type: InstanceTreeGroup['instanceType']): string {
  return type === 'local' ? t('session.instanceLocal') : t('session.instanceRemote')
}

function formatInstanceStatus(status: InstanceTreeGroup['instanceStatus']): string {
  return t(`settings.remoteStatus.${status}`)
}

function formatInstanceLatency(latencyMs: number | null): string {
  if (latencyMs === null || !Number.isFinite(latencyMs)) {
    return t('settings.remoteLatencyUnknown')
  }

  if (latencyMs <= 200) {
    return t('settings.remoteLatencyFast')
  }

  if (latencyMs <= 800) {
    return t('settings.remoteLatencyNormal')
  }

  return t('settings.remoteLatencySlow')
}

function formatInstanceCounts(group: InstanceTreeGroup): string {
  return t('session.instanceCounts', {
    projects: group.projects.length,
    sessions: group.sessionCount
  })
}

function formatProjectSubtitle(group: ProjectSessionGroup): string {
  const path = group.projectPath?.trim()
  if (path) return path
  return group.instanceType === 'local' ? t('session.instanceLocal') : t('session.instanceRemote')
}

function showInstanceMeta(group: InstanceTreeGroup): boolean {
  if (group.instanceType !== 'remote') return false
  return Number.isFinite(group.instanceLatencyMs) || !!group.instanceLastError
}

function formatInstanceTooltip(group: InstanceTreeGroup): string {
  const lines = [group.instanceName, formatInstanceCounts(group)]

  if (group.instanceType === 'remote') {
    lines.splice(1, 0, `${formatInstanceType(group.instanceType)} · ${formatInstanceStatus(group.instanceStatus)}`)
    if (Number.isFinite(group.instanceLatencyMs)) {
      lines.push(`${t('settings.remoteLatency')}: ${formatInstanceLatency(group.instanceLatencyMs)}`)
    }
    if (group.instanceLastError) {
      lines.push(`${t('settings.remoteLastError')}: ${group.instanceLastError}`)
    }
  }

  return lines.join('\n')
}

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

type CreateDialogOptions = {
  instanceId?: string
  projectId?: string
  projectPath?: string
  lockProjectPath?: boolean
}

function openCreateDialog(options: CreateDialogOptions = {}) {
  const instanceId = options.instanceId ?? LOCAL_INSTANCE_ID
  const projectPath =
    options.projectPath ??
    (instanceId === LOCAL_INSTANCE_ID ? activeSessionForDialog.value?.projectPath || '' : '')

  createDialogTargetInstanceId.value = instanceId
  createDialogTargetProjectId.value = options.projectId
  createDialogTargetProjectPath.value = projectPath
  createDialogProjectPath.value = projectPath
  createDialogLockProjectPath.value = options.lockProjectPath ?? false
  showCreateDialog.value = true
}

function closeCreateDialog() {
  showCreateDialog.value = false
  createDialogProjectPath.value = ''
  createDialogTargetInstanceId.value = LOCAL_INSTANCE_ID
  createDialogTargetProjectId.value = undefined
  createDialogTargetProjectPath.value = ''
  createDialogLockProjectPath.value = false
}

async function handleCreateDialogCreated(payload?: {
  instanceId: string
  sessionId: string
  globalSessionKey: string
}) {
  closeCreateDialog()
  if (payload) {
    await sessionsStore.fetchSessionsForInstance(payload.instanceId)
    await projectsStore.fetchProjectsForInstance(payload.instanceId)
  } else {
    await sessionsStore.fetchSessions()
    await projectsStore.fetchProjects()
  }

  reconcileWorkspaceSessions()

  await nextTick()

  if (payload) {
    const createdSessionRef = sessionsStore.getSessionRefByGlobalKey(payload.globalSessionKey)
    if (createdSessionRef) {
      workspaceStore.openSessionRefInActivePane(createdSessionRef)
      sessionsStore.setActiveSessionRef(createdSessionRef)
      return
    }
  }

  applyRouteSessionSelection()
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

function isDormantSession(session: UnifiedSession): boolean {
  return session.status === 'idle' || session.status === 'stopped'
}

function syncActiveSessionWithWorkspace(): void {
  if (workspaceStore.activeSessionRef) {
    sessionsStore.setActiveSessionRef(workspaceStore.activeSessionRef)
  }
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

async function handleResetPaneZoom(paneId: string) {
  if (!paneId) return
  const current = settingsStore.settings.terminalFontSizeByPane || {}
  if (!(paneId in current)) return
  const next = { ...current }
  delete next[paneId]
  await updateSessionUiSettings({ terminalFontSizeByPane: next })
}

async function handleSetPaneZoom(payload: { paneId: string; percent: number }) {
  const paneId = payload.paneId
  if (!paneId) return
  const percent = Number(payload.percent)
  if (!Number.isFinite(percent) || percent <= 0) return

  const baseFontSize = clampFontSize(settingsStore.settings.terminalFontSize ?? DEFAULT_FONT_SIZE)
  const targetFontSize = clampFontSize((baseFontSize * percent) / 100)
  const current = settingsStore.settings.terminalFontSizeByPane || {}
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

function handleFocusPane(paneId: string) {
  workspaceStore.focusPane(paneId)
  syncActiveSessionWithWorkspace()
}

function handleSetPaneTab(payload: { paneId: string; tabId: string }) {
  workspaceStore.setActiveTab(payload.paneId, payload.tabId)
  const tab = workspaceLayout.value.tabs[payload.tabId]
  if (tab) {
    sessionsStore.setActiveSessionRef({
      instanceId: tab.instanceId,
      sessionId: tab.sessionId,
      globalSessionKey: tab.globalSessionKey
    })
  }
}

function handleSplitPane(payload: { paneId: string; direction: WorkspaceSplitDirection }) {
  workspaceStore.splitPane(payload.paneId, payload.direction)
}

function handleClosePane(paneId: string) {
  workspaceStore.closePane(paneId)
  syncActiveSessionWithWorkspace()
}

function handleClosePaneTab(payload: { paneId: string; tabId: string }) {
  workspaceStore.closeTab(payload.paneId, payload.tabId)
  syncActiveSessionWithWorkspace()
}

function handleMoveTab(payload: { fromPaneId: string; toPaneId: string; tabId: string; toIndex?: number }) {
  workspaceStore.moveTabToPane(payload)
  syncActiveSessionWithWorkspace()
}

function handleSplitAndMoveTab(payload: {
  sourcePaneId: string
  targetPaneId: string
  tabId: string
  direction: WorkspaceSplitDirection
}) {
  workspaceStore.splitPaneAndMoveTab(payload)
  syncActiveSessionWithWorkspace()
}

function handleCloseOtherTabs(payload: { paneId: string; tabId: string }) {
  workspaceStore.closeOtherTabs(payload.paneId, payload.tabId)
  syncActiveSessionWithWorkspace()
}

function handleCloseTabsRight(payload: { paneId: string; tabId: string }) {
  workspaceStore.closeTabsToRight(payload.paneId, payload.tabId)
  syncActiveSessionWithWorkspace()
}

function handleToggleTabPin(tabId: string) {
  workspaceStore.toggleTabPinned(tabId)
}

function handleResizeSplit(payload: { path: string; ratio: number }) {
  workspaceStore.updateSplitRatio(payload.path, payload.ratio)
}

function handleEvenSplitPane(paneId: string) {
  workspaceStore.evenSplitForPane(paneId)
}

function handleOpenSessionDrop(payload: {
  sessionRef: SessionRef
  targetPaneId: string
  direction?: WorkspaceSplitDirection
}) {
  const exists = !!sessionsStore.getUnifiedSession(payload.sessionRef.globalSessionKey)
  if (!exists) return

  if (payload.direction) {
    workspaceStore.splitPane(payload.targetPaneId, payload.direction)
    const targetPaneId = workspaceStore.layout.activePaneId
    workspaceStore.openSessionRefInPane(payload.sessionRef, targetPaneId)
  } else {
    workspaceStore.openSessionRefInPane(payload.sessionRef, payload.targetPaneId)
  }

  syncActiveSessionWithWorkspace()
}

function handleSwapPaneTabs(payload: { fromPaneId: string; toPaneId: string }) {
  workspaceStore.swapPaneTabs(payload.fromPaneId, payload.toPaneId)
  syncActiveSessionWithWorkspace()
}

function handleUndoLayout() {
  const undone = workspaceStore.undoLayoutChange()
  if (undone) {
    syncActiveSessionWithWorkspace()
  }
}

async function handleResetWorkspace() {
  if (!confirm(t('session.confirmResetLayout'))) return
  await workspaceStore.hardReset()
  reconcileWorkspaceSessions()
  toast.success(t('toast.layoutReset'))
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

function handleSessionDragStart(e: DragEvent, session: SessionListItem) {
  if (!e.dataTransfer) return
  const sessionData = {
    sessionId: session.sessionId,
    instanceId: session.instanceId,
    globalSessionKey: session.globalSessionKey
  }
  e.dataTransfer.setData(
    'application/x-easysession-session',
    JSON.stringify(sessionData)
  )
  e.dataTransfer.setData(
    'application/x-easysession-session-reorder',
    JSON.stringify({ globalSessionKey: session.globalSessionKey })
  )
  e.dataTransfer.effectAllowed = 'move'
  
  const path = session.projectPath || ''
  const key = buildProjectGroupKey(session.instanceId, path)
  sessionDragState.value = { sessionId: session.id, projectKey: key }
}

function handleSessionDragOver(e: DragEvent, projectKey: string) {
  if (!e.dataTransfer) return
  const sessionReorderRaw = e.dataTransfer.getData('application/x-easysession-session-reorder')
  if (!sessionReorderRaw) return
  
  try {
    const sessionData = JSON.parse(sessionReorderRaw) as { globalSessionKey?: string }
    const session = sessionData.globalSessionKey
      ? sessionsStore.getUnifiedSession(sessionData.globalSessionKey)
      : null
    if (!session) return
    
    const sessionPath = buildProjectGroupKey(session.instanceId, session.projectPath || '')
    if (sessionPath !== projectKey) {
      e.dataTransfer.dropEffect = 'none'
      return
    }
    
    e.dataTransfer.dropEffect = 'move'
  } catch {
    e.dataTransfer.dropEffect = 'none'
  }
}

function handleSessionDrop(e: DragEvent, projectKey: string, targetSessionId: string) {
  e.preventDefault()
  e.stopPropagation()
  if (!e.dataTransfer) return
  const sessionReorderRaw = e.dataTransfer.getData('application/x-easysession-session-reorder')
  if (!sessionReorderRaw) return
  
  try {
    const sessionData = JSON.parse(sessionReorderRaw) as { globalSessionKey?: string }
    const draggedSessionId = sessionData.globalSessionKey
    
    if (!draggedSessionId || draggedSessionId === targetSessionId) return
    
    const session = sessionsStore.getUnifiedSession(draggedSessionId)
    if (!session) return
    
    const sessionPath = buildProjectGroupKey(session.instanceId, session.projectPath || '')
    if (sessionPath !== projectKey) return
    
    const currentOrder = settingsStore.settings.manualSessionOrder[projectKey] || []
    const filteredOrder = currentOrder.filter(id => id !== draggedSessionId)
    const targetIndex = filteredOrder.indexOf(targetSessionId)
    
    if (targetIndex === -1) {
      filteredOrder.push(draggedSessionId)
    } else {
      filteredOrder.splice(targetIndex, 0, draggedSessionId)
    }
    
    const newOrder = { ...settingsStore.settings.manualSessionOrder, [projectKey]: filteredOrder }
    void settingsStore.update({ manualSessionOrder: newOrder })
  } catch {
    // ignore
  } finally {
    sessionDragState.value = null
  }
}

function handleSessionDragEnd() {
  sessionDragState.value = null
}

async function handleSessionClick(session: SessionListItem) {
  const sessionRef = toSessionRef(session)
  workspaceStore.openSessionRefInActivePane(sessionRef)
  sessionsStore.setActiveSessionRef(sessionRef)

  if (!isDormantSession(session)) return
  if (session.instanceId !== LOCAL_INSTANCE_ID) return

  if (settingsStore.settings.sessionWakeConfirm) {
    pendingWakeSession.value = session
    wakeSkipReminder.value = false
    showWakeDialog.value = true
    return
  }

  await startSessionByRef(sessionRef)
}

function handleOpenInPaneContext() {
  const session = contextMenu.value.session
  contextMenu.value.visible = false
  if (!session) return
  const sessionRef = toSessionRef(session)
  workspaceStore.openSessionRefInActivePane(sessionRef)
  sessionsStore.setActiveSessionRef(sessionRef)
}

function handleSplitOpenContext(direction: WorkspaceSplitDirection) {
  const session = contextMenu.value.session
  contextMenu.value.visible = false
  if (!session) return
  const sessionRef = toSessionRef(session)
  const activePaneId = workspaceStore.layout.activePaneId
  workspaceStore.splitPane(activePaneId, direction)
  const targetPaneId = workspaceStore.layout.activePaneId
  workspaceStore.openSessionRefInPane(sessionRef, targetPaneId)
  sessionsStore.setActiveSessionRef(sessionRef)
}

function closeWakeDialog() {
  showWakeDialog.value = false
  pendingWakeSession.value = null
  wakeSkipReminder.value = false
}

async function confirmWakeSession() {
  const session = pendingWakeSession.value
  const disableReminder = wakeSkipReminder.value
  closeWakeDialog()
  if (!session) return

  if (disableReminder && settingsStore.settings.sessionWakeConfirm) {
    await updateSessionUiSettings({ sessionWakeConfirm: false })
  }

  await startSessionByRef(toSessionRef(session))
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
  if (confirm(t('session.confirmDestroy'))) {
    try {
      await sessionsStore.destroySessionRef(sessionRef)
      toast.success(t('toast.sessionDestroyed'))
    } catch (e: unknown) {
      toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  }
}

function handleProjectDragStart(e: DragEvent, group: ProjectSessionGroup) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(
    'application/x-easysession-project-reorder',
    JSON.stringify({ projectKey: group.key })
  )
  e.dataTransfer.effectAllowed = 'move'
  projectDragState.value = { group }
}

function handleProjectDragOver(e: DragEvent) {
  if (!e.dataTransfer) return
  const projectReorderRaw = e.dataTransfer.getData('application/x-easysession-project-reorder')
  if (!projectReorderRaw) return
  e.dataTransfer.dropEffect = 'move'
}

function handleProjectDrop(e: DragEvent, targetProjectKey: string) {
  e.preventDefault()
  e.stopPropagation()
  if (!e.dataTransfer) return
  const projectReorderRaw = e.dataTransfer.getData('application/x-easysession-project-reorder')
  if (!projectReorderRaw) return
  
  try {
    const projectData = JSON.parse(projectReorderRaw) as { projectKey: string }
    const draggedProjectKey = projectData.projectKey
    
    if (draggedProjectKey === targetProjectKey) return
    
    const currentOrder = settingsStore.settings.manualProjectOrder || []
    const filteredOrder = currentOrder.filter(key => key !== draggedProjectKey)
    const targetIndex = filteredOrder.indexOf(targetProjectKey)
    
    if (targetIndex === -1) {
      filteredOrder.push(draggedProjectKey)
    } else {
      filteredOrder.splice(targetIndex, 0, draggedProjectKey)
    }
    
    void settingsStore.update({ manualProjectOrder: filteredOrder })
  } catch {
    // ignore
  } finally {
    projectDragState.value = null
  }
}

function handleProjectDragEnd() {
  projectDragState.value = null
}

function handleTopProjectDragStart(e: DragEvent, group: ProjectSessionGroup) {
  if (!e.dataTransfer) return
  e.dataTransfer.setData(
    'application/x-easysession-project-reorder',
    JSON.stringify({ projectKey: group.key })
  )
  e.dataTransfer.effectAllowed = 'move'
  topProjectDragState.value = { group }
}

function handleTopProjectDragOver(e: DragEvent) {
  if (!e.dataTransfer) return
  const projectReorderRaw = e.dataTransfer.getData('application/x-easysession-project-reorder')
  if (!projectReorderRaw) return
  e.dataTransfer.dropEffect = 'move'
}

function handleTopProjectDrop(e: DragEvent, targetProjectKey: string) {
  e.preventDefault()
  e.stopPropagation()
  if (!e.dataTransfer) return
  const projectReorderRaw = e.dataTransfer.getData('application/x-easysession-project-reorder')
  if (!projectReorderRaw) return
  
  try {
    const projectData = JSON.parse(projectReorderRaw) as { projectKey: string }
    const draggedProjectKey = projectData.projectKey
    
    if (draggedProjectKey === targetProjectKey) return
    
    const currentOrder = settingsStore.settings.manualProjectOrder || []
    const filteredOrder = currentOrder.filter(key => key !== draggedProjectKey)
    const targetIndex = filteredOrder.indexOf(targetProjectKey)
    
    if (targetIndex === -1) {
      filteredOrder.push(draggedProjectKey)
    } else {
      filteredOrder.splice(targetIndex, 0, draggedProjectKey)
    }
    
    void settingsStore.update({ manualProjectOrder: filteredOrder })
  } catch {
    // ignore
  } finally {
    topProjectDragState.value = null
  }
}

function handleTopProjectDragEnd() {
  topProjectDragState.value = null
}

function openContextMenu(e: MouseEvent, session: SessionListItem) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, session }
}

async function handleRename() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (!s) return
  renameSessionId.value = s.id
  renameInput.value = s.name
  showRenameDialog.value = true
}

function closeRenameDialog() {
  showRenameDialog.value = false
  renameSessionId.value = null
  renameInput.value = ''
}

function handleChangeIcon() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (!s) return
  iconPickerSessionId.value = s.id
  showIconPicker.value = true
}

async function confirmIconPick(emoji: string | null) {
  const id = iconPickerSessionId.value
  showIconPicker.value = false
  iconPickerSessionId.value = null
  if (!id) return
  try {
    const sessionRef = sessionsStore.getSessionRefByGlobalKey(id)
    if (!sessionRef) return
    await sessionsStore.updateSessionIconRef(sessionRef, emoji)
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function confirmRename() {
  const id = renameSessionId.value
  const name = renameInput.value.trim()
  if (!id || !name) return

  const current = sessionsStore.getUnifiedSession(id)
  if (current && current.name === name) {
    closeRenameDialog()
    return
  }

  try {
    const sessionRef = sessionsStore.getSessionRefByGlobalKey(id)
    if (!sessionRef) return
    await sessionsStore.renameSessionRef(sessionRef, name)
    toast.success(t('toast.sessionRenamed'))
    closeRenameDialog()
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleDestroyContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handleDestroy(toSessionRef(s))
}

async function handleStartContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handleStart(toSessionRef(s))
}

async function handlePauseContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handlePause(toSessionRef(s))
}

async function handleRestartContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handleRestart(toSessionRef(s))
}

async function reloadSessionTree(options?: { showToast?: boolean }): Promise<void> {
  const showToast = options?.showToast ?? false
  const wasRefreshing = refreshingRemoteData.value
  refreshingRemoteData.value = true
  try {
    await instancesStore.fetchInstances()
    await Promise.all([sessionsStore.fetchAllSessions(), projectsStore.fetchAllProjects()])
    reconcileWorkspaceSessions()
    applyRouteSessionSelection()
    if (showToast) {
      toast.success(t('toast.remoteRefreshed'))
    }
  } catch (e: unknown) {
    if (showToast) {
      toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  } finally {
    if (!wasRefreshing) {
      refreshingRemoteData.value = false
    }
  }
}

async function handleRefreshRemoteData() {
  if (refreshingRemoteData.value) return
  await reloadSessionTree({ showToast: true })
}

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.load()
  await workspaceStore.load()
  await reloadSessionTree()
})

watch(() => [route.query.sessionId, route.query.globalSessionKey], () => {
  applyRouteSessionSelection()
})

watch(
  () => [
    sessionsStore.unifiedSessions.map((session) => session.globalSessionKey).join('|'),
    instancesStore.remoteInstances.map((instance) => `${instance.id}:${instance.status}`).join('|')
  ],
  () => {
    reconcileWorkspaceSessions()
  }
)

watch(
  () => workspaceStore.activeSessionRef,
  (sessionRef) => {
    if (sessionRef) {
      sessionsStore.setActiveSessionRef(sessionRef)
    }
  }
)
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

.session-top-panel {
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.top-inline-row {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 8px;
  padding: 6px var(--spacing-sm);
  overflow: hidden;
}

.tool-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 12px;
  flex-shrink: 0;
  transition: background var(--transition-fast);

  &:hover { background: var(--bg-hover); }
}

// filter-select 已在 global.scss 中定义

.top-filter {
  width: 80px;
  flex-shrink: 0;
}

.top-filter.compact {
  width: 48px;
}

.top-list-area {
  flex: 1;
  min-width: 0;
  max-height: 120px;
  overflow-x: auto;
  overflow-y: hidden;
}

.top-empty-inline {
  width: 100%;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: right;
  padding-left: var(--spacing-xs);
  padding-top: 6px;
}

.top-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.top-flow-row {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  height: 100%;
  padding-bottom: 4px;
}

.top-flow-row::-webkit-scrollbar {
  height: 6px;
}

.top-flow-row::-webkit-scrollbar-track {
  background: transparent;
}

.top-flow-row::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.top-flow-row::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.top-group-card {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 4px 6px;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  transition: all var(--transition-fast);
  cursor: grab;

  &:hover {
    border-color: var(--accent-primary);
    background: rgba(108, 158, 255, 0.06);
  }

  &:active {
    cursor: grabbing;
  }
}

.top-group-label {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: 600;
  padding-right: 5px;
  border-right: 1px solid var(--border-light);
  margin-right: 2px;
  white-space: nowrap;
}

.session-top-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 160px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-primary);
  padding: 3px 6px;
  cursor: pointer;
  transition: all var(--transition-fast);
  font-size: var(--font-size-xs);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--border-color);
  }

  &.active {
    border-color: var(--accent-primary);
    background: rgba(108, 158, 255, 0.12);
  }
}

.top-item-name {
  min-width: 0;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.session-list-panel {
  width: 200px;
  min-width: 200px;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
}

.session-list-panel.collapsed {
  width: 56px;
  min-width: 56px;
}

.collapsed-toolbar {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--border-color);
}

.collapsed-create-btn {
  width: 100%;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover { background: var(--bg-hover); }
}

.collapsed-filter {
  width: 100%;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 2px 2px;
  font-size: 11px;
}

.list-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
  padding: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.empty-list {
  padding: var(--spacing-xl);
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.session-tree {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: block;
  padding: 8px;
  min-height: 0;
  height: 100%;
}

.session-tree::-webkit-scrollbar {
  width: 8px;
}

.session-tree::-webkit-scrollbar-track {
  background: transparent;
}

.session-tree::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.session-tree::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.instance-group {
  margin-bottom: 12px;
}

.instance-group:last-child {
  margin-bottom: 0;
}

.instance-node {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, rgba(108, 158, 255, 0.12), rgba(108, 158, 255, 0.04));
  cursor: pointer;
  user-select: none;
  transition: all var(--transition-fast);
  overflow: hidden;

  &:hover {
    border-color: var(--accent-primary);
    background: linear-gradient(135deg, rgba(108, 158, 255, 0.18), rgba(108, 158, 255, 0.06));
  }
}

.instance-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.instance-header {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
}

.instance-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.instance-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.instance-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 0;
}

.instance-type-badge,
.instance-status-badge {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.instance-type-badge {
  background: rgba(148, 163, 184, 0.18);
  color: var(--text-secondary);
}

.instance-type-badge.remote {
  background: rgba(245, 158, 11, 0.16);
  color: #f59e0b;
}

.instance-status-badge {
  background: rgba(148, 163, 184, 0.14);
  color: var(--text-secondary);
}

.instance-status-badge.status-online {
  background: rgba(34, 197, 94, 0.14);
  color: #22c55e;
}

.instance-status-badge.status-offline,
.instance-status-badge.status-error {
  background: rgba(239, 68, 68, 0.14);
  color: #ef4444;
}

.instance-status-badge.status-connecting {
  background: rgba(59, 130, 246, 0.14);
  color: #3b82f6;
}

.instance-count {
  flex: 1;
  min-width: 0;
  max-width: 100%;
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.instance-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.instance-meta-pill,
.instance-meta-error {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10px;
  line-height: 1.4;
}

.instance-meta-pill {
  align-self: flex-start;
  background: rgba(59, 130, 246, 0.1);
  color: #3b82f6;
}

.instance-meta-error {
  display: -webkit-box;
  max-width: 100%;
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: normal;
  word-break: break-word;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.project-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.project-title-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  min-width: 0;
}

.project-subtitle {
  min-width: 0;
  font-size: 10px;
  line-height: 1.35;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.instance-projects {
  padding: 8px 0 0 12px;
}

.tree-group {
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  overflow: hidden;
  margin-bottom: 10px;
  border: 1px solid var(--border-color);
}

.tree-group:last-child {
  margin-bottom: 0;
}

.project-node {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(108, 158, 255, 0.08);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--border-color);
  transition: all var(--transition-fast);
  overflow: hidden;

  &:hover {
    background: rgba(108, 158, 255, 0.15);
  }
}

.project-caret {
  width: 16px;
  text-align: center;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  font-size: 12px;
  transition: transform var(--transition-fast);
}

.project-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-count {
  min-width: 22px;
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(108, 158, 255, 0.15);
  border-radius: 10px;
  padding: 2px 6px;
  font-weight: 600;
}

.project-actions {
  display: flex;
  align-items: flex-start;
  flex-shrink: 0;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.project-node:hover .project-actions {
  opacity: 1;
}

.project-action-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.project-children {
  display: flex;
  flex-direction: column;
  background: transparent;
}

.project-empty {
  padding: 8px 12px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-style: italic;
}

.session-items {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  display: block;
  min-height: 0;
}

.session-items::-webkit-scrollbar {
  width: 8px;
}

.session-items::-webkit-scrollbar-track {
  background: transparent;
}

.session-items::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 4px;
}

.session-items::-webkit-scrollbar-thumb:hover {
  background: var(--text-muted);
}

.session-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
  border: none;
  border-bottom: 1px solid var(--border-light);
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  transition: all var(--transition-fast);
  font-size: var(--font-size-sm);

  &:hover {
    background: rgba(108, 158, 255, 0.06);
  }

  &.active {
    background: rgba(108, 158, 255, 0.08);
    box-shadow: inset 3px 0 0 #6b7280;
  }

  &:last-child {
    border-bottom: none;
  }
}

.session-items.compact .session-item {
  justify-content: center;
  padding: 6px 3px;
  gap: 4px;
  border-bottom: none;
  display: flex;
}

.compact-group-label {
  width: 100%;
  text-align: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-muted);
  padding: 6px 0 4px;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid var(--border-light);

  &:first-child {
    border-top: none;
  }
}

.session-item.tree-child {
  padding-left: 20px;
  font-size: var(--font-size-xs);
}

.item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.item-time {
  font-size: 10px;
  color: var(--text-muted);
  line-height: 1;
}

.session-item.tree-child {
  padding-left: 24px;
  font-size: var(--font-size-sm);
}

.item-name {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.3;
}

.item-time {
  font-size: 9px;
  color: var(--text-muted);
  line-height: 1;
}

.panel-footer {
  display: flex;
  justify-content: space-between;
  gap: 2px;
  padding: 4px;
  border-top: 1px solid var(--border-color);
}

.panel-btn {
  flex: 1;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  cursor: pointer;
  font-size: 11px;
  transition: background var(--transition-fast);

  &:hover { background: var(--bg-hover); }
}

// type-badge, status-dot, pulse 已在 global.scss 中定义

.session-icon {
  width: 22px;
  height: 22px;
  font-size: 14px;
  line-height: 22px;
  text-align: center;
  flex-shrink: 0;

  &.lg {
    width: 32px;
    height: 32px;
    font-size: 20px;
    line-height: 32px;
  }
}

.icon-picker-dialog {
  width: 320px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: var(--spacing-sm) 0;
}

.icon-grid-cell {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { background: var(--bg-hover); }
  &.selected { background: rgba(108, 158, 255, 0.15); }
  &.clear-cell { color: var(--text-muted); font-size: 12px; }
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

.dialog-check {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.dialog-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
}
</style>
