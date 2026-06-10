// claude / codex 内置常用启动参数描述表。
// 仅是 UI 糖：最终全部归一化为 customArgs 名/值数组拼到命令行，
// CLI 新版本参数变化时用户始终可以用自定义参数行兜底，留空即不传。
// 参数清单依据本机实测：Claude Code 2.1.170、Codex CLI 0.131.0。

import type { CustomCliArgument } from '@shared/cli-types'

export type { CustomCliArgument }

export type PresetCliType = 'claude' | 'codex'

export interface LaunchArgPreset {
  id: string
  name: string
  cliType: PresetCliType
  args: CustomCliArgument[]
}

export type BuiltinArgControl = 'select' | 'toggle' | 'text'

export interface BuiltinArgDescriptor {
  // 命令行 flag，同时作为表单状态的 key 与展示标签
  flag: string
  control: BuiltinArgControl
  // select 的候选值；同时允许手动输入其他值（候选只是快捷方式）
  options?: string[]
  placeholder?: string
}

export const CLAUDE_BUILTIN_ARGS: BuiltinArgDescriptor[] = [
  { flag: '--model', control: 'select', options: ['fable', 'opus', 'sonnet', 'haiku'] },
  {
    flag: '--permission-mode',
    control: 'select',
    options: ['default', 'acceptEdits', 'plan', 'dontAsk', 'auto', 'bypassPermissions']
  },
  { flag: '--effort', control: 'select', options: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { flag: '--dangerously-skip-permissions', control: 'toggle' },
  { flag: '--agent', control: 'text', placeholder: 'agent-name' },
  { flag: '--add-dir', control: 'text', placeholder: 'D:\\path\\to\\dir' }
]

export const CODEX_BUILTIN_ARGS: BuiltinArgDescriptor[] = [
  { flag: '--model', control: 'text', placeholder: 'gpt-5.5-codex' },
  { flag: '--search', control: 'toggle' },
  { flag: '--profile', control: 'text', placeholder: 'profile-name' },
  { flag: '--enable', control: 'text', placeholder: 'feature-name' }
]

export function getBuiltinArgDescriptors(cliType: string): BuiltinArgDescriptor[] {
  if (cliType === 'claude') return CLAUDE_BUILTIN_ARGS
  if (cliType === 'codex') return CODEX_BUILTIN_ARGS
  return []
}

// 表单状态：toggle 为 boolean，select/text 为 string
export type BuiltinArgState = Record<string, string | boolean>

export function createEmptyBuiltinState(descriptors: BuiltinArgDescriptor[]): BuiltinArgState {
  const state: BuiltinArgState = {}
  for (const descriptor of descriptors) {
    state[descriptor.flag] = descriptor.control === 'toggle' ? false : ''
  }
  return state
}

// 内置控件状态 → customArgs 条目（留空/关闭的不产出）
export function builtinStateToArgs(
  state: BuiltinArgState,
  descriptors: BuiltinArgDescriptor[]
): CustomCliArgument[] {
  const args: CustomCliArgument[] = []

  for (const descriptor of descriptors) {
    const value = state[descriptor.flag]
    if (descriptor.control === 'toggle') {
      if (value === true) args.push({ name: descriptor.flag })
      continue
    }
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    args.push({ name: descriptor.flag, value: trimmed })
  }

  return args
}

// 已保存的 customArgs → 内置控件状态 + 剩余自定义条目（编辑会话时回填表单）
export function splitArgsForForm(
  args: CustomCliArgument[] | undefined,
  descriptors: BuiltinArgDescriptor[]
): { builtinState: BuiltinArgState; customArgs: CustomCliArgument[] } {
  const builtinState = createEmptyBuiltinState(descriptors)
  const customArgs: CustomCliArgument[] = []
  const byFlag = new Map(descriptors.map((d) => [d.flag, d]))
  const consumed = new Set<string>()

  for (const arg of Array.isArray(args) ? args : []) {
    if (!arg || typeof arg.name !== 'string') continue
    const name = arg.name.trim()
    if (!name) continue

    const descriptor = byFlag.get(name)
    // 同一 flag 出现多次时，第一次进内置控件，其余保留为自定义行
    if (descriptor && !consumed.has(name)) {
      if (descriptor.control === 'toggle') {
        if (typeof arg.value === 'string' && arg.value.trim()) {
          // toggle flag 却带了值，按自定义处理避免丢失信息
          customArgs.push({ name, value: arg.value.trim() })
          continue
        }
        builtinState[name] = true
        consumed.add(name)
        continue
      }

      const value = typeof arg.value === 'string' ? arg.value.trim() : ''
      // select 控件只接收候选列表内的值；候选外的值（如新版 CLI 的新模型名）
      // 保留为自定义行，避免在表单中不可见或被 select 覆盖丢失
      const acceptable =
        descriptor.control === 'text' || (descriptor.options?.includes(value) ?? true)
      if (value && acceptable) {
        builtinState[name] = value
        consumed.add(name)
        continue
      }
      // 带值控件没有值，或值不在候选列表内，保留为自定义行
      customArgs.push(value ? { name, value } : { name })
      continue
    }

    customArgs.push(
      typeof arg.value === 'string' && arg.value.trim()
        ? { name, value: arg.value.trim() }
        : { name }
    )
  }

  return { builtinState, customArgs }
}

export function normalizeLaunchArgPresets(input: unknown): LaunchArgPreset[] {
  if (!Array.isArray(input)) return []

  const presets: LaunchArgPreset[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const raw = item as Record<string, unknown>
    if (typeof raw.id !== 'string' || !raw.id) continue
    if (typeof raw.name !== 'string' || !raw.name.trim()) continue
    if (raw.cliType !== 'claude' && raw.cliType !== 'codex') continue

    const args: CustomCliArgument[] = []
    if (Array.isArray(raw.args)) {
      for (const arg of raw.args) {
        if (!arg || typeof arg !== 'object') continue
        const argRaw = arg as Record<string, unknown>
        if (typeof argRaw.name !== 'string' || !argRaw.name.trim()) continue
        args.push(
          typeof argRaw.value === 'string' && argRaw.value.trim()
            ? { name: argRaw.name.trim(), value: argRaw.value.trim() }
            : { name: argRaw.name.trim() }
        )
      }
    }

    presets.push({ id: raw.id, name: raw.name.trim(), cliType: raw.cliType, args })
  }

  return presets
}
