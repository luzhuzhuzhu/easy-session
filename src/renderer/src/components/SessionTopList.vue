<template>
  <section class="session-top-panel" :class="{ collapsed: isListCollapsed }">
    <div class="top-inline-row">
      <div class="top-tool-rail">
        <IconButton
          :title="$t('session.create')"
          :label="$t('session.create')"
          size="sm"
          tone="primary"
          @click="onCreate()"
        >
          <UiIcon name="plus" />
        </IconButton>
        <IconButton
          v-if="desktopRemoteMountEnabled"
          :title="remoteRefreshSummary || $t('session.refreshRemote')"
          :label="$t('session.refreshRemote')"
          size="sm"
          :disabled="refreshingRemoteData"
          @click="onRefreshRemote()"
        >
          <UiIcon name="refresh" />
        </IconButton>
        <select
          :value="filterType"
          class="filter-select top-filter"
          :class="{ compact: isListCollapsed }"
          @change="onFilterChange"
        >
          <option value="">{{ $t('session.filter') }}</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="opencode">OpenCode</option>
          <option value="terminal">{{ $t('session.terminal') }}</option>
        </select>
      </div>

      <div class="top-list-area">
        <div v-if="projectSessionTree.length === 0" class="top-empty-inline">
          <span>{{ $t('session.emptyGuideTitle') }}</span>
          <Button size="sm" tone="primary" @click="onCreate()">{{ $t('session.emptyGuideCreateSession') }}</Button>
          <Button size="sm" @click="onOpenProjects()">{{ $t('session.emptyGuideAddProject') }}</Button>
        </div>
        <div
          v-else
          class="top-flow-shell"
          :class="{ 'can-scroll-left': canScrollLeft, 'can-scroll-right': canScrollRight }"
          @mouseenter="updateTopFlowScrollState"
        >
          <button
            class="top-flow-scroll-btn left"
            type="button"
            :disabled="!canScrollLeft"
            aria-label="Scroll sessions left"
            title="Scroll sessions left"
            @click="scrollTopFlow('left')"
          >
            <UiIcon name="chevron-left" />
          </button>
          <div
            ref="topFlowRowRef"
            class="top-flow-row"
            @wheel="handleTopFlowWheel"
            @scroll="updateTopFlowScrollState"
          >
            <div
              v-for="group in projectSessionTree"
              :key="group.key"
              class="top-project-lane"
              :class="{ 'drop-target': dragOverGroupKey === group.key }"
              v-show="group.sessions.length > 0"
              draggable="true"
              @dragstart="onTopProjectDragStart($event, group)"
              @dragenter.prevent="dragOverGroupKey = group.key"
              @dragover.prevent="onTopProjectDragOver($event)"
              @dragleave="handleDropTargetLeave($event, 'group', group.key)"
              @drop="handleTopProjectDrop($event, group.key)"
              @dragend="handleTopProjectDragEnd()"
            >
              <div class="top-project-meta">
                <span class="top-project-label" :title="group.projectPath">{{ group.projectName }}</span>
                <span v-if="group.instanceId !== 'local'" class="top-instance-label" :title="group.instanceName">{{ group.instanceName }}</span>
              </div>
              <div class="top-session-strip">
                <div
                  v-for="session in group.sessions"
                  :key="session.id"
                  class="session-top-item"
                  :class="{
                    active: activeGlobalSessionKey === session.id,
                    'drop-target': dragOverSessionId === session.id
                  }"
                  role="button"
                  tabindex="0"
                  draggable="true"
                  @click="onSessionClick(session)"
                  @keydown.enter.prevent="onSessionClick(session)"
                  @keydown.space.prevent="onSessionClick(session)"
                  @dragstart="onSessionDragStart($event, session)"
                  @dragenter.prevent="dragOverSessionId = session.id"
                  @dragover.prevent="onSessionDragOver($event, group.key)"
                  @dragleave="handleDropTargetLeave($event, 'session', session.id)"
                  @drop="handleSessionDrop($event, group.key, session.id)"
                  @dragend="handleSessionDragEnd()"
                  @contextmenu.prevent="onSessionContextMenu($event, session)"
                >
                  <span v-if="session.icon" class="session-icon">{{ session.icon }}</span>
                  <span v-else class="type-badge" :class="session.type">{{ cliTypeBadgeLetter(session.type) }}</span>
                  <span v-if="!isListCollapsed" class="top-item-name">{{ session.name }}</span>
                  <span
                    class="status-dot"
                    :class="session.status"
                    role="img"
                    :title="formatSessionStatus(session.status)"
                    :aria-label="formatSessionStatus(session.status)"
                  ></span>
                </div>
              </div>
            </div>
          </div>
          <button
            class="top-flow-scroll-btn right"
            type="button"
            :disabled="!canScrollRight"
            aria-label="Scroll sessions right"
            title="Scroll sessions right"
            @click="scrollTopFlow('right')"
          >
            <UiIcon name="chevron-right" />
          </button>
          </div>
      </div>

      <div class="top-actions">
        <IconButton
          :title="$t('session.listPosition')"
          :label="$t('session.listPosition')"
          size="sm"
          @click="onToggleListPosition()"
        >
          <UiIcon :name="isTopLayout ? 'list-left' : 'list-top'" />
        </IconButton>
        <IconButton
          :title="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
          :label="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
          size="sm"
          @click="onToggleListCollapsed()"
        >
          <UiIcon :name="isListCollapsed ? 'chevron-down' : 'chevron-up'" />
        </IconButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectSessionGroup, SessionTreeSessionItem } from '@/features/sessions/session-tree'
import { cliTypeBadgeLetter } from '@shared/cli-types'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

