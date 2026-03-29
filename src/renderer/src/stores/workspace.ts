import { computed, ref, toRaw } from 'vue'
import { defineStore } from 'pinia'
import {
  getWorkspaceLayout,
  resetWorkspaceLayout,
  updateWorkspaceLayout,
  type WorkspaceLayoutNode,
  type WorkspaceLayoutState,
  type WorkspaceTabState,
  type WorkspaceLeafNode,
  type WorkspaceSplitDirection
} from '@/api/workspace'
import { buildGlobalSessionKey, LOCAL_INSTANCE_ID, type SessionRef } from '../models/unified-resource'
import { useInstancesStore } from './instances'
import { useSessionsStore } from './sessions'
import { useSettingsStore } from './settings'

const PERSIST_DEBOUNCE_MS = 200
const HISTORY_LIMIT = 20

function cloneLayout(layout: WorkspaceLayoutState): WorkspaceLayoutState {
  const raw = toRaw(layout)
  if (typeof structuredClone === 'function') {
    return structuredClone(raw) as WorkspaceLayoutState
  }
  return JSON.parse(JSON.stringify(raw)) as WorkspaceLayoutState
}

function layoutEquals(a: WorkspaceLayoutState, b: WorkspaceLayoutState): boolean {
  return JSON.stringify(toRaw(a)) === JSON.stringify(toRaw(b))
}

function createDefaultLayout(): WorkspaceLayoutState {
  return {
    version: 2,
    root: {
      type: 'leaf',
      paneId: 'pane-1',
      activeTabId: null,
      tabs: []
    },
    tabs: {},
    activePaneId: 'pane-1'
  }
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.max(0.15, Math.min(0.85, value))
}

function visitLeaves(node: WorkspaceLayoutNode, leaves: WorkspaceLeafNode[]): void {
  if (node.type === 'leaf') {
    leaves.push(node)
    return
  }
  visitLeaves(node.first, leaves)
  visitLeaves(node.second, leaves)
}

function collectLeaves(node: WorkspaceLayoutNode): WorkspaceLeafNode[] {
  const leaves: WorkspaceLeafNode[] = []
  visitLeaves(node, leaves)
  return leaves
}

interface LeafLocation {
  leaf: WorkspaceLeafNode
  parent: WorkspaceLayoutNode | null
  isFirst: boolean
}

export interface WorkspaceResolvedTabState extends WorkspaceTabState {
  availability: 'ready' | 'offline' | 'missing'
  sessionRef: SessionRef
}

function findLeafByPaneId(
  node: WorkspaceLayoutNode,
  paneId: string,
  parent: WorkspaceLayoutNode | null = null,
  isFirst = false
): LeafLocation | null {
  if (node.type === 'leaf') {
    if (node.paneId === paneId) {
      return { leaf: node, parent, isFirst }
    }
    return null
  }

  return (
    findLeafByPaneId(node.first, paneId, node, true) ??
    findLeafByPaneId(node.second, paneId, node, false)
  )
}

function findParentOfNode(
  node: WorkspaceLayoutNode,
  target: WorkspaceLayoutNode,
  parent: WorkspaceLayoutNode | null = null,
  isFirst = false
): { parent: WorkspaceLayoutNode | null; isFirst: boolean } | null {
  if (node === target) {
    return { parent, isFirst }
  }
  if (node.type === 'leaf') return null
  return (
    findParentOfNode(node.first, target, node, true) ??
    findParentOfNode(node.second, target, node, false)
  )
}

function toLocalSessionRef(sessionId: string): SessionRef {
  return {
    instanceId: LOCAL_INSTANCE_ID,
    sessionId,
    globalSessionKey: buildGlobalSessionKey(LOCAL_INSTANCE_ID, sessionId)
  }
}

