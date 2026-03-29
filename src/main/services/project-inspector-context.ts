import { access } from 'fs/promises'
import { basename } from 'path'
import type { ProjectManager } from './project-manager'
import type { SessionManager } from './session-manager'
import {
  execFileText,
  isCommandMissing,
  isGitCommandFailed,
  normalizeFsPath,
  toPortablePath
} from './project-inspector-shared'
import type {
  ProjectGitState,
  ProjectInspectorResolvedTarget,
  ProjectInspectorTarget
} from './project-inspector'

export interface ProjectInspectorContextDeps {
  projectManager: ProjectManager
  sessionManager: SessionManager
}

export interface GitContextReady {
  state: 'ready'
  repoRoot: string
  projectSubpath: string
}

export interface GitContextUnavailable {
  state: Exclude<ProjectGitState, 'ready'>
  repoRoot: null
  projectSubpath: ''
  message: string
}

export type GitContext = GitContextReady | GitContextUnavailable

export async function resolveProjectInspectorTarget(
  deps: ProjectInspectorContextDeps,
  target: ProjectInspectorTarget
): Promise<ProjectInspectorResolvedTarget> {
  if (target.projectId) {
    const project = deps.projectManager.getProject(target.projectId)
    if (!project) {
      throw new Error(`未找到项目：${target.projectId}`)
    }

    await ensurePathExists(project.path)
    return {
      projectPath: normalizeFsPath(project.path),
      projectName: project.name || basename(project.path)
    }
  }

  if (typeof target.projectPath === 'string' && target.projectPath.trim()) {
    const normalizedPath = normalizeFsPath(target.projectPath)
    const storedProject = deps.projectManager.getProjectByPath(normalizedPath)
    if (storedProject) {
      await ensurePathExists(storedProject.path)
      return {
        projectPath: normalizeFsPath(storedProject.path),
        projectName: storedProject.name || basename(storedProject.path)
      }
    }

    const sessionMatch = deps.sessionManager.listSessions({ projectPath: normalizedPath })[0]
    if (sessionMatch) {
      await ensurePathExists(normalizedPath)
      return {
        projectPath: normalizedPath,
        projectName: basename(normalizedPath)
      }
    }
  }

  throw new Error('未找到可检查的本地项目')
}

export async function resolveProjectGitContext(projectPath: string): Promise<GitContext> {
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

async function ensurePathExists(pathValue: string): Promise<void> {
  try {
    await access(pathValue)
  } catch {
    throw new Error(`项目路径不存在：${pathValue}`)
  }
}
