<template>
  <div class="projects-page">
    <div class="toolbar">
      <button class="icon-btn icon-btn-primary icon-btn-lg" :title="$t('project.add')" @click="handleAddProject">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.25v9.5M3.25 8h9.5" />
        </svg>
      </button>
      <select v-model="createTargetInstanceId" class="sort-select" :title="$t('project.createTarget')">
        <option
          v-for="option in createTargetOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <input
        v-model="searchQuery"
        class="search-input"
        type="text"
        :placeholder="$t('project.search')"
      />
      <select v-model="instanceFilter" class="sort-select">
        <option value="all">{{ $t('project.instanceAll') }}</option>
        <option
          v-for="option in instanceFilterOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>
      <select v-model="sortBy" class="sort-select">
        <option value="name">{{ $t('project.sortName') }}</option>
        <option value="recent">{{ $t('project.sortRecent') }}</option>
        <option value="created">{{ $t('project.sortCreated') }}</option>
      </select>
    </div>

    <div v-if="!projectsStore.loading && sortedProjects.length === 0" class="empty-state">
      <div class="empty-icon">P</div>
      <p class="empty-title">{{ $t('project.noProjects') }}</p>
      <p class="empty-desc">{{ $t('project.addFirst') }}</p>
      <button class="icon-btn icon-btn-primary icon-btn-lg" :title="$t('project.add')" @click="handleAddProject">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.25v9.5M3.25 8h9.5" />
        </svg>
      </button>
    </div>

    <div v-else class="project-grid">
      <div
        v-for="project in sortedProjects"
        :key="project.globalProjectKey"
        class="project-card"
        @click="openProjectDetail(project)"
        @contextmenu.prevent="openContextMenu($event, project)"
      >
        <div class="card-header">
          <div class="card-title-wrap">
            <span class="card-name">{{ project.name }}</span>
            <span class="card-instance-badge" :class="{ local: project.instanceId === LOCAL_INSTANCE_ID }">
              {{ projectInstanceLabel(project) }}
            </span>
            <span
              v-if="shouldShowProjectStatus(project)"
              class="card-status-badge"
              :class="`status-${projectInstanceStatus(project)}`"
            >
              {{ projectInstanceStatusLabel(project) }}
            </span>
          </div>
          <div class="card-actions" @click.stop>
            <button class="icon-btn" :title="$t('project.settings')" @click="openProjectDetail(project)">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
                <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </button>
            <button
              v-if="canCreateSession(project)"
              class="icon-btn icon-btn-primary"
              :title="$t('projectDetail.newSession')"
              @click="openCreateSessionDialog(project)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 3.25v9.5M3.25 8h9.5" />
              </svg>
            </button>
            <button
              v-if="canRenameProject(project)"
              class="icon-btn"
              :title="$t('project.rename')"
              @click="handleRename(project)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M11.5 2.5l2 2M3 11v2h2l7-7-2-2-7 7z" fill="none" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </button>
            <button
              v-if="canOpenInExplorer(project)"
              class="icon-btn"
              :title="$t('project.openInExplorer')"
              @click="openInExplorer(project.path)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 4h5l1 1h6v8H2V4z" fill="none" stroke="currentColor" stroke-width="1.6" />
              </svg>
            </button>
            <button
              v-if="canRemoveProject(project)"
              class="icon-btn danger"
              :title="$t('project.remove')"
              @click="handleRemove(project)"
            >
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </div>
        </div>
        <div class="card-path">{{ project.path }}</div>
        <div class="card-footer">
          <span class="card-meta">{{ $t('project.lastOpened') }}: {{ formatDate(project.lastOpenedAt) }}</span>
        </div>
      </div>
    </div>

    <div v-if="contextMenu.visible" class="context-overlay" @click="contextMenu.visible = false"></div>
    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <button class="context-item" @click="handleContextSettings">{{ $t('project.settings') }}</button>
      <button
        v-if="contextProject && canCreateSession(contextProject)"
        class="context-item"
        @click="handleContextCreateSession"
      >
        {{ $t('projectDetail.newSession') }}
      </button>
      <button v-if="contextProject && canRenameProject(contextProject)" class="context-item" @click="handleContextRename">
        {{ $t('project.rename') }}
      </button>
      <button v-if="contextProject && canOpenInExplorer(contextProject)" class="context-item" @click="handleContextExplorer">
        {{ $t('project.openInExplorer') }}
      </button>
      <button
        v-if="contextProject && canRemoveProject(contextProject)"
        class="context-item danger"
        @click="handleContextRemove"
      >
        {{ $t('project.remove') }}
      </button>
    </div>

    <CreateSessionDialog
      :visible="showCreateSessionDialog"
      :target-instance-id="sessionTargetProject?.instanceId || LOCAL_INSTANCE_ID"
      :target-project-id="sessionTargetProject?.projectId"
      :target-project-path="sessionTargetProject?.path || ''"
      :default-project-path="sessionTargetProject?.path || ''"
      :lock-project-path="true"
      :start-paused="true"
      :activate-on-create="false"
      @cancel="closeCreateSessionDialog"
      @created="handleCreateSessionCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectsStore, type UnifiedProject } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useInstancesStore } from '@/stores/instances'
