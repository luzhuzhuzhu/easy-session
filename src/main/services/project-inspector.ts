import { execFile } from 'child_process'
import { access, readdir, readFile, stat } from 'fs/promises'
import { basename, extname, normalize, parse, relative, resolve, sep } from 'path'
import type { Dirent } from 'fs'
import type { ProjectManager } from './project-manager'
import type { SessionManager } from './session-manager'

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

interface GitContextReady {
  state: 'ready'
  repoRoot: string
  projectSubpath: string
}

interface GitContextUnavailable {
  state: Exclude<ProjectGitState, 'ready'>
  repoRoot: null
  projectSubpath: ''
  message: string
}

type GitContext = GitContextReady | GitContextUnavailable

interface GitGraphContext {
  currentBranch: string | null
  upstreamBranch: string | null
  ahead: number
  behind: number
}

const MAX_PREVIEW_BYTES = 512 * 1024
const IGNORED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', 'release', 'out', 'dist'])

function normalizeFsPath(rawPath: string): string {
  let normalizedPath = normalize(resolve(rawPath))
  const root = parse(normalizedPath).root
  if (normalizedPath !== root) {
    normalizedPath = normalizedPath.replace(/[\\/]+$/, '')
  }
  return normalizedPath
}

function toPortablePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/')
}

function ensureInsideRoot(rootPath: string, relativePath = ''): { absolutePath: string; normalizedRelativePath: string } {
  const absolutePath = normalizeFsPath(resolve(rootPath, relativePath || '.'))
  const root = normalizeFsPath(rootPath)
  const rel = relative(root, absolutePath)
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    throw new Error('只允许访问当前项目目录中的文件')
  }

  return {
    absolutePath,
    normalizedRelativePath: rel === '' ? '' : toPortablePath(rel)
  }
}

function shouldIgnoreDirectory(name: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(name) || name.startsWith('.tmp')
}

function classifyGitStatus(code: string): ProjectGitStatusItem['status'] {
  if (code === '??') return 'untracked'
  if (code === '!!') return 'unknown'
  const x = code[0]
  const y = code[1]
  if (x === 'U' || y === 'U' || code === 'AA' || code === 'DD') return 'conflicted'
  if (x === 'R' || y === 'R') return 'renamed'
  if (x === 'C' || y === 'C') return 'copied'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'M' || y === 'M') return 'modified'
  return 'unknown'
}

function isMarkdownFile(pathValue: string): boolean {
  const ext = extname(pathValue).toLowerCase()
  return ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkd'
}

function looksBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 4096)
  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] === 0) return true
  }
  return false
}

function execFileText(command: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, rejectPromise) => {
    execFile(
      command,
      args,
      { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout) => {
        if (error) {
          rejectPromise(error)
          return
        }
        resolvePromise(stdout)
      }
    )
  })
}

async function tryExecFileText(command: string, args: string[]): Promise<string | null> {
  try {
    return await execFileText(command, args)
  } catch {
    return null
  }
}

function isCommandMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

function isGitCommandFailed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'number'
  )
}

function parseGitStatusLine(line: string): ProjectGitStatusItem[] {
  if (!line || line.length < 3) return []
  const code = line.slice(0, 2)
  const rawPath = line.slice(3).trim()
  if (!rawPath) return []

  if (code === '??') {
    return [{
      path: toPortablePath(rawPath),
      status: 'untracked',
      staged: false
    }]
  }

  const x = code[0]
  const y = code[1]
  const hasStaged = x !== ' ' && x !== '?' && x !== '!'
  const hasUnstaged = y !== ' ' && y !== '?' && y !== '!'

  let path: string
  let previousPath: string | undefined
  if (rawPath.includes(' -> ')) {
    const [prev, next] = rawPath.split(/\s+->\s+/)
    previousPath = toPortablePath(prev)
    path = toPortablePath(next)
  } else {
    path = toPortablePath(rawPath)
  }

  const results: ProjectGitStatusItem[] = []

  if (hasStaged) {
    results.push({
      path,
      previousPath,
      status: classifyGitStatus(x),
      staged: true
    })
  }

  if (hasUnstaged) {
    results.push({
      path,
      previousPath,
      status: classifyGitStatus(y),
      staged: false
    })
  }

  return results
}

export class ProjectInspectorService {
  constructor(
    private readonly projectManager: ProjectManager,
    private readonly sessionManager: SessionManager
  ) {}

