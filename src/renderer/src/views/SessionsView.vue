<template>
  <div class="sessions-page" :class="{ 'top-layout': isTopLayout }">
    <section v-if="isTopLayout" class="session-top-panel" :class="{ collapsed: isListCollapsed }">
      <div class="top-inline-row">
        <button class="tool-btn" :title="$t('session.create')" @click="openCreateDialog()">+</button>
        <select v-model="filterType" class="filter-select top-filter" :class="{ compact: isListCollapsed }">
          <option value="">{{ $t('session.filter') }}</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
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
              <button
                v-for="s in group.sessions"
                :key="s.id"
                class="session-top-item"
                :class="{ active: sessionsStore.activeSessionId === s.id }"
                draggable="true"
                @click="handleSessionClick(s)"
                @dragstart="handleSessionDragStart($event, s)"
                @dragover.prevent="handleSessionDragOver($event, group.key)"
                @drop="handleSessionDrop($event, group.key, s.id)"
                @dragend="handleSessionDragEnd"
                @contextmenu.prevent="openContextMenu($event, s)"
              >
                <span v-if="s.icon" class="session-icon">{{ s.icon }}</span>
                <span v-else class="type-badge" :class="s.type">{{ s.type === 'claude' ? 'C' : 'X' }}</span>
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

    <aside v-else class="session-list-panel" :class="{ collapsed: isListCollapsed }">
      <div v-if="!isListCollapsed" class="list-toolbar">
        <button class="btn btn-primary btn-sm" @click="openCreateDialog()">+ {{ $t('session.create') }}</button>
        <select v-model="filterType" class="filter-select">
          <option value="">{{ $t('session.filter') }}</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
        </select>
      </div>
      <div v-else class="collapsed-toolbar">
        <button class="collapsed-create-btn" :title="$t('session.create')" @click="openCreateDialog()">+</button>
        <select v-model="filterType" class="collapsed-filter" :title="$t('session.filter')">
          <option value="">*</option>
          <option value="claude">C</option>
          <option value="codex">X</option>
        </select>
      </div>

      <template v-if="!isListCollapsed">
        <div v-if="projectSessionTree.length === 0" class="empty-list">
          {{ $t('session.noSessions') }}
        </div>
        <div v-else class="session-tree">
          <div v-for="group in projectSessionTree" :key="group.key" class="tree-group" draggable="true" @dragstart="handleProjectDragStart($event, group)" @dragover.prevent="handleProjectDragOver($event)" @drop="handleProjectDrop($event, group.key)" @dragend="handleProjectDragEnd">
            <div class="project-node" @click="toggleProjectExpand(group.key)">
              <span class="project-caret">{{ isProjectExpanded(group.key) ? 'v' : '>' }}</span>
              <span class="project-name">{{ group.projectName }}</span>
              <span class="project-count">{{ group.sessions.length }}</span>
              <div class="project-actions" @click.stop>
                <button
                  class="project-action-btn"
                  :title="$t('session.create')"
                  @click="openCreateDialog(group.projectPath, !!group.projectId)"
                >
                  +
                </button>
                <button
                  v-if="group.projectId"
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
                :class="{ active: sessionsStore.activeSessionId === s.id }"
                draggable="true"
                @click="handleSessionClick(s)"
                @dragstart="handleSessionDragStart($event, s)"
                @dragover.prevent="handleSessionDragOver($event, group.key)"
                @drop="handleSessionDrop($event, group.key, s.id)"
                @dragend="handleSessionDragEnd"
                @contextmenu.prevent="openContextMenu($event, s)"
              >
                <span v-if="s.icon" class="session-icon">{{ s.icon }}</span>
                <span v-else class="type-badge" :class="s.type">{{ s.type === 'claude' ? 'C' : 'X' }}</span>
                <div class="item-info">
                  <span class="item-name">{{ s.name }}</span>
                  <span class="item-time">{{ formatTime(s.createdAt) }}</span>
                </div>
                <span class="status-dot" :class="s.status"></span>
              </button>
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
            :class="{ active: sessionsStore.activeSessionId === s.id }"
            draggable="true"
            @click="handleSessionClick(s)"
            @dragstart="handleSessionDragStart($event, s)"
            @dragover.prevent="handleSessionDragOver($event, group.key)"
            @drop="handleSessionDrop($event, group.key, s.id)"
            @dragend="handleSessionDragEnd"
            @contextmenu.prevent="openContextMenu($event, s)"
          >
            <span v-if="s.icon" class="session-icon">{{ s.icon }}</span>
            <span v-else class="type-badge" :class="s.type">{{ s.type === 'claude' ? 'C' : 'X' }}</span>
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
        :sessions-by-id="sessionsById"
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
        @clear-output="sessionsStore.clearSessionOutput($event)"
      />
    </main>

    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <button class="context-item" @click="handleOpenInPaneContext">{{ $t('session.openInFocusedPane') }}</button>
      <button class="context-item" @click="handleSplitOpenContext('horizontal')">{{ $t('session.splitRightOpen') }}</button>
      <button class="context-item" @click="handleSplitOpenContext('vertical')">{{ $t('session.splitDownOpen') }}</button>
      <button
        v-if="contextMenu.session?.status !== 'running'"
        class="context-item"
        @click="handleStartContext"
      >
        {{ $t('session.start') }}
      </button>
      <button
        v-if="contextMenu.session?.status === 'running'"
        class="context-item"
        @click="handlePauseContext"
      >
        {{ $t('session.pause') }}
      </button>
      <button class="context-item" @click="handleRestartContext">{{ $t('session.restart') }}</button>
      <button class="context-item" @click="handleRename">{{ $t('session.rename') }}</button>
      <button class="context-item" @click="handleChangeIcon">{{ $t('session.changeIcon') }}</button>
      <button class="context-item danger" @click="handleDestroyContext">{{ $t('session.destroy') }}</button>
    </div>
    <div v-if="contextMenu.visible" class="context-overlay" @click="contextMenu.visible = false"></div>

    <CreateSessionDialog
      :visible="showCreateDialog"
      :default-project-path="createDialogProjectPath"
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
import { useSessionsStore, type Session } from '@/stores/sessions'
import { useProjectsStore } from '@/stores/projects'
import { useSettingsStore, type AppSettings } from '@/stores/settings'
import { useWorkspaceStore } from '@/stores/workspace'
import { useToast } from '@/composables/useToast'
import CreateSessionDialog from '@/components/CreateSessionDialog.vue'
import WorkspacePaneTree from '@/components/WorkspacePaneTree.vue'
import type { WorkspaceSplitDirection } from '@/api/workspace'
import { projectPriorityScore, sessionPriorityScore } from '@/utils/smart-priority'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const sessionsStore = useSessionsStore()
const projectsStore = useProjectsStore()
const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()
const toast = useToast()

