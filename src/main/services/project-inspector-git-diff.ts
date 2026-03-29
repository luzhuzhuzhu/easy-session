import { execFileText, tryExecFileText } from './project-inspector-shared'

export async function readProjectGitDiff(
  projectPath: string,
  relativePath: string,
  viewMode: 'staged' | 'unstaged' | 'auto'
): Promise<string> {
  const diffCommands = viewMode === 'staged'
    ? [[
        '-C',
        projectPath,
        'diff',
        '--no-ext-diff',
        '--relative',
        '--cached',
        '--',
        relativePath
      ]]
    : viewMode === 'unstaged'
      ? [[
          '-C',
          projectPath,
          'diff',
          '--no-ext-diff',
          '--relative',
          '--',
          relativePath
        ]]
      : [
          [
            '-C',
            projectPath,
            'diff',
            '--no-ext-diff',
            '--relative',
            '--',
            relativePath
          ],
          [
            '-C',
            projectPath,
            'diff',
            '--no-ext-diff',
            '--relative',
            '--cached',
            '--',
            relativePath
          ]
        ]

  for (const args of diffCommands) {
    const result = await tryExecFileText('git', args)
    if (result && result.trim()) {
      return result
    }
  }

  return ''
}

export async function readProjectGitBranches(projectPath: string): Promise<[string, string]> {
  const [branchOutput, currentBranchOutput] = await Promise.all([
    execFileText('git', [
      '-C',
      projectPath,
      'for-each-ref',
      '--format=%(refname:short)%00%(refname)%00%(HEAD)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(objectname:short)%00%(committerdate:iso)%00%(contents:subject)',
      'refs/heads/',
      'refs/remotes/'
    ]),
    execFileText('git', [
      '-C',
      projectPath,
      'branch',
      '--show-current'
    ])
  ])

  return [branchOutput, currentBranchOutput]
}