  private async ensurePathExists(pathValue: string): Promise<void> {
    try {
      await access(pathValue)
    } catch {
      throw new Error(`项目路径不存在：${pathValue}`)
    }
  }

  private async resolveTarget(target: ProjectInspectorTarget): Promise<ProjectInspectorResolvedTarget> {
    if (target.projectId) {
      const project = this.projectManager.getProject(target.projectId)
      if (!project) {
        throw new Error(`未找到项目：${target.projectId}`)
      }

      await this.ensurePathExists(project.path)
      return {
        projectPath: normalizeFsPath(project.path),
        projectName: project.name || basename(project.path)
      }
    }

    if (typeof target.projectPath === 'string' && target.projectPath.trim()) {
      const normalizedPath = normalizeFsPath(target.projectPath)
      const storedProject = this.projectManager.getProjectByPath(normalizedPath)
      if (storedProject) {
        await this.ensurePathExists(storedProject.path)
        return {
          projectPath: normalizeFsPath(storedProject.path),
          projectName: storedProject.name || basename(storedProject.path)
        }
      }

      const sessionMatch = this.sessionManager.listSessions({ projectPath: normalizedPath })[0]
      if (sessionMatch) {
        await this.ensurePathExists(normalizedPath)
        return {
          projectPath: normalizedPath,
          projectName: basename(normalizedPath)
        }
      }
    }

    throw new Error('未找到可检查的本地项目')
  }

  private async resolveGitContext(projectPath: string): Promise<GitContext> {
    try {
      const stdout = await execFileText('git', ['-C', projectPath, 'rev-parse', '--show-toplevel', '--show-prefix'])
      const [repoRootLine = '', projectSubpathLine = ''] = stdout.split(/\r?\n/)
      return {
        state: 'ready',
        repoRoot: normalizeFsPath(repoRootLine.trim()),
        projectSubpath: toPortablePath(projectSubpathLine.trim().replace(/\/+$/, ''))
      }
    } catch (error) {
      if (isCommandMissing(error)) {
        return {
          state: 'git-unavailable',
          repoRoot: null,
          projectSubpath: '',
          message: '系统中未检测到 Git，已自动降级为仅文件浏览模式'
        }
      }

      if (isGitCommandFailed(error)) {
        return {
          state: 'non-git',
          repoRoot: null,
          projectSubpath: '',
          message: '当前项目目录不是 Git 仓库，已自动降级为仅文件浏览模式'
        }
      }

      return {
        state: 'error',
        repoRoot: null,
        projectSubpath: '',
        message: error instanceof Error ? error.message : '读取 Git 状态失败'
      }
    }
  }

  async listFileTree(target: ProjectInspectorTarget, relativePath = ''): Promise<ProjectFileTreeResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const { absolutePath, normalizedRelativePath } = ensureInsideRoot(resolvedTarget.projectPath, relativePath)
    const stats = await stat(absolutePath)

    if (!stats.isDirectory()) {
      throw new Error('只能展开项目目录中的文件夹')
    }

    const entries = await readdir(absolutePath, { withFileTypes: true, encoding: 'utf8' })
    const visibleEntries = entries
      .filter((entry) => !(entry.isDirectory() && shouldIgnoreDirectory(entry.name)))
      .sort((a, b) => compareEntries(a, b))
      .map((entry) => toTreeEntry(normalizedRelativePath, entry))

