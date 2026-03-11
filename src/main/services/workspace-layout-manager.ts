import { app } from 'electron'
import { join } from 'path'
import { DataStore } from './data-store'

const LOCAL_INSTANCE_ID = 'local'
const CURRENT_WORKSPACE_LAYOUT_VERSION = 2 as const

export type WorkspaceSplitDirection = 'horizontal' | 'vertical'

export interface WorkspaceTabState {
  id: string
  resourceType: 'session'
  instanceId: string
  sessionId: string
  globalSessionKey: string
  pinned: boolean
  createdAt: number
}

interface LegacyWorkspaceTabState {
  id?: string
  sessionId: string
  pinned?: boolean
  createdAt?: number
}

export interface WorkspaceLeafNode {
  type: 'leaf'
  paneId: string
  activeTabId: string | null
  tabs: string[]
}

export interface WorkspaceSplitNode {
  type: 'split'
  direction: WorkspaceSplitDirection
  ratio: number
  first: WorkspaceLayoutNode
  second: WorkspaceLayoutNode
}

export type WorkspaceLayoutNode = WorkspaceLeafNode | WorkspaceSplitNode

export interface WorkspaceLayoutState {
  version: typeof CURRENT_WORKSPACE_LAYOUT_VERSION
  root: WorkspaceLayoutNode
  tabs: Record<string, WorkspaceTabState>
  activePaneId: string
}

interface LegacyWorkspaceLayoutState {
  version?: 1
  root: WorkspaceLayoutNode
  tabs: Record<string, LegacyWorkspaceTabState>
  activePaneId: string
}

type StoredWorkspaceLayoutState = WorkspaceLayoutState | LegacyWorkspaceLayoutState
type WorkspaceLayoutMigrationState = {
  version?: 1 | typeof CURRENT_WORKSPACE_LAYOUT_VERSION
  root?: unknown
  tabs?: Record<string, unknown>
  activePaneId?: string
}
type WorkspaceLayoutMigrationHandler = (state: WorkspaceLayoutMigrationState) => WorkspaceLayoutMigrationState

function cloneLayout(layout: WorkspaceLayoutState): WorkspaceLayoutState {
  if (typeof structuredClone === 'function') {
    return structuredClone(layout)
  }
  return JSON.parse(JSON.stringify(layout)) as WorkspaceLayoutState
}

function clampRatio(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0.5
  return Math.max(0.15, Math.min(0.85, value))
}

function buildGlobalSessionKey(instanceId: string, sessionId: string): string {
  return `${instanceId}:${sessionId}`
}

