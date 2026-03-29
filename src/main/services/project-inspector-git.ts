import {
  execFileText,
  toPortablePath,
  tryExecFileText
} from './project-inspector-shared'
import type {
  ProjectGitBranchItem,
  ProjectGitCommitChangeItem,
  ProjectGitCommitItem,
  ProjectGitStatusItem,
  ProjectGitSwimlane
} from './project-inspector'

interface GitGraphContext {
  currentBranch: string | null
  upstreamBranch: string | null
  ahead: number
  behind: number
}

export function parseGitStatusOutput(output: string): ProjectGitStatusItem[] {
  return output
    .split(/\r?\n/)
    .flatMap((line) => parseGitStatusLine(line))
    .filter((item) => Boolean(item))
}

export function parseGitLogOutput(output: string): ProjectGitCommitItem[] {
  const commits: ProjectGitCommitItem[] = []
  const lines = output.split(/\r?\n/)

  for (const line of lines) {
    if (!line.trim()) continue

    const parts = line.split('\x01')
    if (parts.length < 9) continue

    const [hash, shortHash, message, author, authorEmail, date, relativeDate, parentsRaw, refsRaw] = parts

    const parents = parentsRaw?.trim() ? parentsRaw.trim().split(/\s+/) : []
    const refs = refsRaw?.trim()
      ? refsRaw.trim().split(',').map((ref) => ref.trim()).filter(Boolean)
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

export function buildGitGraphRows(commits: ProjectGitCommitItem[]): ProjectGitCommitItem[] {
  let previousOutput: ProjectGitSwimlane[] = []
  let laneCounter = 0
  let paletteCursor = 0

  return commits.map((commit, commitIndex) => {
    const inputSwimlanes = previousOutput.map((lane) => ({ ...lane }))
    let circleLaneIndex = inputSwimlanes.findIndex((lane) => lane.commitHash === commit.hash)

    if (circleLaneIndex === -1) {
      const insertedLane = createGraphLane(commit, laneCounter, paletteCursor)
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
        createGraphLane(commit, laneCounter, paletteCursor, parentHash)
      )
      laneCounter += 1
      paletteCursor += 1
    }

    const dedupedOutput = dedupeGraphLanes(outputSwimlanes)
    const graphWidth = Math.max(inputSwimlanes.length, dedupedOutput.length, 1)

    previousOutput = dedupedOutput.map((lane) => ({ ...lane }))

    return {
      ...commit,
      kind: resolveCommitKind(commit),
      circleLaneIndex,
      inputSwimlanes,
      outputSwimlanes: dedupedOutput,
      graphWidth
    }
  })
}

export async function enrichGitLogRows(
  projectPath: string,
  commits: ProjectGitCommitItem[],
  options?: { branch?: string; skip?: number }
): Promise<ProjectGitCommitItem[]> {
  if (!commits.length || options?.branch || (options?.skip ?? 0) !== 0) {
    return commits
  }

  const graphContext = await readGitGraphContext(projectPath)
  if (!graphContext) {
    return commits
  }

  return injectSyntheticGraphRows(commits, graphContext)
}

export function parseBranchesOutput(output: string): ProjectGitBranchItem[] {
  const branches: ProjectGitBranchItem[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    if (!line.trim()) continue

    const parts = line.split('\0')
    if (parts.length < 7) continue

    const [name, fullRefName, isHead, upstream, tracking, commitHash, commitDate, commitMessage] = parts
    const aheadBehind = parseAheadBehind(tracking)

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

  const localBranches = branches.filter((branch) => !branch.isRemote)
  const remoteBranches = branches.filter((branch) => branch.isRemote)
  localBranches.sort((a, b) => (a.isCurrent ? -1 : b.isCurrent ? 1 : a.name.localeCompare(b.name)))
  remoteBranches.sort((a, b) => a.name.localeCompare(b.name))

  return [...localBranches, ...remoteBranches]
}

export function parseCommitChangeStatus(code: string): ProjectGitCommitChangeItem['status'] {
  switch (code) {
    case 'A': return 'added'
    case 'D': return 'deleted'
    case 'M': return 'modified'
    case 'R': return 'renamed'
    case 'C': return 'copied'
    default: return 'modified'
  }
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

async function readGitGraphContext(projectPath: string): Promise<GitGraphContext | null> {
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

function injectSyntheticGraphRows(commits: ProjectGitCommitItem[], graphContext: GitGraphContext): ProjectGitCommitItem[] {
  const headCommit = commits[0]
  const headLane = headCommit.inputSwimlanes[headCommit.circleLaneIndex] ?? createGraphLane(headCommit, 0, 0)
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

function dedupeGraphLanes(lanes: ProjectGitSwimlane[]): ProjectGitSwimlane[] {
  const seen = new Set<string>()
  const result: ProjectGitSwimlane[] = []
  for (const lane of lanes) {
    if (seen.has(lane.id)) continue
    seen.add(lane.id)
    result.push(lane)
  }
  return result
}

function createGraphLane(
  commit: ProjectGitCommitItem,
  laneCounter: number,
  paletteCursor: number,
  commitHash = commit.hash
): ProjectGitSwimlane {
  const refType = resolveCommitRefType(commit)
  const colorKey = refType === 'palette'
    ? `palette:${paletteCursor % 5}`
    : `${refType}:${resolveLaneSemanticKey(commit)}`

  return {
    id: `lane:${laneCounter}`,
    commitHash,
    colorKey,
    refType
  }
}

function resolveCommitKind(commit: ProjectGitCommitItem): ProjectGitCommitItem['kind'] {
  if (commit.refs.some((ref) => ref.startsWith('HEAD ->') || ref === 'HEAD')) {
    return 'head'
  }
  if (commit.parents.length > 1) {
    return 'merge'
  }
  return 'commit'
}

function resolveCommitRefType(commit: ProjectGitCommitItem): ProjectGitSwimlane['refType'] {
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

function resolveLaneSemanticKey(commit: ProjectGitCommitItem): string {
  const firstRef = commit.refs.find((ref) => !ref.startsWith('tag:'))
  if (!firstRef) return commit.shortHash
  return firstRef.replace(/^HEAD ->\s*/, '').replace(/\s+/g, '-')
}

function parseAheadBehind(tracking: string): { ahead: number; behind: number } {
  if (!tracking) return { ahead: 0, behind: 0 }

  const aheadMatch = tracking.match(/ahead (\d+)/)
  const behindMatch = tracking.match(/behind (\d+)/)

  return {
    ahead: aheadMatch ? parseInt(aheadMatch[1], 10) : 0,
    behind: behindMatch ? parseInt(behindMatch[1], 10) : 0
  }
}