    return {
      target: resolvedTarget,
      parentRelativePath: normalizedRelativePath,
      entries: visibleEntries
    }
  }

  async readFile(target: ProjectInspectorTarget, relativePath: string): Promise<ProjectFileReadResult> {
    const resolvedTarget = await this.resolveTarget(target)
    const { absolutePath, normalizedRelativePath } = ensureInsideRoot(resolvedTarget.projectPath, relativePath)
    const fileStats = await stat(absolutePath)

    if (!fileStats.isFile()) {
      throw new Error('只能读取项目目录中的文件')
    }

    if (fileStats.size > MAX_PREVIEW_BYTES) {
      return {
        target: resolvedTarget,
        relativePath: normalizedRelativePath,
        absolutePath,
        kind: 'too_large',
        size: fileStats.size,
        content: null
      }
    }

    const buffer = await readFile(absolutePath)
    if (looksBinary(buffer)) {
      return {
        target: resolvedTarget,
        relativePath: normalizedRelativePath,
        absolutePath,
        kind: 'binary',
        size: fileStats.size,
        content: null
      }
    }

    return {
      target: resolvedTarget,
      relativePath: normalizedRelativePath,
      absolutePath,
      kind: isMarkdownFile(absolutePath) ? 'markdown' : 'text',
      size: fileStats.size,
      content: buffer.toString('utf8')
    }
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

      const items = stdout
        .split(/\r?\n/)
        .flatMap((line) => parseGitStatusLine(line))
        .filter((item) => Boolean(item))

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
      const diffCommands = viewMode === 'staged'
        ? [[
            '-C',
            resolvedTarget.projectPath,
            'diff',
            '--no-ext-diff',
            '--relative',
            '--cached',
            '--',
            normalizedRelativePath
          ]]
        : viewMode === 'unstaged'
          ? [[
              '-C',
              resolvedTarget.projectPath,
              'diff',
              '--no-ext-diff',
              '--relative',
              '--',
              normalizedRelativePath
            ]]
          : [
              [
                '-C',
                resolvedTarget.projectPath,
                'diff',
                '--no-ext-diff',
                '--relative',
                '--',
                normalizedRelativePath
              ],
              [
                '-C',
                resolvedTarget.projectPath,
                'diff',
                '--no-ext-diff',
                '--relative',
                '--cached',
                '--',
                normalizedRelativePath
              ]
            ]

      let stdout = ''
      for (const args of diffCommands) {
        const result = await tryExecFileText('git', args)
        if (result && result.trim()) {
          stdout = result
          break
        }
      }

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
      const graphContext = options?.branch ? null : await this.readGitGraphContext(resolvedTarget.projectPath)
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
      let commits = this.buildGitGraphRows(this.parseGitLogOutput(stdout))
      if (!options?.branch && skip === 0 && graphContext) {
        commits = this.injectSyntheticGraphRows(commits, graphContext)
      }

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

      const commits = this.parseGitLogOutput(stdout)

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
      const [branchOutput, currentBranchOutput] = await Promise.all([
        execFileText('git', [
          '-C',
          resolvedTarget.projectPath,
          'for-each-ref',
          '--format=%(refname:short)%00%(refname)%00%(HEAD)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(objectname:short)%00%(committerdate:iso)%00%(contents:subject)',
          'refs/heads/',
          'refs/remotes/'
        ]),
        execFileText('git', [
          '-C',
          resolvedTarget.projectPath,
          'branch',
          '--show-current'
        ])
      ])

      const currentBranch = currentBranchOutput.trim() || null
      const branches = this.parseBranchesOutput(branchOutput)

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

  private parseGitLogOutput(output: string): ProjectGitCommitItem[] {
    const commits: ProjectGitCommitItem[] = []
    const lines = output.split(/\r?\n/)

    for (const line of lines) {
      if (!line.trim()) continue

      const parts = line.split('\x01')
      if (parts.length < 9) continue

      const [hash, shortHash, message, author, authorEmail, date, relativeDate, parentsRaw, refsRaw] = parts

      const parents = parentsRaw?.trim() ? parentsRaw.trim().split(/\s+/) : []
      const refs = refsRaw?.trim()
        ? refsRaw.trim().split(',').map((r) => r.trim()).filter(Boolean)
        : []

      commits.push({
        hash: hash?.trim() ?? '',
        shortHash: shortHash?.trim() ?? '',
        message: message?.trim() ?? '',
        author: author?.trim() ?? '',
        authorEmail: authorEmail?.trim() ?? '',
        date: date?.trim() ?? '',
        relativeDate: relativeDate?.trim() ?? '',
        parents,
        refs,
        kind: 'commit',
        circleLaneIndex: 0,
        inputSwimlanes: [],
        outputSwimlanes: [],
        graphWidth: 1
      })
    }

    return commits
  }

  private buildGitGraphRows(commits: ProjectGitCommitItem[]): ProjectGitCommitItem[] {
    let previousOutput: ProjectGitSwimlane[] = []
    let laneCounter = 0
    let paletteCursor = 0

    return commits.map((commit, commitIndex) => {
      const inputSwimlanes = previousOutput.map((lane) => ({ ...lane }))
      let circleLaneIndex = inputSwimlanes.findIndex((lane) => lane.commitHash === commit.hash)

      if (circleLaneIndex === -1) {
        const insertedLane = this.createGraphLane(commit, laneCounter, paletteCursor)
        laneCounter += 1
        if (insertedLane.refType === 'palette') {
          paletteCursor += 1
        }
        circleLaneIndex = inputSwimlanes.length === 0 || commitIndex === 0 ? 0 : inputSwimlanes.length
        inputSwimlanes.splice(circleLaneIndex, 0, insertedLane)
      }

      const outputSwimlanes = inputSwimlanes.map((lane) => ({ ...lane }))
      if (commit.parents.length > 0) {
        outputSwimlanes[circleLaneIndex] = {
          ...outputSwimlanes[circleLaneIndex],
          commitHash: commit.parents[0]
        }
      } else {
        outputSwimlanes.splice(circleLaneIndex, 1)
      }

      for (const parentHash of commit.parents.slice(1)) {
        if (outputSwimlanes.some((lane) => lane.commitHash === parentHash)) continue
        outputSwimlanes.splice(
          Math.min(circleLaneIndex + 1, outputSwimlanes.length),
          0,
          this.createGraphLane(commit, laneCounter, paletteCursor, parentHash)
        )
        laneCounter += 1
        paletteCursor += 1
      }

      const dedupedOutput = this.dedupeGraphLanes(outputSwimlanes)
      const graphWidth = Math.max(inputSwimlanes.length, dedupedOutput.length, 1)

      previousOutput = dedupedOutput.map((lane) => ({ ...lane }))

      return {
        ...commit,
        kind: this.resolveCommitKind(commit),
        circleLaneIndex,
        inputSwimlanes,
        outputSwimlanes: dedupedOutput,
        graphWidth
      }
    })
  }

  private async readGitGraphContext(projectPath: string): Promise<GitGraphContext | null> {
    try {
      const currentBranchRaw = await execFileText('git', ['-C', projectPath, 'branch', '--show-current'])
      const currentBranch = currentBranchRaw.trim() || null
      if (!currentBranch) {
        return {
          currentBranch: null,
          upstreamBranch: null,
          ahead: 0,
          behind: 0
        }
      }

      const upstreamRaw = await tryExecFileText('git', [
        '-C',
        projectPath,
        'rev-parse',
        '--abbrev-ref',
        '--symbolic-full-name',
        '@{upstream}'
      ])

      const upstreamBranch = upstreamRaw?.trim() || null
      if (!upstreamBranch) {
        return { currentBranch, upstreamBranch: null, ahead: 0, behind: 0 }
      }

      const countsRaw = await tryExecFileText('git', [
        '-C',
        projectPath,
        'rev-list',
        '--left-right',
        '--count',
        `HEAD...${upstreamBranch}`
      ])

      const [aheadRaw = '0', behindRaw = '0'] = countsRaw?.trim().split(/\s+/) ?? []
      return {
        currentBranch,
        upstreamBranch,
        ahead: Number.parseInt(aheadRaw, 10) || 0,
        behind: Number.parseInt(behindRaw, 10) || 0
      }
    } catch {
      return null
    }
  }

  private injectSyntheticGraphRows(commits: ProjectGitCommitItem[], graphContext: GitGraphContext): ProjectGitCommitItem[] {
    if (!commits.length) return commits

    const headCommit = commits[0]
    const headLane = headCommit.inputSwimlanes[headCommit.circleLaneIndex] ?? this.createGraphLane(headCommit, 0, 0)
    const syntheticRows: ProjectGitCommitItem[] = []

    if (graphContext.ahead > 0) {
      syntheticRows.push({
        hash: `synthetic:outgoing:${headCommit.hash}`,
        shortHash: '',
        message: `Outgoing changes · ${graphContext.ahead}`,
        author: graphContext.currentBranch ?? '',
        authorEmail: '',
        date: '',
        relativeDate: '',
        parents: [],
        refs: graphContext.currentBranch ? [graphContext.currentBranch] : [],
        kind: 'outgoing-changes',
        circleLaneIndex: headCommit.circleLaneIndex,
        inputSwimlanes: [{ ...headLane }],
        outputSwimlanes: [{ ...headLane }],
        graphWidth: Math.max(headCommit.graphWidth, 1),
        syntheticCount: graphContext.ahead,
        syntheticRef: graphContext.currentBranch
      })
    }

    if (graphContext.behind > 0) {
      syntheticRows.push({
        hash: `synthetic:incoming:${headCommit.hash}`,
        shortHash: '',
        message: `Incoming changes · ${graphContext.behind}`,
        author: graphContext.upstreamBranch ?? '',
        authorEmail: '',
        date: '',
        relativeDate: '',
        parents: [],
        refs: graphContext.upstreamBranch ? [graphContext.upstreamBranch] : [],
        kind: 'incoming-changes',
        circleLaneIndex: headCommit.circleLaneIndex,
        inputSwimlanes: [{
          ...headLane,
          refType: 'remote',
          colorKey: graphContext.upstreamBranch ? `remote:${graphContext.upstreamBranch}` : 'remote:upstream'
        }],
        outputSwimlanes: [{
          ...headLane,
          refType: 'remote',
          colorKey: graphContext.upstreamBranch ? `remote:${graphContext.upstreamBranch}` : 'remote:upstream'
        }],
        graphWidth: Math.max(headCommit.graphWidth, 1),
        syntheticCount: graphContext.behind,
        syntheticRef: graphContext.upstreamBranch
      })
    }

    return syntheticRows.length ? [...syntheticRows, ...commits] : commits
  }

  private dedupeGraphLanes(lanes: ProjectGitSwimlane[]): ProjectGitSwimlane[] {
    const seen = new Set<string>()
    const result: ProjectGitSwimlane[] = []
    for (const lane of lanes) {
      if (seen.has(lane.id)) continue
      seen.add(lane.id)
      result.push(lane)
    }
    return result
  }

  private createGraphLane(
    commit: ProjectGitCommitItem,
    laneCounter: number,
    paletteCursor: number,
    commitHash = commit.hash
  ): ProjectGitSwimlane {
    const refType = this.resolveCommitRefType(commit)
    const colorKey = refType === 'palette'
      ? `palette:${paletteCursor % 5}`
      : `${refType}:${this.resolveLaneSemanticKey(commit)}`

    return {
      id: `lane:${laneCounter}`,
      commitHash,
      colorKey,
      refType
    }
  }

  private resolveCommitKind(commit: ProjectGitCommitItem): ProjectGitCommitItem['kind'] {
    if (commit.refs.some((ref) => ref.startsWith('HEAD ->') || ref === 'HEAD')) {
      return 'head'
    }
    if (commit.parents.length > 1) {
      return 'merge'
    }
    return 'commit'
  }

  private resolveCommitRefType(commit: ProjectGitCommitItem): ProjectGitSwimlane['refType'] {
    if (commit.refs.some((ref) => ref.startsWith('HEAD ->') || ref === 'HEAD')) {
      return 'local'
    }
    if (commit.refs.some((ref) => ref.startsWith('origin/') || ref.includes('remotes/'))) {
      return 'remote'
    }
    if (commit.refs.some((ref) => ref.startsWith('base:'))) {
      return 'base'
    }
    if (commit.refs.some((ref) => !ref.startsWith('tag:') && !ref.includes('/'))) {
      return 'local'
    }
    return 'palette'
  }

  private resolveLaneSemanticKey(commit: ProjectGitCommitItem): string {
    const firstRef = commit.refs.find((ref) => !ref.startsWith('tag:'))
    if (!firstRef) return commit.shortHash
    return firstRef.replace(/^HEAD ->\s*/, '').replace(/\s+/g, '-')
  }

  private parseBranchesOutput(output: string): ProjectGitBranchItem[] {
    const branches: ProjectGitBranchItem[] = []
    const lines = output.split('\n')

    for (const line of lines) {
      if (!line.trim()) continue

      const parts = line.split('\0')
      if (parts.length < 7) continue

      const [name, fullRefName, isHead, upstream, tracking, commitHash, commitDate, commitMessage] = parts

      const aheadBehind = this.parseAheadBehind(tracking)

      branches.push({
        name: name.trim(),
        isCurrent: isHead.trim() === '*',
        isRemote: fullRefName.trim().startsWith('refs/remotes/'),
        upstream: upstream?.trim() || null,
        ahead: aheadBehind.ahead,
        behind: aheadBehind.behind,
        lastCommit: commitHash?.trim()
          ? {
              hash: commitHash.trim(),
              date: commitDate?.trim() ?? '',
              message: commitMessage?.trim() ?? ''
            }
          : null
      })
    }

    const localBranches = branches.filter((b) => !b.isRemote)
    const remoteBranches = branches.filter((b) => b.isRemote)
    localBranches.sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : a.name.localeCompare(b.name)))
    remoteBranches.sort((a, b) => a.name.localeCompare(b.name))

    return [...localBranches, ...remoteBranches]
  }

  private parseAheadBehind(tracking: string): { ahead: number; behind: number } {
    if (!tracking) return { ahead: 0, behind: 0 }

    const aheadMatch = tracking.match(/ahead (\d+)/)
    const behindMatch = tracking.match(/behind (\d+)/)

    return {
      ahead: aheadMatch ? parseInt(aheadMatch[1], 10) : 0,
      behind: behindMatch ? parseInt(behindMatch[1], 10) : 0
    }
  }

  async stageFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await execFileText('git', [
      '-C',
      resolvedTarget.projectPath,
      'add',
      '--',
      normalizedRelativePath
    ])
  }

  async unstageFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await execFileText('git', [
      '-C',
      resolvedTarget.projectPath,
      'restore',
      '--staged',
      '--',
      normalizedRelativePath
    ])
  }

  async discardFile(target: ProjectInspectorTarget, relativePath: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)
    const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    const status = await this.getGitStatus(target)
    const unstagedEntry = status.items.find((item) => item.path === normalizedRelativePath && !item.staged)
    if (!unstagedEntry) {
      return
    }

    if (unstagedEntry.status === 'untracked') {
      await execFileText('git', [
        '-C',
        resolvedTarget.projectPath,
        'clean',
        '-f',
        '--',
        normalizedRelativePath
      ])
      return
    }

    await execFileText('git', [
      '-C',
      resolvedTarget.projectPath,
      'restore',
      '--worktree',
      '--',
      normalizedRelativePath
    ])
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

    await execFileText('git', [
      '-C',
      resolvedTarget.projectPath,
      'commit',
      '-m',
      message.trim()
    ])
  }

  async checkoutBranch(target: ProjectInspectorTarget, branchName: string): Promise<void> {
    const resolvedTarget = await this.resolveTarget(target)
    const gitContext = await this.resolveGitContext(resolvedTarget.projectPath)

    if (gitContext.state !== 'ready') {
      throw new Error('当前项目不是 Git 仓库')
    }

    await execFileText('git', [
      '-C',
      resolvedTarget.projectPath,
      'checkout',
      branchName
    ])
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
      const parentHashRaw = await execFileText('git', [
        '-C',
        resolvedTarget.projectPath,
        'rev-parse',
        `${commitHash}^`
      ])
      const parentHash = parentHashRaw.trim() || null

      const changesOutput = await execFileText('git', [
        '-C',
        resolvedTarget.projectPath,
        'diff',
        '--name-status',
        '--no-renames',
        parentHash ? `${parentHash}..${commitHash}` : commitHash
      ])

      const changes: ProjectGitCommitChangeItem[] = []
      for (const line of changesOutput.split(/\r?\n/)) {
        if (!line.trim()) continue
        const [status, path] = line.split('\t')
        if (status && path) {
          changes.push({
            path: toPortablePath(path),
            status: this.parseChangeStatus(status.trim())
          })
        }
      }

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

    const args = [
      '-C',
      resolvedTarget.projectPath,
      'show',
      '--no-ext-diff',
      commitHash
    ]

    if (relativePath) {
      const normalizedRelativePath = ensureInsideRoot(resolvedTarget.projectPath, relativePath).normalizedRelativePath
      args.push('--', normalizedRelativePath)
    }

    return execFileText('git', args)
  }

  private parseChangeStatus(code: string): ProjectGitCommitChangeItem['status'] {
    switch (code) {
      case 'A': return 'added'
      case 'D': return 'deleted'
      case 'M': return 'modified'
      case 'R': return 'renamed'
      case 'C': return 'copied'
      default: return 'modified'
    }
  }
}

function compareEntries(a: Dirent, b: Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) return -1
  if (!a.isDirectory() && b.isDirectory()) return 1
  return a.name.localeCompare(b.name, 'zh-CN')
}

function toTreeEntry(parentRelativePath: string, entry: Dirent): ProjectFileTreeEntry {
  const relativePath = parentRelativePath
    ? `${parentRelativePath}/${entry.name}`
    : entry.name

  return {
    name: entry.name,
    relativePath,
    kind: entry.isDirectory() ? 'directory' : 'file',
    expandable: entry.isDirectory()
  }
}