const props = defineProps<{
  projectSessionTree: ProjectSessionGroup[]
  activeGlobalSessionKey: string | null
  filterType: string
  isListCollapsed: boolean
  isTopLayout: boolean
  desktopRemoteMountEnabled: boolean
  refreshingRemoteData: boolean
  remoteRefreshSummary: string
  onCreate: () => void
  onRefreshRemote: () => void
  onOpenProjects: () => void
  onToggleListPosition: () => void
  onToggleListCollapsed: () => void
  onSessionClick: (session: SessionTreeSessionItem) => void
  onSessionDragStart: (event: DragEvent, session: SessionTreeSessionItem) => void
  onSessionDragOver: (event: DragEvent, projectKey: string) => void
  onSessionDrop: (event: DragEvent, projectKey: string, targetSessionId: string) => void
  onSessionDragEnd: () => void
  onSessionContextMenu: (event: MouseEvent, session: SessionTreeSessionItem) => void
  onTopProjectDragStart: (event: DragEvent, group: ProjectSessionGroup) => void
  onTopProjectDragOver: (event: DragEvent) => void
  onTopProjectDrop: (event: DragEvent, targetProjectKey: string) => void
  onTopProjectDragEnd: () => void
}>()

const emit = defineEmits<{
  'update:filterType': [value: string]
}>()

const { t } = useI18n()
const dragOverGroupKey = ref('')
const dragOverSessionId = ref('')
const topFlowRowRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)
let scrollAnimationId: number | null = null

function onFilterChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  emit('update:filterType', target?.value ?? '')
}

function handleTopFlowWheel(event: WheelEvent): void {
  const row = event.currentTarget as HTMLElement | null
  if (!row || row.scrollWidth <= row.clientWidth) return

  const horizontalDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
  if (horizontalDelta === 0) return

  event.preventDefault()
  row.scrollLeft += horizontalDelta
  updateTopFlowScrollState()
}

function updateTopFlowScrollState(): void {
  const row = topFlowRowRef.value
  if (!row) {
    canScrollLeft.value = false
    canScrollRight.value = false
    return
  }

  const maxScrollLeft = row.scrollWidth - row.clientWidth
  canScrollLeft.value = row.scrollLeft > 1
  canScrollRight.value = row.scrollLeft < maxScrollLeft - 1
}

function animateScrollBy(row: HTMLElement, delta: number, duration: number): void {
  if (scrollAnimationId !== null) {
    cancelAnimationFrame(scrollAnimationId)
    scrollAnimationId = null
  }

  const startLeft = row.scrollLeft
  const startTime = performance.now()
  // easeOutCubic：起始略快、结尾柔和，避免末段顿挫。
  const ease = (t: number): number => 1 - Math.pow(1 - t, 3)

  const step = (now: number): void => {
    const elapsed = now - startTime
    const progress = Math.min(1, elapsed / duration)
    row.scrollLeft = startLeft + delta * ease(progress)

    if (progress < 1) {
      scrollAnimationId = requestAnimationFrame(step)
    } else {
      scrollAnimationId = null
      updateTopFlowScrollState()
    }
  }

  scrollAnimationId = requestAnimationFrame(step)
}

function scrollTopFlow(direction: 'left' | 'right'): void {
  const row = topFlowRowRef.value
  if (!row) return

  // 一次滚动一个项目泳道宽度；找不到或宽度异常时回退到 1/3 视口宽度，至少 120px。
  const firstLane = row.querySelector<HTMLElement>('.top-project-lane')
  const laneWidth = firstLane?.offsetWidth ?? 0
  const fallback = Math.max(120, row.clientWidth * 0.33)
  const step = laneWidth > 0 && laneWidth < row.clientWidth ? laneWidth : fallback

  // 比浏览器原生 smooth 略慢一些，体感更从容。
  animateScrollBy(row, direction === 'left' ? -step : step, 700)
}

function handleWindowResize(): void {
  updateTopFlowScrollState()
}

onMounted(() => {
  window.addEventListener('resize', handleWindowResize)
  void nextTick(updateTopFlowScrollState)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleWindowResize)
  if (scrollAnimationId !== null) {
    cancelAnimationFrame(scrollAnimationId)
    scrollAnimationId = null
  }
})

watch(
  () => [props.projectSessionTree, props.isListCollapsed, props.filterType, props.activeGlobalSessionKey],
  () => {
    void nextTick(updateTopFlowScrollState)
  },
  { deep: true }
)

function formatSessionStatus(status: SessionTreeSessionItem['status']): string {
  return t(`session.status.${status}`)
}

function isLeavingCurrentTarget(event: DragEvent): boolean {
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  return !(current && related && current.contains(related))
}

function handleDropTargetLeave(event: DragEvent, type: 'group' | 'session', key: string): void {
  if (!isLeavingCurrentTarget(event)) return
  if (type === 'group' && dragOverGroupKey.value === key) {
    dragOverGroupKey.value = ''
  }
  if (type === 'session' && dragOverSessionId.value === key) {
    dragOverSessionId.value = ''
  }
}

function clearDropTargets(): void {
  dragOverGroupKey.value = ''
  dragOverSessionId.value = ''
}

function handleTopProjectDrop(event: DragEvent, key: string): void {
  props.onTopProjectDrop(event, key)
  clearDropTargets()
}

function handleTopProjectDragEnd(): void {
  props.onTopProjectDragEnd()
  clearDropTargets()
}

function handleSessionDrop(event: DragEvent, projectKey: string, sessionId: string): void {
  props.onSessionDrop(event, projectKey, sessionId)
  clearDropTargets()
}

function handleSessionDragEnd(): void {
  props.onSessionDragEnd()
  clearDropTargets()
}
</script>
