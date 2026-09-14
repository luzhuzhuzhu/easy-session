import { homedir } from 'os'
import { join } from 'path'
import { pathContext, resolveCliRoot, resolveOpenCodeConfig, type CliPathContext } from './cli-paths'
import type { CliType } from '../../shared/cli-types'

const HOME = homedir()

export type EditableCliType = Exclude<CliType, 'terminal'>
export type ConfigFormat = 'json' | 'jsonc' | 'toml' | 'yaml'

export type CliConfigPathContext = CliPathContext

export interface CliConfigDescriptor {
  cliType: EditableCliType
  format: ConfigFormat
  displayPath: string
  allowCreate: boolean
  resolvePath: (context?: CliConfigPathContext) => string
}

function configFile(cli: EditableCliType, file: string, context?: CliConfigPathContext): string {
  return pathContext(context).path.join(resolveCliRoot(cli, context), file)
}

export const CLI_CONFIG_DESCRIPTORS: Readonly<Record<EditableCliType, CliConfigDescriptor>> = {
  claude: {
    cliType: 'claude',
    format: 'json',
    displayPath: '~/.claude/settings.json',
    allowCreate: true,
    resolvePath: (context) => configFile('claude', 'settings.json', context)
  },
  codex: {
    cliType: 'codex',
    format: 'toml',
    displayPath: '~/.codex/config.toml',
    allowCreate: true,
    resolvePath: (context) => configFile('codex', 'config.toml', context)
  },
  opencode: {
    cliType: 'opencode',
    format: 'json',
    displayPath: '~/.config/opencode/opencode.json',
    allowCreate: true,
    resolvePath: resolveOpenCodeConfig
  },
  gemini: {
    cliType: 'gemini',
    format: 'json',
    displayPath: '~/.gemini/settings.json',
    allowCreate: true,
    resolvePath: (context) => configFile('gemini', 'settings.json', context)
  },
  pi: {
    cliType: 'pi',
    format: 'json',
    displayPath: '${PI_CODING_AGENT_DIR:-~/.pi/agent}/settings.json',
    allowCreate: true,
    resolvePath: (context) => configFile('pi', 'settings.json', context)
  },
  omp: {
    cliType: 'omp',
    format: 'yaml',
    displayPath: '${PI_CODING_AGENT_DIR:-~/.omp/agent}/config.yml',
    allowCreate: true,
    resolvePath: (context) => configFile('omp', 'config.yml', context)
  },
  grok: {
    cliType: 'grok',
    format: 'toml',
    displayPath: '${GROK_HOME:-~/.grok}/config.toml',
    allowCreate: true,
    resolvePath: (context) => configFile('grok', 'config.toml', context)
  },
  hermes: {
    cliType: 'hermes',
    format: 'yaml',
    displayPath: '${HERMES_HOME}/config.yaml',
    allowCreate: true,
    resolvePath: (context) => configFile('hermes', 'config.yaml', context)
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
