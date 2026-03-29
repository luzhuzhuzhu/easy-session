<template>
  <header class="panel-header">
    <div class="header-main">
      <div class="header-left">
        <nav v-if="sidebarVisible" class="inline-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.value"
            class="inline-tab-btn"
            :class="{ active: activeTab === tab.value }"
            type="button"
            :title="tab.label"
            @click="emit('set-active-tab', tab.value)"
          >
            <svg v-if="tab.value === 'changes'" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="3" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="3" cy="13" r="2" stroke="currentColor" stroke-width="1.5"/>
              <circle cx="13" cy="13" r="2" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 5v3M5 11l2-2m4 2l-2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <svg v-else-if="tab.value === 'files'" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M2 3h5l2 2h5v8H2V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            </svg>
            <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </nav>
      </div>

      <div class="header-right">
        <button
          v-if="!isHistoryTab"
          class="mini-toggle-btn icon-btn"
          :class="{ active: sidebarVisible }"
          type="button"
          :title="sidebarVisible ? t('inspector.hideSidebar') : t('inspector.showSidebar')"
          @click="emit('toggle-sidebar-visible', !sidebarVisible)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 3h12v10H2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M6 3v10" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button
          v-if="!isHistoryTab && sidebarVisible"
          class="mini-toggle-btn icon-btn"
          :class="{ active: sidebarAutoCollapse }"
          type="button"
          :title="t('inspector.sidebarAutoCollapse')"
          @click="emit('toggle-sidebar-auto-collapse', !sidebarAutoCollapse)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <div ref="zoomControlRef" class="viewer-zoom-control">
          <button
            class="mini-btn viewer-zoom-btn"
            type="button"
            :title="`${t('terminal.zoomPresets')} / ${t('terminal.resetZoom')}`"
            @click.stop="toggleZoomMenu"
            @dblclick.stop="handleResetZoom"
          >
            {{ viewerZoomPercent }}%
          </button>
          <div v-if="zoomMenuOpen" class="viewer-zoom-menu" @click.stop>
            <button
              v-for="percent in ZOOM_PRESET_PERCENTS"
              :key="percent"
              class="viewer-zoom-item"
              :class="{ active: percent === viewerZoomPercent }"
              type="button"
              @click="handleSetZoom(percent)"
            >
              {{ percent }}%
            </button>
          </div>
        </div>
        <button class="ghost-btn utility-btn icon-btn" type="button" :title="t('inspector.refresh')" @click="emit('refresh')">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M14 8a6 6 0 11-1.76-4.24M12 2v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <button
          class="mini-toggle-btn icon-btn"
          :class="{ active: autoFollowActivePaneProject }"
          type="button"
          :title="t('inspector.followActivePane')"
          @click="emit('toggle-follow', !autoFollowActivePaneProject)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6.5 9.5l3-3M9 4h2a3 3 0 010 6H9M7 12H5a3 3 0 010-6h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <select
          class="project-select compact-select"
          :title="projectSelectTitle"
          :disabled="autoFollowActivePaneProject"
          :value="projectSelectValue"
          @change="handleManualProjectChange(($event.target as HTMLSelectElement).value)"
        >
          <option value="">{{ projectSelectPlaceholder }}</option>
          <option
            v-for="option in manualProjectOptions"
            :key="option.key"
            :value="option.projectPath"
          >
            {{ option.projectName }}
          </option>
        </select>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

type HeaderTab = {
  value: 'changes' | 'files' | 'history'
  label: string
}

type ProjectOption = {
  key: string
  projectPath: string
  projectName: string
}

const ZOOM_PRESET_PERCENTS = [80, 90, 100, 110, 125, 150] as const

defineProps<{
  tabs: readonly HeaderTab[]
  activeTab: HeaderTab['value']
  sidebarVisible: boolean
  isHistoryTab: boolean
  sidebarAutoCollapse: boolean
  viewerZoomPercent: number
  autoFollowActivePaneProject: boolean
  projectSelectTitle: string
  projectSelectValue: string
  projectSelectPlaceholder: string
  manualProjectOptions: ProjectOption[]
}>()

const emit = defineEmits<{
  'set-active-tab': [tab: HeaderTab['value']]
  'toggle-sidebar-visible': [visible: boolean]
  'toggle-sidebar-auto-collapse': [checked: boolean]
  'set-viewer-zoom': [percent: number]
  'reset-viewer-zoom': []
  refresh: []
  'toggle-follow': [checked: boolean]
  'manual-project-change': [value: string]
}>()

const { t } = useI18n()
const zoomMenuOpen = ref(false)
const zoomControlRef = ref<HTMLElement | null>(null)

function toggleZoomMenu(): void {
  zoomMenuOpen.value = !zoomMenuOpen.value
}

function handleSetZoom(percent: number): void {
  zoomMenuOpen.value = false
  emit('set-viewer-zoom', percent)
}

function handleResetZoom(): void {
  zoomMenuOpen.value = false
  emit('reset-viewer-zoom')
}

function handleManualProjectChange(value: string): void {
  emit('manual-project-change', value)
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!zoomMenuOpen.value) return
  const host = zoomControlRef.value
  if (host && event.target instanceof Node && !host.contains(event.target)) {
    zoomMenuOpen.value = false
  }
}

function handleEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    zoomMenuOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleDocumentPointerDown)
  window.removeEventListener('keydown', handleEscape)
})
</script>

<style scoped lang="scss">
.panel-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  position: relative;
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.header-left {
  min-width: 0;
  flex: 0 1 auto;
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.inline-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 3px;
  flex-shrink: 0;
  width: fit-content;
  max-width: 100%;
}

.inline-tab-btn {
  height: 22px;
  width: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
  border-radius: 2px;
  transition: all 140ms ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    background: color-mix(in srgb, var(--bg-tertiary) 78%, var(--accent-primary) 22%);
    color: var(--text-primary);
  }
}

.viewer-zoom-control {
  position: relative;
  flex-shrink: 0;
}

.viewer-zoom-btn {
  min-width: 48px;
  padding: 0 6px;
}

.viewer-zoom-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 72px;
  padding: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-md);
}

.viewer-zoom-item {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: right;
  padding: 6px 8px;
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    color: var(--accent-primary);
    background: rgba(108, 158, 255, 0.12);
  }
}

.mini-btn,
.ghost-btn,
.project-select {
  height: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.mini-btn,
.ghost-btn {
  padding: 0 8px;
  cursor: pointer;
  font-size: 11px;
}

.ghost-btn {
  background: transparent;
}

.project-select {
  width: 100%;
  min-width: 0;
  padding: 0 8px;
}

.compact-select {
  max-width: 180px;
  flex: 1;
  font-size: 12px;
}

.mini-toggle-btn {
  height: 24px;
  width: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;

  &.active {
    color: var(--accent-primary);
    background: color-mix(in srgb, var(--bg-tertiary) 82%, var(--accent-primary) 18%);
  }
}

.utility-btn {
  border-color: transparent;
  color: var(--text-secondary);
  width: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
    border-color: transparent;
  }
}
</style>
