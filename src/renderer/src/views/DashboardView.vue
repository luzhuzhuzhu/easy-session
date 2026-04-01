<template>
  <div class="dashboard">
    <div class="welcome">
      <h1>{{ $t('dashboard.welcome') }}</h1>
      <p>{{ $t('dashboard.description') }}</p>
    </div>

<div class="cards">
      <div class="card cli-card">
        <h3>{{ $t('dashboard.claudeStatus') }}</h3>
        <div class="cli-status">
          <span class="indicator" :class="statusClass(appStore.claudeAvailable, checking)"></span>
          <span class="status-text">{{ statusText(appStore.claudeAvailable, checking) }}</span>
        </div>
        <div v-if="!checking && appStore.claudeAvailable" class="cli-detail">
          <div v-if="appStore.claudeInfo.path"><span class="label">{{ $t('dashboard.cliPath') }}</span> <code>{{ appStore.claudeInfo.path }}</code></div>
          <div v-if="appStore.claudeInfo.version"><span class="label">{{ $t('dashboard.cliVersion') }}</span> {{ appStore.claudeInfo.version }}</div>
        </div>
      </div>
      <div class="card cli-card">
        <h3>{{ $t('dashboard.codexStatus') }}</h3>
        <div class="cli-status">
          <span class="indicator" :class="statusClass(appStore.codexAvailable, checking)"></span>
          <span class="status-text">{{ statusText(appStore.codexAvailable, checking) }}</span>
        </div>
        <div v-if="!checking && appStore.codexAvailable" class="cli-detail">
          <div v-if="appStore.codexInfo.path"><span class="label">{{ $t('dashboard.cliPath') }}</span> <code>{{ appStore.codexInfo.path }}</code></div>
          <div v-if="appStore.codexInfo.version"><span class="label">{{ $t('dashboard.cliVersion') }}</span> {{ appStore.codexInfo.version }}</div>
        </div>
      </div>
      <div class="card cli-card">
        <h3>{{ $t('dashboard.opencodeStatus') }}</h3>
        <div class="cli-status">
          <span class="indicator" :class="statusClass(appStore.opencodeAvailable, checking)"></span>
          <span class="status-text">{{ statusText(appStore.opencodeAvailable, checking) }}</span>
        </div>
        <div v-if="!checking && appStore.opencodeAvailable" class="cli-detail">
          <div v-if="appStore.opencodeInfo.path"><span class="label">{{ $t('dashboard.cliPath') }}</span> <code>{{ appStore.opencodeInfo.path }}</code></div>
          <div v-if="appStore.opencodeInfo.version"><span class="label">{{ $t('dashboard.cliVersion') }}</span> {{ appStore.opencodeInfo.version }}</div>
        </div>
      </div>
    </div>

    <div class="cards">
      <div class="card stat-card">
        <h3>{{ $t('dashboard.activeProjects') }}</h3>
        <span class="stat">{{ quickAccessProjectCount }}</span>
      </div>
      <div class="card stat-card">
        <h3>{{ $t('dashboard.activeSessions') }}</h3>
        <span class="stat">{{ runningSessions }}</span>
      </div>
    </div>

      <div v-if="quickAccessRecentProjects.length" class="recent-projects">
        <h3>{{ $t('dashboard.recentProjects') }}</h3>
        <p v-if="projectsStore.unavailableRemoteProjectCount > 0" class="recent-note">
          {{ $t('dashboard.remoteUnavailableHint') }}
        </p>
        <div class="recent-list">
          <div
            v-for="p in quickAccessRecentProjects"
            :key="p.globalProjectKey"
            class="recent-item"
            @click="$router.push(buildProjectRouteLocation(p))"
          >
            <span class="recent-name">{{ p.name }}</span>
            <span class="recent-path">{{ p.path }}</span>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <h3>{{ $t('dashboard.quickActions') }}</h3>
      <div class="actions">
        <button class="action-btn" @click="handleNewProject">
          <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
            <path d="M8 3.25v9.5M3.25 8h9.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="1.6" />
          </svg>
          {{ $t('dashboard.newProject') }}
        </button>
        <button class="action-btn" @click="$router.push('/sessions')">
          <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
            <rect x="4" y="4" width="8" height="8" rx="0" fill="none" stroke="currentColor" stroke-width="1.6" />
          </svg>
          {{ $t('dashboard.newSession') }}
        </button>
        <button class="action-btn" @click="openConfigPanel">
          <svg viewBox="0 0 16 16" aria-hidden="true" width="14" height="14">
            <circle cx="8" cy="8" r="2" fill="none" stroke="currentColor" stroke-width="1.6" />
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" />
          </svg>
          {{ $t('dashboard.openConfig') }}
        </button>
      </div>
    </div>

    <div class="config-merged">
      <div class="config-merged-head">
        <h3>{{ $t('config.title') }}</h3>
        <button class="action-btn action-btn-small" @click="toggleConfigPanel">
          {{ $t(configPanelOpen ? 'dashboard.hideConfig' : 'dashboard.showConfig') }}
        </button>
      </div>
      <ConfigEditorPanel v-if="configPanelOpen" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { useInstancesStore } from '@/stores/instances'
