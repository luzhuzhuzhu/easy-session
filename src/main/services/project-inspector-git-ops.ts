import { execFileText, toPortablePath } from './project-inspector-shared'
import { parseCommitChangeStatus } from './project-inspector-git'
import type { ProjectGitCommitChangeItem, ProjectGitStatusItem } from './project-inspector'

export async function stageProjectGitFile(projectPath: string, relativePath: string): Promise<void> {
  await execFileText('git', [
    '-C',
    projectPath,
    'add',
    '--',
    relativePath
  ])
}

export async function unstageProjectGitFile(projectPath: string, relativePath: string): Promise<void> {
  await execFileText('git', [
    '-C',
    projectPath,
    'restore',
    '--staged',
    '--',
    relativePath
  ])
}

export async function discardProjectGitFile(
  projectPath: string,
  relativePath: string,
  unstagedEntry: ProjectGitStatusItem | null
): Promise<void> {
  if (!unstagedEntry) {
    return
  }

  if (unstagedEntry.status === 'untracked') {
    await execFileText('git', [
      '-C',
      projectPath,
      'clean',
      '-f',
      '--',
      relativePath
    ])
    return
  }

  await execFileText('git', [
    '-C',
    projectPath,
    'restore',
    '--worktree',
    '--',
    relativePath
  ])
}

export async function commitProjectGitChanges(projectPath: string, message: string): Promise<void> {
  await execFileText('git', [
    '-C',
    projectPath,
    'commit',
    '-m',
    message.trim()
  ])
}

export async function checkoutProjectGitBranch(projectPath: string, branchName: string): Promise<void> {
  await execFileText('git', [
    '-C',
    projectPath,
    'checkout',
    branchName
  ])
}

export async function fetchProjectGitRemote(projectPath: string): Promise<void> {
  await execFileText('git', [
    '-C',
    projectPath,
    'fetch',
    '--all',
    '--prune'
  ])
}

export async function pullProjectGitCurrentBranch(projectPath: string): Promise<void> {
  await execFileText('git', [
    '-C',
    projectPath,
    'pull',
    '--ff-only'
  ])
}

export async function pushProjectGitCurrentBranch(projectPath: string): Promise<void> {
  await execFileText('git', [
    '-C',
    projectPath,
    'push'
  ])
}

export async function readProjectGitCommitChanges(
  projectPath: string,
  commitHash: string
): Promise<{ parentHash: string | null; changes: ProjectGitCommitChangeItem[] }> {
  const parentHashRaw = await execFileText('git', [
    '-C',
    projectPath,
    'rev-parse',
    `${commitHash}^`
  ])
  const parentHash = parentHashRaw.trim() || null

  const changesOutput = await execFileText('git', [
    '-C',
    projectPath,
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
        status: parseCommitChangeStatus(status.trim())
      })
    }
  }

  return {
    parentHash,
    changes
  }
}

export async function readProjectGitCommitDiff(
  projectPath: string,
  commitHash: string,
  relativePath?: string
): Promise<string> {
  const args = [
    '-C',
    projectPath,
    'show',
    '--no-ext-diff',
    commitHash
  ]

  if (relativePath) {
    args.push('--', relativePath)
  }

  return execFileText('git', args)
}
