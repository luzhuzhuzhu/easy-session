import { existsSync } from 'fs'
import { join } from 'path'

export interface DetectedShell {
  id: string
  label: string
  path: string
}

const GIT_BASH_CANDIDATES = [
  'C:\\Program Files\\Git\\bin\\bash.exe',
  'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
  'C:\\Program Files (x86)\\Git\\bin\\bash.exe'
]

const WINDOWS_EXECUTABLE_EXTENSIONS = ['.exe', '.cmd', '.bat', '.com', '']

export function findGitBashPath(): string | undefined {
  return GIT_BASH_CANDIDATES.find((p) => existsSync(p))
}

// 在 PATH 中查找可执行文件；exts 为空数组时按 command 原名精确匹配
export function findExecutableInPath(
  command: string,
  exts: string[] = WINDOWS_EXECUTABLE_EXTENSIONS
): string | null {
  const pathEnv = process.env.PATH || ''
  const separator = process.platform === 'win32' ? ';' : ':'
  const candidates = exts.length > 0 ? exts : ['']

  for (const dir of pathEnv.split(separator).filter(Boolean)) {
    for (const ext of candidates) {
      const candidate = join(dir, `${command}${ext}`)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

function detectWindowsShells(): DetectedShell[] {
  const shells: DetectedShell[] = []
  const systemRoot = process.env.SystemRoot || 'C:\\Windows'

  const cmdPath = process.env.ComSpec || join(systemRoot, 'System32', 'cmd.exe')
  if (existsSync(cmdPath)) {
    shells.push({ id: 'cmd', label: 'Command Prompt', path: cmdPath })
  }

  const powershellPath = join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  if (existsSync(powershellPath)) {
    shells.push({ id: 'powershell', label: 'Windows PowerShell', path: powershellPath })
  }

  const pwshPath = findExecutableInPath('pwsh', ['.exe'])
  if (pwshPath) {
    shells.push({ id: 'pwsh', label: 'PowerShell 7 (pwsh)', path: pwshPath })
  }

  const gitBashPath = findGitBashPath()
  if (gitBashPath) {
    shells.push({ id: 'git-bash', label: 'Git Bash', path: gitBashPath })
  }

  const wslPath = join(systemRoot, 'System32', 'wsl.exe')
  if (existsSync(wslPath)) {
    shells.push({ id: 'wsl', label: 'WSL', path: wslPath })
  }

  return shells
}

function detectUnixShells(): DetectedShell[] {
  const shells: DetectedShell[] = []
  const seen = new Set<string>()

  const userShell = process.env.SHELL
  if (userShell && existsSync(userShell)) {
    shells.push({ id: 'default', label: `Default (${userShell})`, path: userShell })
    seen.add(userShell)
  }

  for (const candidate of ['/bin/bash', '/bin/zsh', '/bin/sh']) {
    if (seen.has(candidate) || !existsSync(candidate)) continue
    shells.push({ id: candidate.split('/').pop() || candidate, label: candidate, path: candidate })
    seen.add(candidate)
  }

  return shells
}

// 已安装的 shell 在进程生命周期内不会变化，缓存避免每次 spawn/开对话框
// 都在主进程做同步 PATH 扫描
let cachedShells: DetectedShell[] | null = null

export function detectShells(): DetectedShell[] {
  if (!cachedShells) {
    cachedShells = process.platform === 'win32' ? detectWindowsShells() : detectUnixShells()
  }
  return cachedShells
}

// 将用户选择（检测到的 id 或任意路径）解析为可执行文件路径
export function resolveShellPath(shell: string | undefined): string {
  const trimmed = shell?.trim() || ''

  // 自定义路径直接放行，不触发检测扫描
  if (trimmed && (trimmed.includes('\\') || trimmed.includes('/') || existsSync(trimmed))) {
    return trimmed
  }

  const detected = detectShells()
  if (!trimmed) {
    const fallback = detected[0]?.path
    if (!fallback) throw new Error('No shell detected on this system')
    return fallback
  }

  const byId = detected.find((s) => s.id === trimmed)
  if (byId) return byId.path
  return trimmed
}
