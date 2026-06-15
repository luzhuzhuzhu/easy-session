<template>
  <div v-if="node.type === 'split'" class="workspace-split" :class="[node.direction, { resizing: isResizingSplit }]">
    <div class="split-child first" :style="firstChildStyle">
      <WorkspacePaneTree
        :node-path="`${nodePath}.first`"
        :node="node.first"
        :tabs-index="tabsIndex"
        :resolved-tabs-index="resolvedTabsIndex"
        :sessions-by-global-key="sessionsByGlobalKey"
        :pane-zoom-percent-by-id="paneZoomPercentById"
        :active-pane-id="activePaneId"
        :can-close-panes="canClosePanes"
        :pane-ids="paneIds"
        @focus-pane="emit('focus-pane', $event)"
        @set-active-tab="emit('set-active-tab', $event)"
        @split-pane="emit('split-pane', $event)"
        @close-pane="emit('close-pane', $event)"
        @close-tab="emit('close-tab', $event)"
        @move-tab="emit('move-tab', $event)"
        @split-and-move-tab="emit('split-and-move-tab', $event)"
        @close-other-tabs="emit('close-other-tabs', $event)"
        @close-tabs-right="emit('close-tabs-right', $event)"
        @toggle-tab-pin="emit('toggle-tab-pin', $event)"
        @resize-split="emit('resize-split', $event)"
        @even-split-pane="emit('even-split-pane', $event)"
        @open-session-drop="emit('open-session-drop', $event)"
        @undo-layout="emit('undo-layout')"
        @reset-layout="emit('reset-layout')"
        @start-session="emit('start-session', $event)"
        @pause-session="emit('pause-session', $event)"
        @restart-session="emit('restart-session', $event)"
        @destroy-session="emit('destroy-session', $event)"
        @clear-output="emit('clear-output', $event)"
        @set-pane-zoom="emit('set-pane-zoom', $event)"
        @reset-pane-zoom="emit('reset-pane-zoom', $event)"
        @swap-pane-tabs="emit('swap-pane-tabs', $event)"
      />
    </div>
    <div class="splitter" @mousedown.prevent="startSplitResize"></div>
    <div class="split-child second" :style="secondChildStyle">
      <WorkspacePaneTree
        :node-path="`${nodePath}.second`"
        :node="node.second"
        :tabs-index="tabsIndex"
        :resolved-tabs-index="resolvedTabsIndex"
        :sessions-by-global-key="sessionsByGlobalKey"
        :pane-zoom-percent-by-id="paneZoomPercentById"
        :active-pane-id="activePaneId"
        :can-close-panes="canClosePanes"
        :pane-ids="paneIds"
        @focus-pane="emit('focus-pane', $event)"
        @set-active-tab="emit('set-active-tab', $event)"
        @split-pane="emit('split-pane', $event)"
        @close-pane="emit('close-pane', $event)"
        @close-tab="emit('close-tab', $event)"
        @move-tab="emit('move-tab', $event)"
        @split-and-move-tab="emit('split-and-move-tab', $event)"
        @close-other-tabs="emit('close-other-tabs', $event)"
        @close-tabs-right="emit('close-tabs-right', $event)"
        @toggle-tab-pin="emit('toggle-tab-pin', $event)"
        @resize-split="emit('resize-split', $event)"
        @even-split-pane="emit('even-split-pane', $event)"
        @open-session-drop="emit('open-session-drop', $event)"
        @undo-layout="emit('undo-layout')"
        @reset-layout="emit('reset-layout')"
        @start-session="emit('start-session', $event)"
        @pause-session="emit('pause-session', $event)"
        @restart-session="emit('restart-session', $event)"
        @destroy-session="emit('destroy-session', $event)"
        @clear-output="emit('clear-output', $event)"
        @set-pane-zoom="emit('set-pane-zoom', $event)"
        @reset-pane-zoom="emit('reset-pane-zoom', $event)"
        @swap-pane-tabs="emit('swap-pane-tabs', $event)"
      />
    </div>
  </div>

  <div
    v-else
    class="workspace-pane"
    :class="{
      focused: activePaneId === node.paneId,
      'drop-active': paneDropActive,
      'drop-split': !!edgeDropDirection
    }"
    @mousedown="handleFocusPane"
    @dragover.prevent="handlePaneDragOver"
    @dragleave="clearEdgeDrop"
    @drop="handlePaneEdgeDrop"
    @contextmenu.prevent="openPaneMenu"
  >
    <div v-if="edgeDropDirection" class="edge-drop-indicator" :class="edgeDropDirection"></div>
    <div v-if="paneDropActive" class="pane-drop-copy" :class="{ split: !!edgeDropDirection }">
      {{ paneDropLabel }}
    </div>

    <div class="pane-content">
      <div
        v-if="showPaneTabs"
        class="pane-tabs"
        role="tablist"
        :aria-label="$t('session.paneTabs')"
      >
        <div
          v-for="tab in paneTabs"
          :key="tab.tabId"
          class="pane-tab"
          :class="{ active: tab.active, offline: tab.offline }"
          role="tab"
          :aria-selected="tab.active"
          :tabindex="tab.active ? 0 : -1"
          :title="tab.name"
          draggable="true"
          @click="handleSelectTab(tab.tabId)"
          @keydown.enter.prevent="handleSelectTab(tab.tabId)"
          @keydown.space.prevent="handleSelectTab(tab.tabId)"
          @auxclick.middle.prevent="handleCloseTab(tab.tabId)"
          @dragstart="handleTabDragStart(tab.tabId, $event)"
          @dragend="handleTabDragEnd"
        >
          <span v-if="tab.icon" class="pane-tab-icon">{{ tab.icon }}</span>
          <span v-else-if="tab.type" class="type-badge" :class="tab.type">{{ cliTypeBadgeLetter(tab.type) }}</span>
          <span class="pane-tab-name">{{ tab.name }}</span>
          <span v-if="tab.pinned" class="pane-tab-pin" aria-hidden="true">📌</span>
          <button
            class="pane-tab-close"
            type="button"
            :aria-label="$t('session.closeTabAction')"
            :title="$t('session.closeTabAction')"
            @click.stop="handleCloseTab(tab.tabId)"
            @keydown.enter.stop
            @mousedown.stop
          >
            <UiIcon name="x" />
          </button>
        </div>
      </div>
      <template v-if="activeSession">
        <div
          class="pane-header"
          :class="{ 'pane-header-offline': activeTabOffline }"
          draggable="true"
          @dragstart="handleHeaderDragStart"
          @dragend="handleHeaderDragEnd"
        >
          <div class="pane-header-info">
            <span v-if="activeSession.icon" class="session-icon">{{ activeSession.icon }}</span>
            <span v-else class="type-badge" :class="activeSession.type">{{ cliTypeBadgeLetter(activeSession.type) }}</span>
            <span class="pane-session-name">{{ activeSession.name }}</span>
            <span
              v-if="activeTabOffline"
              class="status-tag offline"
              :title="offlinePaneTitle"
            >
              {{ $t('settings.remoteStatus.offline') }}
            </span>
            <span
              v-else
              class="status-tag"
              :class="activeSession.status"
              :title="formatSessionStatus(activeSession.status)"
            >
              {{ formatSessionStatus(activeSession.status) }}
            </span>
            <SessionRuntimeInfo class="pane-runtime-info" :session="activeSession" />
          </div>
          <div class="pane-header-actions">
            <div ref="zoomControlRef" class="pane-zoom-control">
              <button
                class="pane-zoom-reset-btn"
                type="button"
                :title="`${t('terminal.zoomPresets')} / ${t('terminal.resetZoom')}`"
                :aria-label="`${t('terminal.zoomPresets')} / ${t('terminal.resetZoom')}`"
                @click.stop="toggleZoomMenu"
                @dblclick.stop="handleResetPaneZoom"
              >
                🔍 {{ activePaneZoomPercent }}%
              </button>
              <div
                v-if="zoomMenuOpen"
                ref="paneZoomMenuRef"
                class="pane-zoom-menu"
                role="menu"
                tabindex="-1"
                @click.stop
                @keydown="handlePaneZoomMenuKeydown"
              >
                <button
                  v-for="percent in ZOOM_PRESET_PERCENTS"
                  :key="percent"
                  class="pane-zoom-item"
                  :class="{ active: percent === activePaneZoomPercent }"
                  type="button"
                  role="menuitem"
                  @click="handleSetPaneZoom(percent)"
                >
                  {{ percent }}%
                </button>
              </div>
            </div>
            <IconButton
              v-if="canStartSession && activeSession.status !== 'running' && activeSessionRef"
              tone="primary"
              :label="$t('session.start')"
              @click="emit('start-session', activeSessionRef)"
            >
              <UiIcon name="play" />
            </IconButton>
            <IconButton
              v-else-if="canPauseSession && activeSessionRef"
              :label="$t('session.pause')"
              @click="emit('pause-session', activeSessionRef)"
            >
              <UiIcon name="pause" />
            </IconButton>
            <IconButton
              v-if="canRestartSession && activeSessionRef"
              :label="$t('session.restart')"
              @click="emit('restart-session', activeSessionRef)"
            >
              <UiIcon name="refresh" />
            </IconButton>
            <IconButton
              v-if="canDestroySession && activeSessionRef"
              tone="danger"
              :label="$t('session.destroy')"
              @click="emit('destroy-session', activeSessionRef)"
            >
              <UiIcon name="trash" />
            </IconButton>
          </div>
        </div>

        <div v-if="activeTabOffline" class="pane-unavailable offline">
          <div class="pane-unavailable-icon" aria-hidden="true">
            <UiIcon name="offline" />
          </div>
          <div class="pane-unavailable-copy">
            <h3>{{ offlinePaneTitle }}</h3>
            <p>{{ offlinePaneMessage }}</p>
            <p v-if="offlinePaneDetails" class="pane-unavailable-detail">{{ offlinePaneDetails }}</p>
            <Button class="pane-unavailable-action" size="sm" @click="openRemoteSettings">
              {{ $t('session.remoteOpenSettings') }}
            </Button>
          </div>
        </div>
        <TerminalOutput
          v-else
          :session-ref="activeSessionRef"
          :process-key="activeSession.processId"
          :pane-id="node.paneId"
          @clear="activeSessionRef && emit('clear-output', activeSessionRef)"
        />
      </template>
      <div v-else-if="activeResolvedTab?.availability === 'offline'" class="pane-unavailable offline">
        <div class="pane-unavailable-icon" aria-hidden="true">
          <UiIcon name="offline" />
        </div>
        <div class="pane-unavailable-copy">
          <h3>{{ offlinePaneTitle }}</h3>
          <p>{{ offlinePaneMessage }}</p>
          <p v-if="offlinePaneDetails" class="pane-unavailable-detail">{{ offlinePaneDetails }}</p>
          <Button class="pane-unavailable-action" size="sm" @click="openRemoteSettings">
            {{ $t('session.remoteOpenSettings') }}
          </Button>
        </div>
      </div>
      <div v-else class="pane-empty">{{ emptyPaneText }}</div>
    </div>

    <div v-if="paneMenu.visible" class="context-overlay" @click="closeMenus"></div>
    <div
      v-if="paneMenu.visible"
      ref="paneMenuRef"
      class="context-menu"
      role="menu"
      tabindex="-1"
      :style="{ left: paneMenu.x + 'px', top: paneMenu.y + 'px' }"
      @keydown="handlePaneMenuKeydown"
    >
      <MenuItem :label="$t('session.newRightPane')" @click="handlePaneMenuSplit('horizontal')">{{ $t('session.newRightPane') }}</MenuItem>
      <MenuItem :label="$t('session.newBottomPane')" @click="handlePaneMenuSplit('vertical')">{{ $t('session.newBottomPane') }}</MenuItem>
      <MenuItem :label="$t('session.evenSplit')" @click="handlePaneMenuEvenSplit">{{ $t('session.evenSplit') }}</MenuItem>
      <MenuItem :label="$t('session.undoLayout')" @click="handlePaneMenuUndoLayout">{{ $t('session.undoLayout') }}</MenuItem>
      <MenuItem :label="$t('session.resetLayout')" @click="handlePaneMenuResetLayout">{{ $t('session.resetLayout') }}</MenuItem>
      <MenuItem v-if="canClosePanes" danger :label="$t('session.closePane')" @click="handlePaneMenuClose">{{ $t('session.closePane') }}</MenuItem>
    </div>
  </div>
