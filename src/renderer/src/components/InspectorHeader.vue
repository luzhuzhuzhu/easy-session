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
            :aria-label="tab.label"
            @click="emit('set-active-tab', tab.value)"
          >
            <UiIcon :name="tabIcon(tab.value)" />
          </button>
        </nav>
        <div class="task-copy">
          <div class="task-title">{{ taskTitle }}</div>
          <div class="task-hint">{{ taskHint }}</div>
        </div>
      </div>

      <div class="header-right">
        <IconButton
          v-if="!isHistoryTab"
          :active="sidebarVisible"
          :label="sidebarVisible ? t('inspector.hideSidebar') : t('inspector.showSidebar')"
          :title="sidebarVisible ? t('inspector.hideSidebar') : t('inspector.showSidebar')"
          @click="emit('toggle-sidebar-visible', !sidebarVisible)"
        >
          <UiIcon name="list-left" />
        </IconButton>
        <IconButton
          v-if="!isHistoryTab && sidebarVisible"
          :active="sidebarAutoCollapse"
          :label="t('inspector.sidebarAutoCollapse')"
          :title="t('inspector.sidebarAutoCollapse')"
          @click="emit('toggle-sidebar-auto-collapse', !sidebarAutoCollapse)"
        >
          <UiIcon name="arrow-right" />
        </IconButton>
        <div ref="zoomControlRef" class="viewer-zoom-control">
          <button
            class="mini-btn viewer-zoom-btn"
            type="button"
            :title="`${t('terminal.zoomPresets')} / ${t('terminal.resetZoom')}`"
            :aria-label="`${t('terminal.zoomPresets')} / ${t('terminal.resetZoom')}`"
            @click.stop="toggleZoomMenu"
            @dblclick.stop="handleResetZoom"
          >
            {{ viewerZoomPercent }}%
          </button>
          <div
            v-if="zoomMenuOpen"
            ref="zoomMenuRef"
            class="viewer-zoom-menu"
            role="menu"
            tabindex="-1"
            @click.stop
            @keydown="handleZoomMenuKeydown"
          >
            <button
              v-for="percent in ZOOM_PRESET_PERCENTS"
              :key="percent"
              class="viewer-zoom-item"
              :class="{ active: percent === viewerZoomPercent }"
              type="button"
              role="menuitem"
              @click="handleSetZoom(percent)"
            >
              {{ percent }}%
            </button>
          </div>
        </div>
        <IconButton
          :label="t('inspector.refresh')"
          :title="t('inspector.refresh')"
          @click="emit('refresh')"
        >
          <UiIcon name="refresh" />
        </IconButton>
        <IconButton
          :active="autoFollowActivePaneProject"
          :label="t('inspector.followActivePane')"
          :title="t('inspector.followActivePane')"
          @click="emit('toggle-follow', !autoFollowActivePaneProject)"
        >
          <UiIcon name="link" />
        </IconButton>
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
import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

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
  taskTitle: string
  taskHint: string
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
const zoomMenuRef = ref<HTMLElement | null>(null)
const { handleMenuKeydown: handleZoomMenuKeydown } = useMenuKeyboard({
  menuRef: zoomMenuRef,
  isOpen: () => zoomMenuOpen.value,
  onClose: () => {
    zoomMenuOpen.value = false
  }
})

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

function tabIcon(tab: HeaderTab['value']): 'git-graph' | 'folder' | 'history' {
  if (tab === 'changes') return 'git-graph'
  if (tab === 'files') return 'folder'
  return 'history'
}

function handleDocumentPointerDown(event: PointerEvent): void {
  if (!zoomMenuOpen.value) return
  const host = zoomControlRef.value
  if (host && event.target instanceof Node && !host.contains(event.target)) {
    zoomMenuOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', handleDocumentPointerDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleDocumentPointerDown)
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
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 10px;
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

.inline-tab-btn :deep(.ui-icon) {
  width: 14px;
  height: 14px;
}

.task-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.task-title {
  min-width: 0;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-hint {
  min-width: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  }
}

.mini-btn,
.project-select {
  height: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.mini-btn {
  padding: 0 8px;
  cursor: pointer;
  font-size: 11px;
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

</style>
