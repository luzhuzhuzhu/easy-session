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
            <span class="nav-icon">{{ item.icon }}</span>
            <span v-if="!sidebarCollapsed" class="nav-text">{{ $t(item.label) }}</span>
            <span v-if="!sidebarCollapsed && SHORTCUT_LABELS[item.path]" class="shortcut-hint">{{ SHORTCUT_LABELS[item.path] }}</span>
          </router-link>
          <div v-if="!sidebarCollapsed && item.path === '/projects' && recentProjects.length" class="nav-sub">
            <router-link
              v-for="p in recentProjects"
              :key="p.id"
              :to="`/projects/${p.id}`"
              class="nav-sub-item"
            >
              {{ p.name }}
            </router-link>
          </div>
        </template>
      </nav>
      <div class="sidebar-footer">
        <router-link to="/settings" class="nav-item" :title="sidebarCollapsed ? $t('settings.title') : undefined">
          <span class="nav-icon">SET</span>
          <span v-if="!sidebarCollapsed" class="nav-text">{{ $t('settings.title') }}</span>
          <span v-if="!sidebarCollapsed" class="shortcut-hint">{{ SHORTCUT_LABELS['/settings'] }}</span>
        </router-link>
        <div v-if="!sidebarCollapsed" class="sidebar-version">v{{ appStore.version }}</div>
        <button class="collapse-btn" @click="toggleSidebar" :title="$t(sidebarCollapsed ? 'sidebar.expand' : 'sidebar.collapse')">
          {{ sidebarCollapsed ? ">" : "<" }}
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
            <span class="session-count" v-if="activeSessionCount > 0">{{ activeSessionCount }} {{ $t('topbar.activeSessions') }}</span>
          </div>
          <div class="window-controls">
            <button class="win-btn" @click="minimize">_</button>
            <button class="win-btn" @click="toggleMaximize">[]</button>
            <button class="win-btn win-btn-close" @click="closeWindow">X</button>
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
import { useSettingsStore } from '@/stores/settings'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import { SHORTCUT_LABELS } from '@/composables/useShortcuts'
import logoSrc from '@/assets/logo-easy-session.png'

const route = useRoute()
const { t } = useI18n()
const projectsStore = useProjectsStore()
const appStore = useAppStore()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const navItems = [
  { path: "/dashboard", icon: "D", label: "nav.dashboard" },
  { path: "/config", icon: "C", label: "nav.config" },
  { path: "/sessions", icon: "S", label: "nav.sessions" },
  { path: "/projects", icon: "P", label: "nav.projects" },
  { path: "/skills", icon: "K", label: "nav.skills" }
]

const recentProjects = computed(() => projectsStore.recentProjects.slice(0, 3))
const sidebarCollapsed = computed(() => settingsStore.settings.sidebarCollapsed)

const activeSessionCount = computed(() =>
  sessionsStore.sessions.filter((s) => s.status === 'running').length
)

const breadcrumbs = computed(() => {
  const crumbs: { label: string; path?: string }[] = []
  if (route.path === '/settings') {
    crumbs.push({ label: t('settings.title') })
  } else if (route.name === 'projectDetail') {
    crumbs.push({ label: t('nav.projects'), path: '/projects' })
    const proj = projectsStore.projects.find((p) => p.id === route.params.id)
    crumbs.push({ label: proj?.name || String(route.params.id) })
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
  if (!projectsStore.projects.length) projectsStore.fetchProjects()
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
  border-radius: var(--radius-md);
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
  padding: var(--spacing-xs);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-md);
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);

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
  border-radius: var(--radius-md);
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
      border-radius: 0 2px 2px 0;
      background: var(--accent-primary);
    }
  }
}

.nav-icon {
  font-size: 11px;
  width: 28px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-weight: 600;
  font-family: var(--font-mono);
  letter-spacing: 0.5px;
  transition: all var(--transition-fast);

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
  border-radius: 3px;
  background: var(--bg-primary);
}

.nav-sub {
  padding-left: 40px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.nav-sub-item {
  padding: 4px var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  text-decoration: none;
  border-radius: var(--radius-sm);
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
  border-radius: 50%;
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
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  color: var(--accent-primary);
}

.window-controls {
  display: flex;
  gap: 2px;
}

.win-btn {
  width: 34px;
  height: 26px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.win-btn-close:hover {
  background: var(--status-error);
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
