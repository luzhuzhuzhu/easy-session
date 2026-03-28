import { ipc } from './ipc'
import type { Session } from './local-session'

export interface Project {
  id: string
  name: string
  path: string
  createdAt: number
  lastOpenedAt: number
  pathExists?: boolean
}

export type ProjectPromptCliType = 'claude' | 'codex'

export interface ProjectPromptFile {
  path: string
  content: string
  exists: boolean
}

export interface ProjectInspectorTarget {
  projectId?: string
  projectPath?: string
}

export interface ProjectFileTreeEntry {
  name: string
  relativePath: string
  kind: 'file' | 'directory'
  expandable: boolean
}

export interface ProjectFileTreeResult {
  target: {
    projectPath: string
    projectName: string
  }
  parentRelativePath: string
  entries: ProjectFileTreeEntry[]
}

export type ProjectGitState = 'ready' | 'non-git' | 'git-unavailable' | 'error'
export type ProjectFileContentKind = 'text' | 'markdown' | 'binary' | 'too_large'

export interface ProjectFileReadResult {
  target: {
    projectPath: string
    projectName: string
  }
  relativePath: string
  absolutePath: string
  kind: ProjectFileContentKind
  size: number
  content: string | null
}

export interface ProjectGitStatusItem {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'copied' | 'conflicted' | 'unknown'
  staged: boolean
  previousPath?: string
}

export interface ProjectGitStatusResult {
  target: {
    projectPath: string
    projectName: string
  }
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  items: ProjectGitStatusItem[]
  message: string | null
}

export interface ProjectGitDiffResult {
  target: {
    projectPath: string
    projectName: string
  }
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  relativePath: string
  viewMode: 'staged' | 'unstaged' | 'auto'
  diff: string
  message: string | null
}

export interface ProjectGitCommitItem {
  hash: string
  shortHash: string
  message: string
  author: string
  authorEmail: string
  date: string
  relativeDate: string
  parents: string[]
  refs: string[]
  kind: 'head' | 'commit' | 'merge' | 'incoming-changes' | 'outgoing-changes'
  circleLaneIndex: number
  inputSwimlanes: ProjectGitSwimlane[]
  outputSwimlanes: ProjectGitSwimlane[]
  graphWidth: number
  syntheticCount?: number
  syntheticRef?: string | null
}

export interface ProjectGitSwimlane {
  id: string
  commitHash: string
  colorKey: string
  refType: 'local' | 'remote' | 'base' | 'palette'
}

export interface ProjectGitCommitChangeItem {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied'
}

export interface ProjectGitCommitChangesResult {
  target: {
    projectPath: string
    projectName: string
  }
  state: ProjectGitState
  commitHash: string
  parentHash: string | null
  changes: ProjectGitCommitChangeItem[]
  message: string | null
}

export interface ProjectGitLogResult {
  target: {
    projectPath: string
    projectName: string
  }
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  commits: ProjectGitCommitItem[]
  hasMore: boolean
  message: string | null
}

export interface ProjectGitBranchItem {
  name: string
  isCurrent: boolean
  isRemote: boolean
  upstream: string | null
  ahead: number
  behind: number
  lastCommit: {
    hash: string
    date: string
    message: string
  } | null
}

export interface ProjectGitBranchesResult {
  target: {
    projectPath: string
    projectName: string
  }
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  currentBranch: string | null
  branches: ProjectGitBranchItem[]
  message: string | null
}

export interface ProjectGitFileHistoryResult {
  target: {
    projectPath: string
    projectName: string
  }
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  relativePath: string
  commits: ProjectGitCommitItem[]
  hasMore: boolean
  message: string | null
}

export function addProject(path: string, name?: string): Promise<Project> {
  return ipc.invoke<Project>('project:add', path, name)
}

export function removeProject(id: string): Promise<boolean> {
  return ipc.invoke<boolean>('project:remove', id)
}

export function listProjects(): Promise<Project[]> {
  return ipc.invoke<Project[]>('project:list')
}

export function getProject(id: string): Promise<Project | null> {
  return ipc.invoke<Project | null>('project:get', id)
}

