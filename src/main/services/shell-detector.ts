import { existsSync } from 'fs'
import { homedir } from 'os'
import { dirname, join } from 'path'

export interface DetectedShell {
  id: string
  label: string
  path: string
}

// Git Bash 候选：不再只硬编码 C:\Program Files\Git。
// ① 遍历各 Program 目录（含 x86/W6432 与用户级安装 LOCALAPPDATA\Programs）；
// ② 从 PATH 里的 git.exe 反推安装根目录，覆盖 D 盘 / 自定义路径安装。
function gitBashCandidates(): string[] {
  const candidates: string[] = []
  const localAppData = process.env.LOCALAPPDATA
  const programDirs = [
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    process.env.ProgramW6432,
    localAppData ? join(localAppData, 'Programs') : undefined
  ].filter((dir): dir is string => !!dir)

  for (const dir of programDirs) {
    candidates.push(join(dir, 'Git', 'bin', 'bash.exe'))
    candidates.push(join(dir, 'Git', 'usr', 'bin', 'bash.exe'))
  }

  // 从 PATH 中的 git 反推安装根目录（git 通常在 <root>\cmd 或 <root>\bin 下）。
  const gitPath = findExecutableInPath('git', ['.exe'])
  if (gitPath) {
    const root = dirname(dirname(gitPath))
    candidates.push(join(root, 'bin', 'bash.exe'))
    candidates.push(join(root, 'usr', 'bin', 'bash.exe'))
  }

  return candidates
}

const WINDOWS_EXECUTABLE_EXTENSIONS = ['.exe', '.cmd', '.bat', '.com', '']

function windowsUserExecutableDirs(): string[] {
  if (process.platform !== 'win32') return []
  const home = homedir()
  const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local')
  const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming')
  return [
    join(home, '.local', 'bin'),
    join(localAppData, 'Microsoft', 'WinGet', 'Links'),
    join(appData, 'npm')
  ]
}

function uniqueExistingDirs(dirs: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const dir of dirs) {
    const key = process.platform === 'win32' ? dir.toLowerCase() : dir
    if (seen.has(key) || !existsSync(dir)) continue
    seen.add(key)
    result.push(dir)
  }
  return result
}

export function getExtraExecutablePathDirs(): string[] {
  return uniqueExistingDirs(windowsUserExecutableDirs())
}

export function findGitBashPath(): string | undefined {
  return gitBashCandidates().find((p) => existsSync(p))
}

// 在 PATH 中查找可执行文件；exts 为空数组时按 command 原名精确匹配
export function findExecutableInPath(
  command: string,
  exts: string[] = WINDOWS_EXECUTABLE_EXTENSIONS
): string | null {
  const pathEnv = process.env.PATH || ''
  const separator = process.platform === 'win32' ? ';' : ':'
  const candidates = exts.length > 0 ? exts : ['']

  const searchDirs = process.platform === 'win32'
    ? [...pathEnv.split(separator).filter(Boolean), ...getExtraExecutablePathDirs()]
    : pathEnv.split(separator).filter(Boolean)

  for (const dir of searchDirs) {
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
