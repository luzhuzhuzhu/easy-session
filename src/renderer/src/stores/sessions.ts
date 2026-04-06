import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  createSession as apiCreateSession,
  destroySession as apiDestroySession,
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
} from '@/api/local-session'
import {
  buildGlobalSessionKey,
  LOCAL_INSTANCE_ID,
  toUnifiedSession,
  type SessionRef,
  type UnifiedSession
} from '../models/unified-resource'
import { getSharedGatewayResolver } from '../gateways'
import type { GatewayCreateSessionParams } from '../gateways/types'
import { useInstancesStore } from './instances'

export type { Session, OutputLine }
export type { UnifiedSession, SessionRef }

function toLocalSession(session: UnifiedSession): Session {
  return {
    id: session.sessionId,
    name: session.name,
    icon: session.icon,
    type: session.type,
    projectPath: session.projectPath,
    status: session.status,
    createdAt: session.createdAt,
    lastStartAt: session.lastStartAt,
    totalRunMs: session.totalRunMs,
    lastRunMs: session.lastRunMs,
    lastActiveAt: session.lastActiveAt,
    processId: session.processId,
    options: session.options,
    parentId: session.parentId,
    claudeSessionId: session.claudeSessionId,
    codexSessionId: session.codexSessionId,
    opencodeSessionId: session.opencodeSessionId
  }
}