function normalizeWorkspaceTab(tabId: string, tab: WorkspaceTabState): WorkspaceTabState | null {
  if (!tab || typeof tab !== 'object' || typeof tab.sessionId !== 'string' || !tab.sessionId) {
    return null
  }

  const instanceId = typeof tab.instanceId === 'string' && tab.instanceId ? tab.instanceId : LOCAL_INSTANCE_ID
  const globalSessionKey =
    typeof tab.globalSessionKey === 'string' && tab.globalSessionKey
      ? tab.globalSessionKey
      : buildGlobalSessionKey(instanceId, tab.sessionId)

  return {
    id: tabId,
    resourceType: 'session',
    instanceId,
    sessionId: tab.sessionId,
    globalSessionKey,
    pinned: !!tab.pinned,
    createdAt: typeof tab.createdAt === 'number' && Number.isFinite(tab.createdAt) ? tab.createdAt : Date.now()
  }
}

function normalizeLayoutInPlace(next: WorkspaceLayoutState): WorkspaceLayoutState {
  next.version = 2

  const leaves: WorkspaceLeafNode[] = []
  visitLeaves(next.root, leaves)
  const usedPaneIds = new Set<string>()
  for (let i = 0; i < leaves.length; i += 1) {
    const leaf = leaves[i]
    let paneId = typeof leaf.paneId === 'string' && leaf.paneId ? leaf.paneId : `pane-${i + 1}`
    while (usedPaneIds.has(paneId)) {
      paneId = `${paneId}-dup`
    }
    leaf.paneId = paneId
    usedPaneIds.add(paneId)
  }

  const usedTabs = new Set<string>()
  const normalizedTabs: Record<string, WorkspaceTabState> = {}
  for (const [tabId, tab] of Object.entries(next.tabs || {})) {
    const normalized = normalizeWorkspaceTab(tabId, tab)
    if (normalized) {
      normalizedTabs[tabId] = normalized
    }
  }
  next.tabs = normalizedTabs

  for (const leaf of leaves) {
    const tabs = leaf.tabs.filter((tabId) => !!next.tabs[tabId])
    leaf.tabs = tabs
    if (leaf.activeTabId && !tabs.includes(leaf.activeTabId)) {
      leaf.activeTabId = tabs[0] ?? null
    }
    if (!leaf.activeTabId && tabs.length > 0) {
      leaf.activeTabId = tabs[0]
    }
    for (const tabId of tabs) {
      usedTabs.add(tabId)
    }
  }

  for (const tabId of Object.keys(next.tabs)) {
    if (!usedTabs.has(tabId)) {
      delete next.tabs[tabId]
    }
  }

  if (!leaves.some((leaf) => leaf.paneId === next.activePaneId)) {
    next.activePaneId = leaves[0]?.paneId ?? 'pane-1'
  }

  return next
}

function normalizeLayout(layout: WorkspaceLayoutState): WorkspaceLayoutState {
  return normalizeLayoutInPlace(cloneLayout(layout))
}