import { useToast } from '@/composables/useToast'
import { projectPriorityScore } from '@/utils/smart-priority'
import { LOCAL_INSTANCE_ID } from '@/models/unified-resource'
import { buildProjectRouteLocation } from '@/utils/project-routing'
import CreateSessionDialog from '@/components/CreateSessionDialog.vue'

const { t } = useI18n()
const router = useRouter()
const projectsStore = useProjectsStore()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const instancesStore = useInstancesStore()
const toast = useToast()

const searchQuery = ref('')
const instanceFilter = ref<'all' | string>('all')
const createTargetInstanceId = ref<string>(LOCAL_INSTANCE_ID)
const sortBy = ref<'name' | 'recent' | 'created'>('recent')
const contextMenu = ref({ visible: false, x: 0, y: 0, project: null as UnifiedProject | null })
const showCreateSessionDialog = ref(false)
const sessionTargetProject = ref<UnifiedProject | null>(null)

const contextProject = computed(() => contextMenu.value.project)
const createTargetOptions = computed(() =>
  instancesStore.instances
    .filter((instance) => instance.type === 'local' || instance.enabled)
    .filter((instance) => instance.capabilities.projectCreate)
    .map((instance) => ({
      value: instance.id,
      label: instance.id === LOCAL_INSTANCE_ID ? t('session.instanceLocal') : instance.name
    }))
)
const instanceFilterOptions = computed(() =>
  instancesStore.instances
    .filter((instance) => instance.type === 'local' || instance.enabled)
    .map((instance) => ({
      value: instance.id,
      label: instance.id === LOCAL_INSTANCE_ID ? t('session.instanceLocal') : instance.name
    }))
)

const filteredProjects = computed(() => {
  const byInstance =
    instanceFilter.value === 'all'
      ? projectsStore.unifiedProjects
      : projectsStore.unifiedProjects.filter((project) => project.instanceId === instanceFilter.value)
  const q = searchQuery.value.toLowerCase()
  if (!q) return byInstance
  return byInstance.filter(
    (project) => project.name.toLowerCase().includes(q) || project.path.toLowerCase().includes(q)
  )
})

const sortedProjects = computed(() => {
  const list = [...filteredProjects.value]
  const smartEnabled =
    settingsStore.settings.smartPriorityEnabled &&
    (settingsStore.settings.smartPriorityScope === 'projects' || settingsStore.settings.smartPriorityScope === 'both')

  if (smartEnabled) {
    const mode = settingsStore.settings.smartPriorityMode
    const now = Date.now()
    const sessionsByProjectKey = new Map<string, typeof sessionsStore.unifiedSessions>()

    for (const session of sessionsStore.unifiedSessions) {
      if (session.projectId) {
        const key = `${session.instanceId}:${session.projectId}`
        const current = sessionsByProjectKey.get(key)
        if (current) {
          current.push(session)
        } else {
          sessionsByProjectKey.set(key, [session])
        }
      }
    }

    const projectScores = new Map<string, number>()
    for (const project of list) {
      const sessions = (sessionsByProjectKey.get(project.globalProjectKey) ?? []).map((session) => ({
        ...session,
        id: session.sessionId
      }))
      projectScores.set(
        project.globalProjectKey,
        projectPriorityScore({ lastOpenedAt: project.lastOpenedAt }, sessions, mode, now)
      )
    }

    return list.sort(
      (left, right) =>
        (projectScores.get(right.globalProjectKey) ?? 0) - (projectScores.get(left.globalProjectKey) ?? 0)
    )
  }

  switch (sortBy.value) {
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    case 'recent':
      return list.sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    case 'created':
      return list.sort((a, b) => b.createdAt - a.createdAt)
    default:
      return list
  }
})

function formatDate(ts: number) {
  return new Date(ts).toLocaleString()
}

function projectInstanceLabel(project: UnifiedProject): string {
  if (project.instanceId === LOCAL_INSTANCE_ID) {
    return t('session.instanceLocal')
  }
  const instance = instancesStore.getInstance(project.instanceId)
  return instance?.name || t('session.instanceRemote')
}