const showCreateDialog = ref(false)
const createDialogProjectPath = ref('')
const createDialogLockProjectPath = ref(false)
const showRenameDialog = ref(false)
const renameSessionId = ref<string | null>(null)
const renameInput = ref('')

const showWakeDialog = ref(false)
const pendingWakeSession = ref<Session | null>(null)
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
  return sessionsStore.sessions.find((s) => s.id === iconPickerSessionId.value)?.icon ?? null
})

function applyRouteSessionSelection() {
  const querySessionId = typeof route.query.sessionId === 'string' ? route.query.sessionId : ''
  if (querySessionId) {
    const exists = sessionsStore.sessions.some((session) => session.id === querySessionId)
    if (exists) {
      sessionsStore.setActiveSession(querySessionId)
      workspaceStore.openSessionInActivePane(querySessionId)
      return
    }
  }

  if (sessionsStore.sessions.length === 0) return

  const fallbackSessionId = workspaceStore.activeSessionId || sessionsStore.activeSessionId || sessionsStore.sessions[0].id
  sessionsStore.setActiveSession(fallbackSessionId)
  workspaceStore.openSessionInActivePane(fallbackSessionId)
}

function reconcileWorkspaceSessions() {
  const validIds = sessionsStore.sessions.map((session) => session.id)
  const fallback = sessionsStore.activeSessionId || validIds[0]
  workspaceStore.reconcileSessions(validIds, fallback)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
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
const contextMenu = ref({ visible: false, x: 0, y: 0, session: null as Session | null })
const expandedProjectMap = ref<Record<string, boolean>>({})

const sessionDragState = ref<{ sessionId: string; projectKey: string } | null>(null)
const projectDragState = ref<{ group: ProjectSessionGroup } | null>(null)
const topProjectDragState = ref<{ group: ProjectSessionGroup } | null>(null)

interface ProjectSessionGroup {
  key: string
  projectId: string | null
  projectName: string
  projectPath: string
  sessions: Session[]
}

interface ProjectMeta {
  id: string
  name: string
  path: string
  lastOpenedAt: number
}

function normalizePathKey(path: string): string {
  const safePath = path || ''
  if (window.electronAPI?.platform === 'win32') return safePath.toLowerCase()
  return safePath
}

function getPathLeaf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '')
  const parts = trimmed.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] || path || '-'
}