function toCreateSessionParams(params: GatewayCreateSessionParams): CreateSessionParams {
  if (!params.projectPath) {
    throw new Error('本地创建会话时必须提供 projectPath')
  }

  return {
    type: params.type,
    projectPath: params.projectPath,
    name: params.name,
    icon: params.icon,
    options: params.options,
    parentId: params.parentId,
    startPaused: params.startPaused
  }
}

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<Session[]>([])
  const activeGlobalSessionKeyState = ref<string | null>(null)
  const remoteSessionsByInstance = ref<Record<string, UnifiedSession[]>>({})
  const sessionCollectionVersion = ref(0)

  let cleanupStatus: (() => void) | null = null
  const remoteStatusCleanups = new Map<string, () => void>()
  const resolver = getSharedGatewayResolver()

  const unifiedSessions = computed<UnifiedSession[]>(() =>
    [
      ...sessions.value.map((session) => toUnifiedSession(session)),
      ...Object.values(remoteSessionsByInstance.value).flat()
    ]
  )

  const sessionIndexByGlobalKey = computed<Record<string, UnifiedSession>>(() =>
    Object.fromEntries(unifiedSessions.value.map((session) => [session.globalSessionKey, session]))
  )

  const activeUnifiedSession = computed<UnifiedSession | null>(() => {
    if (!activeGlobalSessionKeyState.value) return null
    return sessionIndexByGlobalKey.value[activeGlobalSessionKeyState.value] ?? null
  })

  const activeSessionId = computed<string | null>(() => activeUnifiedSession.value?.sessionId ?? null)
  const activeGlobalSessionKey = computed<string | null>(() => activeGlobalSessionKeyState.value)
  const activeSessionRef = computed<SessionRef | null>(() => {
    const session = activeUnifiedSession.value
    if (!session) return null
    return {
      instanceId: session.instanceId,
      sessionId: session.sessionId,
      globalSessionKey: session.globalSessionKey
    }
  })

  function bumpSessionCollectionVersion(): void {
    sessionCollectionVersion.value += 1
  }

  function toSessionRef(session: Pick<UnifiedSession, 'instanceId' | 'sessionId' | 'globalSessionKey'>): SessionRef {
    return {
      instanceId: session.instanceId,
      sessionId: session.sessionId,
      globalSessionKey: session.globalSessionKey
    }
  }

  async function syncWorkspaceAfterSessionMutation(preferredSessionRef?: SessionRef | null): Promise<void> {
    const [{ useWorkspaceStore }, { useSettingsStore }] = await Promise.all([
      import('./workspace'),
      import('./settings')
    ])

    const workspaceStore = useWorkspaceStore()
    const settingsStore = useSettingsStore()
    const validGlobalSessionKeys = unifiedSessions.value.map((session) => session.globalSessionKey)
    const preserveInstanceIds = new Set(
      useInstancesStore().remoteInstances
        .filter((instance) => instance.status !== 'online')
        .map((instance) => instance.id)
    )

    if (!settingsStore.settings.desktopRemoteMountEnabled) {
      for (const tab of Object.values(workspaceStore.layout.tabs)) {
        if (tab.instanceId !== LOCAL_INSTANCE_ID) {
          preserveInstanceIds.add(tab.instanceId)
        }
      }
    }

    const fallbackSessionRef =
      preferredSessionRef ??
      activeSessionRef.value ??
      (unifiedSessions.value[0] ? toSessionRef(unifiedSessions.value[0]) : undefined)

    workspaceStore.reconcileSessionRefs(validGlobalSessionKeys, {
      fallbackSessionRef: fallbackSessionRef ?? undefined,
      preserveInstanceIds: [...preserveInstanceIds]
    })

    if (workspaceStore.activeSessionRef) {
      activeGlobalSessionKeyState.value = workspaceStore.activeSessionRef.globalSessionKey
      return
    }

    if (fallbackSessionRef && validGlobalSessionKeys.includes(fallbackSessionRef.globalSessionKey)) {
      activeGlobalSessionKeyState.value = fallbackSessionRef.globalSessionKey
      return
    }

    if (activeGlobalSessionKeyState.value && !validGlobalSessionKeys.includes(activeGlobalSessionKeyState.value)) {
      activeGlobalSessionKeyState.value = null
    }
  }

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
    for (const cleanup of remoteStatusCleanups.values()) {
      cleanup()
    }
    remoteStatusCleanups.clear()
  }

  async function fetchSessions(filter?: SessionFilter) {
    ensureListeners()
    const gateway = await resolver.resolve(LOCAL_INSTANCE_ID)
    sessions.value = (await gateway.listSessions(LOCAL_INSTANCE_ID, filter)).map((session) => toLocalSession(session))
    bumpSessionCollectionVersion()
  }

  async function ensureRemoteStatusListener(instanceId: string): Promise<void> {
    if (instanceId === LOCAL_INSTANCE_ID || remoteStatusCleanups.has(instanceId)) return
    const gateway = await resolver.resolve(instanceId)
    const cleanup = gateway.subscribeStatus(instanceId, (event) => {
      const current = remoteSessionsByInstance.value[event.instanceId] || []
      remoteSessionsByInstance.value = {
        ...remoteSessionsByInstance.value,
        [event.instanceId]: current.map((session) =>
          session.sessionId === event.sessionId
            ? { ...session, status: event.status }
            : session
        )
      }
    })
    remoteStatusCleanups.set(instanceId, cleanup)
  }

  async function fetchSessionsForInstance(instanceId: string, filter?: SessionFilter): Promise<UnifiedSession[]> {
    if (instanceId === LOCAL_INSTANCE_ID) {
      await fetchSessions(filter)
      return unifiedSessions.value.filter((session) => session.instanceId === LOCAL_INSTANCE_ID)
    }

    await ensureRemoteStatusListener(instanceId)
    const gateway = await resolver.resolve(instanceId)
    const remoteSessions = await gateway.listSessions(instanceId, filter)
    const instancesStore = useInstancesStore()
    instancesStore.markRemoteFetchSuccess(instanceId)
    remoteSessionsByInstance.value = {
      ...remoteSessionsByInstance.value,
      [instanceId]: remoteSessions
    }
    bumpSessionCollectionVersion()
    try {
      const capabilitySnapshot = await gateway.getCapabilities(instanceId)
      instancesStore.syncRemoteCapabilities(instanceId, capabilitySnapshot)
    } catch {
      // 不让 capability 同步失败影响远程会话主链
    }
    return remoteSessions
  }

  async function fetchAllSessions(instanceIds?: string[], filter?: SessionFilter): Promise<UnifiedSession[]> {
    const targets =
      instanceIds ??
      useInstancesStore().instances
        .filter((instance) => instance.type === 'local' || instance.enabled)
        .map((instance) => instance.id)

    const targetSet = new Set(targets)
    for (const existingInstanceId of Object.keys(remoteSessionsByInstance.value)) {
      if (targetSet.has(existingInstanceId)) continue
      clearRemoteSessions(existingInstanceId)
    }

    await Promise.allSettled(
      targets.map(async (instanceId) => {
        try {
          await fetchSessionsForInstance(instanceId, filter)
        } catch (error) {
          useInstancesStore().markRemoteFetchFailure(instanceId, error)
          // 保留该实例上次已知数据，不让单个远程故障拖垮整页聚合
        }
      })
    )
    return unifiedSessions.value
  }

  function clearRemoteSessions(instanceId?: string): void {
    if (!instanceId) {
      remoteSessionsByInstance.value = {}
      bumpSessionCollectionVersion()
      for (const cleanup of remoteStatusCleanups.values()) {
        cleanup()
      }
      remoteStatusCleanups.clear()
      resolver.invalidate()
      return
    }

    if (instanceId === LOCAL_INSTANCE_ID) return
    const cleanup = remoteStatusCleanups.get(instanceId)
    cleanup?.()
    remoteStatusCleanups.delete(instanceId)
    const next = { ...remoteSessionsByInstance.value }
    delete next[instanceId]
    remoteSessionsByInstance.value = next
    bumpSessionCollectionVersion()
    resolver.invalidate(instanceId)
  }

  function upsertRemoteSession(instanceId: string, session: UnifiedSession): void {
    const current = remoteSessionsByInstance.value[instanceId] || []
    const next = [...current]
    const index = next.findIndex((item) => item.globalSessionKey === session.globalSessionKey)
    if (index === -1) {
      next.push(session)
    } else {
      next[index] = session
    }
    remoteSessionsByInstance.value = {
      ...remoteSessionsByInstance.value,
      [instanceId]: next
    }
    bumpSessionCollectionVersion()
  }

  function removeSessionRefFromState(sessionRef: SessionRef): void {
    if (sessionRef.instanceId === LOCAL_INSTANCE_ID) {
      sessions.value = sessions.value.filter((session) => session.id !== sessionRef.sessionId)
      bumpSessionCollectionVersion()
      return
    }

    const current = remoteSessionsByInstance.value[sessionRef.instanceId] || []
    remoteSessionsByInstance.value = {
      ...remoteSessionsByInstance.value,
      [sessionRef.instanceId]: current.filter((session) => session.sessionId !== sessionRef.sessionId)
    }
    bumpSessionCollectionVersion()
  }

  async function createSessionForInstance(
    instanceId: string,
    params: GatewayCreateSessionParams,
    opts?: { activate?: boolean }
  ): Promise<UnifiedSession> {
    ensureListeners()
    const shouldActivate = opts?.activate ?? true

    if (instanceId === LOCAL_INSTANCE_ID) {
      const session = await apiCreateSession(toCreateSessionParams(params))
      sessions.value.push(session)
      bumpSessionCollectionVersion()
      if (shouldActivate) {
        activeGlobalSessionKeyState.value = buildGlobalSessionKey(LOCAL_INSTANCE_ID, session.id)
      }
      const unifiedSession = toUnifiedSession(session)
      await syncWorkspaceAfterSessionMutation(shouldActivate ? toSessionRef(unifiedSession) : activeSessionRef.value)
      return unifiedSession
    }

    const gateway = await resolver.resolve(instanceId)
    const session = await gateway.createSession(instanceId, params)
    upsertRemoteSession(instanceId, session)
    useInstancesStore().markRemoteFetchSuccess(instanceId)
    if (shouldActivate) {
      activeGlobalSessionKeyState.value = session.globalSessionKey
    }
    await syncWorkspaceAfterSessionMutation(shouldActivate ? toSessionRef(session) : activeSessionRef.value)
    return session
  }

  async function createSession(params: CreateSessionParams, opts?: { activate?: boolean }) {
    const session = await createSessionForInstance(
      LOCAL_INSTANCE_ID,
      {
        type: params.type,
        projectPath: params.projectPath,
        name: params.name,
        icon: params.icon,
        options: params.options,
        parentId: params.parentId,
        startPaused: params.startPaused
      },
      opts
    )
    return toLocalSession(session)
  }

  async function destroySession(id: string) {
    ensureListeners()
    const ok = await apiDestroySession(id)
    if (!ok) {
      throw new Error('Failed to destroy session')
    }

    sessions.value = sessions.value.filter((s) => s.id !== id)
    bumpSessionCollectionVersion()
    if (activeGlobalSessionKeyState.value === buildGlobalSessionKey(LOCAL_INSTANCE_ID, id)) {
      activeGlobalSessionKeyState.value =
        sessions.value.length > 0 ? buildGlobalSessionKey(LOCAL_INSTANCE_ID, sessions.value[0].id) : null
    }
  }

  function setActiveSession(id: string) {
    setActiveSessionRef(getSessionRef(id))
  }

  function setActiveSessionRef(sessionRef: SessionRef | null): void {
    activeGlobalSessionKeyState.value = sessionRef?.globalSessionKey ?? null
  }

  function getSessionRef(sessionId: string): SessionRef {
    return {
      instanceId: LOCAL_INSTANCE_ID,
      sessionId,
      globalSessionKey: buildGlobalSessionKey(LOCAL_INSTANCE_ID, sessionId)
    }
  }

  function getUnifiedSession(globalSessionKey: string): UnifiedSession | null {
    return sessionIndexByGlobalKey.value[globalSessionKey] ?? null
  }

  function getSessionRefByGlobalKey(globalSessionKey: string): SessionRef | null {
    const session = getUnifiedSession(globalSessionKey)
    if (!session) return null
    return {
      instanceId: session.instanceId,
      sessionId: session.sessionId,
      globalSessionKey: session.globalSessionKey
    }
  }

  function assertLocalSessionRef(sessionRef: SessionRef, action: string): void {
    if (sessionRef.instanceId !== LOCAL_INSTANCE_ID) {
      throw new Error(`${action} 当前仅支持本地会话`)
    }
  }

  async function sendInput(id: string, input: string) {
    return apiSendInput(id, input)
  }

  async function clearSessionOutput(id: string) {
    await clearOutput(id)
  }

  async function clearSessionOutputRef(sessionRef: SessionRef): Promise<void> {
    assertLocalSessionRef(sessionRef, '清空输出')
    await clearSessionOutput(sessionRef.sessionId)
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
    if (idx !== -1 && updated) sessions.value[idx] = updated
    return updated
  }

  async function restartSessionRef(sessionRef: SessionRef) {
    if (sessionRef.instanceId === LOCAL_INSTANCE_ID) {
      const updated = await restartSession(sessionRef.sessionId)
      await syncWorkspaceAfterSessionMutation(sessionRef)
      return updated
    }

    const gateway = await resolver.resolve(sessionRef.instanceId)
    const updated = await gateway.restartSession(sessionRef.instanceId, sessionRef.sessionId)
    if (updated) {
      upsertRemoteSession(sessionRef.instanceId, updated)
    } else {
      await fetchSessionsForInstance(sessionRef.instanceId)
    }
    await syncWorkspaceAfterSessionMutation(sessionRef)
    return updated ? toLocalSession(updated) : null
  }

  async function startSession(id: string) {
    ensureListeners()
    const updated = await apiStartSession(id)
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1 && updated) sessions.value[idx] = updated
    return updated
  }

  async function startSessionRef(sessionRef: SessionRef) {
    if (sessionRef.instanceId === LOCAL_INSTANCE_ID) {
      const updated = await startSession(sessionRef.sessionId)
      await syncWorkspaceAfterSessionMutation(sessionRef)
      return updated
    }

    const gateway = await resolver.resolve(sessionRef.instanceId)
    const updated = await gateway.startSession(sessionRef.instanceId, sessionRef.sessionId)
    if (updated) {
      upsertRemoteSession(sessionRef.instanceId, updated)
    } else {
      await fetchSessionsForInstance(sessionRef.instanceId)
    }
    await syncWorkspaceAfterSessionMutation(sessionRef)
    return updated ? toLocalSession(updated) : null
  }

  async function pauseSession(id: string) {
    ensureListeners()
    const updated = await apiPauseSession(id)
    const idx = sessions.value.findIndex((s) => s.id === id)
    if (idx !== -1 && updated) sessions.value[idx] = updated
    return updated
  }

  async function pauseSessionRef(sessionRef: SessionRef) {
    if (sessionRef.instanceId === LOCAL_INSTANCE_ID) {
      const updated = await pauseSession(sessionRef.sessionId)
      await syncWorkspaceAfterSessionMutation(sessionRef)
      return updated
    }

    const gateway = await resolver.resolve(sessionRef.instanceId)
    const updated = await gateway.pauseSession(sessionRef.instanceId, sessionRef.sessionId)
    if (updated) {
      upsertRemoteSession(sessionRef.instanceId, updated)
    } else {
      await fetchSessionsForInstance(sessionRef.instanceId)
    }
    await syncWorkspaceAfterSessionMutation(sessionRef)
    return updated ? toLocalSession(updated) : null
  }

  async function destroySessionRef(sessionRef: SessionRef): Promise<void> {
    if (sessionRef.instanceId === LOCAL_INSTANCE_ID) {
      await destroySession(sessionRef.sessionId)
      await syncWorkspaceAfterSessionMutation(activeSessionRef.value)
      return
    }

    const gateway = await resolver.resolve(sessionRef.instanceId)
    const deleted = await gateway.destroySession(sessionRef.instanceId, sessionRef.sessionId)
    if (!deleted) {
      throw new Error('Failed to destroy session')
    }

    removeSessionRefFromState(sessionRef)
    if (activeGlobalSessionKeyState.value === sessionRef.globalSessionKey) {
      const fallback = unifiedSessions.value.find((session) => session.globalSessionKey !== sessionRef.globalSessionKey) ?? null
      activeGlobalSessionKeyState.value = fallback?.globalSessionKey ?? null
    }
    await syncWorkspaceAfterSessionMutation(activeSessionRef.value)
  }

  async function renameSessionRef(sessionRef: SessionRef, name: string): Promise<boolean> {
    assertLocalSessionRef(sessionRef, '重命名会话')
    return renameSession(sessionRef.sessionId, name)
  }

  async function updateSessionIconRef(sessionRef: SessionRef, icon: string | null): Promise<boolean> {
    assertLocalSessionRef(sessionRef, '修改会话图标')
    return updateSessionIcon(sessionRef.sessionId, icon)
  }

  return {
    sessions,
    remoteSessionsByInstance,
    unifiedSessions,
    sessionIndexByGlobalKey,
    sessionCollectionVersion,
    activeSessionId,
    activeGlobalSessionKey,
    activeSessionRef,
    activeUnifiedSession,
    fetchSessions,
    fetchSessionsForInstance,
    fetchAllSessions,
    createSession,
    createSessionForInstance,
    destroySession,
    destroySessionRef,
    startSession,
    startSessionRef,
    pauseSession,
    pauseSessionRef,
    restartSession,
    restartSessionRef,
    setActiveSession,
    setActiveSessionRef,
    sendInput,
    clearSessionOutput,
    clearSessionOutputRef,
    renameSession,
    renameSessionRef,
    updateSessionIcon,
    updateSessionIconRef,
    clearRemoteSessions,
    getSessionRef,
    getSessionRefByGlobalKey,
    getUnifiedSession,
    dispose
  }
})


