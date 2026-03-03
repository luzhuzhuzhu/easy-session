<template>
  <div v-if="node.type === 'split'" class="workspace-split" :class="[node.direction, { resizing: isResizingSplit }]">
    <div class="split-child first" :style="firstChildStyle">
      <WorkspacePaneTree
        :node-path="`${nodePath}.first`"
        :node="node.first"
        :tabs-index="tabsIndex"
        :sessions-by-id="sessionsById"
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
      />
    </div>
    <div class="splitter" @mousedown.prevent="startSplitResize"></div>
    <div class="split-child second" :style="secondChildStyle">
      <WorkspacePaneTree
        :node-path="`${nodePath}.second`"
        :node="node.second"
        :tabs-index="tabsIndex"
        :sessions-by-id="sessionsById"
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
      />
    </div>
  </div>

  <div
    v-else
    class="workspace-pane"
    :class="{ focused: activePaneId === node.paneId }"
    @mousedown="handleFocusPane"
    @dragover.prevent="handlePaneDragOver"
    @dragleave="clearEdgeDrop"
    @drop="handlePaneEdgeDrop"
    @contextmenu.prevent="openPaneMenu"
  >
    <div v-if="edgeDropDirection" class="edge-drop-indicator" :class="edgeDropDirection"></div>

    <div class="pane-content">
      <template v-if="activeSession">
        <div class="pane-header">
          <div class="pane-header-info">
            <span v-if="activeSession.icon" class="session-icon">{{ activeSession.icon }}</span>
            <span v-else class="type-badge" :class="activeSession.type">{{ activeSession.type === 'claude' ? 'C' : activeSession.type === 'codex' ? 'X' : 'O' }}</span>
            <span class="pane-session-name">{{ activeSession.name }}</span>
            <span class="status-tag" :class="activeSession.status">{{ activeSession.status }}</span>
            <SessionRuntimeInfo :session="activeSession" />
          </div>
          <div class="pane-header-actions">
            <button
              v-if="activeSession.status !== 'running'"
              class="btn btn-primary btn-sm"
              @click="emit('start-session', activeSession.id)"
            >
              {{ $t('session.start') }}
            </button>
            <button v-else class="btn btn-sm" @click="emit('pause-session', activeSession.id)">
              {{ $t('session.pause') }}
            </button>
            <button class="btn btn-sm" @click="emit('restart-session', activeSession.id)">{{ $t('session.restart') }}</button>
            <button class="btn btn-danger btn-sm" @click="emit('destroy-session', activeSession.id)">{{ $t('session.destroy') }}</button>
          </div>
        </div>

        <TerminalOutput
          :session-id="activeSession.id"
          :process-key="activeSession.processId"
          @clear="emit('clear-output', activeSession.id)"
        />
      </template>
      <div v-else class="pane-empty">{{ $t('session.noActive') }}</div>
    </div>

    <div v-if="paneMenu.visible" class="context-overlay" @click="closeMenus"></div>
    <div
      v-if="paneMenu.visible"
      class="context-menu"
      :style="{ left: paneMenu.x + 'px', top: paneMenu.y + 'px' }"
    >
      <button class="context-item" @click="handlePaneMenuSplit('horizontal')">{{ $t('session.newRightPane') }}</button>
      <button class="context-item" @click="handlePaneMenuSplit('vertical')">{{ $t('session.newBottomPane') }}</button>
      <button class="context-item" @click="handlePaneMenuEvenSplit">{{ $t('session.evenSplit') }}</button>
      <button class="context-item" @click="handlePaneMenuUndoLayout">{{ $t('session.undoLayout') }}</button>
      <button class="context-item" @click="handlePaneMenuResetLayout">{{ $t('session.resetLayout') }}</button>
      <button v-if="canClosePanes" class="context-item danger" @click="handlePaneMenuClose">{{ $t('session.closePane') }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { Session } from '@/api/session'
import type {
  WorkspaceLayoutNode,
  WorkspaceSplitDirection,
  WorkspaceTabState
} from '@/api/workspace'
import TerminalOutput from '@/components/TerminalOutput.vue'
import SessionRuntimeInfo from '@/components/SessionRuntimeInfo.vue'

defineOptions({ name: 'WorkspacePaneTree' })

const props = defineProps<{
  nodePath: string
  node: WorkspaceLayoutNode
  tabsIndex: Record<string, WorkspaceTabState>
  sessionsById: Record<string, Session>
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
  'open-session-drop': [payload: { sessionId: string; targetPaneId: string; direction?: WorkspaceSplitDirection }]
  'undo-layout': []
  'reset-layout': []
  'start-session': [sessionId: string]
  'pause-session': [sessionId: string]
  'restart-session': [sessionId: string]
  'destroy-session': [sessionId: string]
  'clear-output': [sessionId: string]
}>()

const edgeDropDirection = ref<WorkspaceSplitDirection | null>(null)
const paneMenu = ref({ visible: false, x: 0, y: 0 })
const isResizingSplit = ref(false)

const firstChildStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  return { flex: `${props.node.ratio} 1 0%` }
})