</template>

<script lang="ts">
const PANE_HEADER_MIME = 'application/x-easysession-pane-header'
const TAB_MIME = 'application/x-easysession-tab'
const SESSION_MIME = 'application/x-easysession-session'

// dragover 阶段 dataTransfer 处于 protected mode（getData 恒为空串），
// 读不出拖拽源的 paneId；用模块级变量在递归的各个 pane 实例之间共享，
// 才能在悬停时区分"自己"和"别的分窗"
let draggingHeaderPaneId: string | null = null
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import type {
  WorkspaceLayoutNode,
  WorkspaceSplitDirection,
  WorkspaceTabState
} from '@/api/workspace'
import TerminalOutput from '@/components/TerminalOutput.vue'
import { cliTypeBadgeLetter } from '@shared/cli-types'
import SessionRuntimeInfo from '@/components/SessionRuntimeInfo.vue'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import MenuItem from '@/components/ui/MenuItem.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import { useInstancesStore } from '@/stores/instances'
import type { SessionRef, UnifiedSession } from '@/models/unified-resource'
import type { WorkspaceResolvedTabState } from '@/stores/workspace'

defineOptions({ name: 'WorkspacePaneTree' })
const { t } = useI18n()
const router = useRouter()

const props = defineProps<{
  nodePath: string
  node: WorkspaceLayoutNode
  tabsIndex: Record<string, WorkspaceTabState>
  resolvedTabsIndex: Record<string, WorkspaceResolvedTabState>
  sessionsByGlobalKey: Record<string, UnifiedSession>
  paneZoomPercentById: Record<string, number>
  activePaneId: string
  canClosePanes: boolean
  paneIds: string[]
}>()

