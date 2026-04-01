<template>
  <div
    ref="runtimeRoot"
    class="session-runtime-info"
    :class="`mode-${displayMode}`"
    :title="runtimeTitle"
  >
    <span v-if="displayMode !== 'minimal'" class="runtime-chip runtime-total">
      <span class="runtime-key">T</span>
      <span class="runtime-value">{{ totalRuntimeText }}</span>
    </span>
    <span class="runtime-chip runtime-single">
      <span class="runtime-key">R</span>
      <span class="runtime-value">{{ singleRuntimeText }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { UnifiedSession } from '@/models/unified-resource'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  session: UnifiedSession | null
}>()

const { t } = useI18n()
const now = ref(Date.now())
const runtimeRoot = ref<HTMLElement | null>(null)
const displayMode = ref<'full' | 'compact' | 'minimal'>('full')
let timer: ReturnType<typeof setInterval> | null = null
let resizeObserver: ResizeObserver | null = null

function startTicker(): void {
  if (timer) return
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
}

function stopTicker(): void {
  if (!timer) return
  clearInterval(timer)
  timer = null
}

function updateDisplayMode(): void {
  const header = runtimeRoot.value?.closest('.pane-header') as HTMLElement | null
  const width = header?.clientWidth ?? 0

  if (width <= 0) {
    displayMode.value = 'full'
    return
  }

  if (width < 620) {
    displayMode.value = 'minimal'
    return
  }

  if (width < 860) {
    displayMode.value = 'compact'
    return
  }

  displayMode.value = 'full'
}

const shouldTick = computed(() => {
  if (!props.session) return false
  return props.session.status === 'running' && Number.isFinite(props.session.lastStartAt)
})

watch(shouldTick, (running) => {
  if (running) {
    startTicker()
    return
  }
  stopTicker()
}, { immediate: true })

onMounted(() => {
  if (shouldTick.value) {
    startTicker()
  }
  updateDisplayMode()
  const header = runtimeRoot.value?.closest('.pane-header') as HTMLElement | null
  if (!header) return
  resizeObserver = new ResizeObserver(() => {
    updateDisplayMode()
  })
  resizeObserver.observe(header)
})

onUnmounted(() => {
  stopTicker()
  resizeObserver?.disconnect()
  resizeObserver = null
})

function formatDuration(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms))
  const totalSec = Math.floor(safeMs / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []

  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

function getTotalRuntimeMs(): number {
  if (!props.session) return 0

  const base = Number.isFinite(props.session.totalRunMs) ? Number(props.session.totalRunMs) : 0
  if (props.session.status === 'running' && Number.isFinite(props.session.lastStartAt)) {
    return base + Math.max(0, now.value - Number(props.session.lastStartAt))
  }

  return base
}

function getSingleRuntimeMs(): number {
  if (!props.session) return 0

  if (props.session.status === 'running' && Number.isFinite(props.session.lastStartAt)) {
    return Math.max(0, now.value - Number(props.session.lastStartAt))
  }

  return Number.isFinite(props.session.lastRunMs) ? Number(props.session.lastRunMs) : 0
}

const totalRuntimeText = computed(() => formatDuration(getTotalRuntimeMs()))
const singleRuntimeText = computed(() => formatDuration(getSingleRuntimeMs()))
const runtimeTitle = computed(() => {
  return `${t('session.totalRuntime')}: ${totalRuntimeText.value} | ${t('session.singleRuntime')}: ${singleRuntimeText.value}`
})
</script>

<style scoped lang="scss">
.session-runtime-info {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  flex-shrink: 1;
  white-space: nowrap;
  overflow: hidden;
  padding: 2px 6px;
  border-radius: 0;
  border: 1px solid var(--border-color);
  background: rgba(108, 158, 255, 0.08);
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.2;
}

.runtime-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  white-space: nowrap;
}

.runtime-key {
  width: 14px;
  height: 14px;
  border-radius: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(108, 158, 255, 0.22);
  color: var(--accent-primary);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.2px;
  flex-shrink: 0;
}

.runtime-value {
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.1px;
}

.mode-compact {
  padding: 2px 5px;
  gap: 3px;
}

.mode-compact .runtime-chip {
  gap: 3px;
}

.mode-minimal {
  padding: 2px 5px;
}
</style>
