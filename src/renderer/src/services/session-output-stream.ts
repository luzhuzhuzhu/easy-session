import { onSessionOutput, type OutputEvent } from '@/api/local-session'
import {
  buildGlobalSessionKey,
  LOCAL_INSTANCE_ID,
  type SessionRef
} from '../models/unified-resource'

type OutputListener = (event: OutputEvent) => void

const listenersByGlobalKey = new Map<string, Set<OutputListener>>()
let unlistenIpc: (() => void) | null = null

function resolveGlobalSessionKey(target: SessionRef | string): string {
  if (typeof target === 'string') {
    return buildGlobalSessionKey(LOCAL_INSTANCE_ID, target)
  }
  return target.globalSessionKey
}

function ensureBridge(): void {
  if (unlistenIpc) return

  unlistenIpc = onSessionOutput((event) => {
    const globalSessionKey = buildGlobalSessionKey(LOCAL_INSTANCE_ID, event.sessionId)
    const listeners = listenersByGlobalKey.get(globalSessionKey)
    if (!listeners || listeners.size === 0) return

    for (const listener of listeners) {
      listener(event)
    }
  })
}

export function subscribeSessionOutput(target: SessionRef | string, listener: OutputListener): () => void {
  ensureBridge()

  const globalSessionKey = resolveGlobalSessionKey(target)

  let listeners = listenersByGlobalKey.get(globalSessionKey)
  if (!listeners) {
    listeners = new Set<OutputListener>()
    listenersByGlobalKey.set(globalSessionKey, listeners)
  }
  listeners.add(listener)

  return () => {
    const current = listenersByGlobalKey.get(globalSessionKey)
    if (!current) return
    current.delete(listener)
    if (current.size === 0) {
      listenersByGlobalKey.delete(globalSessionKey)
    }
  }
}