const emit = defineEmits<{
  'focus-pane': [paneId: string]
  'set-active-tab': [payload: { paneId: string; tabId: string }]
  'split-pane': [payload: { paneId: string; direction: WorkspaceSplitDirection }]
  'close-pane': [paneId: string]
  'close-tab': [payload: { paneId: string; tabId: string }]
  'move-tab': [payload: { fromPaneId: string; toPaneId: string; tabId: string; toIndex?: number }]
  'split-and-move-tab': [payload: { sourcePaneId: string; targetPaneId: string; tabId: string; direction: WorkspaceSplitDirection }]
  'close-other-tabs': [payload: { paneId: string; tabId: string }]
  'close-tabs-right': [payload: { paneId: string; tabId: string }]
  'toggle-tab-pin': [tabId: string]
  'resize-split': [payload: { path: string; ratio: number }]
  'even-split-pane': [paneId: string]
  'open-session-drop': [payload: { sessionRef: SessionRef; targetPaneId: string; direction?: WorkspaceSplitDirection }]
  'undo-layout': []
  'reset-layout': []
  'start-session': [sessionRef: SessionRef]
  'pause-session': [sessionRef: SessionRef]
  'restart-session': [sessionRef: SessionRef]
  'destroy-session': [sessionRef: SessionRef]
  'clear-output': [sessionRef: SessionRef]
  'set-pane-zoom': [payload: { paneId: string; percent: number }]
  'reset-pane-zoom': [paneId: string]
  'swap-pane-tabs': [payload: { fromPaneId: string; toPaneId: string }]
}>()

