import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  createSession as apiCreateSession,
  destroySession as apiDestroySession,
  listSessions as apiListSessions,
  sendInput as apiSendInput,
  clearOutput,
  renameSession as apiRenameSession,
  updateSessionIcon as apiUpdateSessionIcon,
  restartSession as apiRestartSession,
  startSession as apiStartSession,
  pauseSession as apiPauseSession,
  onSessionStatusChange,
  type Session,
  type CreateSessionParams,
  type SessionFilter,
  type OutputLine
} from '@/api/session'

export type { Session, OutputLine }

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<Session[]>([])
  const activeSessionId = ref<string | null>(null)

  let cleanupStatus: (() => void) | null = null

  function ensureListeners() {
    if (cleanupStatus) return

    cleanupStatus = onSessionStatusChange(({ sessionId, status }) => {
      const session = sessions.value.find((s) => s.id === sessionId)
      if (session) session.status = status
    })
  }

  function dispose() {
    cleanupStatus?.()
    cleanupStatus = null
  }

  async function fetchSessions(filter?: SessionFilter) {
    ensureListeners()
    sessions.value = await apiListSessions(filter)
  }

  async function createSession(params: CreateSessionParams, opts?: { activate?: boolean }) {
    ensureListeners()
    const shouldActivate = opts?.activate ?? true
    const session = await apiCreateSession(params)
    sessions.value.push(session)
    if (shouldActivate) {
      activeSessionId.value = session.id
    }
    return session
  }

  async function destroySession(id: string) {
    ensureListeners()
    const ok = await apiDestroySession(id)
    if (!ok) {
      throw new Error('Failed to destroy session')
    }

    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (activeSessionId.value === id) {
      activeSessionId.value = sessions.value.length > 0 ? sessions.value[0].id : null
    }
  }

  function setActiveSession(id: string) {
    activeSessionId.value = id
  }

  async function sendInput(id: string, input: string) {
    return apiSendInput(id, input)
  }

  async function clearSessionOutput(id: string) {
    await clearOutput(id)
  }

  async function renameSession(id: string, name: string) {
    const ok = await apiRenameSession(id, name)
    if (ok) {
      const session = sessions.value.find((s) => s.id === id)
      if (session) session.name = name
    }
    return ok
  }

  async function updateSessionIcon(id: string, icon: string | null) {
    const ok = await apiUpdateSessionIcon(id, icon)
    if (ok) {
      const session = sessions.value.find((s) => s.id === id)
      if (session) session.icon = icon
    }
    return ok
  }

  async function restartSession(id: string) {
    ensureListeners()
    const updated = await apiRestartSession(id)
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1) sessions.value[idx] = updated
    return updated
  }

  async function startSession(id: string) {
    ensureListeners()
    const updated = await apiStartSession(id)
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1) sessions.value[idx] = updated
    return updated
  }

  async function pauseSession(id: string) {
    ensureListeners()
    const updated = await apiPauseSession(id)
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1) sessions.value[idx] = updated
    return updated
  }

  return {
    sessions,
    activeSessionId,
    fetchSessions,
    createSession,
    destroySession,
    startSession,
    pauseSession,
    restartSession,
    setActiveSession,
    sendInput,
    clearSessionOutput,
    renameSession,
    updateSessionIcon,
    dispose
  }
})
