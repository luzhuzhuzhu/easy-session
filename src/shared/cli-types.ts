// 会话类型的单一来源：主进程、远程路由、渲染层统一从这里取值，
// 新增会话类型时只改这一个文件（显示名、徽章字母、运行时校验随之生效）。

export const CLI_TYPES = ['claude', 'codex', 'opencode', 'terminal'] as const

export type CliType = (typeof CLI_TYPES)[number]

export function isCliType(value: unknown): value is CliType {
  return typeof value === 'string' && (CLI_TYPES as readonly string[]).includes(value)
}

export const CLI_TYPE_DISPLAY_NAMES: Record<CliType, string> = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
  terminal: 'Terminal'
}

export const CLI_TYPE_BADGE_LETTERS: Record<CliType, string> = {
  claude: 'C',
  codex: 'X',
  opencode: 'O',
  terminal: 'T'
}

export function cliTypeBadgeLetter(type: string): string {
  return CLI_TYPE_BADGE_LETTERS[type as CliType] ?? 'O'
}

// 默认会话名 "Claude-001" 等的解析正则，由显示名派生，保证与生成逻辑一致
export const CLI_TYPE_NAME_PATTERN = new RegExp(
  `^(?:${Object.values(CLI_TYPE_DISPLAY_NAMES).join('|')})-(\\d+)$`
)

export interface CustomCliArgument {
  name: string
  value?: string
}