const edgeDropDirection = ref<WorkspaceSplitDirection | null>(null)
const paneDropActive = ref(false)
const paneDropKind = ref<'pane' | 'tab' | 'session' | null>(null)
const paneMenu = ref({ visible: false, x: 0, y: 0 })
const paneMenuRef = ref<HTMLElement | null>(null)
const isResizingSplit = ref(false)
const zoomMenuOpen = ref(false)
const zoomControlRef = ref<HTMLElement | null>(null)
const paneZoomMenuRef = ref<HTMLElement | null>(null)
const ZOOM_PRESET_PERCENTS = [80, 90, 100, 110, 125, 150] as const
const instancesStore = useInstancesStore()
const { handleMenuKeydown: handlePaneMenuKeydown } = useMenuKeyboard({
  menuRef: paneMenuRef,
  isOpen: () => paneMenu.value.visible,
  onClose: closeMenus
})
const { handleMenuKeydown: handlePaneZoomMenuKeydown } = useMenuKeyboard({
  menuRef: paneZoomMenuRef,
  isOpen: () => zoomMenuOpen.value,
  onClose: () => {
    zoomMenuOpen.value = false
  }
})

const firstChildStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  return { flex: `${props.node.ratio} 1 0%` }
})

const secondChildStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  return { flex: `${1 - props.node.ratio} 1 0%` }
})

const activeSession = computed<UnifiedSession | null>(() => {
  if (props.node.type !== 'leaf') return null
  const tabId = props.node.activeTabId
  if (!tabId) return null
  const globalSessionKey = props.tabsIndex[tabId]?.globalSessionKey
  if (!globalSessionKey) return null
  return props.sessionsByGlobalKey[globalSessionKey] ?? null
})
const activeResolvedTab = computed<WorkspaceResolvedTabState | null>(() => {
  if (props.node.type !== 'leaf') return null
  const tabId = props.node.activeTabId
  if (!tabId) return null
  return props.resolvedTabsIndex[tabId] ?? null
})

interface PaneTabView {
  tabId: string
  name: string
  icon: string | null
  type: UnifiedSession['type'] | null
  pinned: boolean
  active: boolean
  offline: boolean
}

const paneTabs = computed<PaneTabView[]>(() => {
  if (props.node.type !== 'leaf') return []
  const leaf = props.node
  return leaf.tabs.map((tabId) => {
    const tab = props.tabsIndex[tabId]
    const resolved = props.resolvedTabsIndex[tabId]
    const session = tab ? props.sessionsByGlobalKey[tab.globalSessionKey] : undefined
    return {
      tabId,
      name: session?.name ?? t('session.missingPaneSession'),
      icon: session?.icon ?? null,
      type: session?.type ?? null,
      pinned: !!tab?.pinned,
      active: leaf.activeTabId === tabId,
      offline: resolved?.availability === 'offline'
    }
  })
})
// Only surface the tab strip when a pane actually carries more than one session,
// so Ctrl+W "close active tab" stays visible/predictable instead of silently
// swapping to an invisible neighbour tab.
const showPaneTabs = computed(() => paneTabs.value.length > 1)

function handleSelectTab(tabId: string): void {
  if (props.node.type !== 'leaf') return
  emit('set-active-tab', { paneId: props.node.paneId, tabId })
}

function handleCloseTab(tabId: string): void {
  if (props.node.type !== 'leaf') return
  emit('close-tab', { paneId: props.node.paneId, tabId })
}

function handleTabDragStart(tabId: string, e: DragEvent): void {
  if (props.node.type !== 'leaf') return
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(TAB_MIME, JSON.stringify({ paneId: props.node.paneId, tabId }))
}

