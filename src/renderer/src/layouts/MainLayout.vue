<template>
  <div class="layout">
    <header class="topbar" @dblclick="toggleMaximize">
      <div class="topbar-left">
        <router-link class="brand-link" to="/dashboard" :title="`${$t('app.title')} v${appStore.version}`" @dblclick.stop>
          <img class="logo-image" :src="logoSrc" alt="EasySession logo" />
          <span class="brand-copy">
            <span class="brand-title">{{ $t('app.title') }}</span>
          </span>
        </router-link>

        <nav class="global-nav" :aria-label="$t('app.title')" @dblclick.stop>
          <router-link
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="top-nav-item"
            :class="{ active: isNavActive(item.path) }"
          >
            <span class="top-nav-icon">
              <svg v-if="item.icon === 'dashboard'" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" fill="currentColor" />
                <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" fill="currentColor" />
                <rect x="2.5" y="9" width="4.5" height="4.5" rx="1" fill="currentColor" />
                <rect x="9" y="9" width="4.5" height="4.5" rx="1" fill="currentColor" />
              </svg>
              <svg v-else-if="item.icon === 'sessions'" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2.5" y="3" width="11" height="10" rx="1.4" fill="currentColor" />
                <rect x="4.25" y="5.5" width="7.5" height="1.2" rx=".6" fill="var(--bg-secondary)" />
                <rect x="4.25" y="8" width="5.5" height="1.2" rx=".6" fill="var(--bg-secondary)" />
                <rect x="4.25" y="10.5" width="6.5" height="1.2" rx=".6" fill="var(--bg-secondary)" />
              </svg>
              <svg v-else-if="item.icon === 'projects'" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 4.6A1.6 1.6 0 0 1 3.6 3h3l1.45 1.7h4.35A1.6 1.6 0 0 1 14 6.3v5.1a1.6 1.6 0 0 1-1.6 1.6H3.6A1.6 1.6 0 0 1 2 11.4V4.6z" fill="currentColor" />
              </svg>
              <svg v-else-if="item.icon === 'skills'" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1.7 9.65 6h4.55l-3.68 2.72 1.42 4.52L8 10.56l-3.94 2.68 1.42-4.52L1.8 6h4.55L8 1.7z" fill="currentColor" />
              </svg>
              <svg v-else-if="item.icon === 'settings'" viewBox="0 0 16 16" fill="currentColor" fill-rule="evenodd" aria-hidden="true">
                <path d="M6.6 1.1 9.4 1.1 9.1 2.7 11 3.5 11.9 2.2 13.8 4.1 12.5 5 13.3 6.9 14.9 6.6 14.9 9.4 13.3 9.1 12.5 11 13.8 11.9 11.9 13.8 11 12.5 9.1 13.3 9.4 14.9 6.6 14.9 6.9 13.3 5 12.5 4.1 13.8 2.2 11.9 3.5 11 2.7 9.1 1.1 9.4 1.1 6.6 2.7 6.9 3.5 5 2.2 4.1 4.1 2.2 5 3.5 6.9 2.7ZM10.5 8A2.5 2.5 0 1 0 5.5 8 2.5 2.5 0 1 0 10.5 8Z" />
              </svg>
            </span>
            <span class="top-nav-label">{{ $t(item.label) }}</span>
          </router-link>
        </nav>

        <nav v-if="contextCrumbs.length" class="context-trail" :aria-label="$t('nav.projects')" @dblclick.stop>
          <span class="context-divider" aria-hidden="true"></span>
          <span class="breadcrumb-item" v-for="(crumb, i) in contextCrumbs" :key="`${crumb.label}-${i}`">
            <span v-if="i > 0" class="breadcrumb-sep">/</span>
            <router-link v-if="crumb.path" :to="crumb.path" class="breadcrumb-link">{{ crumb.label }}</router-link>
            <span v-else class="breadcrumb-current">{{ crumb.label }}</span>
          </span>
        </nav>
      </div>

      <div class="topbar-right" @dblclick.stop>
        <div class="status-indicators">
          <button
            class="cli-status-btn"
            type="button"
            :title="getCliStatusTitle(appStore.claudeAvailable ? 'topbar.claudeOnline' : 'topbar.claudeOffline')"
            :aria-label="getCliStatusTitle(appStore.claudeAvailable ? 'topbar.claudeOnline' : 'topbar.claudeOffline')"
            @click="openCliSettings"
          >
            <span class="status-dot" :class="appStore.claudeAvailable ? 'online' : 'offline'"></span>
            <span class="status-label">Claude</span>
          </button>
          <button
            class="cli-status-btn"
            type="button"
            :title="getCliStatusTitle(appStore.codexAvailable ? 'topbar.codexOnline' : 'topbar.codexOffline')"
            :aria-label="getCliStatusTitle(appStore.codexAvailable ? 'topbar.codexOnline' : 'topbar.codexOffline')"
            @click="openCliSettings"
          >
            <span class="status-dot" :class="appStore.codexAvailable ? 'online' : 'offline'"></span>
            <span class="status-label">Codex</span>
          </button>
          <button
            class="cli-status-btn"
            type="button"
            :title="getCliStatusTitle(appStore.opencodeAvailable ? 'topbar.opencodeOnline' : 'topbar.opencodeOffline')"
            :aria-label="getCliStatusTitle(appStore.opencodeAvailable ? 'topbar.opencodeOnline' : 'topbar.opencodeOffline')"
            @click="openCliSettings"
          >
            <span class="status-dot" :class="appStore.opencodeAvailable ? 'online' : 'offline'"></span>
            <span class="status-label">OpenCode</span>
          </button>
          <span class="session-count" v-if="activeSessionCount > 0">{{ activeSessionCount }} {{ $t('topbar.activeSessions') }}</span>
        </div>

        <div class="window-controls">
          <button class="win-btn" @click="minimize" title="最小化">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
          <button class="win-btn" @click="toggleMaximize" title="最大化/还原">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="8" height="8" stroke="currentColor" stroke-width="1.5" rx="1"/>
            </svg>
          </button>
          <button class="win-btn win-btn-close" @click="closeWindow" title="关闭">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </header>

    <main class="content">
      <ErrorBoundary>
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </ErrorBoundary>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectsStore } from '@/stores/projects'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { useInstancesStore } from '@/stores/instances'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import logoSrc from '@/assets/logo-easy-session-light.png'
import { resolveProjectRouteRef } from '@/utils/project-routing'
import { LOCAL_INSTANCE_ID } from '@/models/unified-resource'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const projectsStore = useProjectsStore()
const appStore = useAppStore()
const sessionsStore = useSessionsStore()
const instancesStore = useInstancesStore()
const confirmDialog = useConfirmDialog()