const filteredSessions = computed(() => {
  if (!filterType.value) return sessionsStore.sessions
  return sessionsStore.sessions.filter((s) => s.type === filterType.value)
})

const projectMetaIndex = computed(() => {
  const sorted: ProjectMeta[] = [...projectsStore.projects]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((project) => ({
      id: project.id,
      name: project.name,
      path: project.path,
      lastOpenedAt: project.lastOpenedAt
    }))

  const byKey = new Map<string, ProjectMeta>()
  for (const project of sorted) {
    byKey.set(normalizePathKey(project.path), project)
  }

  return { sorted, byKey }
})

const projectSessionTree = computed<ProjectSessionGroup[]>(() => {
  const groupMap = new Map<string, ProjectSessionGroup>()
  const includeEmptyProjects = !filterType.value
  const { sorted: sortedProjects, byKey: projectByKey } = projectMetaIndex.value
  const smartSessionsEnabled =
    settingsStore.settings.smartPriorityEnabled &&
    (settingsStore.settings.smartPriorityScope === 'sessions' || settingsStore.settings.smartPriorityScope === 'both')
  const smartProjectsEnabled =
    settingsStore.settings.smartPriorityEnabled &&
    (settingsStore.settings.smartPriorityScope === 'projects' || settingsStore.settings.smartPriorityScope === 'both')
  const mode = settingsStore.settings.smartPriorityMode
  const now = Date.now()

  if (includeEmptyProjects) {
    for (const project of sortedProjects) {
      const key = normalizePathKey(project.path)
      groupMap.set(key, {
        key,
        projectId: project.id,
        projectName: project.name,
        projectPath: project.path,
        sessions: []
      })
    }
  }

  for (const session of filteredSessions.value) {
    const path = session.projectPath || ''
    const key = normalizePathKey(path)

    if (!groupMap.has(key)) {
      const project = projectByKey.get(key)
      groupMap.set(key, {
        key,
        projectId: project ? project.id : null,
        projectName: project ? project.name : (path ? getPathLeaf(path) : t('session.unmanagedProject')),
        projectPath: path,
        sessions: []
      })
    }

    groupMap.get(key)!.sessions.push(session)
  }

  const groups = Array.from(groupMap.values())
    .filter((group) => group.sessions.length > 0 || includeEmptyProjects)

  const manualSessionOrder = settingsStore.settings.manualSessionOrder || {}

  for (const group of groups) {
    if (smartSessionsEnabled) {
      const sessionScores = new Map<string, number>()
      for (const session of group.sessions) {
        sessionScores.set(session.id, sessionPriorityScore(session, mode, now))
      }
      group.sessions.sort((a, b) => (sessionScores.get(b.id) ?? 0) - (sessionScores.get(a.id) ?? 0))
      continue
    }

    const manualOrder = manualSessionOrder[group.key]
    if (manualOrder && manualOrder.length > 0) {
      const orderMap = new Map<string, number>()
      manualOrder.forEach((id, index) => orderMap.set(id, index))
      group.sessions.sort((a, b) => {
        const aIndex = orderMap.get(a.id) ?? 999999
        const bIndex = orderMap.get(b.id) ?? 999999
        if (aIndex !== bIndex) return aIndex - bIndex
        if (a.status === 'running' && b.status !== 'running') return -1
        if (b.status === 'running' && a.status !== 'running') return 1
        return b.createdAt - a.createdAt
      })
    } else {
      group.sessions.sort((a, b) => {
        if (a.status === 'running' && b.status !== 'running') return -1
        if (b.status === 'running' && a.status !== 'running') return 1
        return b.createdAt - a.createdAt
      })
    }
  }

  const manualProjectOrder = settingsStore.settings.manualProjectOrder || []
  if (smartProjectsEnabled) {
    const groupScores = new Map<string, number>()
    for (const group of groups) {
      const meta = projectByKey.get(group.key)
      groupScores.set(
        group.key,
        projectPriorityScore(
          { lastOpenedAt: meta?.lastOpenedAt ?? 0 },
          group.sessions,
          mode,
          now
        )
      )
    }
    groups.sort((a, b) => {
      return (groupScores.get(b.key) ?? 0) - (groupScores.get(a.key) ?? 0)
    })
  } else if (manualProjectOrder && manualProjectOrder.length > 0) {
    const orderMap = new Map<string, number>()
    manualProjectOrder.forEach((key, index) => orderMap.set(key, index))
    groups.sort((a, b) => {
      const aIndex = orderMap.get(a.key) ?? 999999
      const bIndex = orderMap.get(b.key) ?? 999999
      return aIndex - bIndex
    })
  } else {
    groups.sort((a, b) => a.projectName.localeCompare(b.projectName))
  }
  return groups
})

