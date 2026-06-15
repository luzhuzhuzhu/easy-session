import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useShortcutHelp } from '@/composables/useShortcutHelp'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { useToast } from '@/composables/useToast'

// Single source of truth for Ctrl+<number> navigation. Order MUST match the
// visible nav order in MainLayout.vue `navItems`, otherwise the shortcuts drift
// out of sync with what users see (the collaboration page used to be skipped).
export const NAV_ROUTES: ReadonlyArray<{ key: string; path: string }> = [
  { key: '1', path: '/dashboard' },
  { key: '2', path: '/sessions' },
  { key: '3', path: '/collaboration' },
  { key: '4', path: '/projects' },
  { key: '5', path: '/skills' },
  { key: '6', path: '/settings' }
]

const NAV_SHORTCUTS: Record<string, string> = Object.fromEntries(
  NAV_ROUTES.map(({ key, path }) => [key, path])
)

export const SHORTCUT_LABELS: Record<string, string> = Object.fromEntries(
  NAV_ROUTES.map(({ key, path }) => [path, `Ctrl+${key}`])
)

export function useShortcuts() {
  const router = useRouter()
  const sessionsStore = useSessionsStore()
  const workspaceStore = useWorkspaceStore()
  const shortcutHelp = useShortcutHelp()
  const toast = useToast()
  const { t } = useI18n()

  function handler(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName
    const isPrimary = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

    if ((e.key === 'F1' || (isPrimary && !e.shiftKey && !e.altKey && e.key === '/')) && !e.repeat) {
      e.preventDefault()
      shortcutHelp.toggle()
      return
    }

    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return


    if (isPrimary && !e.shiftKey && !e.altKey) {
      if (NAV_SHORTCUTS[e.key]) {
        e.preventDefault()
        router.push(NAV_SHORTCUTS[e.key])
        return
      }
      if (key === 'n') {
        e.preventDefault()
        router.push({ path: '/sessions', query: { action: 'create' } })
        return
      }
      if (key === ',') {
        e.preventDefault()
        router.push('/settings')
        return
      }
      if (key === 'w') {
        e.preventDefault()
        if (router.currentRoute.value.path === '/sessions') {
          const pane = workspaceStore.activePane
          if (pane?.activeTabId) {
            const closingTab = workspaceStore.layout.tabs[pane.activeTabId]
            const closedName = closingTab
              ? sessionsStore.sessionIndexByGlobalKey[closingTab.globalSessionKey]?.name ?? ''
              : ''
            workspaceStore.closeTab(workspaceStore.layout.activePaneId, pane.activeTabId)
            if (workspaceStore.activeSessionRef) {
              sessionsStore.setActiveSessionRef(workspaceStore.activeSessionRef)
            }
            toast.info(
              closedName
                ? t('shortcuts.tabClosedNamed', { name: closedName })
                : t('shortcuts.tabClosed')
            )
          }
        }
        return
      }
      if (key === 'z') {
        if (router.currentRoute.value.path !== '/sessions') return
        const undone = workspaceStore.undoLayoutChange()
        if (undone) {
          e.preventDefault()
        }
        return
      }
    }
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}
