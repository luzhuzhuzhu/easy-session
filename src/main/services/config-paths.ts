import { homedir } from 'os'
import { join } from 'path'

const HOME = homedir()

export const CLAUDE_GLOBAL_CONFIG = join(HOME, '.claude', 'settings.json')
export const CLAUDE_COMMANDS_DIR = join(HOME, '.claude', 'commands')
export const CODEX_CONFIG = join(HOME, '.codex', 'config.json')

export function claudeProjectConfig(projectPath: string): string {
  return join(projectPath, '.claude', 'settings.json')
}
