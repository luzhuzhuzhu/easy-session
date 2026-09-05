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
import { useRoute, useRouter } from 'vue-router'
import MainLayout from '@/layouts/MainLayout.vue'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import ShortcutHelpDialog from '@/components/ShortcutHelpDialog.vue'
import ToastContainer from '@/components/ToastContainer.vue'
import { useShortcuts } from '@/composables/useShortcuts'
import { useSettingsStore } from '@/stores/settings'
import { useWorkspaceStore } from '@/stores/workspace'
import { useCollabStore } from '@/stores/collab'
import { useSessionsStore } from '@/stores/sessions'
import { onCollabFocus } from '@/api/agent-bus'
import { onSessionFocusRequest, onCrashNotice, openCrashLog } from '@/api/local-session'
import { useToast } from '@/composables/useToast'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const settingsStore = useSettingsStore()
const workspaceStore = useWorkspaceStore()
const collabStore = useCollabStore()
const sessionsStore = useSessionsStore()
let unsubscribeCollabFocus: (() => void) | null = null
let unsubscribeSessionFocus: (() => void) | null = null
let unsubscribeCrashNotice: (() => void) | null = null

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

  // UX-13：崩溃恢复 toast。主进程 reload 后推送一次；安全模式（10 分钟内 ≥3 崩）额外警示。
  unsubscribeCrashNotice = onCrashNotice((payload) => {
    if (payload.level === 'safe-mode') {
      toast.withAction(
        'warning',
        t('crash.safeModeMessage', { count: payload.count }),
        t('crash.safeModeTitle'),
        t('crash.dismiss'),
        () => {}
      )
    } else {
      toast.withAction(
        'info',
        t('crash.recoveredMessage'),
        t('crash.recoveredTitle'),
        t('crash.viewDetails'),
        () => {
          void openCrashLog()
        }
      )
    }
  })

  // 全程订阅协作 bus，使离开协作页也能收到 badge/toast/系统通知。
  collabStore.start({
    t,
    isOnCollabPage: () => route.path === '/collaboration'
  })
  // 点击系统通知/角标后主进程请求聚焦协作页并选中对应任务。
  unsubscribeCollabFocus = onCollabFocus((taskId) => {
    collabStore.setFocusTask(taskId)
    if (route.path !== '/collaboration') void router.push('/collaboration')
  })

  // 点击"会话退出"通知：跳回会话页并在窗格中打开该会话。路由到位后走与
  // SessionsView.handleSessionClick 相同的 focus/open + setActive 组合。
  unsubscribeSessionFocus = onSessionFocusRequest((sessionId) => {
    const focusInWorkspace = (): void => {
      const session = sessionsStore.unifiedSessions.find((s) => s.sessionId === sessionId)
      if (!session) return
      const sessionRef = {
        instanceId: session.instanceId,
        sessionId: session.sessionId,
        globalSessionKey: session.globalSessionKey
      }
      if (!workspaceStore.focusSessionRef(sessionRef)) {
        workspaceStore.openSessionRefInActivePane(sessionRef)
      }
      sessionsStore.setActiveSessionRef(sessionRef)
    }
    if (route.path !== '/sessions') {
      void router.push('/sessions').then(focusInWorkspace)
    } else {
      focusInWorkspace()
    }
  })
})

onBeforeUnmount(() => {
  window.electronAPI.removeListener(SHUTDOWN_START_CHANNEL, shutdownListener)
  if (unsubscribeCollabFocus) unsubscribeCollabFocus()
  if (unsubscribeSessionFocus) unsubscribeSessionFocus()
  if (unsubscribeCrashNotice) unsubscribeCrashNotice()
  collabStore.stop()
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