const workspaceLayout = computed(() => workspaceStore.layout)
const sessionsById = computed(() => {
  const index: Record<string, Session> = {}
  for (const session of sessionsStore.sessions) {
    index[session.id] = session
  }
  return index
})

const activeSessionForDialog = computed(() => {
  const activeId = workspaceStore.activeSessionId || sessionsStore.activeSessionId
  if (!activeId) return null
  return sessionsStore.sessions.find((session) => session.id === activeId) || null
})

const isTopLayout = computed(() => settingsStore.settings.sessionsListPosition === 'top')
const isListCollapsed = computed(() => settingsStore.settings.sessionsPanelCollapsed)

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

function isProjectExpanded(key: string): boolean {
  return expandedProjectMap.value[key] ?? true
}

function toggleProjectExpand(key: string) {
  expandedProjectMap.value[key] = !isProjectExpanded(key)
}

function openProject(group: ProjectSessionGroup) {
  if (!group.projectId) return
  void router.push(`/projects/${group.projectId}`)
}

function openCreateDialog(projectPath = activeSessionForDialog.value?.projectPath || '', lockProjectPath = false) {
  createDialogProjectPath.value = projectPath
  createDialogLockProjectPath.value = lockProjectPath
  showCreateDialog.value = true
}

function closeCreateDialog() {
  showCreateDialog.value = false
  createDialogProjectPath.value = ''
  createDialogLockProjectPath.value = false
}

async function handleCreateDialogCreated(sessionId?: string) {
  closeCreateDialog()
  await nextTick()
  if (sessionId) {
    workspaceStore.openSessionInActivePane(sessionId)
    sessionsStore.setActiveSession(sessionId)
  }
  await sessionsStore.fetchSessions()
  reconcileWorkspaceSessions()
  if (sessionId && sessionsStore.sessions.some((session) => session.id === sessionId)) {
    workspaceStore.openSessionInActivePane(sessionId)
    sessionsStore.setActiveSession(sessionId)
  }
  applyRouteSessionSelection()
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString()
}