function projectInstanceStatus(project: UnifiedProject): string {
  return instancesStore.getInstance(project.instanceId)?.status ?? 'unknown'
}

function projectInstanceStatusLabel(project: UnifiedProject): string {
  return t(`settings.remoteStatus.${projectInstanceStatus(project)}`)
}

function shouldShowProjectStatus(project: UnifiedProject): boolean {
  return project.instanceId !== LOCAL_INSTANCE_ID
}

function getProjectCapabilities(project: UnifiedProject) {
  return instancesStore.getInstance(project.instanceId)?.capabilities ?? null
}

function canCreateSession(project: UnifiedProject): boolean {
  return !!getProjectCapabilities(project)?.sessionCreate
}

function canOpenInExplorer(project: UnifiedProject): boolean {
  return project.instanceId === LOCAL_INSTANCE_ID && !!getProjectCapabilities(project)?.localPathOpen
}

function canRemoveProject(project: UnifiedProject): boolean {
  return !!getProjectCapabilities(project)?.projectRemove
}

function canRenameProject(project: UnifiedProject): boolean {
  return !!getProjectCapabilities(project)?.projectUpdate
}

function getDefaultCreateTargetId(): string {
  return createTargetOptions.value[0]?.value ?? LOCAL_INSTANCE_ID
}

