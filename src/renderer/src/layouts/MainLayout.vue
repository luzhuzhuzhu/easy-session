<template>
  <div class="layout" :class="{ collapsed: sidebarCollapsed }">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="logo">
          <img class="logo-image" :src="logoSrc" alt="EasySession logo" />
        </div>
        <template v-if="!sidebarCollapsed">
          <div class="brand">
            <div class="brand-title">{{ $t('app.title') }}</div>
            <div class="brand-subtitle">{{ $t('app.subtitle') }}</div>
          </div>
        </template>
      </div>
      <nav class="nav-menu">
        <template v-for="item in navItems" :key="item.path">
          <router-link :to="item.path" class="nav-item" :title="sidebarCollapsed ? $t(item.label) : undefined">
            <span class="nav-icon">
              <svg v-if="item.icon === 'dashboard'" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="2" width="5" height="5" fill="currentColor" />
                <rect x="9" y="2" width="5" height="5" fill="currentColor" />
                <rect x="2" y="9" width="5" height="5" fill="currentColor" />
                <rect x="9" y="9" width="5" height="5" fill="currentColor" />
              </svg>
<svg v-else-if="item.icon === 'sessions'" viewBox="0 0 16 16" aria-hidden="true">
                <rect x="2" y="2" width="12" height="12" fill="currentColor" />
                <rect x="2" y="5" width="12" height="2" fill="var(--bg-secondary)" />
                <rect x="4" y="8" width="8" height="1" fill="var(--bg-secondary)" />
                <rect x="4" y="10" width="5" height="1" fill="var(--bg-secondary)" />
              </svg>
              <svg v-else-if="item.icon === 'projects'" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M2 4.5a1.5 1.5 0 0 1 1.5-1.5h3.2l2 2h5.3a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H3.5a1.5 1.5 0 0 1-1.5-1.5v-6z" fill="currentColor" />
              </svg>
              <svg v-else-if="item.icon === 'skills'" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1.5L9.8 6h4.7l-3.8 2.8 1.5 4.7L8 12l-4.2 2.5 1.5-4.7L1.5 6h4.7L8 1.5z" fill="currentColor" />
              </svg>
            </span>
            <span v-if="!sidebarCollapsed" class="nav-text">{{ $t(item.label) }}</span>
            <span v-if="!sidebarCollapsed && SHORTCUT_LABELS[item.path]" class="shortcut-hint">{{ SHORTCUT_LABELS[item.path] }}</span>
          </router-link>
          <div v-if="!sidebarCollapsed && item.path === '/projects' && recentProjects.length" class="nav-sub">
            <div v-if="projectsStore.unavailableRemoteProjectCount > 0" class="nav-sub-note">
              {{ $t('dashboard.remoteUnavailableHint') }}
            </div>
            <router-link
              v-for="p in recentProjects"
              :key="p.globalProjectKey"
              :to="buildProjectRouteLocation(p)"
              class="nav-sub-item"
            >
              {{ p.name }}
            </router-link>
          </div>
        </template>
      </nav>
      <div class="sidebar-footer">
        <router-link to="/settings" class="nav-item" :title="sidebarCollapsed ? $t('settings.title') : undefined">
          <span class="nav-icon">
<svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="8" cy="8" r="5" fill="currentColor" />
              <rect x="7" y="1" width="2" height="3" fill="currentColor" />
              <rect x="7" y="12" width="2" height="3" fill="currentColor" />
              <rect x="1" y="7" width="3" height="2" fill="currentColor" />
              <rect x="12" y="7" width="3" height="2" fill="currentColor" />
              <rect x="2.5" y="2.5" width="2.5" height="2.5" fill="currentColor" />
              <rect x="11" y="2.5" width="2.5" height="2.5" fill="currentColor" />
              <rect x="2.5" y="11" width="2.5" height="2.5" fill="currentColor" />
              <rect x="11" y="11" width="2.5" height="2.5" fill="currentColor" />
              <circle cx="8" cy="8" r="2.5" fill="var(--bg-secondary)" />
            </svg>
          </span>
          <span v-if="!sidebarCollapsed" class="nav-text">{{ $t('settings.title') }}</span>
          <span v-if="!sidebarCollapsed" class="shortcut-hint">{{ SHORTCUT_LABELS['/settings'] }}</span>
        </router-link>
        <div v-if="!sidebarCollapsed" class="sidebar-version">v{{ appStore.version }}</div>
        <button class="collapse-btn" @click="toggleSidebar" :title="$t(sidebarCollapsed ? 'sidebar.expand' : 'sidebar.collapse')">
          <svg v-if="sidebarCollapsed" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6 3l5 5-5 5V3z" fill="currentColor" />
          </svg>
          <svg v-else viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3l-5 5 5 5V3z" fill="currentColor" />
          </svg>
        </button>
      </div>
    </aside>
    <div class="main-area">
      <header class="topbar" @dblclick="toggleMaximize">
        <div class="topbar-left">
          <nav class="breadcrumb">
            <span class="breadcrumb-item" v-for="(crumb, i) in breadcrumbs" :key="i">
              <span v-if="i > 0" class="breadcrumb-sep">/</span>
              <router-link v-if="crumb.path" :to="crumb.path" class="breadcrumb-link">{{ crumb.label }}</router-link>
              <span v-else class="breadcrumb-current">{{ crumb.label }}</span>
            </span>
          </nav>
        </div>
        <div class="topbar-right">
          <div class="status-indicators">
            <span class="status-dot" :class="appStore.claudeAvailable ? 'online' : 'offline'" :title="$t(appStore.claudeAvailable ? 'topbar.claudeOnline' : 'topbar.claudeOffline')"></span>
            <span class="status-label">Claude</span>
            <span class="status-dot" :class="appStore.codexAvailable ? 'online' : 'offline'" :title="$t(appStore.codexAvailable ? 'topbar.codexOnline' : 'topbar.codexOffline')"></span>
            <span class="status-label">Codex</span>
            <span class="status-dot" :class="appStore.opencodeAvailable ? 'online' : 'offline'" :title="$t(appStore.opencodeAvailable ? 'topbar.opencodeOnline' : 'topbar.opencodeOffline')"></span>
            <span class="status-label">OpenCode</span>
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectsStore } from '@/stores/projects'
import { useAppStore } from '@/stores/app'
import { useSessionsStore } from '@/stores/sessions'
import { useInstancesStore } from '@/stores/instances'
import { useSettingsStore } from '@/stores/settings'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import { SHORTCUT_LABELS } from '@/composables/useShortcuts'
import logoSrc from '@/assets/logo-easy-session-light.png'
import { buildProjectRouteLocation, resolveProjectRouteRef } from '@/utils/project-routing'

const route = useRoute()
const { t } = useI18n()
const projectsStore = useProjectsStore()
const appStore = useAppStore()
const sessionsStore = useSessionsStore()
const instancesStore = useInstancesStore()
const settingsStore = useSettingsStore()
const navItems = [
  { path: "/dashboard", icon: "dashboard", label: "nav.dashboard" },
  { path: "/sessions", icon: "sessions", label: "nav.sessions" },
  { path: "/projects", icon: "projects", label: "nav.projects" },
  { path: "/skills", icon: "skills", label: "nav.skills" }
]

const recentProjects = computed(() => projectsStore.quickAccessRecentProjects.slice(0, 3))
const sidebarCollapsed = computed(() => settingsStore.settings.sidebarCollapsed)

const activeSessionCount = computed(() =>
  sessionsStore.unifiedSessions.filter((session) => session.status === 'running').length
)

const breadcrumbs = computed(() => {
  const crumbs: { label: string; path?: string }[] = []
  if (route.path === '/settings') {
    crumbs.push({ label: t('settings.title') })
  } else if (route.name === 'projectDetail' || route.name === 'instanceProjectDetail') {
    crumbs.push({ label: t('nav.projects'), path: '/projects' })
    const projectRef = resolveProjectRouteRef(route)
    const project = projectRef ? projectsStore.getUnifiedProject(projectRef.globalProjectKey) : null
    crumbs.push({ label: project?.name || String(projectRef?.projectId || route.params.id || route.params.projectId) })
  } else {
    const item = navItems.find((n) => route.path.startsWith(n.path))
    if (item) crumbs.push({ label: t(item.label) })
  }
  return crumbs
})

