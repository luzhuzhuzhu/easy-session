import { execFile } from 'child_process'
import type { Dirent } from 'fs'
import { extname, normalize, parse, relative, resolve, sep } from 'path'

const IGNORED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', 'release', 'out', 'dist'])

export function normalizeFsPath(rawPath: string): string {
  let normalizedPath = normalize(resolve(rawPath))
  const root = parse(normalizedPath).root
  if (normalizedPath !== root) {
    normalizedPath = normalizedPath.replace(/[\\/]+$/, '')
  }
  return normalizedPath
}

export function toPortablePath(pathValue: string): string {
  return pathValue.replace(/\\/g, '/')
}

export function ensureInsideRoot(rootPath: string, relativePath = ''): { absolutePath: string; normalizedRelativePath: string } {
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

export function shouldIgnoreDirectory(name: string): boolean {
  return IGNORED_DIRECTORY_NAMES.has(name) || name.startsWith('.tmp')
}

export function isMarkdownFile(pathValue: string): boolean {
  const ext = extname(pathValue).toLowerCase()
  return ext === '.md' || ext === '.markdown' || ext === '.mdown' || ext === '.mkd'
}

export function looksBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 4096)
  for (let i = 0; i < sampleLength; i += 1) {
    if (buffer[i] === 0) return true
  }
  return false
}

export function execFileText(command: string, args: string[]): Promise<string> {
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

export async function tryExecFileText(command: string, args: string[]): Promise<string | null> {
  try {
    return await execFileText(command, args)
  } catch {
    return null
  }
}

export function isCommandMissing(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  )
}

export function isGitCommandFailed(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'number'
  )
}

export function shouldTreatGitStatusAsUntracked(code: string): boolean {
  return code === '??'
}

export function compareEntries(a: Dirent, b: Dirent): number {
  if (a.isDirectory() && !b.isDirectory()) return -1
  if (!a.isDirectory() && b.isDirectory()) return 1
  return a.name.localeCompare(b.name, 'zh-CN')
}
