<template>
  <div class="toast-container">
    <TransitionGroup name="toast">
      <div
        v-for="t in toastStore.toasts"
        :key="t.id"
        class="toast-item toast"
        :class="t.type"
        @mouseenter="pauseTimer(t.id)"
        @mouseleave="resumeTimer(t.id)"
      >
        <span class="toast-icon">{{ icons[t.type] }}</span>
        <div class="toast-body">
          <div v-if="t.title" class="toast-title">{{ t.title }}</div>
          <div class="toast-msg">{{ t.message }}</div>
        </div>
        <button class="toast-close" @click="toastStore.remove(t.id)">&times;</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { watch, onUnmounted } from 'vue'
import { useToastStore } from '@/composables/useToast'

const toastStore = useToastStore()

const icons: Record<string, string> = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
}

const timers = new Map<number, ReturnType<typeof setTimeout>>()

function startTimer(id: number, duration: number) {
  clearTimer(id)
  timers.set(id, setTimeout(() => toastStore.remove(id), duration))
}

function clearTimer(id: number) {
  const t = timers.get(id)
  if (t) { clearTimeout(t); timers.delete(id) }
}

function pauseTimer(id: number) { clearTimer(id) }

function resumeTimer(id: number) {
  const item = toastStore.toasts.find(t => t.id === id)
  if (item) startTimer(id, item.duration)
}

watch(() => toastStore.toasts.length, () => {
  for (const t of toastStore.toasts) {
    if (!timers.has(t.id)) startTimer(t.id, t.duration)
  }
})

onUnmounted(() => timers.forEach((_, id) => clearTimer(id)))
</script>

<style scoped lang="scss">
.toast-container {
  position: fixed;
  top: 60px;
  right: 16px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 360px;
}

.toast-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
  min-width: 260px;
  backdrop-filter: blur(8px);

  &.success { border-left: 3px solid var(--status-success); }
  &.error { border-left: 3px solid var(--status-error); }
  &.warning { border-left: 3px solid var(--status-warning); }
  &.info { border-left: 3px solid var(--accent-primary); }
}

.toast-icon {
  font-size: var(--font-size-md);
  flex-shrink: 0;
  width: 20px;
  text-align: center;
  .success & { color: var(--status-success); }
  .error & { color: var(--status-error); }
  .warning & { color: var(--status-warning); }
  .info & { color: var(--accent-primary); }
}

.toast-body { flex: 1; min-width: 0; }

.toast-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  margin-bottom: 2px;
}

.toast-msg {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  word-break: break-word;
}

.toast-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-lg);
  line-height: 1;
  padding: 0;
  &:hover { color: var(--text-primary); }
}

.toast-enter-active { animation: slideIn 0.3s ease; }
.toast-leave-active { animation: fadeOut 0.2s ease; }

@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}
</style>
