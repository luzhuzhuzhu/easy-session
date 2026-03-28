import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'

const execMocks = vi.hoisted(() => ({
  execFileMock: vi.fn()
}))

vi.mock('child_process', () => ({
  execFile: execMocks.execFileMock
}))

import { ProjectInspectorService } from '../src/main/services/project-inspector'

describe('ProjectInspectorService', () => {
  let tempDir: string
  let service: ProjectInspectorService
  let projectManager: any
  let sessionManager: any

  beforeEach(async () => {
    execMocks.execFileMock.mockReset()
    tempDir = await mkdtemp(join(tmpdir(), 'easysession-inspector-'))
    await mkdir(join(tempDir, 'docs'))
    await mkdir(join(tempDir, 'node_modules'))
    await writeFile(join(tempDir, 'README.md'), '# Demo\n\nhello', 'utf8')
    await writeFile(join(tempDir, 'notes.txt'), 'plain text', 'utf8')
    await writeFile(join(tempDir, 'binary.bin'), Buffer.from([0, 1, 2, 3]))

    projectManager = {
      getProject: vi.fn(),
      getProjectByPath: vi.fn((path: string) => (path === tempDir ? { id: 'project-1', name: 'Demo', path: tempDir } : undefined))
    }
    sessionManager = {
      listSessions: vi.fn(() => [{ id: 'session-1', projectPath: tempDir }])
    }
    service = new ProjectInspectorService(projectManager, sessionManager)
  })

  afterEach(async () => {
    await import('fs/promises').then(({ rm }) => rm(tempDir, { recursive: true, force: true }))
  })

  it('lists file tree entries and ignores heavy directories', async () => {
    const result = await service.listFileTree({ projectPath: tempDir })

    expect(result.target.projectPath).toBe(tempDir)
    expect(result.entries.map((entry) => entry.name)).toEqual(['docs', 'binary.bin', 'notes.txt', 'README.md'])
    expect(result.entries.some((entry) => entry.name === 'node_modules')).toBe(false)
  })

  it('reads markdown files as markdown preview content', async () => {
    const result = await service.readFile({ projectPath: tempDir }, 'README.md')

    expect(result.kind).toBe('markdown')
    expect(result.content).toContain('# Demo')
  })

  it('detects binary files and avoids previewing them', async () => {
    const result = await service.readFile({ projectPath: tempDir }, 'binary.bin')

    expect(result.kind).toBe('binary')
    expect(result.content).toBeNull()
  })

  it('returns non-git state when current project is not a git repository', async () => {
    execMocks.execFileMock.mockImplementation((_command: string, _args: string[], _options: any, callback: Function) => {
      callback(Object.assign(new Error('not a git repository'), { code: 128 }))
    })

    const result = await service.getGitStatus({ projectPath: tempDir })

    expect(result.state).toBe('non-git')
    expect(result.items).toEqual([])
    expect(result.message).toContain('不是 Git 仓库')
  })

  it('parses git status and diff for subdirectory repositories', async () => {
    execMocks.execFileMock.mockImplementation((command: string, args: string[], _options: any, callback: Function) => {
      expect(command).toBe('git')
      const subCommand = args[2]
      if (subCommand === 'rev-parse') {
        callback(null, `${join(tempDir, '..')}\napps/demo/\n`)
        return
      }
      if (subCommand === 'status') {
        callback(null, ' M README.md\n?? docs/guide.md\n')
        return
      }
      if (subCommand === 'diff') {
        callback(null, 'diff --git a/README.md b/README.md\n@@ -1 +1 @@\n-old\n+new\n')
        return
      }
      callback(new Error(`unexpected git command: ${subCommand}`))
    })

    const status = await service.getGitStatus({ projectPath: tempDir })
    const diff = await service.getGitDiff({ projectPath: tempDir }, 'README.md')

    expect(status.state).toBe('ready')
    expect(status.projectSubpath).toBe('apps/demo')
    expect(status.items.map((item) => item.path)).toEqual(['README.md', 'docs/guide.md'])
    expect(diff.diff).toContain('diff --git')
    expect(diff.projectSubpath).toBe('apps/demo')
  })

  it('falls back to cached diff when worktree diff is empty', async () => {
    execMocks.execFileMock.mockImplementation((command: string, args: string[], _options: any, callback: Function) => {
      expect(command).toBe('git')
      const subCommand = args[2]
      if (subCommand === 'rev-parse') {
        callback(null, `${tempDir}\n\n`)
        return
      }
      if (subCommand === 'status') {
        callback(null, 'M  README.md\n')
        return
      }
      if (subCommand === 'diff' && args.includes('--cached')) {
        callback(null, 'diff --git a/README.md b/README.md\n@@ -1 +1 @@\n-old\n+new staged\n')
        return
      }
      if (subCommand === 'diff') {
        callback(null, '')
        return
      }
      callback(new Error(`unexpected git command: ${subCommand}`))
    })

    const diff = await service.getGitDiff({ projectPath: tempDir }, 'README.md')

    expect(diff.diff).toContain('+new staged')
    expect(diff.message).toBeNull()
  })

  it('returns different diff content for staged and unstaged views of the same file', async () => {
    execMocks.execFileMock.mockImplementation((command: string, args: string[], _options: any, callback: Function) => {
      expect(command).toBe('git')
      const subCommand = args[2]
      if (subCommand === 'rev-parse') {
        callback(null, `${tempDir}\n\n`)
        return
      }
      if (subCommand === 'status') {
        callback(null, 'MM README.md\n')
        return
      }
      if (subCommand === 'diff' && args.includes('--cached')) {
        callback(null, 'diff --git a/README.md b/README.md\n@@ -1 +1 @@\n-old\n+staged\n')
        return
      }
      if (subCommand === 'diff') {
        callback(null, 'diff --git a/README.md b/README.md\n@@ -1 +1 @@\n-old\n+unstaged\n')
        return
      }
      callback(new Error(`unexpected git command: ${subCommand}`))
    })

    const unstagedDiff = await service.getGitDiff({ projectPath: tempDir }, 'README.md', { viewMode: 'unstaged' })
    const stagedDiff = await service.getGitDiff({ projectPath: tempDir }, 'README.md', { viewMode: 'staged' })

    expect(unstagedDiff.diff).toContain('+unstaged')
    expect(stagedDiff.diff).toContain('+staged')
    expect(unstagedDiff.viewMode).toBe('unstaged')
    expect(stagedDiff.viewMode).toBe('staged')
  })

  it('discards unstaged changes with restore and untracked files with clean', async () => {
    const calls: string[][] = []
    execMocks.execFileMock.mockImplementation((command: string, args: string[], _options: any, callback: Function) => {
      expect(command).toBe('git')
      calls.push(args)
      const subCommand = args[2]
      if (subCommand === 'rev-parse') {
        callback(null, `${tempDir}\n\n`)
        return
      }
      if (subCommand === 'status') {
        if (calls.filter((entry) => entry[2] === 'status').length === 1) {
          callback(null, ' M README.md\n')
          return
        }
        callback(null, '?? notes.txt\n')
        return
      }
      if (subCommand === 'restore' || subCommand === 'clean') {
        callback(null, '')
        return
      }
      callback(new Error(`unexpected git command: ${subCommand}`))
    })

    await service.discardFile({ projectPath: tempDir }, 'README.md')
    await service.discardFile({ projectPath: tempDir }, 'notes.txt')

    expect(calls.some((args) => args[2] === 'restore' && args.includes('--worktree') && args.includes('README.md'))).toBe(true)
    expect(calls.some((args) => args[2] === 'clean' && args.includes('notes.txt'))).toBe(true)
  })

  it('builds swimlane-based git graph rows for history instead of ascii graph text', async () => {
    const logArgs: string[][] = []
    execMocks.execFileMock.mockImplementation((command: string, args: string[], _options: any, callback: Function) => {
      expect(command).toBe('git')
      const subCommand = args[2]
      if (subCommand === 'rev-parse') {
        if (args.includes('@{upstream}')) {
          callback(null, 'origin/main\n')
          return
        }
        callback(null, `${tempDir}\n\n`)
        return
      }
      if (subCommand === 'branch') {
        callback(null, 'main\n')
        return
      }
      if (subCommand === 'rev-list') {
        callback(null, '2\t1\n')
        return
      }
      if (subCommand === 'log') {
        logArgs.push(args)
        callback(
          null,
          [
            ['cccccccc', 'ccccccc', 'HEAD commit', 'Alice', 'alice@example.com', '2026-03-28 10:00:00 +0800', '1 minute ago', 'bbbbbbbb', 'HEAD -> main, origin/main'].join('\x01'),
            ['bbbbbbbb', 'bbbbbbb', 'Merge branch feature', 'Alice', 'alice@example.com', '2026-03-28 09:00:00 +0800', '2 minutes ago', 'aaaaaaaa dddddddd', 'feature'].join('\x01'),
            ['dddddddd', 'ddddddd', 'Feature work', 'Bob', 'bob@example.com', '2026-03-28 08:00:00 +0800', '3 minutes ago', 'aaaaaaaa', 'origin/feature'].join('\x01'),
            ['aaaaaaaa', 'aaaaaaa', 'Base commit', 'Alice', 'alice@example.com', '2026-03-28 07:00:00 +0800', '4 minutes ago', '', ''].join('\x01')
          ].join('\n')
        )
        return
      }
      callback(new Error(`unexpected git command: ${subCommand}`))
    })

    const result = await service.getGitLog({ projectPath: tempDir })

    expect(result.state).toBe('ready')
    expect(result.commits).toHaveLength(6)
    expect(logArgs[0]).toContain('--branches')
    expect(logArgs[0]).toContain('--remotes')
    expect(result.commits[0].kind).toBe('outgoing-changes')
    expect(result.commits[1].kind).toBe('incoming-changes')
    expect(result.commits[2].kind).toBe('head')
    expect(result.commits[2].inputSwimlanes).toHaveLength(1)
    expect(result.commits[2].outputSwimlanes[0].commitHash).toBe('bbbbbbbb')
    expect(result.commits[3].kind).toBe('merge')
    expect(result.commits[3].outputSwimlanes).toHaveLength(2)
    expect(result.commits[3].graphWidth).toBeGreaterThan(1)
    expect(result.commits[3].outputSwimlanes[1].commitHash).toBe('dddddddd')
  })

  it('keeps local branches with slash as local branches instead of remote branches', async () => {
    execMocks.execFileMock.mockImplementation((command: string, args: string[], _options: any, callback: Function) => {
      expect(command).toBe('git')
      const subCommand = args[2]
      if (subCommand === 'rev-parse') {
        callback(null, `${tempDir}\n\n`)
        return
      }
      if (subCommand === 'for-each-ref') {
        callback(
          null,
          [
            ['main', 'refs/heads/main', '*', 'origin/main', 'ahead 1', 'aaaaaaa', '2026-03-28 10:00:00 +0800', 'Main commit'].join('\0'),
            ['feature/ui-refresh', 'refs/heads/feature/ui-refresh', ' ', '', '', 'bbbbbbb', '2026-03-28 09:00:00 +0800', 'Feature commit'].join('\0'),
            ['origin/main', 'refs/remotes/origin/main', ' ', '', '', 'ccccccc', '2026-03-28 08:00:00 +0800', 'Remote main'].join('\0')
          ].join('\n')
        )
        return
      }
      if (subCommand === 'branch') {
        callback(null, 'main\n')
        return
      }
      callback(new Error(`unexpected git command: ${subCommand}`))
    })

    const result = await service.getGitBranches({ projectPath: tempDir })

    expect(result.state).toBe('ready')
    expect(result.branches.find((item) => item.name === 'feature/ui-refresh')?.isRemote).toBe(false)
    expect(result.branches.find((item) => item.name === 'origin/main')?.isRemote).toBe(true)
  })
})
