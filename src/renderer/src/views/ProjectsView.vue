<template>
  <div class="projects-page">
    <!-- Top toolbar -->
    <div class="toolbar">
      <button class="btn btn-primary btn-sm" @click="handleAddProject">
        + {{ $t('project.add') }}
      </button>
      <input
        v-model="searchQuery"
        class="search-input"
        type="text"
        :placeholder="$t('project.search')"
      />
      <select v-model="sortBy" class="sort-select">
        <option value="name">{{ $t('project.sortName') }}</option>
        <option value="recent">{{ $t('project.sortRecent') }}</option>
        <option value="created">{{ $t('project.sortCreated') }}</option>
      </select>
    </div>

    <!-- 空状态 -->
    <div v-if="!projectsStore.loading && sortedProjects.length === 0" class="empty-state">
      <div class="empty-icon">P</div>
      <p class="empty-title">{{ $t('project.noProjects') }}</p>
      <p class="empty-desc">{{ $t('project.addFirst') }}</p>
      <button class="btn btn-primary" @click="handleAddProject">+ {{ $t('project.add') }}</button>
    </div>

    <!-- 项目卡片网格 -->
    <div v-else class="project-grid">
      <div
        v-for="p in sortedProjects"
        :key="p.id"
        class="project-card"
        @click="$router.push(`/projects/${p.id}`)"
        @contextmenu.prevent="openContextMenu($event, p)"
      >
        <div class="card-header">
          <span class="card-name">{{ p.name }}</span>
          <div class="card-actions" @click.stop>
            <button class="icon-btn" :title="$t('project.settings')" @click="$router.push(`/projects/${p.id}`)">S</button>
            <button class="icon-btn" :title="$t('project.openInExplorer')" @click="openInExplorer(p.path)">O</button>
            <button class="icon-btn danger" :title="$t('project.remove')" @click="handleRemove(p.id)">X</button>
          </div>
        </div>
        <div class="card-path">{{ p.path }}</div>
        <div class="card-footer">
          <span class="card-meta">{{ $t('project.lastOpened') }}: {{ formatDate(p.lastOpenedAt) }}</span>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="contextMenu.visible" class="context-overlay" @click="contextMenu.visible = false"></div>
    <div v-if="contextMenu.visible" class="context-menu" :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }">
      <button class="context-item" @click="handleContextSettings">{{ $t('project.settings') }}</button>
      <button class="context-item" @click="handleContextExplorer">{{ $t('project.openInExplorer') }}</button>
      <button class="context-item danger" @click="handleContextRemove">{{ $t('project.remove') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectsStore, type Project } from '@/stores/projects'
import { useToast } from '@/composables/useToast'
import { selectFolder } from '@/api/project'

const { t } = useI18n()
const router = useRouter()
const projectsStore = useProjectsStore()
const toast = useToast()

const searchQuery = ref('')
const sortBy = ref<'name' | 'recent' | 'created'>('recent')
const contextMenu = ref({ visible: false, x: 0, y: 0, project: null as Project | null })

const filteredProjects = computed(() => {
  const q = searchQuery.value.toLowerCase()
  if (!q) return projectsStore.projects
  return projectsStore.projects.filter(
    (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)
  )
})

const sortedProjects = computed(() => {
  const list = [...filteredProjects.value]
  switch (sortBy.value) {
    case 'name':
      return list.sort((a, b) => a.name.localeCompare(b.name))
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

async function handleAddProject() {
  try {
    const path = await selectFolder()
    if (path) {
      await projectsStore.addProject(path)
      toast.success(t('toast.projectAdded'))
    }
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleRemove(id: string) {
  if (confirm(t('project.confirmRemove'))) {
    try {
      await projectsStore.removeProject(id)
      toast.success(t('toast.projectRemoved'))
    } catch (e: unknown) {
      toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
    }
  }
}

function openInExplorer(path: string) {
  window.electronAPI?.invoke('shell:openPath', path)
}

function openContextMenu(e: MouseEvent, p: Project) {
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, project: p }
}

// 右键菜单处理
function handleContextSettings() {
  const p = contextMenu.value.project
  contextMenu.value.visible = false
  if (p) router.push(`/projects/${p.id}`)
}

function handleContextExplorer() {
  const p = contextMenu.value.project
  contextMenu.value.visible = false
  if (p) openInExplorer(p.path)
}

async function handleContextRemove() {
  const p = contextMenu.value.project
  contextMenu.value.visible = false
  if (p) await handleRemove(p.id)
}

onMounted(() => {
  projectsStore.fetchProjects()
})
</script>

<style scoped lang="scss">
.projects-page {
  padding: var(--spacing-xl);
  max-width: 1100px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-lg);
}

.search-input {
  flex: 1;
  padding: 6px 12px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: var(--font-size-sm);
  outline: none;
  transition: border-color var(--transition-fast);
  &:focus { border-color: var(--accent-primary); }
}

.sort-select {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: var(--font-size-xs);
}

.empty-state {
  text-align: center;
  padding: var(--spacing-xl) 0;
  color: var(--text-muted);
}

.empty-icon { font-size: 48px; margin-bottom: var(--spacing-md); }
.empty-title { font-size: var(--font-size-lg); margin-bottom: var(--spacing-xs); }
.empty-desc { font-size: var(--font-size-sm); margin-bottom: var(--spacing-lg); }

.project-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--spacing-md);
}

.project-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  cursor: pointer;
  transition: all var(--transition-fast);
  &:hover {
    border-color: var(--border-light);
    box-shadow: var(--shadow-md);
    .card-actions { opacity: 1; }
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-sm);
}

.card-name {
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
}

.card-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity var(--transition-fast);
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  transition: all var(--transition-fast);
  &:hover { background: var(--bg-tertiary); color: var(--text-primary); }
  &.danger:hover { background: rgba(248, 113, 113, 0.15); color: var(--status-error); }
}

.card-path {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: var(--spacing-sm);
  font-family: var(--font-mono);
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--spacing-sm);
}

.card-meta {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

// btn, btn-sm, btn-primary 已在 global.scss 中定义
// context-overlay, context-menu, context-item 已在 global.scss 中定义
</style>
