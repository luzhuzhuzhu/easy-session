import type { CustomCliArgument } from './types'

export function normalizeCustomCliArgs(customArgs?: CustomCliArgument[]): string[] {
  if (!Array.isArray(customArgs)) return []

  const args: string[] = []
  for (const item of customArgs) {
    if (!item || typeof item.name !== 'string') continue

    const name = item.name.trim()
    if (!name) continue

    args.push(name)

    if (typeof item.value !== 'string') continue
    const value = item.value.trim()
    if (value) args.push(value)
  }

  return args
}
