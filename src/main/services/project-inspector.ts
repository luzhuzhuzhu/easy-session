import type { ProjectManager } from './project-manager'
import type { SessionManager } from './session-manager'
import {
  ensureInsideRoot,
  execFileText
} from './project-inspector-shared'
import {
  buildGitGraphRows,
  enrichGitLogRows,
  parseBranchesOutput,
  parseGitLogOutput,
  parseGitStatusOutput
} from './project-inspector-git'
import {
  checkoutProjectGitBranch,
  commitProjectGitChanges,
  discardProjectGitFile,
  fetchProjectGitRemote,
  pullProjectGitCurrentBranch,
  pushProjectGitCurrentBranch,
  readProjectGitCommitChanges,
  readProjectGitCommitDiff,
  stageProjectGitFile,
  unstageProjectGitFile
} from './project-inspector-git-ops'
import {
  listProjectFileTree,
  readProjectFile
} from './project-inspector-file'
import {
  resolveProjectGitContext,
  resolveProjectInspectorTarget,
  type GitContext
} from './project-inspector-context'
import {
  readProjectGitBranches,
  readProjectGitDiff
} from './project-inspector-git-diff'

export interface ProjectInspectorTarget {
  projectId?: string
  projectPath?: string
}

export type ProjectGitState = 'ready' | 'non-git' | 'git-unavailable' | 'error'
export type ProjectFileContentKind = 'text' | 'markdown' | 'binary' | 'too_large'

export interface ProjectInspectorResolvedTarget {
  projectPath: string
  projectName: string
}

export interface ProjectFileTreeEntry {
  name: string
  relativePath: string
  kind: 'file' | 'directory'
  expandable: boolean
}

export interface ProjectFileTreeResult {
  target: ProjectInspectorResolvedTarget
  parentRelativePath: string
  entries: ProjectFileTreeEntry[]
}

export interface ProjectFileReadResult {
  target: ProjectInspectorResolvedTarget
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
  target: ProjectInspectorResolvedTarget
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  items: ProjectGitStatusItem[]
  message: string | null
}

export interface ProjectGitDiffResult {
  target: ProjectInspectorResolvedTarget
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

export interface ProjectGitLogResult {
  target: ProjectInspectorResolvedTarget
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
  target: ProjectInspectorResolvedTarget
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  currentBranch: string | null
  branches: ProjectGitBranchItem[]
  message: string | null
}

export interface ProjectGitFileHistoryResult {
  target: ProjectInspectorResolvedTarget
  state: ProjectGitState
  repoRoot: string | null
  projectSubpath: string
  relativePath: string
  commits: ProjectGitCommitItem[]
  hasMore: boolean
  message: string | null
}

export interface ProjectGitCommitChangeItem {
  path: string
  status: 'added' | 'deleted' | 'modified' | 'renamed' | 'copied'
}

export interface ProjectGitCommitChangesResult {
  target: ProjectInspectorResolvedTarget
  state: ProjectGitState
  commitHash: string
  parentHash: string | null
  changes: ProjectGitCommitChangeItem[]
  message: string | null
}

export class ProjectInspectorService {
  constructor(
    private readonly projectManager: ProjectManager,
    private readonly sessionManager: SessionManager
  ) {}

  private async resolveTarget(target: ProjectInspectorTarget): Promise<ProjectInspectorResolvedTarget> {
    return resolveProjectInspectorTarget(
      {
        projectManager: this.projectManager,
        sessionManager: this.sessionManager
      },
      target
    )
  }

  private async resolveGitContext(projectPath: string): Promise<GitContext> {
    return resolveProjectGitContext(projectPath)
  }

  async listFileTree(target: ProjectInspectorTarget, relativePath = ''): Promise<ProjectFileTreeResult> {
    const resolvedTarget = await this.resolveTarget(target)
    return listProjectFileTree(resolvedTarget, relativePath)
  }

  async readFile(target: ProjectInspectorTarget, relativePath: string): Promise<ProjectFileReadResult> {
    const resolvedTarget = await this.resolveTarget(target)
    return readProjectFile(resolvedTarget, relativePath)
  }

  async getGitStatus(target: ProjectInspectorTarget): Promise<ProjectGitStatusResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      return {
        target: resolvedTarget,
        state: gitContext.state,
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        items: [],
        message: gitContext.message
      }
    }

