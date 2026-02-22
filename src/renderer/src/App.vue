<template>
  <MainLayout />
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
import ToastContainer from '@/components/ToastContainer.vue'
import { useShortcuts } from '@/composables/useShortcuts'
import { useSettingsStore } from '@/stores/settings'

const { locale } = useI18n()
const settingsStore = useSettingsStore()

const SHUTDOWN_START_CHANNEL = 'app:shutdown-start'
const isShuttingDown = ref(false)
const shutdownListener = (_event: IpcRendererEvent) => {
  isShuttingDown.value = true
}

watch(() => settingsStore.settings.language, (lang) => {
  locale.value = lang
})

onMounted(async () => {
  if (!settingsStore.loaded) await settingsStore.load()
  locale.value = settingsStore.settings.language
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
  background: rgba(13, 18, 28, 0.66);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: all;
}

.shutdown-card {
  width: min(90vw, 460px);
  padding: 28px 30px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: linear-gradient(160deg, rgba(32, 42, 63, 0.94), rgba(20, 26, 39, 0.94));
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.42);
  text-align: center;
}

.shutdown-spinner {
  width: 34px;
  height: 34px;
  margin: 0 auto 14px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.22);
  border-top-color: #8ec2ff;
  animation: spin 0.8s linear infinite;
}

.shutdown-title {
  color: #f3f7ff;
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.shutdown-desc {
  color: rgba(243, 247, 255, 0.78);
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