export function updateProject(id: string, updates: { name?: string }): Promise<Project> {
  return ipc.invoke<Project>('project:update', id, updates)
}

export function openProject(id: string): Promise<Project> {
  return ipc.invoke<Project>('project:open', id)
}

export function selectFolder(): Promise<string | null> {
  return ipc.invoke<string | null>('project:selectFolder')
}

export function getProjectSessions(projectId: string): Promise<Session[]> {
  return ipc.invoke<Session[]>('project:sessions', projectId)
}

export function detectProject(projectPath: string): Promise<{ claude: boolean; codex: boolean; opencode: boolean }> {
  return ipc.invoke<{ claude: boolean; codex: boolean; opencode: boolean }>('project:detect', projectPath)
}

export function readProjectPrompt(
  projectId: string,
  cliType: ProjectPromptCliType
): Promise<ProjectPromptFile | null> {
  return ipc.invoke<ProjectPromptFile | null>('project:prompt:read', projectId, cliType)
}

export function writeProjectPrompt(
  projectId: string,
  cliType: ProjectPromptCliType,
  content: string
): Promise<ProjectPromptFile | null> {
  return ipc.invoke<ProjectPromptFile | null>('project:prompt:write', projectId, cliType, content)
}

export function listProjectFiles(
  target: ProjectInspectorTarget,
  relativePath = ''
): Promise<ProjectFileTreeResult> {
  return ipc.invoke<ProjectFileTreeResult>('project:fileTree', target, relativePath)
}

export function readProjectFile(
  target: ProjectInspectorTarget,
  relativePath: string
): Promise<ProjectFileReadResult> {
  return ipc.invoke<ProjectFileReadResult>('project:fileRead', target, relativePath)
}

export function getProjectGitStatus(target: ProjectInspectorTarget): Promise<ProjectGitStatusResult> {
  return ipc.invoke<ProjectGitStatusResult>('project:gitStatus', target)
}

export function getProjectGitDiff(
  target: ProjectInspectorTarget,
  relativePath: string,
  options?: { viewMode?: 'staged' | 'unstaged' | 'auto' }
): Promise<ProjectGitDiffResult> {
  return ipc.invoke<ProjectGitDiffResult>('project:gitDiff', target, relativePath, options)
}

export interface GitLogOptions {
  skip?: number
  maxCount?: number
  branch?: string
}

export function getProjectGitLog(
  target: ProjectInspectorTarget,
  options?: GitLogOptions
): Promise<ProjectGitLogResult> {
  return ipc.invoke<ProjectGitLogResult>('project:gitLog', target, options)
}

export function getProjectGitFileHistory(
  target: ProjectInspectorTarget,
  relativePath: string,
  options?: { skip?: number; maxCount?: number }
): Promise<ProjectGitFileHistoryResult> {
  return ipc.invoke<ProjectGitFileHistoryResult>('project:gitFileHistory', target, relativePath, options)
}

export function getProjectGitBranches(target: ProjectInspectorTarget): Promise<ProjectGitBranchesResult> {
  return ipc.invoke<ProjectGitBranchesResult>('project:gitBranches', target)
}

export function stageProjectFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
  return ipc.invoke<void>('project:gitStage', target, relativePath)
}

export function unstageProjectFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
  return ipc.invoke<void>('project:gitUnstage', target, relativePath)
}

export function discardProjectFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
  return ipc.invoke<void>('project:gitDiscard', target, relativePath)
}

export function commitProjectChanges(target: ProjectInspectorTarget, message: string): Promise<void> {
  return ipc.invoke<void>('project:gitCommit', target, message)
}

export function checkoutBranch(target: ProjectInspectorTarget, branchName: string): Promise<void> {
  return ipc.invoke<void>('project:gitCheckout', target, branchName)
}

export function getCommitChanges(target: ProjectInspectorTarget, commitHash: string): Promise<ProjectGitCommitChangesResult> {
  return ipc.invoke<ProjectGitCommitChangesResult>('project:gitCommitChanges', target, commitHash)
}

export function getCommitDiff(target: ProjectInspectorTarget, commitHash: string, relativePath?: string): Promise<string> {
  return ipc.invoke<string>('project:gitCommitDiff', target, commitHash, relativePath)
}
