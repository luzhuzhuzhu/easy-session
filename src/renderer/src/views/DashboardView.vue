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
    </div>

    <div class="cards">
      <div class="card stat-card">
        <h3>{{ $t('dashboard.activeProjects') }}</h3>
        <span class="stat">{{ projectsStore.projects.length }}</span>
      </div>
      <div class="card stat-card">
        <h3>{{ $t('dashboard.activeSessions') }}</h3>
        <span class="stat">{{ runningSessions }}</span>
      </div>
    </div>

    <div v-if="projectsStore.recentProjects.length" class="recent-projects">
      <h3>{{ $t('dashboard.recentProjects') }}</h3>
      <div class="recent-list">
        <div
          v-for="p in projectsStore.recentProjects.slice(0, 5)"
          :key="p.id"
          class="recent-item"
          @click="$router.push(`/projects/${p.id}`)"
        >
          <span class="recent-name">{{ p.name }}</span>
          <span class="recent-path">{{ p.path }}</span>
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <h3>{{ $t('dashboard.quickActions') }}</h3>
      <div class="actions">
        <button class="action-btn" @click="handleNewProject">{{ $t('dashboard.newProject') }}</button>
        <button class="action-btn" @click="$router.push('/sessions')">{{ $t('dashboard.newSession') }}</button>
        <button class="action-btn" @click="$router.push('/config')">{{ $t('dashboard.openConfig') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '@/stores/app'
import { useProjectsStore } from '@/stores/projects'
import { useSessionsStore } from '@/stores/sessions'
import { selectFolder } from '@/api/project'

const { t } = useI18n()
const router = useRouter()
const appStore = useAppStore()
const projectsStore = useProjectsStore()
const sessionsStore = useSessionsStore()
const checking = ref(true)

const runningSessions = computed(() =>
  sessionsStore.sessions.filter((s) => s.status === 'running').length
)

function statusClass(available: boolean, isChecking: boolean) {
  if (isChecking) return 'checking'
  return available ? 'available' : 'unavailable'
}

function statusText(available: boolean, isChecking: boolean) {
  if (isChecking) return t('status.checking')
  return available ? t('status.available') : t('status.unavailable')
}

async function handleNewProject() {
  try {
    const folder = await selectFolder()
    if (folder) {
      const project = await projectsStore.addProject(folder)
      router.push(`/projects/${project.id}`)
    }
  } catch (e: unknown) {
    // Will be caught by global error handler
  }
}

onMounted(async () => {
  await appStore.init()
  await Promise.all([
    appStore.checkCliStatus(),
    projectsStore.fetchProjects(),
    sessionsStore.fetchSessions()
  ])
  checking.value = false
})
</script>

<style scoped lang="scss">
.dashboard {
  padding: var(--spacing-xl);
  max-width: 960px;
}

.welcome {
  margin-bottom: var(--spacing-xl);
  h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--spacing-xs);
    letter-spacing: -0.3px;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--font-size-md);
  }
}

.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--border-light);
    box-shadow: var(--shadow-sm);
  }

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
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;

  &.checking { background: var(--status-warning); animation: pulse 1.2s infinite; }
  &.available { background: var(--status-success); box-shadow: 0 0 6px rgba(52, 211, 153, 0.4); }
  &.unavailable { background: var(--status-error); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.status-text {
  font-weight: 600;
  font-size: var(--font-size-md);
}

.cli-detail {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-sm);
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
    border-radius: var(--radius-sm);
  }

  div + div { margin-top: 4px; }
}

.stat {
  font-size: var(--font-size-2xl);
  font-weight: 700;
  color: var(--accent-primary);
}

.recent-projects {
  margin-bottom: var(--spacing-md);

  h3 {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-sm);
  }
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.recent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-sm) var(--spacing-md);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    border-color: var(--accent-primary);
  }
}

.recent-name {
  font-weight: 600;
  font-size: var(--font-size-md);
}

.recent-path {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.quick-actions {
  margin-top: var(--spacing-lg);

  h3 {
    font-size: var(--font-size-md);
    color: var(--text-secondary);
    margin-bottom: var(--spacing-md);
  }
}

.actions {
  display: flex;
  gap: var(--spacing-md);
}

.action-btn {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--accent-primary);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    background: var(--accent-primary);
    color: var(--bg-primary);
    border-color: var(--accent-primary);
  }

  &:active { transform: scale(0.97); }
}
</style>
