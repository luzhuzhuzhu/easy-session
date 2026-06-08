import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useShortcutHelp } from '@/composables/useShortcutHelp'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'

const NAV_SHORTCUTS: Record<string, string> = {
  '1': '/dashboard',
  '2': '/sessions',
  '3': '/projects',
  '4': '/skills',
  '5': '/settings'
}

export const SHORTCUT_LABELS: Record<string, string> = {
  '/dashboard': 'Ctrl+1',
  '/sessions': 'Ctrl+2',
  '/projects': 'Ctrl+3',
  '/skills': 'Ctrl+4',
  '/settings': 'Ctrl+5'
}

export function useShortcuts() {
  const router = useRouter()
  const sessionsStore = useSessionsStore()
  const workspaceStore = useWorkspaceStore()
  const shortcutHelp = useShortcutHelp()

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
            workspaceStore.closeTab(workspaceStore.layout.activePaneId, pane.activeTabId)
            if (workspaceStore.activeSessionRef) {
              sessionsStore.setActiveSessionRef(workspaceStore.activeSessionRef)
            }
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