    try {
      const stdout = await execFileText('git', [
        '-C',
        resolvedTarget.projectPath,
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--ignored=no',
        '--',
        '.'
      ])

      const items = parseGitStatusOutput(stdout)

      return {
        target: resolvedTarget,
        state: 'ready',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        items,
        message: null
      }
    } catch (error) {
      return {
        target: resolvedTarget,
        state: 'error',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        items: [],
        message: error instanceof Error ? error.message : '读取 Git 变更失败'
      }
    }
  }

  async getGitDiff(
    target: ProjectInspectorTarget,
    relativePath: string,
    options?: { viewMode?: 'staged' | 'unstaged' | 'auto' }
  ): Promise<ProjectGitDiffResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      return {
        target: resolvedTarget,
        state: gitContext.state,
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        relativePath: normalizedRelativePath,
        viewMode: options?.viewMode ?? 'auto',
        diff: '',
        message: gitContext.message
      }
    }

    const status = await this.getGitStatus(target)
    const statusEntry = status.items.find((item) => item.path === normalizedRelativePath)
    if (statusEntry?.status === 'untracked') {
      return {
        target: resolvedTarget,
        state: 'ready',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        relativePath: normalizedRelativePath,
        viewMode: options?.viewMode ?? 'auto',
        diff: '',
        message: '未跟踪文件暂无 diff，可直接查看文件内容'
      }
    }

    try {
      const viewMode = options?.viewMode ?? 'auto'
      const stdout = await readProjectGitDiff(resolvedTarget.projectPath, normalizedRelativePath, viewMode)

      return {
        target: resolvedTarget,
        state: 'ready',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        relativePath: normalizedRelativePath,
        viewMode,
        diff: stdout,
        message: stdout.trim() ? null : '当前文件没有可显示的文本 diff'
      }
    } catch (error) {
      return {
        target: resolvedTarget,
        state: 'error',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        relativePath: normalizedRelativePath,
        viewMode: options?.viewMode ?? 'auto',
        diff: '',
        message: error instanceof Error ? error.message : '读取 Git diff 失败'
      }
    }
  }

  async getGitLog(
    target: ProjectInspectorTarget,
    options?: { skip?: number; maxCount?: number; branch?: string }
  ): Promise<ProjectGitLogResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      return {
        target: resolvedTarget,
        state: gitContext.state,
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        commits: [],
        hasMore: false,
        message: gitContext.message
      }
    }

    const skip = options?.skip ?? 0
    const maxCount = options?.maxCount ?? 50

    try {
      const args = [
        '-C',
        resolvedTarget.projectPath,
        'log',
        '--decorate=short',
        '--topo-order',
        '--pretty=format:%H%x01%h%x01%s%x01%an%x01%ae%x01%ci%x01%cr%x01%P%x01%D',
        '--date=iso',
        `--skip=${skip}`,
        `--max-count=${maxCount + 1}`
      ]

      if (options?.branch) {
        args.push(options.branch)
      } else {
        args.push('--branches', '--remotes')
      }

      const stdout = await execFileText('git', args)
      const parsedCommits = parseGitLogOutput(stdout)
      const graphCommits = buildGitGraphRows(parsedCommits)
      const commits = await enrichGitLogRows(resolvedTarget.projectPath, graphCommits, options)

      return {
        target: resolvedTarget,
        state: 'ready',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        commits: commits.slice(0, maxCount),
        hasMore: commits.length > maxCount,
        message: null
      }
    } catch (error) {
      return {
        target: resolvedTarget,
        state: 'error',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        commits: [],
        hasMore: false,
        message: error instanceof Error ? error.message : '读取 Git 历史失败'
      }
    }
  }

  async getGitFileHistory(
    target: ProjectInspectorTarget,
    relativePath: string,
    options?: { skip?: number; maxCount?: number }
  ): Promise<ProjectGitFileHistoryResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      return {
        target: resolvedTarget,
        state: gitContext.state,
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        relativePath: normalizedRelativePath,
        commits: [],
        hasMore: false,
        message: gitContext.message
      }
    }

    const skip = options?.skip ?? 0
    const maxCount = options?.maxCount ?? 50

    try {
      const stdout = await execFileText('git', [
        '-C',
        resolvedTarget.projectPath,
        'log',
        '--decorate=short',
        '--pretty=format:%H%x01%h%x01%s%x01%an%x01%ae%x01%ci%x01%cr%x01%P%x01%D',
        '--date=iso',
        `--skip=${skip}`,
        `--max-count=${maxCount + 1}`,
        '--follow',
        '--',
        normalizedRelativePath
      ])

      const commits = parseGitLogOutput(stdout)

      return {
        target: resolvedTarget,
        state: 'ready',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        relativePath: normalizedRelativePath,
        commits: commits.slice(0, maxCount),
        hasMore: commits.length > maxCount,
        message: null
      }
    } catch (error) {
      return {
        target: resolvedTarget,
        state: 'error',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        relativePath: normalizedRelativePath,
        commits: [],
        hasMore: false,
        message: error instanceof Error ? error.message : '读取文件历史失败'
      }
    }
  }

  async getGitBranches(target: ProjectInspectorTarget): Promise<ProjectGitBranchesResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      return {
        target: resolvedTarget,
        state: gitContext.state,
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        currentBranch: null,
        branches: [],
        message: gitContext.message
      }
    }

    try {
      const [branchOutput, currentBranchOutput] = await readProjectGitBranches(resolvedTarget.projectPath)

      const currentBranch = currentBranchOutput.trim() || null
      const branches = parseBranchesOutput(branchOutput)

      return {
        target: resolvedTarget,
        state: 'ready',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        currentBranch,
        branches,
        message: null
      }
    } catch (error) {
      return {
        target: resolvedTarget,
        state: 'error',
        repoRoot: gitContext.repoRoot,
        projectSubpath: gitContext.projectSubpath,
        currentBranch: null,
        branches: [],
        message: error instanceof Error ? error.message : '读取分支列表失败'
      }
    }
  }

  async stageFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await stageProjectGitFile(resolvedTarget.projectPath, normalizedRelativePath)
  }

  async unstageFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await unstageProjectGitFile(resolvedTarget.projectPath, normalizedRelativePath)
  }

  async discardFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    const status = await this.getGitStatus(target)
    const unstagedEntries = status.items.filter((item) => {
      if (item.staged) return false
      return item.path === normalizedRelativePath || item.path.startsWith(`${normalizedRelativePath}/`)
    })
    if (!unstagedEntries.length) {
      return
    }

    for (const entry of unstagedEntries) {
      await discardProjectGitFile(resolvedTarget.projectPath, entry.path, entry)
    }
  }

  async commitChanges(target: ProjectInspectorTarget, message: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    if (!message.trim()) {
      throw new Error('提交信息不能为空')
    }

    await commitProjectGitChanges(resolvedTarget.projectPath, message)
  }

  async checkoutBranch(target: ProjectInspectorTarget, branchName: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await checkoutProjectGitBranch(resolvedTarget.projectPath, branchName)
  }

  async fetchGitRemote(target: ProjectInspectorTarget): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await fetchProjectGitRemote(resolvedTarget.projectPath)
  }

  async pullCurrentBranch(target: ProjectInspectorTarget): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await pullProjectGitCurrentBranch(resolvedTarget.projectPath)
  }

  async pushCurrentBranch(target: ProjectInspectorTarget): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await pushProjectGitCurrentBranch(resolvedTarget.projectPath)
  }

  async getCommitChanges(
    target: ProjectInspectorTarget,
    commitHash: string
  ): Promise<ProjectGitCommitChangesResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      return {
        target: resolvedTarget,
        state: gitContext.state,
        commitHash,
        parentHash: null,
        changes: [],
        message: gitContext.message
      }
    }

    try {
      const { parentHash, changes } = await readProjectGitCommitChanges(resolvedTarget.projectPath, commitHash)

      return {
        target: resolvedTarget,
        state: 'ready',
        commitHash,
        parentHash,
        changes,
        message: null
      }
    } catch (error) {
      return {
        target: resolvedTarget,
        state: 'error',
        commitHash,
        parentHash: null,
        changes: [],
        message: error instanceof Error ? error.message : '读取提交变更失败'
      }
    }
  }

  async getCommitDiff(
    target: ProjectInspectorTarget,
    commitHash: string,
    relativePath?: string
  ): Promise<string> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    if (relativePath) {
      const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath
      return readProjectGitCommitDiff(resolvedTarget.projectPath, commitHash, normalizedRelativePath)
    }

    return readProjectGitCommitDiff(resolvedTarget.projectPath, commitHash)
  }
}
