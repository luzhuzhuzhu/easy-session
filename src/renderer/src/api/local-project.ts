import { ipc } from './ipc'
import type { Session } from './local-session'

const PROJECT_INSPECTOR_CACHE_TTL_MS = 1500

interface ProjectInspectorCacheEntry<T> {
  expiresAt: number
  value: T
}

const projectInspectorReadCache = new Map<string, ProjectInspectorCacheEntry<unknown>>()
const projectInspectorInFlight = new Map<string, Promise<unknown>>()
const projectInspectorTargetVersions = new Map<string, number>()

function getProjectInspectorTargetKey(target: ProjectInspectorTarget): string {
  if (target.projectId) {
    return `id:${target.projectId}`
  }

  if (target.projectPath) {
    return `path:${target.projectPath}`
  }

  return 'unknown'
}

function buildProjectInspectorCacheKey(
  scope: string,
  target: ProjectInspectorTarget,
  parts: Array<string | number | undefined>
): string {
  const targetKey = getProjectInspectorTargetKey(target)
  const targetVersion = projectInspectorTargetVersions.get(targetKey) ?? 0
  return [
    scope,
    targetKey,
    targetVersion,
    ...parts.map((part) => String(part ?? ''))
  ].join('::')
}

async function withProjectInspectorReadCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs = PROJECT_INSPECTOR_CACHE_TTL_MS
): Promise<T> {
  const now = Date.now()
  const cached = projectInspectorReadCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value as T
  }

  const inFlight = projectInspectorInFlight.get(key)
  if (inFlight) {
    return inFlight as Promise<T>
  }

  const request = loader()
    .then((result) => {
      projectInspectorReadCache.set(key, {
        expiresAt: Date.now() + ttlMs,
        value: result
      })
      projectInspectorInFlight.delete(key)
      return result
    })
    .catch((error) => {
      projectInspectorInFlight.delete(key)
      throw error
    })

  projectInspectorInFlight.set(key, request)
  return request
}

function invalidateProjectInspectorCache(target?: ProjectInspectorTarget): void {
  if (!target) {
    projectInspectorReadCache.clear()
    projectInspectorInFlight.clear()
    return
  }

  const targetKey = `::${getProjectInspectorTargetKey(target)}::`

  for (const key of projectInspectorReadCache.keys()) {
    if (key.includes(targetKey)) {
      projectInspectorReadCache.delete(key)
    }
  }

  for (const key of projectInspectorInFlight.keys()) {
    if (key.includes(targetKey)) {
      projectInspectorInFlight.delete(key)
    }
  }
}

function bumpProjectInspectorTargetVersion(target: ProjectInspectorTarget): void {
  const targetKey = getProjectInspectorTargetKey(target)
  projectInspectorTargetVersions.set(targetKey, (projectInspectorTargetVersions.get(targetKey) ?? 0) + 1)
}

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
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('fileTree', target, [relativePath]),
    () => ipc.invoke<ProjectFileTreeResult>('project:fileTree', target, relativePath)
  )
}

export function readProjectFile(
  target: ProjectInspectorTarget,
  relativePath: string
): Promise<ProjectFileReadResult> {
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('fileRead', target, [relativePath]),
    () => ipc.invoke<ProjectFileReadResult>('project:fileRead', target, relativePath)
  )
}

export function getProjectGitStatus(target: ProjectInspectorTarget): Promise<ProjectGitStatusResult> {
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('gitStatus', target, []),
    () => ipc.invoke<ProjectGitStatusResult>('project:gitStatus', target)
  )
}

export function getProjectGitDiff(
  target: ProjectInspectorTarget,
  relativePath: string,
  options?: { viewMode?: 'staged' | 'unstaged' | 'auto' }
): Promise<ProjectGitDiffResult> {
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('gitDiff', target, [relativePath, options?.viewMode ?? 'auto']),
    () => ipc.invoke<ProjectGitDiffResult>('project:gitDiff', target, relativePath, options)
  )
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
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('gitLog', target, [
      options?.skip ?? 0,
      options?.maxCount ?? 0,
      options?.branch ?? ''
    ]),
    () => ipc.invoke<ProjectGitLogResult>('project:gitLog', target, options)
  )
}

export function getProjectGitFileHistory(
  target: ProjectInspectorTarget,
  relativePath: string,
  options?: { skip?: number; maxCount?: number }
): Promise<ProjectGitFileHistoryResult> {
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('gitFileHistory', target, [
      relativePath,
      options?.skip ?? 0,
      options?.maxCount ?? 0
    ]),
    () => ipc.invoke<ProjectGitFileHistoryResult>('project:gitFileHistory', target, relativePath, options)
  )
}

export function getProjectGitBranches(target: ProjectInspectorTarget): Promise<ProjectGitBranchesResult> {
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('gitBranches', target, []),
    () => ipc.invoke<ProjectGitBranchesResult>('project:gitBranches', target)
  )
}

export function stageProjectFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitStage', target, relativePath).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function unstageProjectFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitUnstage', target, relativePath).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function discardProjectFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitDiscard', target, relativePath).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function commitProjectChanges(target: ProjectInspectorTarget, message: string): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitCommit', target, message).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function checkoutBranch(target: ProjectInspectorTarget, branchName: string): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitCheckout', target, branchName).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function fetchProjectGitRemote(target: ProjectInspectorTarget): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitFetch', target).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function pullProjectGitCurrentBranch(target: ProjectInspectorTarget): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitPull', target).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function pushProjectGitCurrentBranch(target: ProjectInspectorTarget): Promise<void> {
  invalidateProjectInspectorCache(target)
  return ipc.invoke<void>('project:gitPush', target).then((result) => {
    bumpProjectInspectorTargetVersion(target)
    invalidateProjectInspectorCache(target)
    return result
  })
}

export function getCommitChanges(target: ProjectInspectorTarget, commitHash: string): Promise<ProjectGitCommitChangesResult> {
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('gitCommitChanges', target, [commitHash]),
    () => ipc.invoke<ProjectGitCommitChangesResult>('project:gitCommitChanges', target, commitHash)
  )
}

export function getCommitDiff(target: ProjectInspectorTarget, commitHash: string, relativePath?: string): Promise<string> {
  return withProjectInspectorReadCache(
    buildProjectInspectorCacheKey('gitCommitDiff', target, [commitHash, relativePath ?? '']),
    () => ipc.invoke<string>('project:gitCommitDiff', target, commitHash, relativePath)
  )
}