function genId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${Date.now().toString(36)}-${rand}`
}

function countLeaves(node: WorkspaceLayoutNode): number {
  if (node.type === 'leaf') return 1
  return countLeaves(node.first) + countLeaves(node.second)
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const layout = ref<WorkspaceLayoutState>(createDefaultLayout())
  const loaded = ref(false)
  const history = ref<WorkspaceLayoutState[]>([])
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const paneCount = computed(() => countLeaves(layout.value.root))
  const paneIds = computed(() => {
    return collectLeaves(layout.value.root).map((leaf) => leaf.paneId)
  })

  const activePane = computed(() => {
    const found = findLeafByPaneId(layout.value.root, layout.value.activePaneId)
    return found?.leaf ?? null
  })

  const activeSessionId = computed(() => {
    const pane = activePane.value
    if (!pane?.activeTabId) return null
    return layout.value.tabs[pane.activeTabId]?.sessionId ?? null
  })
  const activeGlobalSessionKey = computed(() => {
    const pane = activePane.value
    if (!pane?.activeTabId) return null
    return layout.value.tabs[pane.activeTabId]?.globalSessionKey ?? null
  })
  const activeSessionRef = computed<SessionRef | null>(() => {
    const pane = activePane.value
    if (!pane?.activeTabId) return null
    const tab = layout.value.tabs[pane.activeTabId]
    if (!tab) return null
    return {
      instanceId: tab.instanceId,
      sessionId: tab.sessionId,
      globalSessionKey: tab.globalSessionKey
    }
  })
  const resolvedTabs = computed<Record<string, WorkspaceResolvedTabState>>(() => {
    const sessionIndex = useSessionsStore().sessionIndexByGlobalKey
    const instanceIndex = useInstancesStore().instanceIndex
    const settingsStore = useSettingsStore()
    const remoteMountEnabled = settingsStore.settings.desktopRemoteMountEnabled
    const next: Record<string, WorkspaceResolvedTabState> = {}

    for (const [tabId, tab] of Object.entries(layout.value.tabs)) {
      const sessionRef: SessionRef = {
        instanceId: tab.instanceId,
        sessionId: tab.sessionId,
        globalSessionKey: tab.globalSessionKey
      }

      let availability: WorkspaceResolvedTabState['availability'] = 'ready'
      if (!sessionIndex[tab.globalSessionKey]) {
        const instance = instanceIndex[tab.instanceId]
        if (tab.instanceId !== LOCAL_INSTANCE_ID && !remoteMountEnabled) {
          availability = 'offline'
        } else if (instance?.type === 'remote' && instance.status !== 'online') {
          availability = 'offline'
        } else {
          availability = 'missing'
        }
      }

      next[tabId] = {
        ...tab,
        availability,
        sessionRef
      }
    }

    return next
  })
  const canUndo = computed(() => history.value.length > 0)
  const undoDepth = computed(() => history.value.length)

  function schedulePersist(): void {
    if (persistTimer) {
      clearTimeout(persistTimer)
    }
    persistTimer = setTimeout(() => {
      persistTimer = null
      void updateWorkspaceLayout(cloneLayout(layout.value))
    }, PERSIST_DEBOUNCE_MS)
  }

  async function load(): Promise<void> {
    try {
      layout.value = normalizeLayout(await getWorkspaceLayout())
      history.value = []
    } catch {
      layout.value = createDefaultLayout()
      history.value = []
    } finally {
      loaded.value = true
    }
  }

  function pushHistory(snapshot: WorkspaceLayoutState): void {
    history.value.push(snapshot)
    if (history.value.length > HISTORY_LIMIT) {
      history.value.splice(0, history.value.length - HISTORY_LIMIT)
    }
  }

  function mutate(
    mutator: (draft: WorkspaceLayoutState) => void,
    options: { trackHistory?: boolean; persist?: boolean } = {}
  ): void {
    const { trackHistory = true, persist = true } = options
    const previous = cloneLayout(layout.value)
    const draft = cloneLayout(layout.value)
    mutator(draft)
    const next = normalizeLayoutInPlace(draft)
    if (layoutEquals(previous, next)) return
    if (trackHistory) {
      pushHistory(previous)
    }
    layout.value = next
    if (persist) {
      schedulePersist()
    }
  }

  function getOrCreatePaneId(): string {
    if (findLeafByPaneId(layout.value.root, layout.value.activePaneId)) {
      return layout.value.activePaneId
    }
    const leaves: WorkspaceLeafNode[] = []
    visitLeaves(layout.value.root, leaves)
    return leaves[0]?.paneId ?? 'pane-1'
  }

  function ensureTabForSessionRef(draft: WorkspaceLayoutState, sessionRef: SessionRef): string {
    for (const [tabId, tab] of Object.entries(draft.tabs)) {
      if (tab.globalSessionKey === sessionRef.globalSessionKey) return tabId
    }
    const tabId = genId('tab')
    draft.tabs[tabId] = {
      id: tabId,
      resourceType: 'session',
      instanceId: sessionRef.instanceId,
      sessionId: sessionRef.sessionId,
      globalSessionKey: sessionRef.globalSessionKey,
      pinned: false,
      createdAt: Date.now()
    }
    return tabId
  }

  function findTabLocationBySessionRef(
    draft: WorkspaceLayoutState,
    sessionRef: SessionRef
  ): { leaf: WorkspaceLeafNode; tabId: string } | null {
    const leaves = collectLeaves(draft.root)
    for (const leaf of leaves) {
      for (const tabId of leaf.tabs) {
        const tab = draft.tabs[tabId]
        if (tab?.globalSessionKey === sessionRef.globalSessionKey) {
          return { leaf, tabId }
        }
      }
    }
    return null
  }

  function focusPane(paneId: string): void {
    mutate((draft) => {
      if (!findLeafByPaneId(draft.root, paneId)) return
      draft.activePaneId = paneId
    }, { trackHistory: false })
  }

  function setActiveTab(paneId: string, tabId: string): void {
    mutate((draft) => {
      const found = findLeafByPaneId(draft.root, paneId)
      if (!found || !found.leaf.tabs.includes(tabId)) return
      found.leaf.activeTabId = tabId
      draft.activePaneId = paneId
    }, { trackHistory: false })
  }

  function openSessionRefInPane(sessionRef: SessionRef, paneId: string): void {
    mutate((draft) => {
      const found = findLeafByPaneId(draft.root, paneId)
      if (!found) return
      const tabId = ensureTabForSessionRef(draft, sessionRef)
      const previousTabsInTarget = [...found.leaf.tabs]

      // Keep one physical tab instance for one session across panes.
      // Opening in another pane acts as move+focus, avoiding duplicated tab IDs.
      const leaves = collectLeaves(draft.root)
      for (const leaf of leaves) {
        if (!leaf.tabs.includes(tabId)) continue
        leaf.tabs = leaf.tabs.filter((existing) => existing !== tabId)
        if (leaf.activeTabId === tabId) {
          leaf.activeTabId = leaf.tabs[0] ?? null
        }
      }

      // UX rule: one visible session per pane (no secondary tab strip in pane).
      found.leaf.tabs = [tabId]
      found.leaf.activeTabId = tabId
      draft.activePaneId = paneId

      for (const removedTabId of previousTabsInTarget) {
        if (removedTabId === tabId) continue
        const stillUsed = leaves.some((leaf) => leaf.tabs.includes(removedTabId))
        if (!stillUsed) {
          delete draft.tabs[removedTabId]
        }
      }
    }, { trackHistory: false })
  }

  function openSessionInPane(sessionId: string, paneId: string): void {
    openSessionRefInPane(toLocalSessionRef(sessionId), paneId)
  }

  function openSessionRefInActivePane(sessionRef: SessionRef): void {
    openSessionRefInPane(sessionRef, getOrCreatePaneId())
  }

  function focusSessionRef(sessionRef: SessionRef): boolean {
    let focused = false
    mutate((draft) => {
      const located = findTabLocationBySessionRef(draft, sessionRef)
      if (!located) return
      located.leaf.activeTabId = located.tabId
      draft.activePaneId = located.leaf.paneId
      focused = true
    }, { trackHistory: false })
    return focused
  }

  function openSessionInActivePane(sessionId: string): void {
    openSessionRefInActivePane(toLocalSessionRef(sessionId))
  }

  function detachTabFromPane(leaf: WorkspaceLeafNode, tabId: string): void {
    leaf.tabs = leaf.tabs.filter((id) => id !== tabId)
    if (leaf.activeTabId === tabId) {
      leaf.activeTabId = leaf.tabs[0] ?? null
    }
  }

  function ensureActiveTab(leaf: WorkspaceLeafNode): void {
    if (leaf.activeTabId && leaf.tabs.includes(leaf.activeTabId)) return
    leaf.activeTabId = leaf.tabs[0] ?? null
  }

  function moveTabToPane(params: {
    fromPaneId: string
    toPaneId: string
    tabId: string
    toIndex?: number
  }): void {
    mutate((draft) => {
      const from = findLeafByPaneId(draft.root, params.fromPaneId)?.leaf
      const to = findLeafByPaneId(draft.root, params.toPaneId)?.leaf
      if (!from || !to) return
      if (!from.tabs.includes(params.tabId)) return

      const samePane = from.paneId === to.paneId
      const sourceIndex = from.tabs.indexOf(params.tabId)
      let targetIndex = typeof params.toIndex === 'number' ? params.toIndex : to.tabs.length

      if (samePane) {
        from.tabs.splice(sourceIndex, 1)
        if (targetIndex > sourceIndex) targetIndex -= 1
        targetIndex = Math.max(0, Math.min(targetIndex, from.tabs.length))
        from.tabs.splice(targetIndex, 0, params.tabId)
        from.activeTabId = params.tabId
        draft.activePaneId = from.paneId
        return
      }

      detachTabFromPane(from, params.tabId)
      targetIndex = Math.max(0, Math.min(targetIndex, to.tabs.length))
      to.tabs.splice(targetIndex, 0, params.tabId)
      to.activeTabId = params.tabId
      draft.activePaneId = to.paneId
      ensureActiveTab(from)
    })
  }

  function splitPane(paneId: string, direction: WorkspaceSplitDirection): void {
    mutate((draft) => {
      const found = findLeafByPaneId(draft.root, paneId)
      if (!found) return

      const newPaneId = genId('pane')
      const replacement: WorkspaceLayoutNode = {
        type: 'split',
        direction,
        ratio: 0.5,
        first: {
          type: 'leaf',
          paneId: found.leaf.paneId,
          activeTabId: found.leaf.activeTabId,
          tabs: [...found.leaf.tabs]
        },
        second: {
          type: 'leaf',
          paneId: newPaneId,
          activeTabId: null,
          tabs: []
        }
      }

      const parentLink = findParentOfNode(draft.root, found.leaf)
      if (!parentLink || !parentLink.parent) {
        draft.root = replacement
      } else if (parentLink.parent.type === 'split') {
        if (parentLink.isFirst) parentLink.parent.first = replacement
        else parentLink.parent.second = replacement
      }

      draft.activePaneId = newPaneId
    })
  }

  function splitPaneAndMoveTab(params: {
    targetPaneId: string
    sourcePaneId: string
    tabId: string
    direction: WorkspaceSplitDirection
  }): void {
    mutate((draft) => {
      const target = findLeafByPaneId(draft.root, params.targetPaneId)
      const source = findLeafByPaneId(draft.root, params.sourcePaneId)
      if (!target || !source) return
      if (!source.leaf.tabs.includes(params.tabId)) return

      const newPaneId = genId('pane')
      const replacement: WorkspaceLayoutNode = {
        type: 'split',
        direction: params.direction,
        ratio: 0.5,
        first: {
          type: 'leaf',
          paneId: target.leaf.paneId,
          activeTabId: target.leaf.activeTabId,
          tabs: [...target.leaf.tabs]
        },
        second: {
          type: 'leaf',
          paneId: newPaneId,
          activeTabId: null,
          tabs: []
        }
      }

      const parentLink = findParentOfNode(draft.root, target.leaf)
      if (!parentLink || !parentLink.parent) {
        draft.root = replacement
      } else if (parentLink.parent.type === 'split') {
        if (parentLink.isFirst) parentLink.parent.first = replacement
        else parentLink.parent.second = replacement
      }

      const updatedSource = findLeafByPaneId(draft.root, params.sourcePaneId)?.leaf
      const createdLeaf = findLeafByPaneId(draft.root, newPaneId)?.leaf
      if (!updatedSource || !createdLeaf) return

      detachTabFromPane(updatedSource, params.tabId)
      createdLeaf.tabs.push(params.tabId)
      createdLeaf.activeTabId = params.tabId
      ensureActiveTab(updatedSource)
      draft.activePaneId = newPaneId
    })
  }

  function closePane(paneId: string): void {
    mutate((draft) => {
      const found = findLeafByPaneId(draft.root, paneId)
      if (!found || !found.parent || found.parent.type !== 'split') return

      const sibling = found.isFirst ? found.parent.second : found.parent.first
      const parentRef = findParentOfNode(draft.root, found.parent)

      if (!parentRef || !parentRef.parent) {
        draft.root = sibling
      } else if (parentRef.parent.type === 'split') {
        if (parentRef.isFirst) parentRef.parent.first = sibling
        else parentRef.parent.second = sibling
      }

      if (draft.activePaneId === paneId) {
        const leaves = collectLeaves(draft.root)
        draft.activePaneId = leaves[0]?.paneId ?? 'pane-1'
      }
    })
  }

  function swapPaneTabs(fromPaneId: string, toPaneId: string): void {
    mutate((draft) => {
      if (!fromPaneId || !toPaneId || fromPaneId === toPaneId) return
      const from = findLeafByPaneId(draft.root, fromPaneId)?.leaf
      const to = findLeafByPaneId(draft.root, toPaneId)?.leaf
      if (!from || !to) return

      const fromTabs = [...from.tabs]
      const toTabs = [...to.tabs]
      const fromActive = from.activeTabId
      const toActive = to.activeTabId

      from.tabs = toTabs
      from.activeTabId = toActive
      to.tabs = fromTabs
      to.activeTabId = fromActive
      draft.activePaneId = to.paneId
    })
  }

  function evenSplitForPane(paneId: string): void {
    mutate((draft) => {
      const found = findLeafByPaneId(draft.root, paneId)
      if (!found || !found.parent || found.parent.type !== 'split') return
      found.parent.ratio = 0.5
    })
  }

  function closeTab(paneId: string, tabId: string): void {
    mutate((draft) => {
      const found = findLeafByPaneId(draft.root, paneId)
      if (!found) return
      if (!found.leaf.tabs.includes(tabId)) return

      found.leaf.tabs = found.leaf.tabs.filter((id) => id !== tabId)
      if (found.leaf.activeTabId === tabId) {
        found.leaf.activeTabId = found.leaf.tabs[0] ?? null
      }

      const leaves: WorkspaceLeafNode[] = []
      visitLeaves(draft.root, leaves)
      const stillUsed = leaves.some((leaf) => leaf.tabs.includes(tabId))
      if (!stillUsed) {
        delete draft.tabs[tabId]
      }
    })
  }

  function closeOtherTabs(paneId: string, tabId: string): void {
    mutate((draft) => {
      const leaf = findLeafByPaneId(draft.root, paneId)?.leaf
      if (!leaf || !leaf.tabs.includes(tabId)) return
      const keep = new Set([tabId])
      for (const existing of leaf.tabs) {
        if (existing === tabId) continue
        const usedElsewhere = paneIdsFromRoot(draft.root)
          .filter((id) => id !== paneId)
          .some((id) => findLeafByPaneId(draft.root, id)?.leaf.tabs.includes(existing))
        if (!usedElsewhere) {
          delete draft.tabs[existing]
        }
      }
      leaf.tabs = leaf.tabs.filter((id) => keep.has(id))
      leaf.activeTabId = tabId
    })
  }

  function closeTabsToRight(paneId: string, tabId: string): void {
    mutate((draft) => {
      const leaf = findLeafByPaneId(draft.root, paneId)?.leaf
      if (!leaf) return
      const index = leaf.tabs.indexOf(tabId)
      if (index < 0) return
      const removing = leaf.tabs.slice(index + 1)
      for (const removeId of removing) {
        const usedElsewhere = paneIdsFromRoot(draft.root)
          .filter((id) => id !== paneId)
          .some((id) => findLeafByPaneId(draft.root, id)?.leaf.tabs.includes(removeId))
        if (!usedElsewhere) {
          delete draft.tabs[removeId]
        }
      }
      leaf.tabs = leaf.tabs.slice(0, index + 1)
      leaf.activeTabId = leaf.tabs[index] ?? leaf.tabs[0] ?? null
    })
  }

  function toggleTabPinned(tabId: string): void {
    mutate((draft) => {
      const tab = draft.tabs[tabId]
      if (!tab) return
      tab.pinned = !tab.pinned
    })
  }

  function paneIdsFromRoot(root: WorkspaceLayoutNode): string[] {
    const leaves: WorkspaceLeafNode[] = []
    visitLeaves(root, leaves)
    return leaves.map((leaf) => leaf.paneId)
  }

  function updateSplitRatio(path: string, ratio: number): void {
    mutate((draft) => {
      const segments = path.split('.').filter(Boolean)
      if (segments.length === 0 || segments[0] !== 'root') return
      let current: WorkspaceLayoutNode = draft.root
      for (let i = 1; i < segments.length; i += 1) {
        if (current.type !== 'split') return
        const seg = segments[i]
        current = seg === 'first' ? current.first : current.second
      }
      if (current.type !== 'split') return
      current.ratio = clampRatio(ratio)
    })
  }

  function reconcileSessionRefs(
    validGlobalSessionKeys: string[],
    options: {
      fallbackSessionRef?: SessionRef
      preserveInstanceIds?: string[]
    } = {}
  ): void {
    mutate((draft) => {
      const valid = new Set(validGlobalSessionKeys)
      const preserveInstanceIds = new Set(options.preserveInstanceIds ?? [])

      for (const [tabId, tab] of Object.entries(draft.tabs)) {
        if (!valid.has(tab.globalSessionKey) && !preserveInstanceIds.has(tab.instanceId)) {
          delete draft.tabs[tabId]
        }
      }

      const leaves: WorkspaceLeafNode[] = []
      visitLeaves(draft.root, leaves)
      for (const leaf of leaves) {
        leaf.tabs = leaf.tabs.filter((tabId) => !!draft.tabs[tabId])
        if (leaf.activeTabId && !leaf.tabs.includes(leaf.activeTabId)) {
          leaf.activeTabId = leaf.tabs[0] ?? null
        }
      }

      const hasAnyTab = leaves.some((leaf) => leaf.tabs.length > 0)
      if (!hasAnyTab && options.fallbackSessionRef && valid.has(options.fallbackSessionRef.globalSessionKey)) {
        const paneId = draft.activePaneId || leaves[0]?.paneId || 'pane-1'
        const leaf = findLeafByPaneId(draft.root, paneId)?.leaf ?? leaves[0]
        if (leaf) {
          const tabId = ensureTabForSessionRef(draft, options.fallbackSessionRef)
          leaf.tabs.push(tabId)
          leaf.activeTabId = tabId
          draft.activePaneId = leaf.paneId
        }
      }
    }, { trackHistory: false })
  }

  function reconcileSessions(validSessionIds: string[], fallbackSessionId?: string): void {
    reconcileSessionRefs(
      validSessionIds.map((sessionId) => buildGlobalSessionKey(LOCAL_INSTANCE_ID, sessionId)),
      {
        fallbackSessionRef: fallbackSessionId ? toLocalSessionRef(fallbackSessionId) : undefined
      }
    )
  }

  function undoLayoutChange(): boolean {
    const previous = history.value.pop()
    if (!previous) return false
    layout.value = normalizeLayout(previous)
    schedulePersist()
    return true
  }

  async function hardReset(): Promise<void> {
    const previous = cloneLayout(layout.value)
    const next = normalizeLayoutInPlace(await resetWorkspaceLayout())
    if (!layoutEquals(previous, next)) {
      pushHistory(previous)
    }
    layout.value = next
  }

  function flushPersist(): void {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
      void updateWorkspaceLayout(cloneLayout(layout.value))
    }
  }

  return {
    layout,
    loaded,
    paneCount,
    paneIds,
    activePane,
    activeSessionId,
    activeGlobalSessionKey,
    activeSessionRef,
    resolvedTabs,
    canUndo,
    undoDepth,
    load,
    focusPane,
    setActiveTab,
    openSessionRefInPane,
    openSessionInPane,
    openSessionRefInActivePane,
    focusSessionRef,
    openSessionInActivePane,
    moveTabToPane,
    splitPane,
    splitPaneAndMoveTab,
    swapPaneTabs,
    closePane,
    evenSplitForPane,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    toggleTabPinned,
    updateSplitRatio,
    reconcileSessionRefs,
    reconcileSessions,
    undoLayoutChange,
    hardReset,
    flushPersist
  }
})
