import { onMounted, ref, watch, type ComputedRef } from 'vue'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import type { AppSettings } from '@/stores/settings'
import type { InstanceTreeGroup, ProjectSessionGroup } from '@/features/sessions/session-tree'
import type { SessionRef, UnifiedSession } from '@/models/unified-resource'

type SessionsStoreLike = {
  sessions: Array<{ id: string }>
  unifiedSessions: UnifiedSession[]
  sessionCollectionVersion: number
  activeSessionRef: SessionRef | null
  setActiveSession(sessionId: string): void
  setActiveSessionRef(sessionRef: SessionRef): void
  getSessionRefByGlobalKey(globalSessionKey: string): SessionRef | null
}

type WorkspaceStoreLike = {
  loaded: boolean
  paneIds: string[]
  activeSessionRef: SessionRef | null
  layout: {
    tabs: Record<string, { instanceId: string }>
  }
  load(): Promise<void>
  focusSessionRef(sessionRef: SessionRef): boolean
  openSessionInActivePane(sessionId: string): void
  openSessionRefInActivePane(sessionRef: SessionRef): void
  reconcileSessionRefs(
    validGlobalSessionKeys: string[],
    options: { fallbackSessionRef?: SessionRef; preserveInstanceIds?: string[] }
  ): void
}

type SettingsStoreLike = {
  loaded: boolean
  settings: AppSettings
  load(): Promise<void>
}

type InstancesStoreLike = {
  remoteInstances: Array<{ id: string; status: string }>
  remoteStateVersion: number
}

type UseSessionsPageCoordinationOptions = {
  route: RouteLocationNormalizedLoaded
  router: Router
  sessionsStore: SessionsStoreLike
  workspaceStore: WorkspaceStoreLike
  settingsStore: SettingsStoreLike
  instancesStore: InstancesStoreLike
  projectSessionTree: ComputedRef<ProjectSessionGroup[]>
  instanceTree: ComputedRef<InstanceTreeGroup[]>
  applyRouteSessionSelection: () => void
  reconcileWorkspaceSessions: () => void
  openCreateDialog: () => void
  reloadSessionTree: () => Promise<void>
  pruneTerminalFontSizeByPane: (activePaneIds: string[]) => void
}

export function useSessionsPageCoordination(options: UseSessionsPageCoordinationOptions) {
  const expandedProjectMap = ref<Record<string, boolean>>({})
  const expandedInstanceMap = ref<Record<string, boolean>>({})

  function isProjectExpanded(key: string): boolean {
    return expandedProjectMap.value[key] ?? true
  }

  function isInstanceExpanded(key: string): boolean {
    return expandedInstanceMap.value[key] ?? true
  }

  function toggleProjectExpand(key: string): void {
    expandedProjectMap.value[key] = !isProjectExpanded(key)
  }

  function toggleInstanceExpand(key: string): void {
    expandedInstanceMap.value[key] = !isInstanceExpanded(key)
  }

  watch(
    () => options.route.query.action,
    (action) => {
      if (action === 'create') {
        options.openCreateDialog()
        void options.router.replace({ path: '/sessions' })
      }
    },
    { immediate: true }
  )

  watch(
    options.projectSessionTree,
    (groups) => {
      const next: Record<string, boolean> = { ...expandedProjectMap.value }
      const keys = new Set(groups.map((group) => group.key))
      for (const group of groups) {
        if (!(group.key in next)) {
          next[group.key] = true
        }
      }
      for (const key of Object.keys(next)) {
        if (!keys.has(key)) delete next[key]
      }
      expandedProjectMap.value = next
    },
    { immediate: true }
  )

  watch(
    options.instanceTree,
    (groups) => {
      const next: Record<string, boolean> = { ...expandedInstanceMap.value }
      const keys = new Set(groups.map((group) => group.key))
      for (const group of groups) {
        if (!(group.key in next)) {
          next[group.key] = true
        }
      }
      for (const key of Object.keys(next)) {
        if (!keys.has(key)) delete next[key]
      }
      expandedInstanceMap.value = next
    },
    { immediate: true }
  )

  watch(
    [() => options.settingsStore.loaded, () => options.workspaceStore.loaded, () => options.workspaceStore.paneIds.join('|')],
    ([settingsLoaded, workspaceLoaded]) => {
      if (!settingsLoaded || !workspaceLoaded) return
      options.pruneTerminalFontSizeByPane(options.workspaceStore.paneIds)
    },
    { immediate: true }
  )

  watch(() => [options.route.query.sessionId, options.route.query.globalSessionKey], () => {
    options.applyRouteSessionSelection()
  })

  watch(
    () => [
      options.sessionsStore.sessionCollectionVersion,
      options.instancesStore.remoteStateVersion
    ],
    () => {
      options.reconcileWorkspaceSessions()
    }
  )

  watch(
    () => options.workspaceStore.activeSessionRef,
    (sessionRef) => {
      if (sessionRef) {
        options.sessionsStore.setActiveSessionRef(sessionRef)
      }
    }
  )

  onMounted(async () => {
    if (!options.settingsStore.loaded) await options.settingsStore.load()
    await options.workspaceStore.load()
    await options.reloadSessionTree()
  })

  return {
    expandedProjectMap,
    expandedInstanceMap,
    isProjectExpanded,
    isInstanceExpanded,
    toggleProjectExpand,
    toggleInstanceExpand
  }
}
