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
            >
              <span class="top-group-label" :title="group.projectPath">{{ group.projectName }}</span>
              <button
                v-for="s in group.sessions"
                :key="s.id"
                class="session-top-item"
                :class="{ active: sessionsStore.activeSessionId === s.id }"
                @click="handleSessionClick(s)"
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
          <div v-for="group in projectSessionTree" :key="group.key" class="tree-group">
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
                @click="handleSessionClick(s)"
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
            @click="handleSessionClick(s)"
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
      <template v-if="activeSession">
        <div class="detail-header">
          <div class="header-info">
            <span v-if="activeSession.icon" class="session-icon lg">{{ activeSession.icon }}</span>
            <span v-else class="type-badge lg" :class="activeSession.type">{{ activeSession.type === 'claude' ? 'C' : 'X' }}</span>
            <div>
              <h2>{{ activeSession.name }}</h2>
              <div class="header-meta">
                <span>{{ $t('session.id') }}: {{ activeSession.id }}</span>
                <span>{{ $t('session.project') }}: {{ activeSession.projectPath || '-' }}</span>
                <span v-if="activeSession.type === 'codex'">
                  {{ $t('session.permissionMode') }}: {{ codexPermissionModeLabel(activeSession) }}
                </span>
                <span class="status-tag" :class="activeSession.status">{{ $t(`session.status.${activeSession.status}`) }}</span>
                <SessionRuntimeInfo :session="activeSession" />
              </div>
            </div>
          </div>
          <div class="header-actions">
            <button v-if="activeSession.status !== 'running'" class="btn btn-primary btn-sm" @click="handleStart(activeSession.id)">
              {{ $t('session.start') }}
            </button>
            <button v-else class="btn btn-sm" @click="handlePause(activeSession.id)">
              {{ $t('session.pause') }}
            </button>
            <button class="btn btn-sm" @click="handleRestart(activeSession.id)">{{ $t('session.restart') }}</button>
            <button class="btn btn-danger btn-sm" @click="handleDestroy(activeSession.id)">{{ $t('session.destroy') }}</button>
          </div>
        </div>

        <TerminalOutput
          :session-id="activeSession.id"
          :process-key="activeSession.processId"
          @clear="sessionsStore.clearSessionOutput(activeSession.id)"
        />
      </template>
      <div v-else class="no-active">{{ $t('session.noActive') }}</div>
    </main>

    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
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
import { useToast } from '@/composables/useToast'
import TerminalOutput from '@/components/TerminalOutput.vue'
import CreateSessionDialog from '@/components/CreateSessionDialog.vue'
import SessionRuntimeInfo from '@/components/SessionRuntimeInfo.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const sessionsStore = useSessionsStore()
const projectsStore = useProjectsStore()
const settingsStore = useSettingsStore()
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
      return
    }
  }

  if (!sessionsStore.activeSessionId && sessionsStore.sessions.length > 0) {
    sessionsStore.setActiveSession(sessionsStore.sessions[0].id)
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
      path: project.path
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

  for (const group of groups) {
    group.sessions.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (b.status === 'running' && a.status !== 'running') return 1
      return b.createdAt - a.createdAt
    })
  }

  groups.sort((a, b) => a.projectName.localeCompare(b.projectName))
  return groups
})

const activeSession = computed(() => sessionsStore.sessions.find((s) => s.id === sessionsStore.activeSessionId) || null)

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

function openCreateDialog(projectPath = activeSession.value?.projectPath || '', lockProjectPath = false) {
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
    sessionsStore.setActiveSession(sessionId)
  }
  await sessionsStore.fetchSessions()
  if (sessionId && sessionsStore.sessions.some((session) => session.id === sessionId)) {
    sessionsStore.setActiveSession(sessionId)
  }
  applyRouteSessionSelection()
}

function codexPermissionModeLabel(session: Session): string {
  if (session.type !== 'codex') return '-'
  const options = session.options || {}
  const mode = typeof options.permissionsMode === 'string' ? options.permissionsMode : ''
  if (mode === 'read-only') return 'Read Only'
  if (mode === 'full-access') return 'Full Access'
  if (mode === 'default') return 'Default'

  const sandbox = typeof options.sandboxMode === 'string' ? options.sandboxMode : ''
  const approval = typeof options.approvalMode === 'string' ? options.approvalMode : ''
  if (sandbox === 'read-only') return 'Read Only'
  if (sandbox === 'danger-full-access' || approval === 'never' || approval === 'full-auto') {
    return 'Full Access'
  }
  return 'Default'
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

async function handleSessionClick(session: Session) {
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
  await Promise.all([sessionsStore.fetchSessions(), projectsStore.fetchProjects()])
  applyRouteSessionSelection()
})

watch(() => route.query.sessionId, () => {
  applyRouteSessionSelection()
})
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
  gap: 6px;
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
  max-height: 140px;
  overflow-y: auto;
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
  align-items: stretch;
  gap: 6px;
  overflow-x: auto;
}

.top-group-card {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  flex-shrink: 0;
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
  max-width: 200px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  padding: 4px 8px;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover { background: var(--bg-hover); }

  &.active {
    border-color: var(--accent-primary);
    background: rgba(108, 158, 255, 0.08);
  }
}

.top-item-name {
  min-width: 0;
  max-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  font-size: var(--font-size-xs);
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
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
}

.tree-group {
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  overflow: hidden;
}

.project-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  background: rgba(108, 158, 255, 0.04);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid rgba(45, 53, 72, 0.5);
}

.project-caret {
  width: 14px;
  text-align: center;
  font-family: var(--font-mono);
  color: var(--text-muted);
  font-size: 11px;
}

.project-name {
  flex: 1;
  min-width: 0;
  font-size: var(--font-size-xs);
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-count {
  min-width: 20px;
  text-align: right;
  font-size: 11px;
  color: var(--text-muted);
}

.project-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.project-action-btn {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.project-children {
  display: flex;
  flex-direction: column;
}

.project-empty {
  padding: var(--spacing-sm) var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.session-items {
  flex: 1;
  overflow-y: auto;
}

.session-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  border: 0;
  border-bottom: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  transition: background var(--transition-fast);

  &:hover { background: var(--bg-hover); }

  &.active {
    background: var(--bg-tertiary);
    box-shadow: inset 3px 0 0 var(--accent-primary);
  }
}

.session-items.compact .session-item {
  justify-content: center;
  padding: 6px 4px;
  gap: 4px;
}

.compact-group-label {
  width: 100%;
  text-align: center;
  font-size: 10px;
  font-weight: 700;
  color: var(--text-muted);
  padding: 4px 0 1px;
  border-top: 1px solid var(--border-color);
  line-height: 1;

  &:first-child {
    border-top: none;
  }
}

.session-item.tree-child {
  padding-left: 22px;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-name {
  display: block;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-time {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
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
}

.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 10px var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  gap: var(--spacing-md);
}

.header-info {
  display: flex;
  align-items: flex-start;
  gap: var(--spacing-sm);
  min-width: 0;
  flex: 1;

  h2 {
    font-size: var(--font-size-lg);
    margin: 0;
    line-height: 1.3;
  }
}

.header-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  margin-top: 2px;
  line-height: 1.6;
}

// status-tag 已在 global.scss 中定义

.header-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.no-active {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: var(--font-size-lg);
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