function isDormantSession(session: Session): boolean {
  return session.status === 'idle' || session.status === 'stopped'
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

function handleFocusPane(paneId: string) {
  workspaceStore.focusPane(paneId)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
}

function handleSetPaneTab(payload: { paneId: string; tabId: string }) {
  workspaceStore.setActiveTab(payload.paneId, payload.tabId)
  const sessionId = workspaceLayout.value.tabs[payload.tabId]?.sessionId
  if (sessionId) {
    sessionsStore.setActiveSession(sessionId)
  }
}

function handleSplitPane(payload: { paneId: string; direction: WorkspaceSplitDirection }) {
  workspaceStore.splitPane(payload.paneId, payload.direction)
}

function handleClosePane(paneId: string) {
  workspaceStore.closePane(paneId)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
}

function handleClosePaneTab(payload: { paneId: string; tabId: string }) {
  workspaceStore.closeTab(payload.paneId, payload.tabId)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
}

function handleMoveTab(payload: { fromPaneId: string; toPaneId: string; tabId: string; toIndex?: number }) {
  workspaceStore.moveTabToPane(payload)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
}

function handleSplitAndMoveTab(payload: {
  sourcePaneId: string
  targetPaneId: string
  tabId: string
  direction: WorkspaceSplitDirection
}) {
  workspaceStore.splitPaneAndMoveTab(payload)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
}

function handleCloseOtherTabs(payload: { paneId: string; tabId: string }) {
  workspaceStore.closeOtherTabs(payload.paneId, payload.tabId)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
}

function handleCloseTabsRight(payload: { paneId: string; tabId: string }) {
  workspaceStore.closeTabsToRight(payload.paneId, payload.tabId)
  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
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
  sessionId: string
  targetPaneId: string
  direction?: WorkspaceSplitDirection
}) {
  const exists = sessionsStore.sessions.some((session) => session.id === payload.sessionId)
  if (!exists) return

  if (payload.direction) {
    workspaceStore.splitPane(payload.targetPaneId, payload.direction)
    const targetPaneId = workspaceStore.layout.activePaneId
    workspaceStore.openSessionInPane(payload.sessionId, targetPaneId)
  } else {
    workspaceStore.openSessionInPane(payload.sessionId, payload.targetPaneId)
  }

  if (workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  } else {
    sessionsStore.setActiveSession(payload.sessionId)
  }
}

function handleUndoLayout() {
  const undone = workspaceStore.undoLayoutChange()
  if (undone && workspaceStore.activeSessionId) {
    sessionsStore.setActiveSession(workspaceStore.activeSessionId)
  }
}

async function handleResetWorkspace() {
  if (!confirm(t('session.confirmResetLayout'))) return
  await workspaceStore.hardReset()
  reconcileWorkspaceSessions()
  toast.success(t('toast.layoutReset'))
}

