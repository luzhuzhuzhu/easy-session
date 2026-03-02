import { app } from 'electron'
import { join } from 'path'
import { DataStore } from './data-store'

export type WorkspaceSplitDirection = 'horizontal' | 'vertical'

export interface WorkspaceTabState {
  id: string
  sessionId: string
  pinned: boolean
  createdAt: number
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
  version: 1
  root: WorkspaceLayoutNode
  tabs: Record<string, WorkspaceTabState>
  activePaneId: string
}

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

function createDefaultLayout(): WorkspaceLayoutState {
  return {
    version: 1,
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

function visitLeaves(node: WorkspaceLayoutNode, leaves: WorkspaceLeafNode[]): void {
  if (node.type === 'leaf') {
    leaves.push(node)
    return
  }
  visitLeaves(node.first, leaves)
  visitLeaves(node.second, leaves)
}

function normalizeNode(node: WorkspaceLayoutNode): WorkspaceLayoutNode {
  if (!node || typeof node !== 'object') {
    return {
      type: 'leaf',
      paneId: 'pane-1',
      activeTabId: null,
      tabs: []
    }
  }

  if ((node as WorkspaceLeafNode).type === 'leaf') {
    const leaf = node as WorkspaceLeafNode
    const paneId = typeof leaf.paneId === 'string' && leaf.paneId ? leaf.paneId : 'pane-1'
    const tabs = Array.isArray(leaf.tabs) ? leaf.tabs.filter((tabId) => typeof tabId === 'string') : []
    const activeTabId =
      typeof leaf.activeTabId === 'string' && tabs.includes(leaf.activeTabId) ? leaf.activeTabId : tabs[0] ?? null

    return {
      type: 'leaf',
      paneId,
      tabs,
      activeTabId
    }
  }

  const split = node as WorkspaceSplitNode
  return {
    type: 'split',
    direction: split.direction === 'vertical' ? 'vertical' : 'horizontal',
    ratio: clampRatio(split.ratio),
    first: normalizeNode(split.first),
    second: normalizeNode(split.second)
  }
}

function normalizeLayout(layout: WorkspaceLayoutState): WorkspaceLayoutState {
  const normalized: WorkspaceLayoutState = {
    version: 1,
    root: normalizeNode(layout.root),
    tabs: {},
    activePaneId: layout.activePaneId
  }

  if (layout.tabs && typeof layout.tabs === 'object') {
    for (const [tabId, tab] of Object.entries(layout.tabs)) {
      if (!tab || typeof tab !== 'object') continue
      if (typeof tab.sessionId !== 'string' || !tab.sessionId) continue
      normalized.tabs[tabId] = {
        id: tabId,
        sessionId: tab.sessionId,
        pinned: !!tab.pinned,
        createdAt: typeof tab.createdAt === 'number' && Number.isFinite(tab.createdAt) ? tab.createdAt : Date.now()
      }
    }
  }

  const leaves: WorkspaceLeafNode[] = []
  visitLeaves(normalized.root, leaves)
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
  for (const leaf of leaves) {
    const filtered = leaf.tabs.filter((tabId) => !!normalized.tabs[tabId])
    leaf.tabs = filtered
    if (leaf.activeTabId && !filtered.includes(leaf.activeTabId)) {
      leaf.activeTabId = filtered[0] ?? null
    }
    if (!leaf.activeTabId && filtered.length > 0) {
      leaf.activeTabId = filtered[0]
    }
    for (const tabId of filtered) {
      usedTabs.add(tabId)
    }
  }

  for (const tabId of Object.keys(normalized.tabs)) {
    if (!usedTabs.has(tabId)) {
      delete normalized.tabs[tabId]
    }
  }

  if (!leaves.some((leaf) => leaf.paneId === normalized.activePaneId)) {
    normalized.activePaneId = leaves[0]?.paneId ?? 'pane-1'
  }

  return normalized
}

export class WorkspaceLayoutManager {
  private readonly store: DataStore<WorkspaceLayoutState>
  private layout: WorkspaceLayoutState = createDefaultLayout()

  constructor() {
    this.store = new DataStore<WorkspaceLayoutState>(join(app.getPath('userData'), 'workspace-layout.json'))
  }

  async init(): Promise<void> {
    const result = await this.store.load()
    if (!result.data) {
      // 首次启动或数据丢失，保存默认布局到磁盘
      await this.store.save(this.layout)
      return
    }

    this.layout = normalizeLayout(result.data)
    if (result.restoredFromBackup) {
      await this.store.save(this.layout)
    }
  }

  getLayout(): WorkspaceLayoutState {
    return cloneLayout(this.layout)
  }

  async updateLayout(nextLayout: WorkspaceLayoutState): Promise<WorkspaceLayoutState> {
    const normalized = normalizeLayout(nextLayout)
    this.layout = normalized
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
