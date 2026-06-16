<template>
  <div ref="containerEl" class="pane-layout" :class="direction">
    <template v-for="(pane, index) in panes" :key="pane.key">
      <div class="pane" :style="paneStyle(pane)">
        <slot :name="pane.key" />
      </div>
      <div
        v-if="index < panes.length - 1"
        class="pane-splitter"
        :class="direction"
        role="separator"
        :aria-orientation="direction === 'horizontal' ? 'vertical' : 'horizontal'"
        @mousedown.prevent="startResize(index, $event)"
      ></div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'

export interface PaneItem {
  key: string
  size: number
  minSize?: number
}

const props = defineProps<{
  direction: 'horizontal' | 'vertical'
  panes: PaneItem[]
}>()

const emit = defineEmits<{
  resize: [sizes: Array<{ key: string; size: number }>]
}>()

const containerEl = ref<HTMLElement | null>(null)
let detach: (() => void) | null = null

function paneStyle(pane: PaneItem): Record<string, string> {
  const min = `${pane.minSize ?? 0}px`
  // flex-grow 用 size 作权重，flex-basis 0 让分配完全由权重决定，分辨率无关。
  return {
    flex: `${pane.size} 1 0`,
    [props.direction === 'horizontal' ? 'minWidth' : 'minHeight']: min
  }
}

function startResize(index: number, event: MouseEvent): void {
  const container = containerEl.value
  if (!container) return
  detach?.()

  const horizontal = props.direction === 'horizontal'
  const startPos = horizontal ? event.clientX : event.clientY
  const sizes = props.panes.map((p) => p.size)
  const totalSize = sizes.reduce((sum, s) => sum + s, 0)
  const containerPx = horizontal ? container.clientWidth : container.clientHeight
  // 每“权重单位”对应的像素（忽略 splitter 占位的微小误差）。
  const pxPerUnit = totalSize > 0 && containerPx > 0 ? containerPx / totalSize : 1

  const aStart = sizes[index]
  const bStart = sizes[index + 1]
  const aMinUnit = (props.panes[index].minSize ?? 0) / pxPerUnit
  const bMinUnit = (props.panes[index + 1].minSize ?? 0) / pxPerUnit

  function onMove(moveEvent: MouseEvent): void {
    const pos = horizontal ? moveEvent.clientX : moveEvent.clientY
    let delta = (pos - startPos) / pxPerUnit
    if (aStart + delta < aMinUnit) delta = aMinUnit - aStart
    if (bStart - delta < bMinUnit) delta = bStart - bMinUnit
    const next = [...sizes]
    next[index] = aStart + delta
    next[index + 1] = bStart - delta
    emit(
      'resize',
      props.panes.map((p, i) => ({ key: p.key, size: next[i] }))
    )
  }

  function onUp(): void {
    detach?.()
    detach = null
  }

  document.body.style.cursor = horizontal ? 'col-resize' : 'row-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  detach = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
}

onBeforeUnmount(() => {
  detach?.()
})
</script>

<style scoped lang="scss">
.pane-layout {
  display: flex;
  min-width: 0;
  min-height: 0;
  width: 100%;
  height: 100%;

  &.horizontal {
    flex-direction: row;
  }

  &.vertical {
    flex-direction: column;
  }
}

.pane {
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;

  // 让每个 pane 内的内容(通常是 .panel)填满。
  > :deep(*) {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
  }
}

.pane-splitter {
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

  // 中央的细分隔线。
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
</style>
