import { readdir, readFile, stat } from 'fs/promises'
import type { Dirent } from 'fs'
import {
  compareEntries,
  ensureInsideRoot,
  isMarkdownFile,
  looksBinary,
  shouldIgnoreDirectory
} from './project-inspector-shared'
import type {
  ProjectFileReadResult,
  ProjectFileTreeEntry,
  ProjectFileTreeResult,
  ProjectInspectorResolvedTarget
} from './project-inspector'

const MAX_PREVIEW_BYTES = 512 * 1024

export async function listProjectFileTree(
  target: ProjectInspectorResolvedTarget,
  relativePath = ''
): Promise<ProjectFileTreeResult> {
  const { absolutePath, normalizedRelativePath } = ensureInsideRoot(target.projectPath, relativePath)
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
    target,
    parentRelativePath: normalizedRelativePath,
    entries: visibleEntries
  }
}

export async function readProjectFile(
  target: ProjectInspectorResolvedTarget,
  relativePath: string
): Promise<ProjectFileReadResult> {
  const { absolutePath, normalizedRelativePath } = ensureInsideRoot(target.projectPath, relativePath)
  const fileStats = await stat(absolutePath)

  if (!fileStats.isFile()) {
    throw new Error('只能读取项目目录中的文件')
  }

  if (fileStats.size > MAX_PREVIEW_BYTES) {
    return {
      target,
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
      target,
      relativePath: normalizedRelativePath,
      absolutePath,
      kind: 'binary',
      size: fileStats.size,
      content: null
    }
  }

  return {
    target,
    relativePath: normalizedRelativePath,
    absolutePath,
    kind: isMarkdownFile(absolutePath) ? 'markdown' : 'text',
    size: fileStats.size,
    content: buffer.toString('utf8')
  }
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
