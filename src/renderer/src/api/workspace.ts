import { ipc } from './ipc'

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
  version: 2
  root: WorkspaceLayoutNode
  tabs: Record<string, WorkspaceTabState>
  activePaneId: string
}

export function getWorkspaceLayout(): Promise<WorkspaceLayoutState> {
  return ipc.invoke<WorkspaceLayoutState>('workspace:getLayout')
}

export function updateWorkspaceLayout(layout: WorkspaceLayoutState): Promise<WorkspaceLayoutState> {
  return ipc.invoke<WorkspaceLayoutState>('workspace:updateLayout', layout)
}

export function resetWorkspaceLayout(): Promise<WorkspaceLayoutState> {
  return ipc.invoke<WorkspaceLayoutState>('workspace:resetLayout')
}