const navItems = [
  { path: '/dashboard', icon: 'dashboard', label: 'nav.dashboard' },
  { path: '/sessions', icon: 'sessions', label: 'nav.sessions' },
  { path: '/projects', icon: 'projects', label: 'nav.projects' },
  { path: '/skills', icon: 'skills', label: 'nav.skills' },
  { path: '/settings', icon: 'settings', label: 'nav.settings' }
]

const activeSessionCount = computed(() =>
  sessionsStore.unifiedSessions.filter((session) => session.status === 'running').length
)

const runningLocalSessionCount = computed(() =>
  sessionsStore.unifiedSessions.filter((session) => session.instanceId === 'local' && session.status === 'running').length
)

const runningRemoteSessionCount = computed(() =>
  sessionsStore.unifiedSessions.filter((session) => session.instanceId !== 'local' && session.status === 'running').length
)

const contextCrumbs = computed(() => {
  const crumbs: { label: string; path?: string }[] = []
  if (route.name === 'projectDetail' || route.name === 'instanceProjectDetail') {
    crumbs.push({ label: t('nav.projects'), path: '/projects' })
    const projectRef = resolveProjectRouteRef(route)
    const project = projectRef ? projectsStore.getUnifiedProject(projectRef.globalProjectKey) : null
    if (projectRef) {
      crumbs.push({ label: formatProjectInstanceCrumb(projectRef.instanceId) })
    }
    crumbs.push({ label: project?.name || String(projectRef?.projectId || route.params.id || route.params.projectId) })
  }
  return crumbs
})

const api = window.electronAPI

function isNavActive(path: string): boolean {
  if (path === '/projects' && route.name === 'instanceProjectDetail') return true
  return route.path === path || route.path.startsWith(`${path}/`)
}

function minimize() {
  api.invoke('window:minimize')
}

function toggleMaximize() {
  api.invoke('window:maximize')
}

async function closeWindow() {
  if (activeSessionCount.value > 0) {
    const confirmed = await confirmDialog.confirm({
      title: t('topbar.confirmCloseRunningTitle'),
      message: t('topbar.confirmCloseRunningMessage', {
        local: runningLocalSessionCount.value,
        remote: runningRemoteSessionCount.value
      }),
      details: t('topbar.confirmCloseRunningDetails'),
      confirmText: t('topbar.confirmCloseRunningAction'),
      cancelText: t('common.cancel'),
      tone: 'danger'
    })
    if (!confirmed) return
  }
  api.invoke('window:close')
}