function handleTabDragEnd(): void {
  resetPaneDropState()
}
const activeSessionRef = computed<SessionRef | null>(() => {
  const session = activeSession.value
  if (!session) return null
  return {
    instanceId: session.instanceId,
    sessionId: session.sessionId,
    globalSessionKey: session.globalSessionKey
  }
})
const activeInstanceCapabilities = computed(() => {
  const session = activeSession.value
  if (!session) return null
  return instancesStore.getInstance(session.instanceId)?.capabilities ?? null
})
const activeTabInstance = computed(() => {
  const tab = activeResolvedTab.value
  if (!tab) return null
  return instancesStore.getInstance(tab.instanceId)
})
const activeTabOffline = computed(() => activeResolvedTab.value?.availability === 'offline')
const canStartSession = computed(() => !activeTabOffline.value && !!activeInstanceCapabilities.value?.sessionStart)
const canPauseSession = computed(() => !activeTabOffline.value && !!activeInstanceCapabilities.value?.sessionPause)
const canRestartSession = computed(() => !activeTabOffline.value && !!activeInstanceCapabilities.value?.sessionRestart)
const canDestroySession = computed(() => !activeTabOffline.value && !!activeInstanceCapabilities.value?.sessionDestroy)
const emptyPaneText = computed(() => {
  if (activeResolvedTab.value?.availability === 'offline') {
    return t('session.remoteOfflinePane')
  }
  if (activeResolvedTab.value?.availability === 'missing') {
    return t('session.missingPaneSession')
  }
  return t('session.noActive')
})
const activePaneZoomPercent = computed<number>(() => {
  if (props.node.type !== 'leaf') return 100
  return props.paneZoomPercentById[props.node.paneId] ?? 100
})
const paneDropLabel = computed(() => {
  if (paneDropKind.value === 'pane') return t('session.dropSwapPane')
  if (edgeDropDirection.value === 'horizontal') return t('session.dropSplitRight')
  if (edgeDropDirection.value === 'vertical') return t('session.dropSplitBottom')
  return t('session.dropOpenInPane')
})

const offlinePaneTitle = computed(() => {
  const instance = activeTabInstance.value
  if (instance?.type === 'remote') {
    return t('session.remoteOfflinePaneTitle', { instance: instance.name })
  }
  return t('session.remoteOfflinePane')
})

const offlinePaneMessage = computed(() => {
  const instance = activeTabInstance.value
  if (instance?.type === 'remote') {
    return t('session.remoteOfflinePaneMessage', {
      status: t(`settings.remoteStatus.${instance.status}`)
    })
  }
  return t('session.remoteOfflinePane')
})

const offlinePaneDetails = computed(() => {
  const instance = activeTabInstance.value
  if (instance?.type !== 'remote') return ''
  if (instance.lastError) {
    return t('session.remoteOfflinePaneDetails', { error: instance.lastError })
  }
  return t('session.remoteOfflinePaneRetryHint')
})

function formatSessionStatus(status: UnifiedSession['status']): string {
  return t(`session.status.${status}`)
}

function openRemoteSettings(): void {
  void router.push('/settings?category=remote')
}

function handleFocusPane(): void {
  if (props.node.type !== 'leaf') return
  emit('focus-pane', props.node.paneId)
}

function handleResetPaneZoom(): void {
  if (props.node.type !== 'leaf') return
  zoomMenuOpen.value = false
  emit('reset-pane-zoom', props.node.paneId)
}

function toggleZoomMenu(): void {
  if (props.node.type !== 'leaf') return
  zoomMenuOpen.value = !zoomMenuOpen.value
}

function handleSetPaneZoom(percent: number): void {
  if (props.node.type !== 'leaf') return
  zoomMenuOpen.value = false
  emit('set-pane-zoom', { paneId: props.node.paneId, percent })
}

function handleHeaderDragStart(e: DragEvent): void {
  if (props.node.type !== 'leaf') return
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData(PANE_HEADER_MIME, JSON.stringify({ paneId: props.node.paneId }))
  draggingHeaderPaneId = props.node.paneId
}

function handleHeaderDragEnd(): void {
  draggingHeaderPaneId = null
}

let detachResizeListeners: (() => void) | null = null
let edgeRaf = 0
let pendingEdgeUpdate: { host: HTMLElement; clientX: number; clientY: number } | null = null
let previousBodyCursor: string | null = null
let previousBodyUserSelect: string | null = null

function clearResizeListeners(): void {
  detachResizeListeners?.()
  detachResizeListeners = null
  isResizingSplit.value = false
  if (typeof document !== 'undefined' && document.body) {
    const bodyStyle = document.body.style
    if (previousBodyCursor !== null) {
      bodyStyle.cursor = previousBodyCursor
      previousBodyCursor = null
    } else {
      bodyStyle.removeProperty('cursor')
    }
    if (previousBodyUserSelect !== null) {
      bodyStyle.userSelect = previousBodyUserSelect
      previousBodyUserSelect = null
    } else {
      bodyStyle.removeProperty('user-select')
    }
  }
}