async function handleAddProject() {
  try {
    const targetInstanceId = createTargetInstanceId.value || getDefaultCreateTargetId()
    const instance = instancesStore.getInstance(targetInstanceId)
    if (!instance || !instance.capabilities.projectCreate) {
      toast.warning(t('project.createTargetUnavailable'))
      return
    }

    if (targetInstanceId === LOCAL_INSTANCE_ID) {
      const path = await projectsStore.selectFolder()
      if (!path) return
      const project = await projectsStore.addProject(path)
      toast.success(t('toast.projectAdded'))
      openProjectDetail({
        instanceId: LOCAL_INSTANCE_ID,
        projectId: project.id,
        globalProjectKey: `${LOCAL_INSTANCE_ID}:${project.id}`,
        name: project.name,
        path: project.path,
        createdAt: project.createdAt,
        lastOpenedAt: project.lastOpenedAt,
        pathExists: project.pathExists,
        source: 'local'
      })
      return
    }

    const rawPath = window.prompt(t('project.remotePathPrompt'), '') ?? ''
    if (!rawPath.trim()) return
    const rawName = window.prompt(t('project.remoteNamePrompt'), '') ?? ''
    const created = await projectsStore.createProjectRef(targetInstanceId, {
      path: rawPath.trim(),
      name: rawName.trim() || undefined
    })
    toast.success(t('toast.projectAdded'))
    openProjectDetail(created)
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleRemove(project: UnifiedProject) {
  if (!confirm(t('project.confirmRemove'))) return

  try {
    await projectsStore.removeProjectRef({
      instanceId: project.instanceId,
      projectId: project.projectId,
      globalProjectKey: project.globalProjectKey
    })
    toast.success(t('toast.projectRemoved'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function openProjectDetail(project: UnifiedProject) {
  const projectRef = {
    instanceId: project.instanceId,
    projectId: project.projectId,
    globalProjectKey: project.globalProjectKey
  }

  const capabilities = getProjectCapabilities(project)
  let targetProject = project

  if (capabilities?.projectOpen) {
    try {
      targetProject = (await projectsStore.openProjectRef(projectRef)) ?? project
    } catch {
      projectsStore.setActiveProjectRef(projectRef)
    }
  } else {
    projectsStore.setActiveProjectRef(projectRef)
  }

  void router.push(buildProjectRouteLocation(targetProject))
}

function openCreateSessionDialog(project: UnifiedProject): void {
  sessionTargetProject.value = project
  showCreateSessionDialog.value = true
}

function closeCreateSessionDialog(): void {
  showCreateSessionDialog.value = false
  sessionTargetProject.value = null
}

async function handleCreateSessionCreated(payload?: {
  instanceId: string
  sessionId: string
  globalSessionKey: string
}): Promise<void> {
  closeCreateSessionDialog()
  if (!payload) return
  await sessionsStore.fetchSessionsForInstance(payload.instanceId)
}

function openInExplorer(path: string) {
  window.electronAPI?.invoke('shell:openPath', path)
}

function openContextMenu(e: MouseEvent, project: UnifiedProject) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, project }
}

function handleContextSettings() {
  const project = contextMenu.value.project
  contextMenu.value.visible = false
  if (project) openProjectDetail(project)
}

function handleContextCreateSession() {
  const project = contextMenu.value.project
  contextMenu.value.visible = false
  if (project && canCreateSession(project)) {
    openCreateSessionDialog(project)
  }
}

function handleContextExplorer() {
  const project = contextMenu.value.project
  contextMenu.value.visible = false
  if (project && canOpenInExplorer(project)) {
    openInExplorer(project.path)
  }
}

async function handleContextRemove() {
  const project = contextMenu.value.project
  contextMenu.value.visible = false
  if (project && canRemoveProject(project)) {
    await handleRemove(project)
  }
}

async function handleRename(project: UnifiedProject) {
  const nextName = window.prompt(t('project.renamePrompt'), project.name)?.trim() || ''
  if (!nextName || nextName === project.name) return

  try {
    await projectsStore.updateProjectRef(
      {
        instanceId: project.instanceId,
        projectId: project.projectId,
        globalProjectKey: project.globalProjectKey
      },
      { name: nextName }
    )
    toast.success(t('toast.projectUpdated'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleContextRename() {
  const project = contextMenu.value.project
  contextMenu.value.visible = false
  if (project && canRenameProject(project)) {
    await handleRename(project)
  }
}

onMounted(() => {
  if (!settingsStore.loaded) {
    void settingsStore.load()
  }
  void instancesStore.fetchInstances()
  void projectsStore.fetchAllProjects()
  void sessionsStore.fetchAllSessions()
})

watch(
  createTargetOptions,
  (options) => {
    if (options.some((option) => option.value === createTargetInstanceId.value)) return
    createTargetInstanceId.value = options[0]?.value ?? LOCAL_INSTANCE_ID
  },
  { immediate: true }
)

watch(
  instanceFilterOptions,
  (options) => {
    if (instanceFilter.value === 'all') return
    if (options.some((option) => option.value === instanceFilter.value)) return
    instanceFilter.value = 'all'
  },
  { immediate: true }
)
</script>

<style scoped lang="scss">
.projects-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.search-input {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  font-size: var(--font-size-xs);
  outline: none;
  transition: border-color var(--transition-fast);
  min-width: 0;

  &:focus {
    border-color: var(--accent-primary);
  }
}

.sort-select {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: 4px 8px;
  font-size: var(--font-size-xs);
  min-width: 100px;
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl) 0;
  color: var(--text-muted);
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-icon { font-size: 48px; margin-bottom: var(--spacing-md); }
.empty-title { font-size: var(--font-size-lg); margin-bottom: var(--spacing-xs); }
.empty-desc { font-size: var(--font-size-sm); margin-bottom: var(--spacing-lg); }

.project-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: minmax(0, auto);
  align-content: start;
  gap: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px;
  align-items: start;
}

.project-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  min-height: 92px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  contain: layout paint style;

  &:hover {
    border-color: var(--border-light);

    .card-actions {
      opacity: 1;
    }
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  gap: var(--spacing-xs);
  align-items: center;
  flex-shrink: 0;
  min-width: 0;
}

.card-title-wrap {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: 0;
  flex: 1;
}

.card-name {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-instance-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 0;
  background: rgba(96, 165, 250, 0.12);
  color: var(--accent-primary);
  font-size: var(--font-size-xs);
  white-space: nowrap;
  flex-shrink: 0;

  &.local {
    background: rgba(148, 163, 184, 0.14);
    color: var(--text-secondary);
  }
}

.card-status-badge {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 0;
  font-size: var(--font-size-xs);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;

  &.status-online {
    color: var(--status-success);
    background: rgba(52, 211, 153, 0.12);
  }

  &.status-offline,
  &.status-error {
    color: var(--status-error);
    background: rgba(248, 113, 113, 0.12);
  }
}

.card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
  flex-shrink: 0;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 0;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
  }

  &.danger:hover {
    background: rgba(248, 113, 113, 0.15);
    color: var(--status-error);
  }
}

.card-path {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.45;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  flex-shrink: 0;
  margin-top: auto;
}

.card-meta {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

@media (min-width: 1600px) {
  .project-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1320px) {
  .project-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 920px) {
  .project-grid {
    grid-template-columns: repeat(1, minmax(0, 1fr));
  }
}

.context-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
}

.context-menu {
  position: fixed;
  z-index: 110;
  min-width: 180px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  box-shadow: var(--shadow-lg);
  padding: 6px;
}

.context-item {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-primary);
  padding: 8px 10px;
  border-radius: 0;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }

  &.danger {
    color: var(--status-error);
  }
}
</style>
