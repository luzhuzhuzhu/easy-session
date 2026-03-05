import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'

const NAV_SHORTCUTS: Record<string, string> = {
  '1': '/dashboard',
  '2': '/dashboard?panel=advanced',
  '3': '/sessions',
  '4': '/projects',
  '5': '/skills'
}

export const SHORTCUT_LABELS: Record<string, string> = {
  '/dashboard': 'Ctrl+1',
  '/sessions': 'Ctrl+3',
  '/projects': 'Ctrl+4',
  '/skills': 'Ctrl+5',
  '/settings': 'Ctrl+,'
}

export function useShortcuts() {
  const router = useRouter()
  const sessionsStore = useSessionsStore()
  const workspaceStore = useWorkspaceStore()

  function handler(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

    const isPrimary = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()

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
        if (router.currentRoute.value.path === '/sessions' && sessionsStore.activeSessionId) {
          void sessionsStore.destroySession(sessionsStore.activeSessionId).catch(() => {})
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

    if (e.key === 'Escape') {
      const overlay = document.querySelector('.dialog-overlay') as HTMLElement
      if (overlay) {
        e.preventDefault()
        overlay.click()
      }
    }
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))
}