function startSplitResize(e: MouseEvent): void {
  if (props.node.type !== 'split') return
  if (detachResizeListeners) {
    clearResizeListeners()
  }
  const host = (e.currentTarget as HTMLElement | null)?.parentElement as HTMLElement | null
  if (!host) return
  const direction = props.node.direction
  isResizingSplit.value = true
  if (typeof document !== 'undefined' && document.body) {
    const bodyStyle = document.body.style
    previousBodyCursor = bodyStyle.cursor
    previousBodyUserSelect = bodyStyle.userSelect
    bodyStyle.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    bodyStyle.userSelect = 'none'
  }

  const onMove = (ev: MouseEvent) => {
    if (ev.buttons === 0) {
      clearResizeListeners()
      return
    }
    const rect = host.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    const rawRatio =
      direction === 'horizontal'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height
    const ratio = Math.max(0.15, Math.min(0.85, rawRatio))
    emit('resize-split', { path: props.nodePath, ratio })
  }

  const onUp = () => {
    clearResizeListeners()
  }

  const onVisibilityChange = () => {
    if (document.visibilityState !== 'visible') {
      clearResizeListeners()
    }
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp, { once: true })
  window.addEventListener('blur', onUp, { once: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
  detachResizeListeners = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.removeEventListener('blur', onUp)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

type WorkspaceDragPayload =
  | { type: 'pane'; paneId: string }
  | { type: 'tab'; paneId: string; tabId: string }
  | { type: 'session'; sessionRef: SessionRef }

// dragover 阶段只能读 types 不能读数据，按 MIME 类型判断拖拽来源
function detectWorkspaceDragKind(e: DragEvent): 'pane' | 'tab' | 'session' | null {
  const types = e.dataTransfer?.types
  if (!types) return null
  if (types.includes(PANE_HEADER_MIME)) return 'pane'
  if (types.includes(TAB_MIME)) return 'tab'
  if (types.includes(SESSION_MIME)) return 'session'
  return null
}

function readWorkspaceDragPayload(e: DragEvent): WorkspaceDragPayload | null {
  const headerRaw = e.dataTransfer?.getData(PANE_HEADER_MIME)
  if (headerRaw) {
    try {
      const parsed = JSON.parse(headerRaw) as { paneId?: string }
      if (typeof parsed.paneId === 'string' && parsed.paneId) {
        return { type: 'pane', paneId: parsed.paneId }
      }
    } catch {
      // ignore invalid payload
    }
  }

  const raw = e.dataTransfer?.getData(TAB_MIME)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { paneId?: string; tabId?: string }
      if (parsed.paneId && parsed.tabId) {
        return { type: 'tab', paneId: parsed.paneId, tabId: parsed.tabId }
      }
    } catch {
      // ignore invalid payload
    }
  }

  const sessionRaw = e.dataTransfer?.getData(SESSION_MIME)
  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as Partial<SessionRef> & { sessionId?: string }
      if (parsed.sessionId) {
        const instanceId = typeof parsed.instanceId === 'string' && parsed.instanceId ? parsed.instanceId : 'local'
        return {
          type: 'session',
          sessionRef: {
            instanceId,
            sessionId: parsed.sessionId,
            globalSessionKey:
              typeof parsed.globalSessionKey === 'string' && parsed.globalSessionKey
                ? parsed.globalSessionKey
                : `${instanceId}:${parsed.sessionId}`
          }
        }
      }
    } catch {
      // ignore invalid payload
    }
  }

  return null
}

function applyEdgeDropDirection(host: HTMLElement, clientX: number, clientY: number): void {
  const rect = host.getBoundingClientRect()
  const edgeSize = 24
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x >= rect.width - edgeSize) {
    edgeDropDirection.value = 'horizontal'
    return
  }
  if (y >= rect.height - edgeSize) {
    edgeDropDirection.value = 'vertical'
    return
  }
  edgeDropDirection.value = null
}

function flushPendingEdgeUpdate(): void {
  edgeRaf = 0
  if (!pendingEdgeUpdate) return
  const { host, clientX, clientY } = pendingEdgeUpdate
  pendingEdgeUpdate = null
  applyEdgeDropDirection(host, clientX, clientY)
}

function queueEdgeUpdate(host: HTMLElement, clientX: number, clientY: number): void {
  pendingEdgeUpdate = { host, clientX, clientY }
  if (edgeRaf) return
  edgeRaf = window.requestAnimationFrame(flushPendingEdgeUpdate)
}

function handlePaneDragOver(e: DragEvent): void {
  if (props.node.type !== 'leaf') return
  const kind = detectWorkspaceDragKind(e)
  if (!kind) {
    resetPaneDropState()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
    return
  }

  if (kind === 'pane') {
    // 拖动分窗信息栏：整个目标分窗（含终端区域）都是交换目标，悬停在自己身上不响应
    if (draggingHeaderPaneId === props.node.paneId) {
      resetPaneDropState()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none'
      return
    }
    paneDropKind.value = 'pane'
    paneDropActive.value = true
    edgeDropDirection.value = null
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    return
  }

  const host = e.currentTarget as HTMLElement | null
  if (!host) return
  paneDropKind.value = kind
  paneDropActive.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  queueEdgeUpdate(host, e.clientX, e.clientY)
}

