import { homedir } from 'os'
import { join } from 'path'
import type { CliType } from '../../shared/cli-types'

const HOME = homedir()

export type EditableCliType = Exclude<CliType, 'terminal'>
export type ConfigFormat = 'json' | 'toml' | 'yaml'

export interface CliConfigPathContext {
  homeDir?: string
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

export interface CliConfigDescriptor {
  cliType: EditableCliType
  format: ConfigFormat
  displayPath: string
  allowCreate: boolean
  resolvePath: (context?: CliConfigPathContext) => string
}

function contextValues(context: CliConfigPathContext = {}): {
  homeDir: string
  env: NodeJS.ProcessEnv
  platform: NodeJS.Platform
} {
  return {
    homeDir: context.homeDir ?? homedir(),
    env: context.env ?? process.env,
    platform: context.platform ?? process.platform
  }
}

function resolvePiPath(context?: CliConfigPathContext): string {
  const { homeDir, env } = contextValues(context)
  const root = env.PI_CODING_AGENT_DIR?.trim() || join(homeDir, '.pi', 'agent')
  return join(root, 'settings.json')
}

function resolveOmpPath(context?: CliConfigPathContext): string {
  const { homeDir, env } = contextValues(context)
  const explicitRoot = env.PI_CODING_AGENT_DIR?.trim()
  if (explicitRoot) return join(explicitRoot, 'config.yml')

  const profile = env.OMP_PROFILE?.trim() || env.PI_PROFILE?.trim()
  if (profile) return join(homeDir, '.omp', 'profiles', profile, 'agent', 'config.yml')
  return join(homeDir, '.omp', 'agent', 'config.yml')
}

function resolveGrokPath(context?: CliConfigPathContext): string {
  const { homeDir, env } = contextValues(context)
  return join(env.GROK_HOME?.trim() || join(homeDir, '.grok'), 'config.toml')
}

function resolveHermesPath(context?: CliConfigPathContext): string {
  const { homeDir, env, platform } = contextValues(context)
  const explicitRoot = env.HERMES_HOME?.trim()
  if (explicitRoot) return join(explicitRoot, 'config.yaml')
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA?.trim()
    if (localAppData) return join(localAppData, 'hermes', 'config.yaml')
  }
  return join(homeDir, '.hermes', 'config.yaml')
}

export const CLI_CONFIG_DESCRIPTORS: Readonly<Record<EditableCliType, CliConfigDescriptor>> = {
  claude: {
    cliType: 'claude',
    format: 'json',
    displayPath: '~/.claude/settings.json',
    allowCreate: true,
    resolvePath: (context) => join(contextValues(context).homeDir, '.claude', 'settings.json')
  },
  codex: {
    cliType: 'codex',
    format: 'toml',
    displayPath: '~/.codex/config.toml',
    allowCreate: true,
    resolvePath: (context) => join(contextValues(context).homeDir, '.codex', 'config.toml')
  },
  opencode: {
    cliType: 'opencode',
    format: 'json',
    displayPath: '~/.config/opencode/opencode.json',
    allowCreate: true,
    resolvePath: (context) => join(contextValues(context).homeDir, '.config', 'opencode', 'opencode.json')
  },
  gemini: {
    cliType: 'gemini',
    format: 'json',
    displayPath: '~/.gemini/settings.json',
    allowCreate: true,
    resolvePath: (context) => join(contextValues(context).homeDir, '.gemini', 'settings.json')
  },
  pi: {
    cliType: 'pi',
    format: 'json',
    displayPath: '${PI_CODING_AGENT_DIR:-~/.pi/agent}/settings.json',
    allowCreate: true,
    resolvePath: resolvePiPath
  },
  omp: {
    cliType: 'omp',
    format: 'yaml',
    displayPath: '${PI_CODING_AGENT_DIR:-~/.omp/agent}/config.yml',
    allowCreate: true,
    resolvePath: resolveOmpPath
  },
  grok: {
    cliType: 'grok',
    format: 'toml',
    displayPath: '${GROK_HOME:-~/.grok}/config.toml',
    allowCreate: true,
    resolvePath: resolveGrokPath
  },
  hermes: {
    cliType: 'hermes',
    format: 'yaml',
    displayPath: '${HERMES_HOME}/config.yaml',
    allowCreate: true,
    resolvePath: resolveHermesPath
  }
}

export function isEditableCliType(value: unknown): value is EditableCliType {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CLI_CONFIG_DESCRIPTORS, value)
}

export function getCliConfigDescriptor(cliType: EditableCliType): CliConfigDescriptor {
  return CLI_CONFIG_DESCRIPTORS[cliType]
}

export function resolveCliConfigPath(
  cliType: EditableCliType,
  context?: CliConfigPathContext
): string {
  return getCliConfigDescriptor(cliType).resolvePath(context)
}

export const CLAUDE_GLOBAL_CONFIG = join(HOME, '.claude', 'settings.json')
export const CLAUDE_COMMANDS_DIR = join(HOME, '.claude', 'commands')
export const CODEX_CONFIG = join(HOME, '.codex', 'config.toml')
export const OPENCODE_GLOBAL_CONFIG = join(HOME, '.config', 'opencode', 'opencode.json')

export function claudeProjectConfig(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json')
}