const secondChildStyle = computed(() => {
  if (props.node.type !== 'split') return {}
  return { flex: `${1 - props.node.ratio} 1 0%` }
})

const activeSession = computed<Session | null>(() => {
  if (props.node.type !== 'leaf') return null
  const tabId = props.node.activeTabId
  if (!tabId) return null
  const sessionId = props.tabsIndex[tabId]?.sessionId
  if (!sessionId) return null
  return props.sessionsById[sessionId] ?? null
})

function handleFocusPane(): void {
  if (props.node.type !== 'leaf') return
  emit('focus-pane', props.node.paneId)
}

let detachResizeListeners: (() => void) | null = null
let edgeRaf = 0
let pendingEdgeUpdate: { host: HTMLElement; clientX: number; clientY: number } | null = null

function clearResizeListeners(): void {
  detachResizeListeners?.()
  detachResizeListeners = null
  isResizingSplit.value = false
}

function startSplitResize(e: MouseEvent): void {
  if (props.node.type !== 'split') return
  const host = (e.currentTarget as HTMLElement | null)?.parentElement as HTMLElement | null
  if (!host) return
  const direction = props.node.direction
  isResizingSplit.value = true

  const onMove = (ev: MouseEvent) => {
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

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp, { once: true })
  detachResizeListeners = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
}

type WorkspaceDragPayload =
  | { type: 'tab'; paneId: string; tabId: string }
  | { type: 'session'; sessionId: string }

function readWorkspaceDragPayload(e: DragEvent): WorkspaceDragPayload | null {
  const raw = e.dataTransfer?.getData('application/x-easysession-tab')
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

  const sessionRaw = e.dataTransfer?.getData('application/x-easysession-session')
  if (sessionRaw) {
    try {
      const parsed = JSON.parse(sessionRaw) as { sessionId?: string }
      if (parsed.sessionId) {
        return { type: 'session', sessionId: parsed.sessionId }
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
  const payload = readWorkspaceDragPayload(e)
  if (!payload) {
    edgeDropDirection.value = null
    return
  }

  const host = e.currentTarget as HTMLElement | null
  if (!host) return
  queueEdgeUpdate(host, e.clientX, e.clientY)
}

function clearEdgeDrop(e: DragEvent): void {
  const current = e.currentTarget as HTMLElement | null
  const related = e.relatedTarget as Node | null
  if (current && related && current.contains(related)) return
  if (edgeRaf) {
    window.cancelAnimationFrame(edgeRaf)
    edgeRaf = 0
  }
  pendingEdgeUpdate = null
  edgeDropDirection.value = null
}

function handlePaneEdgeDrop(e: DragEvent): void {
  if (props.node.type !== 'leaf') return
  e.preventDefault()
  e.stopPropagation()
  const payload = readWorkspaceDragPayload(e)
  if (!payload) return

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
        sessionId: payload.sessionId,
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
        sessionId: payload.sessionId,
        targetPaneId: props.node.paneId
      })
    }
  }
  edgeDropDirection.value = null
}

function closeMenus(): void {
  paneMenu.value.visible = false
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
})
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
  background: rgba(58, 68, 89, 0.55);
}

.workspace-split.vertical .splitter {
  width: 100%;
  min-height: 4px;
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
  border-radius: var(--radius-sm);
  background: var(--bg-secondary);
  overflow: hidden;
  position: relative;
  transition: border-color 140ms ease, box-shadow 140ms ease;

  &.focused {
    border-color: #6b7280;
  }
}

.pane-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid var(--border-color);
  background: rgba(45, 53, 72, 0.35);
  min-height: 34px;
}

.pane-tab {
  max-width: 180px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  min-width: 0;

  &.active {
    color: var(--text-primary);
    border-color: var(--accent-primary);
    background: rgba(108, 158, 255, 0.12);
  }
}

.pane-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pane-tab-pin {
  font-size: 10px;
  color: var(--text-muted);
}

.pane-tab-close {
  font-size: 11px;
  color: var(--text-muted);
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
  border-radius: var(--radius-sm);
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
}

.pane-header-info {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}

.pane-session-name {
  font-size: var(--font-size-sm);
  font-weight: 600;
}

.pane-header-actions {
  display: flex;
  gap: 4px;
}

.pane-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
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
  z-index: 2;
  border: 2px solid rgba(108, 158, 255, 0.75);
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

@media (prefers-reduced-motion: reduce) {
  .split-child,
  .workspace-pane,
  .edge-drop-indicator {
    transition: none !important;
  }
}
</style>