function openCliSettings(): void {
  void router.push({ path: '/settings', query: { category: 'cli' } })
}

function getCliStatusTitle(statusKey: string): string {
  return `${t(statusKey)} · ${t('topbar.openCliSettings')}`
}

function formatProjectInstanceCrumb(instanceId: string): string {
  if (instanceId === LOCAL_INSTANCE_ID) {
    return t('session.instanceLocal')
  }

  const instance = instancesStore.getInstance(instanceId)
  const name = instance?.name || instanceId
  if (!instance) return name
  return `${name} · ${t(`settings.remoteStatus.${instance.status}`)}`
}

onMounted(() => {
  if (!projectsStore.unifiedProjects.length) {
    void instancesStore.fetchInstances().then(() => projectsStore.fetchAllProjects())
  }
})
</script>

<style scoped lang="scss">
.layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-width: 960px;
  min-height: 600px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.topbar {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 0 0 0 10px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-secondary) 94%, var(--bg-primary));
  -webkit-app-region: drag;
  flex-shrink: 0;
}

.topbar-left,
.topbar-right {
  display: flex;
  align-items: center;
  min-width: 0;
}

.topbar-left {
  flex: 1;
  gap: 10px;
  align-self: stretch;
  -webkit-app-region: drag;
}

.topbar-right {
  gap: 12px;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.brand-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-primary);
  text-decoration: none;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.logo-image {
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}

.brand-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.brand-title {
  font-size: var(--font-size-sm);
  font-weight: 650;
  line-height: 1;
  letter-spacing: 0;
}

.global-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 2px;
  border: 1px solid color-mix(in srgb, var(--border-color) 82%, transparent);
  border-radius: var(--radius-xl);
  background: color-mix(in srgb, var(--bg-primary) 68%, transparent);
  -webkit-app-region: no-drag;
}

.top-nav-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  text-decoration: none;
  font-size: var(--font-size-sm);
  line-height: 1;
  white-space: nowrap;
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.active {
    background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-tertiary));
    color: var(--text-primary);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 18%, transparent);
  }
}

.top-nav-icon {
  width: 15px;
  height: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  svg {
    width: 15px;
    height: 15px;
    display: block;
  }
}

.top-nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.context-trail {
  display: inline-flex;
  align-items: center;
  gap: 0;
  min-width: 0;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  white-space: nowrap;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

.context-divider {
  width: 1px;
  height: 22px;
  margin-right: 12px;
  background: var(--border-color);
}

.breadcrumb-item {
  display: inline-flex;
  align-items: center;
  min-width: 0;
}

.breadcrumb-sep {
  margin: 0 7px;
  color: var(--text-muted);
  opacity: 0.55;
}

.breadcrumb-link {
  color: var(--text-secondary);
  text-decoration: none;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover {
    color: var(--accent-primary);
  }
}

.breadcrumb-current {
  color: var(--text-primary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.status-indicators {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  min-width: 0;
}

.status-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;

  &.online {
    background: var(--status-success);
    box-shadow: 0 0 4px color-mix(in srgb, var(--status-success) 45%, transparent);
  }

  &.offline {
    background: var(--text-muted);
  }
}

.status-label {
  margin-right: var(--spacing-sm);
  font-size: 11px;
  letter-spacing: 0;
}

.cli-status-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font: inherit;

  &:hover,
  &:focus-visible {
    color: var(--text-primary);
  }

  &:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: 3px;
  }
}

.session-count {
  padding: 3px 8px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-lg);
  font-size: var(--font-size-xs);
  color: var(--accent-primary);
  white-space: nowrap;
}

.window-controls {
  display: flex;
  align-self: stretch;
  gap: 0;
}

.win-btn {
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 140ms ease;

  svg {
    transition: transform 140ms ease;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary);

    svg {
      transform: scale(1.1);
    }
  }

  &:active {
    background: rgba(255, 255, 255, 0.12);
  }
}

.win-btn-close:hover {
  background: #e81123;
  color: white;
}

.content {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

@media (max-width: 1160px) {
  .brand-title {
    display: none;
  }

  .topbar-left {
    gap: 8px;
  }

  .top-nav-item {
    padding: 0 9px;
  }
}

@media (max-width: 1040px) {
  .top-nav-label {
    display: none;
  }

  .top-nav-item {
    width: 28px;
    padding: 0;
  }

  .context-trail {
    display: none;
  }
}
</style>
