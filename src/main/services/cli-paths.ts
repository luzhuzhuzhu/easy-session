import { existsSync, readFileSync } from 'fs'
import { homedir } from 'os'
import { win32, posix } from 'path'
import type { CliType } from '../../shared/cli-types'

export interface CliPathContext {
  homeDir?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
  profile?: string
  cwd?: string
  exists?: (path: string) => boolean
}

export function pathContext(context: CliPathContext = {}) {
  const platform = context.platform ?? process.platform
  return {
    platform,
    path: platform === 'win32' ? win32 : posix,
    home: context.homeDir ?? homedir(),
    env: context.env ?? process.env,
    cwd: context.cwd ?? process.cwd(),
    exists: context.exists ?? existsSync
  }
}

export function expandCliPath(value: string, context?: CliPathContext): string {
  const c = pathContext(context)
  const trimmed = value.trim()
  const expanded = trimmed === '~' ? c.home : /^~[/\\]/.test(trimmed) ? c.path.join(c.home, trimmed.slice(2)) : trimmed
  return c.path.isAbsolute(expanded) ? c.path.normalize(expanded) : c.path.resolve(c.cwd, expanded)
}

function profileName(value: string | undefined): string | undefined {
  const name = value?.trim()
  if (!name || name === 'default') return undefined
  // Profiles are names, not paths. Never let a profile escape its root.
  if (!/^[\w][\w.-]*$/.test(name) || name === '..' || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    throw new Error('Invalid CLI profile name')
  }
  return name
}

export function resolveOmpDirectories(context?: CliPathContext) {
  const c = pathContext(context)
  const profile = profileName(c.env.OMP_PROFILE !== undefined ? c.env.OMP_PROFILE : c.env.PI_PROFILE)
  const base = c.path.join(c.home, c.env.PI_CONFIG_DIR?.trim() || '.omp')
  const configRoot = profile ? c.path.join(base, 'profiles', profile) : base
  const defaultAgent = c.path.join(configRoot, 'agent')
  const agent = !profile && c.env.PI_CODING_AGENT_DIR?.trim()
    ? expandCliPath(c.env.PI_CODING_AGENT_DIR, context) : defaultAgent
  const xdgData = c.env.XDG_DATA_HOME?.trim()
  const migratedData = xdgData ? c.path.join(expandCliPath(xdgData, context), 'omp', ...(profile ? ['profiles', profile] : [])) : ''
  const data = c.platform !== 'win32' && agent === defaultAgent && migratedData && c.exists(migratedData)
    ? migratedData : agent
  return { agent, sessions: c.path.join(data, 'sessions'), profile }
}

export function resolveCliRoot(cli: Exclude<CliType, 'terminal'>, context?: CliPathContext): string {
  const c = pathContext(context)
  const envRoot = (key: string, fallback: string) => c.env[key]?.trim() ? expandCliPath(c.env[key]!, context) : fallback
  switch (cli) {
    case 'claude': return envRoot('CLAUDE_CONFIG_DIR', c.path.join(c.home, '.claude'))
    case 'codex': return envRoot('CODEX_HOME', c.path.join(c.home, '.codex'))
    case 'opencode': return c.path.join(envRoot('XDG_CONFIG_HOME', c.path.join(c.home, '.config')), 'opencode')
    // GEMINI_CLI_HOME replaces HOME, not the final .gemini directory.
    case 'gemini': return c.path.join(envRoot('GEMINI_CLI_HOME', c.home), '.gemini')
    case 'pi': return envRoot('PI_CODING_AGENT_DIR', c.path.join(c.home, '.pi', 'agent'))
    case 'omp': return resolveOmpDirectories(context).agent
    case 'grok': return envRoot('GROK_HOME', c.path.join(c.home, '.grok'))
    case 'hermes': {
      const base = c.platform === 'win32'
        ? c.path.join(c.env.LOCALAPPDATA?.trim() || c.path.join(c.home, 'AppData', 'Local'), 'hermes')
        : c.path.join(c.home, '.hermes')
      const root = envRoot('HERMES_HOME', base)
      if (context?.profile !== undefined) {
        const name = profileName(context.profile)
        const profileRoot = c.path.basename(c.path.dirname(root)) === 'profiles' ? c.path.dirname(c.path.dirname(root)) : root
        return name ? c.path.join(profileRoot, 'profiles', name) : profileRoot
      }
      if (c.path.basename(c.path.dirname(root)) === 'profiles') return root
      // Match the upstream CLI's sticky profile selection; no scans across profiles.
      try {
        const relative = c.path.relative(base, root)
        const profileRoot = relative.startsWith('..') || c.path.isAbsolute(relative) ? root : base
        const active = profileName(readFileSync(c.path.join(profileRoot, 'active_profile'), 'utf8'))
        if (active) return c.path.join(profileRoot, 'profiles', active)
      } catch { /* no active profile, inaccessible or invalid marker */ }
      return root
    }
  }
}

export function resolveCliSessionsRoot(cli: 'pi' | 'omp', context?: CliPathContext): string {
  const c = pathContext(context)
  if (cli === 'omp') return resolveOmpDirectories(context).sessions
  if (c.env.PI_CODING_AGENT_SESSION_DIR?.trim()) return expandCliPath(c.env.PI_CODING_AGENT_SESSION_DIR, context)
  return c.path.join(resolveCliRoot('pi', context), 'sessions')
}

export function resolveOpenCodeConfig(context?: CliPathContext): string {
  const c = pathContext(context)
  if (c.env.OPENCODE_CONFIG?.trim()) return expandCliPath(c.env.OPENCODE_CONFIG, context)
  const roots = [
    ...(c.env.OPENCODE_CONFIG_DIR?.trim() ? [expandCliPath(c.env.OPENCODE_CONFIG_DIR, context)] : []),
    resolveCliRoot('opencode', context)
  ]
  for (const root of roots) {
    // Upstream loads JSON first, JSONC second (higher priority).
    for (const name of ['opencode.jsonc', 'opencode.json']) {
      const file = c.path.join(root, name)
      if (c.exists(file)) return file
    }
  }
  return c.path.join(roots[0], 'opencode.json')
}