function toggleSidebar() {
  settingsStore.update({ sidebarCollapsed: !settingsStore.settings.sidebarCollapsed })
}

const api = window.electronAPI
function minimize() { api.invoke('window:minimize') }
function toggleMaximize() { api.invoke('window:maximize') }
function closeWindow() { api.invoke('window:close') }

onMounted(() => {
  if (!projectsStore.unifiedProjects.length) {
    void instancesStore.fetchInstances().then(() => projectsStore.fetchAllProjects())
  }
})
</script>

<style scoped lang="scss">
.layout {
  display: flex;
  height: 100vh;
  min-width: 960px;
  min-height: 600px;
  background: var(--bg-primary);
  color: var(--text-primary);
}

.sidebar {
  width: var(--sidebar-width);
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--transition-normal);

  .collapsed & {
    width: var(--sidebar-collapsed-width);
  }
}

.sidebar-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  -webkit-app-region: drag;
  min-height: 72px;

  .collapsed & {
    justify-content: center;
    padding: var(--spacing-md) var(--spacing-sm);
  }
}

.logo {
  width: 52px;
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0;
  background: transparent;
  flex-shrink: 0;
}

.logo-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.brand-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.brand-subtitle {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.nav-menu {
  padding: var(--spacing-sm);
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  overflow-y: auto;
}

.sidebar-footer {
  padding: var(--spacing-sm);
  border-top: 1px solid var(--border-color);
}

.sidebar-version {
  text-align: center;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: var(--spacing-xs) 0;
}

.collapse-btn {
  width: 100%;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 0;
  transition: all var(--transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 16px;
    height: 16px;
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 0;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: var(--font-size-sm);
  transition: all var(--transition-fast);
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  user-select: none;

  .collapsed & {
    justify-content: center;
    padding: var(--spacing-sm);
  }

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &.router-link-active {
    background: var(--bg-tertiary);
    color: var(--accent-primary);

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 6px;
      bottom: 6px;
      width: 3px;
      border-radius: 0;
      background: var(--accent-primary);
    }
  }
}

.nav-icon {
  font-size: 11px;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: 0;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  transition: all var(--transition-fast);

  svg {
    width: 16px;
    height: 16px;
  }

  .nav-item:hover &,
  .router-link-active & {
    background: rgba(108, 158, 255, 0.15);
    color: var(--accent-primary);
  }
}

.shortcut-hint {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
  opacity: 0.4;
  font-family: var(--font-mono);
  padding: 1px 4px;
  border-radius: 0;
  background: var(--bg-primary);
}

.nav-sub {
  padding-left: 40px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav-sub-note {
  padding: 4px var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  line-height: 1.4;
}

.nav-sub-item {
  padding: 4px var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  text-decoration: none;
  border-radius: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.router-link-active {
    color: var(--accent-primary);
  }
}

.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.topbar {
  height: var(--topbar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
  -webkit-app-region: drag;
  gap: var(--spacing-md);
}

.topbar-left {
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.breadcrumb {
  display: flex;
  align-items: center;
  font-size: var(--font-size-md);
}

.breadcrumb-sep {
  margin: 0 6px;
  color: var(--text-muted);
  opacity: 0.5;
}

.breadcrumb-link {
  color: var(--text-secondary);
  text-decoration: none;
  &:hover { color: var(--accent-primary); }
}

.breadcrumb-current {
  color: var(--text-primary);
  font-weight: 500;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  -webkit-app-region: no-drag;
}

.status-indicators {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 0;
  &.online { background: var(--status-success); box-shadow: 0 0 4px rgba(52, 211, 153, 0.4); }
  &.offline { background: var(--text-muted); }
}

.status-label {
  margin-right: var(--spacing-sm);
  font-size: 11px;
  letter-spacing: 0.3px;
}

.session-count {
  padding: 2px 8px;
  background: var(--bg-tertiary);
  border-radius: 0;
  font-size: var(--font-size-xs);
  color: var(--accent-primary);
}

.window-controls {
  display: flex;
  gap: 2px;
}

.win-btn {
  width: 46px;
  height: 32px;
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
}

// 页面切换过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