function resetPaneDropState(): void {
  if (edgeRaf) {
    window.cancelAnimationFrame(edgeRaf)
    edgeRaf = 0
  }
  pendingEdgeUpdate = null
  edgeDropDirection.value = null
  paneDropActive.value = false
  paneDropKind.value = null
}

function clearEdgeDrop(e: DragEvent): void {
  const current = e.currentTarget as HTMLElement | null
  const related = e.relatedTarget as Node | null
  if (current && related && current.contains(related)) return
  resetPaneDropState()
}

function handlePaneEdgeDrop(e: DragEvent): void {
  if (props.node.type !== 'leaf') return
  e.preventDefault()
  e.stopPropagation()
  const payload = readWorkspaceDragPayload(e)
  if (!payload) {
    resetPaneDropState()
    return
  }

  if (payload.type === 'pane') {
    if (payload.paneId !== props.node.paneId) {
      emit('swap-pane-tabs', { fromPaneId: payload.paneId, toPaneId: props.node.paneId })
    }
    draggingHeaderPaneId = null
    resetPaneDropState()
    return
  }

  if (edgeDropDirection.value) {
    if (payload.type === 'tab') {
      emit('split-and-move-tab', {
        sourcePaneId: payload.paneId,
        targetPaneId: props.node.paneId,
        tabId: payload.tabId,
        direction: edgeDropDirection.value
      })
    } else {
      emit('open-session-drop', {
        sessionRef: payload.sessionRef,
        targetPaneId: props.node.paneId,
        direction: edgeDropDirection.value
      })
    }
  } else {
    if (payload.type === 'tab') {
      emit('move-tab', {
        fromPaneId: payload.paneId,
        toPaneId: props.node.paneId,
        tabId: payload.tabId
      })
    } else {
      emit('open-session-drop', {
        sessionRef: payload.sessionRef,
        targetPaneId: props.node.paneId
      })
    }
  }
  resetPaneDropState()
}

function closeMenus(): void {
  paneMenu.value.visible = false
  zoomMenuOpen.value = false
}

function openPaneMenu(e: MouseEvent): void {
  if (props.node.type !== 'leaf') return
  paneMenu.value = { visible: true, x: e.clientX, y: e.clientY }
}

function handlePaneMenuSplit(direction: WorkspaceSplitDirection): void {
  if (props.node.type !== 'leaf') return
  closeMenus()
  emit('split-pane', { paneId: props.node.paneId, direction })
}

function handlePaneMenuClose(): void {
  if (props.node.type !== 'leaf') return
  closeMenus()
  emit('close-pane', props.node.paneId)
}

function handlePaneMenuEvenSplit(): void {
  if (props.node.type !== 'leaf') return
  closeMenus()
  emit('even-split-pane', props.node.paneId)
}

function handlePaneMenuUndoLayout(): void {
  closeMenus()
  emit('undo-layout')
}

function handlePaneMenuResetLayout(): void {
  closeMenus()
  emit('reset-layout')
}

onBeforeUnmount(() => {
  clearResizeListeners()
  if (edgeRaf) {
    window.cancelAnimationFrame(edgeRaf)
    edgeRaf = 0
  }
  document.removeEventListener('pointerdown', handleGlobalPointerDown)
})

function handleGlobalPointerDown(e: PointerEvent): void {
  if (!zoomMenuOpen.value) return
  const host = zoomControlRef.value
  const target = e.target as Node | null
  if (!host || !target || !host.contains(target)) {
    zoomMenuOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleGlobalPointerDown)
})

watch(
  () => props.node.type === 'leaf' ? props.node.paneId : '',
  () => {
    zoomMenuOpen.value = false
  }
)
</script>

<style scoped lang="scss">
.workspace-split {
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
  display: flex;
  gap: 4px;

  &.horizontal {
    flex-direction: row;
  }

  &.vertical {
    flex-direction: column;
  }
}

.split-child {
  min-width: 0;
  min-height: 0;
  display: flex;
  transition: flex-grow 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.workspace-split.resizing .split-child {
  transition: none;
}

.splitter {
  flex: 0 0 4px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--border-light) 55%, transparent);
  cursor: col-resize;
  transition: background 120ms ease, box-shadow 120ms ease;
}

.splitter:hover {
  background: color-mix(in srgb, var(--accent-primary) 65%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 35%, transparent);
}

.workspace-split.resizing .splitter {
  background: color-mix(in srgb, var(--accent-primary) 80%, transparent);
}

.workspace-split.vertical .splitter {
  width: 100%;
  min-height: 4px;
  cursor: row-resize;
}

.workspace-split.horizontal .splitter {
  height: 100%;
  min-width: 4px;
}

.workspace-pane {
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
  overflow: hidden;
  position: relative;
  transition: border-color 140ms ease, box-shadow 140ms ease;

  &.focused {
    border-color: #6b7280;
  }

  &.drop-active {
    border-color: color-mix(in srgb, var(--accent-primary) 72%, var(--border-color));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 54%, transparent);
  }

  &.drop-split {
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 64%, transparent);
  }
}