async function restartSessionById(id: string, showSuccess = true) {
  try {
    await sessionsStore.restartSession(id)
    if (showSuccess) toast.success(t('toast.sessionRestarted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function startSessionById(id: string, showSuccess = true) {
  try {
    await sessionsStore.startSession(id)
    if (showSuccess) toast.success(t('toast.sessionStarted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function pauseSessionById(id: string, showSuccess = true) {
  try {
    await sessionsStore.pauseSession(id)
    if (showSuccess) toast.success(t('toast.sessionPaused'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

function handleSessionDragStart(e: DragEvent, session: Session) {
  if (!e.dataTransfer) return
  const sessionData = { sessionId: session.id }
  e.dataTransfer.setData(
    'application/x-easysession-session',
    JSON.stringify(sessionData)
  )
  e.dataTransfer.setData(
    'application/x-easysession-session-reorder',
    JSON.stringify(sessionData)
  )
  e.dataTransfer.effectAllowed = 'move'
  
  const path = session.projectPath || ''
  const key = normalizePathKey(path)
  sessionDragState.value = { sessionId: session.id, projectKey: key }
}

function handleSessionDragOver(e: DragEvent, projectKey: string) {
  if (!e.dataTransfer) return
  const sessionReorderRaw = e.dataTransfer.getData('application/x-easysession-session-reorder')
  if (!sessionReorderRaw) return
  
  try {
    const sessionData = JSON.parse(sessionReorderRaw) as { sessionId: string }
    const session = sessionsStore.sessions.find(s => s.id === sessionData.sessionId)
    if (!session) return
    
    const sessionPath = normalizePathKey(session.projectPath || '')
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
  
  const sessionReorderRaw = e.dataTransfer.getData('application/x-easysession-session-reorder')
  if (!sessionReorderRaw) return
  
  try {
    const sessionData = JSON.parse(sessionReorderRaw) as { sessionId: string }
    const draggedSessionId = sessionData.sessionId
    
    if (draggedSessionId === targetSessionId) return
    
    const session = sessionsStore.sessions.find(s => s.id === draggedSessionId)
    if (!session) return
    
    const sessionPath = normalizePathKey(session.projectPath || '')
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

async function handleSessionClick(session: Session) {
  workspaceStore.openSessionInActivePane(session.id)
  sessionsStore.setActiveSession(session.id)

  if (!isDormantSession(session)) return

  if (settingsStore.settings.sessionWakeConfirm) {
    pendingWakeSession.value = session
    wakeSkipReminder.value = false
    showWakeDialog.value = true
    return
  }

  await startSessionById(session.id)
}

function handleOpenInPaneContext() {
  const session = contextMenu.value.session
  contextMenu.value.visible = false
  if (!session) return
  workspaceStore.openSessionInActivePane(session.id)
  sessionsStore.setActiveSession(session.id)
}

function handleSplitOpenContext(direction: WorkspaceSplitDirection) {
  const session = contextMenu.value.session
  contextMenu.value.visible = false
  if (!session) return
  const activePaneId = workspaceStore.layout.activePaneId
  workspaceStore.splitPane(activePaneId, direction)
  const targetPaneId = workspaceStore.layout.activePaneId
  workspaceStore.openSessionInPane(session.id, targetPaneId)
  sessionsStore.setActiveSession(session.id)
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

  await startSessionById(session.id)
}

async function handleStart(id: string) {
  await startSessionById(id)
}

async function handlePause(id: string) {
  await pauseSessionById(id)
}

async function handleRestart(id: string) {
  await restartSessionById(id)
}

async function handleDestroy(id: string) {
  if (confirm(t('session.confirmDestroy'))) {
    try {
      await sessionsStore.destroySession(id)
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

function openContextMenu(e: MouseEvent, session: Session) {
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
    await sessionsStore.updateSessionIcon(id, emoji)
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function confirmRename() {
  const id = renameSessionId.value
  const name = renameInput.value.trim()
  if (!id || !name) return

  const current = sessionsStore.sessions.find((session) => session.id === id)
  if (current && current.name === name) {
    closeRenameDialog()
    return
  }

  try {
    await sessionsStore.renameSession(id, name)
    toast.success(t('toast.sessionRenamed'))
    closeRenameDialog()
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleDestroyContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handleDestroy(s.id)
}

async function handleStartContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handleStart(s.id)
}

async function handlePauseContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handlePause(s.id)
}

async function handleRestartContext() {
  const s = contextMenu.value.session
  contextMenu.value.visible = false
  if (s) await handleRestart(s.id)
}

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.load()
  await Promise.all([sessionsStore.fetchSessions(), projectsStore.fetchProjects(), workspaceStore.load()])
  reconcileWorkspaceSessions()
  applyRouteSessionSelection()
})

watch(() => route.query.sessionId, () => {
  applyRouteSessionSelection()
})

watch(
  () => sessionsStore.sessions.map((session) => session.id).join('|'),
  () => {
    reconcileWorkspaceSessions()
  }
)

watch(
  () => workspaceStore.activeSessionId,
  (sessionId) => {
    if (sessionId) {
      sessionsStore.setActiveSession(sessionId)
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
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(108, 158, 255, 0.08);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--border-color);
  transition: all var(--transition-fast);

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
  align-items: center;
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
