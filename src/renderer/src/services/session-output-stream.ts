import { onSessionOutput, type OutputEvent } from '@/api/session'

type OutputListener = (event: OutputEvent) => void

const listenersBySession = new Map<string, Set<OutputListener>>()
let unlistenIpc: (() => void) | null = null

function ensureBridge(): void {
  if (unlistenIpc) return

  unlistenIpc = onSessionOutput((event) => {
    const listeners = listenersBySession.get(event.sessionId)
    if (!listeners || listeners.size === 0) return

    for (const listener of listeners) {
      listener(event)
    }
  })
}

export function subscribeSessionOutput(sessionId: string, listener: OutputListener): () => void {
  ensureBridge()

  let listeners = listenersBySession.get(sessionId)
  if (!listeners) {
    listeners = new Set<OutputListener>()
    listenersBySession.set(sessionId, listeners)
  }
  listeners.add(listener)

  return () => {
    const current = listenersBySession.get(sessionId)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) {
      listenersBySession.delete(sessionId)
    }
  }
}