.pane-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--bg-tertiary) 55%, transparent);
  min-height: 34px;
  overflow-x: auto;
  scrollbar-width: thin;
}

.pane-tab {
  max-width: 180px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 3px 6px 3px 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  min-width: 0;
  font-size: var(--font-size-xs);
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    color: var(--text-primary);
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
  }

  &.offline {
    color: var(--text-muted);
    border-style: dashed;
  }

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
  }
}

.pane-tab-icon {
  flex-shrink: 0;
  font-size: 13px;
  line-height: 1;
}

.pane-tab :deep(.type-badge) {
  flex-shrink: 0;
  border-radius: var(--radius-xs);
}

.pane-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-tab-pin {
  flex-shrink: 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.pane-tab-close {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  transition: color 120ms ease, background 120ms ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
    color: var(--text-primary);
  }
}

.pane-tab-empty {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  padding: 0 6px;
}

.pane-tab-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.pane-btn {
  width: 22px;
  height: 22px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.pane-content {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.pane-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 8px var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
  min-height: 44px;
  cursor: grab;

  &:active {
    cursor: grabbing;
  }

  &.pane-header-offline {
    background: color-mix(in srgb, var(--status-warning) 8%, transparent);
    border-bottom-color: color-mix(in srgb, var(--status-warning) 32%, var(--border-color));
  }
}

.pane-header-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.pane-session-name {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.pane-runtime-info {
  min-width: 0;
  flex-shrink: 1;
}

.pane-zoom-reset-btn {
  flex-shrink: 0;
  height: 24px;
  min-width: 48px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-xs);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 22px;
  cursor: pointer;
  transition: all 140ms ease;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
    border-color: var(--text-muted);
  }

  &:active {
    transform: scale(0.96);
  }
}

.pane-zoom-control {
  position: relative;
  flex-shrink: 0;
}

.pane-zoom-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  min-width: 72px;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-md);
}

.pane-zoom-item {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: right;
  border-radius: var(--radius-xs);
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

.pane-header-info :deep(.status-tag) {
  white-space: nowrap;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
}

.pane-header-info :deep(.status-tag.offline) {
  color: var(--status-warning);
  background: color-mix(in srgb, var(--status-warning) 12%, transparent);
}

.pane-header-info :deep(.type-badge) {
  border-radius: var(--radius-xs);
}

.pane-header-info :deep(.session-runtime-info) {
  border-radius: var(--radius-sm);
}

.pane-header-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.pane-header-actions :deep(.icon-button) {
  border-radius: var(--radius-xs);
}

.pane-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.pane-unavailable {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-width: 0;
  padding: 24px;
  color: var(--text-secondary);
  text-align: left;
}

.pane-unavailable-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border: 1px solid color-mix(in srgb, var(--status-warning) 36%, var(--border-color));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--status-warning) 8%, transparent);
  color: var(--status-warning);

  .ui-icon {
    width: 24px;
    height: 24px;
  }
}

.pane-unavailable-copy {
  max-width: 520px;
  min-width: 0;

  h3 {
    margin: 0 0 6px;
    color: var(--text-primary);
    font-size: 15px;
    line-height: 1.35;
  }

  p {
    margin: 0;
    color: var(--text-secondary);
    font-size: 12px;
    line-height: 1.55;
  }

  .pane-unavailable-detail {
    margin-top: 8px;
    color: var(--text-muted);
    overflow-wrap: anywhere;
  }
}

.pane-unavailable-action {
  margin-top: 14px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 42%, var(--border-color));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-tertiary));
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;

  &:hover {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 16%, var(--bg-tertiary));
  }
}

.session-icon {
  width: 18px;
  height: 18px;
  font-size: 14px;
  line-height: 18px;
  text-align: center;
}

.edge-drop-indicator {
  position: absolute;
  pointer-events: none;
  z-index: 3;
  border: 2px solid color-mix(in srgb, var(--accent-primary) 75%, transparent);
  border-radius: var(--radius-sm);
  transition: opacity 120ms ease;

  &.horizontal {
    top: 4px;
    bottom: 4px;
    right: 4px;
    width: 28%;
  }

  &.vertical {
    left: 4px;
    right: 4px;
    bottom: 4px;
    height: 28%;
  }
}

.pane-drop-copy {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 4;
  max-width: min(72%, 260px);
  transform: translate(-50%, -50%);
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 48%, var(--border-color));
  background: color-mix(in srgb, var(--bg-primary) 90%, var(--accent-primary) 10%);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  pointer-events: none;
  box-shadow: var(--shadow-md);

  &.split {
    color: var(--accent-primary);
  }
}

@media (prefers-reduced-motion: reduce) {
  .split-child,
  .workspace-pane,
  .edge-drop-indicator {
    transition: none !important;
  }
}
</style>