function createDefaultLayout(): WorkspaceLayoutState {
  return {
    version: CURRENT_WORKSPACE_LAYOUT_VERSION,
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

function detectStoredVersion(input: unknown): 1 | typeof CURRENT_WORKSPACE_LAYOUT_VERSION | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const raw = input as WorkspaceLayoutMigrationState
  if (raw.version === CURRENT_WORKSPACE_LAYOUT_VERSION) {
    return CURRENT_WORKSPACE_LAYOUT_VERSION
  }

  if (raw.version === 1 || 'root' in raw || 'tabs' in raw || 'activePaneId' in raw) {
    return 1
  }

  return null
}

function migrateV1ToV2(state: WorkspaceLayoutMigrationState): WorkspaceLayoutMigrationState {
  return {
    ...state,
    version: CURRENT_WORKSPACE_LAYOUT_VERSION
  }
}

const WORKSPACE_LAYOUT_MIGRATIONS: Record<number, WorkspaceLayoutMigrationHandler> = {
  1: migrateV1ToV2
}

function migrateToCurrentLayout(input: unknown): { state: WorkspaceLayoutMigrationState | null; migrated: boolean } {
  let state = input as WorkspaceLayoutMigrationState | null
  let version = detectStoredVersion(state)
  if (!state || version === null) {
    return { state: null, migrated: true }
  }

  let migrated = false
  while (version < CURRENT_WORKSPACE_LAYOUT_VERSION) {
    const migration = WORKSPACE_LAYOUT_MIGRATIONS[version]
    if (!migration) {
      break
    }
    state = migration(state)
    version = detectStoredVersion(state)
    migrated = true
    if (version === null) {
      return { state: null, migrated: true }
    }
  }

  return { state, migrated }
}

function visitLeaves(node: WorkspaceLayoutNode, leaves: WorkspaceLeafNode[]): void {
  if (node.type === 'leaf') {
    leaves.push(node)
    return
  }
  visitLeaves(node.first, leaves)
  visitLeaves(node.second, leaves)
}

function normalizeNode(node: unknown): WorkspaceLayoutNode {
  if (!node || typeof node !== 'object') {
    return {
      type: 'leaf',
      paneId: 'pane-1',
      activeTabId: null,
      tabs: []
    }
  }

  if ((node as WorkspaceLeafNode).type === 'leaf') {
    const leaf = node as Partial<WorkspaceLeafNode>
    const paneId = typeof leaf.paneId === 'string' && leaf.paneId ? leaf.paneId : 'pane-1'
    const tabs = Array.isArray(leaf.tabs) ? leaf.tabs.filter((tabId): tabId is string => typeof tabId === 'string') : []
    const activeTabId =
      typeof leaf.activeTabId === 'string' && tabs.includes(leaf.activeTabId) ? leaf.activeTabId : tabs[0] ?? null

    return {
      type: 'leaf',
      paneId,
      tabs,
      activeTabId
    }
  }

  const split = node as Partial<WorkspaceSplitNode>
  return {
    type: 'split',
    direction: split.direction === 'vertical' ? 'vertical' : 'horizontal',
    ratio: clampRatio(split.ratio),
    first: normalizeNode(split.first),
    second: normalizeNode(split.second)
  }
}

function normalizeTab(tabId: string, tab: unknown): { tab: WorkspaceTabState | null; migrated: boolean } {
  if (!tab || typeof tab !== 'object') {
    return { tab: null, migrated: true }
  }

  const raw = tab as Partial<WorkspaceTabState & LegacyWorkspaceTabState>
  if (typeof raw.sessionId !== 'string' || !raw.sessionId) {
    return { tab: null, migrated: true }
  }

  const instanceId =
    typeof raw.instanceId === 'string' && raw.instanceId.trim() ? raw.instanceId.trim() : LOCAL_INSTANCE_ID
  const globalSessionKey =
    typeof raw.globalSessionKey === 'string' && raw.globalSessionKey.trim()
      ? raw.globalSessionKey.trim()
      : buildGlobalSessionKey(instanceId, raw.sessionId)

  return {
    migrated:
      raw.resourceType !== 'session' ||
      raw.instanceId !== instanceId ||
      raw.globalSessionKey !== globalSessionKey ||
      raw.id !== tabId,
    tab: {
      id: tabId,
      resourceType: 'session',
      instanceId,
      sessionId: raw.sessionId,
      globalSessionKey,
      pinned: !!raw.pinned,
      createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
    }
  }
}

function normalizeLayout(input: unknown): { layout: WorkspaceLayoutState; migrated: boolean } {
  const migration = migrateToCurrentLayout(input)
  const raw = migration.state
  if (!raw || typeof raw !== 'object') {
    return { layout: createDefaultLayout(), migrated: true }
  }

  const normalized: WorkspaceLayoutState = {
    version: CURRENT_WORKSPACE_LAYOUT_VERSION,
    root: normalizeNode(raw.root),
    tabs: {},
    activePaneId: typeof raw.activePaneId === 'string' && raw.activePaneId ? raw.activePaneId : 'pane-1'
  }

  let migrated = migration.migrated || raw.version !== CURRENT_WORKSPACE_LAYOUT_VERSION

  if (raw.tabs && typeof raw.tabs === 'object') {
    for (const [tabId, tab] of Object.entries(raw.tabs)) {
      const normalizedTab = normalizeTab(tabId, tab)
      if (!normalizedTab.tab) {
        migrated = true
        continue
      }
      migrated = migrated || normalizedTab.migrated
      normalized.tabs[tabId] = normalizedTab.tab
    }
  } else {
    migrated = true
  }

  const leaves: WorkspaceLeafNode[] = []
  visitLeaves(normalized.root, leaves)
  const usedPaneIds = new Set<string>()
  for (let i = 0; i < leaves.length; i += 1) {
    const leaf = leaves[i]
    let paneId = typeof leaf.paneId === 'string' && leaf.paneId ? leaf.paneId : `pane-${i + 1}`
    while (usedPaneIds.has(paneId)) {
      paneId = `${paneId}-dup`
      migrated = true
    }
    if (paneId !== leaf.paneId) {
      migrated = true
    }
    leaf.paneId = paneId
    usedPaneIds.add(paneId)
  }

  const usedTabs = new Set<string>()
  for (const leaf of leaves) {
    const filtered = leaf.tabs.filter((tabId) => !!normalized.tabs[tabId])
    if (filtered.length !== leaf.tabs.length) {
      migrated = true
    }
    leaf.tabs = filtered
    if (leaf.activeTabId && !filtered.includes(leaf.activeTabId)) {
      leaf.activeTabId = filtered[0] ?? null
      migrated = true
    }
    if (!leaf.activeTabId && filtered.length > 0) {
      leaf.activeTabId = filtered[0]
      migrated = true
    }
    for (const tabId of filtered) {
      usedTabs.add(tabId)
    }
  }

  for (const tabId of Object.keys(normalized.tabs)) {
    if (!usedTabs.has(tabId)) {
      delete normalized.tabs[tabId]
      migrated = true
    }
  }

  if (!leaves.some((leaf) => leaf.paneId === normalized.activePaneId)) {
    normalized.activePaneId = leaves[0]?.paneId ?? 'pane-1'
    migrated = true
  }

  return { layout: normalized, migrated }
}

export class WorkspaceLayoutManager {
  private readonly store: DataStore<StoredWorkspaceLayoutState>
  private layout: WorkspaceLayoutState = createDefaultLayout()

  constructor() {
    this.store = new DataStore<StoredWorkspaceLayoutState>(join(app.getPath('userData'), 'workspace-layout.json'))
  }

  async init(): Promise<void> {
    const result = await this.store.load()
    if (!result.data) {
      // Keep the corrupted legacy file in place so users can recover it manually,
      // while still booting the app with a safe in-memory default layout.
      if (result.error === 'corrupted' || result.error === 'read_error') {
        return
      }
      await this.store.save(this.layout)
      return
    }

    const normalized = normalizeLayout(result.data)
    this.layout = normalized.layout
    if (result.restoredFromBackup || normalized.migrated) {
      await this.store.save(this.layout)
    }
  }

  getLayout(): WorkspaceLayoutState {
    return cloneLayout(this.layout)
  }

  async updateLayout(nextLayout: WorkspaceLayoutState): Promise<WorkspaceLayoutState> {
    const normalized = normalizeLayout(nextLayout)
    this.layout = normalized.layout
    await this.store.save(this.layout)
    return this.getLayout()
  }

  async resetLayout(): Promise<WorkspaceLayoutState> {
    this.layout = createDefaultLayout()
    await this.store.save(this.layout)
    return this.getLayout()
  }

  flush(): Promise<void> {
    return this.store.flush()
  }
}
