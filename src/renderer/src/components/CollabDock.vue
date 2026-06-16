<template>
  <!-- split 节点：横/纵两个区域 + 可拖拽 splitter -->
  <div v-if="node.type === 'split'" ref="containerEl" class="dock-split" :class="node.direction">
    <div class="dock-region" :style="firstStyle">
      <CollabDock :node="node.first" :path="`${path}.first`">
        <template #panel="scoped"><slot name="panel" v-bind="scoped" /></template>
      </CollabDock>
    </div>
    <div class="dock-splitter" :class="node.direction" @mousedown.prevent="onSplitterDown"></div>
    <div class="dock-region" :style="secondStyle">
      <CollabDock :node="node.second" :path="`${path}.second`">
        <template #panel="scoped"><slot name="panel" v-bind="scoped" /></template>
      </CollabDock>
    </div>
  </div>

  <!-- leaf 节点：单一面板，可拖标题换位/分屏 -->
  <div v-else class="dock-leaf" @dragover="onDragOver" @drop="onDrop" @dragleave="onDragLeave">
    <header class="dock-head" draggable="true" @dragstart="onHeadDragStart" @dragend="onHeadDragEnd">
      <span class="drag-grip" aria-hidden="true">⠿</span>
      <span class="dock-title">{{ panelTitle }}</span>
      <button
        class="dock-close"
        type="button"
        :disabled="leafCount <= 1"
        :title="t('collab.dockHide')"
        :aria-label="t('collab.dockHide')"
        @click="hidePanel(node.panelId)"
      >✕</button>
    </header>
    <div class="dock-leaf-body">
      <slot name="panel" :panel-id="node.panelId" />
    </div>
    <div v-if="dropActive" class="dock-drop" :class="`zone-${dropZone}`" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, ref, type VNode } from 'vue'
import { useI18n } from 'vue-i18n'
import { COLLAB_DOCK_KEY, type DockNode, type DropZone } from '@/composables/useCollabDock'

const props = defineProps<{ node: DockNode; path: string }>()
// 显式声明插槽类型，打破递归组件自引用插槽的类型推断环。
defineSlots<{ panel(props: { panelId: string }): VNode[] }>()

const { t } = useI18n()
const injected = inject(COLLAB_DOCK_KEY)
if (!injected) throw new Error('CollabDock 必须在 useCollabDock 的 provider 内使用')
const dock = injected

const draggingPanelId = dock.draggingPanelId
const dropTarget = dock.dropTarget
const leafCount = dock.leafCount
const hidePanel = dock.hidePanel

const containerEl = ref<HTMLElement | null>(null)

const panelTitle = computed(() => (props.node.type === 'leaf' ? t(`collab.panel.${props.node.panelId}`) : ''))
const firstStyle = computed(() => (props.node.type === 'split' ? { flex: `${props.node.ratio} 1 0` } : {}))
const secondStyle = computed(() => (props.node.type === 'split' ? { flex: `${1 - props.node.ratio} 1 0` } : {}))

const dropActive = computed(
  () =>
    props.node.type === 'leaf' &&
    !!draggingPanelId.value &&
    dropTarget.value?.panelId === props.node.panelId
)
const dropZone = computed(() => dropTarget.value?.zone ?? 'center')

// 根据指针在 leaf 内的相对位置判定停靠区：靠四边=分屏方向，居中=换位。
function zoneFromEvent(event: DragEvent, el: HTMLElement): DropZone {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return 'center'
  const x = (event.clientX - rect.left) / rect.width
  const y = (event.clientY - rect.top) / rect.height
  const edge = 0.26
  const distLeft = x
  const distRight = 1 - x
  const distTop = y
  const distBottom = 1 - y
  const min = Math.min(distLeft, distRight, distTop, distBottom)
  if (min > edge) return 'center'
  if (min === distLeft) return 'left'
  if (min === distRight) return 'right'
  if (min === distTop) return 'top'
  return 'bottom'
}

function onHeadDragStart(event: DragEvent): void {
  if (props.node.type !== 'leaf') return
  dock.startDrag(props.node.panelId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    try {
      event.dataTransfer.setData('text/plain', props.node.panelId)
    } catch {
      // 忽略受保护场景下的写入失败。
    }
  }
}

function onHeadDragEnd(): void {
  dock.endDrag()
}

function onDragOver(event: DragEvent): void {
  if (props.node.type !== 'leaf' || !draggingPanelId.value) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dock.setDropTarget(props.node.panelId, zoneFromEvent(event, event.currentTarget as HTMLElement))
}

function onDragLeave(): void {
  if (props.node.type !== 'leaf') return
  dock.clearDropTarget(props.node.panelId)
}

function onDrop(event: DragEvent): void {
  if (props.node.type !== 'leaf' || !draggingPanelId.value) return
  event.preventDefault()
  dock.dropOnPanel(props.node.panelId, zoneFromEvent(event, event.currentTarget as HTMLElement))
  dock.endDrag()
}

function onSplitterDown(): void {
  if (props.node.type !== 'split') return
  const container = containerEl.value
  if (!container) return
  const horizontal = props.node.direction === 'horizontal'
  const rect = container.getBoundingClientRect()
  const total = horizontal ? rect.width : rect.height
  if (total <= 0) return
  const path = props.path

  function onMove(moveEvent: MouseEvent): void {
    const pos = horizontal ? moveEvent.clientX - rect.left : moveEvent.clientY - rect.top
    dock.setRatio(path, pos / total)
  }
  function onUp(): void {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped lang="scss">
.dock-split {
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;

  &.horizontal {
    flex-direction: row;
  }

  &.vertical {
    flex-direction: column;
  }
}

.dock-region {
  display: flex;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.dock-leaf {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg-secondary) 74%, transparent);
}

.dock-head {
  min-height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border-color);
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }
}

.drag-grip {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  letter-spacing: -1px;
}

.dock-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 800;
  text-transform: uppercase;
}

.dock-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--status-error);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.dock-leaf-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  > :deep(*) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
}

.dock-splitter {
  flex: 0 0 auto;
  position: relative;
  background: transparent;
  transition: background 120ms ease;

  &.horizontal {
    width: 6px;
    cursor: col-resize;
  }

  &.vertical {
    height: 6px;
    cursor: row-resize;
  }

  &::after {
    content: '';
    position: absolute;
    background: var(--border-color);
  }

  &.horizontal::after {
    top: 6px;
    bottom: 6px;
    left: 50%;
    width: 1px;
    transform: translateX(-50%);
  }

  &.vertical::after {
    left: 6px;
    right: 6px;
    top: 50%;
    height: 1px;
    transform: translateY(-50%);
  }

  &:hover {
    background: color-mix(in srgb, var(--accent-primary) 22%, transparent);
  }
}

// 拖放停靠指示器（不拦截拖拽事件）。
.dock-drop {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  border: 2px solid var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 18%, transparent);
  border-radius: 6px;
  transition: all 90ms ease;

  &.zone-center {
    inset: 4px;
  }

  &.zone-left {
    top: 4px;
    bottom: 4px;
    left: 4px;
    width: calc(50% - 4px);
  }

  &.zone-right {
    top: 4px;
    bottom: 4px;
    right: 4px;
    width: calc(50% - 4px);
  }

  &.zone-top {
    left: 4px;
    right: 4px;
    top: 4px;
    height: calc(50% - 4px);
  }

  &.zone-bottom {
    left: 4px;
    right: 4px;
    bottom: 4px;
    height: calc(50% - 4px);
  }
}
</style>
