<template>
  <MainLayout />
  <ConfirmDialogHost />
  <ShortcutHelpDialog />
  <ToastContainer />
  <div v-if="isShuttingDown" class="shutdown-overlay">
    <div class="shutdown-card">
      <div class="shutdown-spinner" aria-hidden="true"></div>
      <div class="shutdown-title">{{ $t('app.closingTitle') }}</div>
      <div class="shutdown-desc">{{ $t('app.closingDesc') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { IpcRendererEvent } from 'electron'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import MainLayout from '@/layouts/MainLayout.vue'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ShortcutHelpDialog from '@/components/ShortcutHelpDialog.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import { useShortcuts } from '@/composables/useShortcuts'
import { useSettingsStore } from '@/stores/settings'
import { useWorkspaceStore } from '@/stores/workspace'

const { locale } = useI18n()
const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()

const SHUTDOWN_START_CHANNEL = 'app:shutdown-start'
const isShuttingDown = ref(false)
const shutdownListener = (_event: IpcRendererEvent) => {
  workspaceStore.flushPersist()
  isShuttingDown.value = true
}

function resolveDocumentTheme(theme: string): string {
  if (theme === 'gemini' || theme === 'gemini-light' || theme === 'gemini-dark') return 'gemini-dark'
  return 'chatgpt-dark'
}

watch(() => settingsStore.settings.language, (lang) => {
  locale.value = lang
})

watch(() => settingsStore.settings.theme, (theme) => {
  document.documentElement.dataset.theme = resolveDocumentTheme(theme)
}, { immediate: true })

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.load()
  locale.value = settingsStore.settings.language
  document.documentElement.dataset.theme = resolveDocumentTheme(settingsStore.settings.theme)
  window.electronAPI.on(SHUTDOWN_START_CHANNEL, shutdownListener)
})

onBeforeUnmount(() => {
  window.electronAPI.removeListener(SHUTDOWN_START_CHANNEL, shutdownListener)
})

useShortcuts()
</script>

<style scoped lang="scss">
.shutdown-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: color-mix(in srgb, var(--bg-primary) 70%, transparent);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

.shutdown-card {
  width: min(90vw, 460px);
  padding: 28px 30px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.shutdown-spinner {
  width: 34px;
  height: 34px;
  margin: 0 auto 14px;
  border-radius: 50%;
  border: 3px solid var(--border-light);
  border-top-color: var(--accent-primary);
  animation: spin 0.8s linear infinite;
}

.shutdown-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.shutdown-desc {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
