<template>
  <span>{{ $t('session.totalRuntime') }}: {{ totalRuntimeText }}</span>
  <span>{{ $t('session.singleRuntime') }}: {{ singleRuntimeText }}</span>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Session } from '@/stores/sessions'

const props = defineProps<{
  session: Session | null
}>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

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
})

onUnmounted(() => {
  stopTicker()
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
</script>