import { selectFolder } from '@/api/local-project'
import ConfigEditorPanel from '@/components/ConfigEditorPanel.vue'
import { buildProjectRouteLocation } from '@/utils/project-routing'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const projectsStore = useProjectsStore()
const sessionsStore = useSessionsStore()
const instancesStore = useInstancesStore()
const checking = ref(true)
const configPanelOpen = ref(false)

const runningSessions = computed(() =>
  sessionsStore.unifiedSessions.filter((session) => session.status === 'running').length
)
const quickAccessProjectCount = computed(() => projectsStore.quickAccessProjectCount)
const quickAccessRecentProjects = computed(() => projectsStore.quickAccessRecentProjects)

function statusClass(available: boolean, isChecking: boolean) {
  if (isChecking) return 'checking'
  return available ? 'available' : 'unavailable'
}

function statusText(available: boolean, isChecking: boolean) {
  if (isChecking) return t('status.checking')
  return available ? t('status.available') : t('status.unavailable')
}

function queryPanelValue(): string {
  const panel = route.query.panel
  return Array.isArray(panel) ? String(panel[0] || '') : String(panel || '')
}

function syncPanelFromQuery(): void {
  configPanelOpen.value = queryPanelValue() === 'advanced'
}

function replacePanelQuery(open: boolean): void {
  const nextQuery: LocationQueryRaw = { ...route.query }
  if (open) {
    nextQuery.panel = 'advanced'
  } else {
    delete nextQuery.panel
  }
  void router.replace({ path: '/dashboard', query: nextQuery })
}

function openConfigPanel(): void {
  configPanelOpen.value = true
  replacePanelQuery(true)
}

function toggleConfigPanel(): void {
  configPanelOpen.value = !configPanelOpen.value
  replacePanelQuery(configPanelOpen.value)
}

async function handleNewProject() {
  try {
    const folder = await selectFolder()
    if (folder) {
      const project = await projectsStore.addProject(folder)
      router.push(buildProjectRouteLocation({
        instanceId: 'local',
        projectId: project.id,
        globalProjectKey: `local:${project.id}`
      }))
    }
  } catch (e: unknown) {
    // Will be caught by global error handler
  }
}

onMounted(async () => {
  syncPanelFromQuery()
  await appStore.init()
  await instancesStore.fetchInstances()
  await Promise.all([
    appStore.checkCliStatus(),
    projectsStore.fetchAllProjects(),
    sessionsStore.fetchAllSessions()
  ])
  checking.value = false
})

watch(
  () => route.query.panel,
  () => {
    syncPanelFromQuery()
  }
)
</script>

<style scoped lang="scss">
.dashboard {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.welcome {
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  flex-shrink: 0;
  
  h1 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--spacing-xs);
    letter-spacing: -0.3px;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--font-size-sm);
  }
}

.cards {
  display: flex;
  gap: 8px;
  padding: 8px;
  flex-shrink: 0;
  overflow-x: auto;
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-md);
  flex: 1;
  min-width: 200px;

  h3 {
    font-size: var(--font-size-xs);
    color: var(--text-muted);
    margin-bottom: var(--spacing-sm);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 500;
  }
}

.cli-status {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.indicator {
  width: 8px;
  height: 8px;
  border-radius: 0;
  display: inline-block;
  flex-shrink: 0;

  &.checking { background: var(--status-warning); animation: pulse 1.2s infinite; }
  &.available { background: var(--status-success); }
  &.unavailable { background: var(--status-error); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.status-text {
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.cli-detail {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);

  .label {
    color: var(--text-muted);
    margin-right: var(--spacing-xs);
  }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 0;
  }

  div + div { margin-top: 4px; }
}

.stat {
  font-size: var(--font-size-xl);
  font-weight: 700;
  color: var(--accent-primary);
}

.recent-projects {
  padding: 8px;
  flex: 1;
  overflow-y: auto;

  h3 {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-sm);
  }
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recent-note {
  margin: 0 0 var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
  }
}

.recent-name {
  font-weight: 600;
  font-size: var(--font-size-sm);
}

.recent-path {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.quick-actions {
  padding: 8px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;

  h3 {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-sm);
  }
}

.config-merged {
  padding: 8px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}

.config-merged-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);

  h3 {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
    margin: 0;
  }
}

.actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  svg {
    flex-shrink: 0;
  }
}

.action-btn-small {
  padding: 6px 12px;
}
</style>
