// UX-5：快捷键单一注册表——三处硬编码（useShortcuts / MainLayout navItems /
// ShortcutHelpDialog）收敛到这一份定义。消费方式：
//  - useShortcuts：按 id 找 handler 行为
//  - ShortcutHelpDialog：按 group 渲染 label 与键位（自动与实际行为一致）
//  - 新增/改键只改这里 + 对应 handler 实现
export type ShortcutScope = 'navigation' | 'workspace' | 'help'

export interface ShortcutDef {
  id: string
  /** 展示用键位序列（帮助面板渲染顺序即按键顺序） */
  keys: string[]
  /** 归一化匹配键（e.key.toLowerCase()），与 keys[末位] 语义一致 */
  matchKey: string
  /** 是否需要 Ctrl/Meta 修饰 */
  primary: boolean
  scope: ShortcutScope
  /** i18n key：shortcuts.items.<labelKey> */
  labelKey: string
  /** 导航类快捷键的目标路径（仅 scope=navigation 使用） */
  path?: string
}

export const SHORTCUT_REGISTRY: readonly ShortcutDef[] = [
  // —— 导航（顺序即 navItems 顺序，Ctrl+1..6）——
  { id: 'nav.dashboard', keys: ['Ctrl', '1'], matchKey: '1', primary: true, scope: 'navigation', labelKey: 'shortcuts.items.dashboard', path: '/dashboard' },
  { id: 'nav.sessions', keys: ['Ctrl', '2'], matchKey: '2', primary: true, scope: 'navigation', labelKey: 'shortcuts.items.sessions', path: '/sessions' },
  { id: 'nav.collaboration', keys: ['Ctrl', '3'], matchKey: '3', primary: true, scope: 'navigation', labelKey: 'shortcuts.items.collaboration', path: '/collaboration' },
  { id: 'nav.projects', keys: ['Ctrl', '4'], matchKey: '4', primary: true, scope: 'navigation', labelKey: 'shortcuts.items.projects', path: '/projects' },
  { id: 'nav.skills', keys: ['Ctrl', '5'], matchKey: '5', primary: true, scope: 'navigation', labelKey: 'shortcuts.items.skills', path: '/skills' },
  { id: 'nav.settings', keys: ['Ctrl', '6'], matchKey: '6', primary: true, scope: 'navigation', labelKey: 'shortcuts.items.settings', path: '/settings' },
  { id: 'nav.settingsComma', keys: ['Ctrl', ','], matchKey: ',', primary: true, scope: 'navigation', labelKey: 'shortcuts.items.settings', path: '/settings' },
  // —— 工作区 ——
  { id: 'workspace.newSession', keys: ['Ctrl', 'N'], matchKey: 'n', primary: true, scope: 'workspace', labelKey: 'shortcuts.items.newSession' },
  { id: 'workspace.closeTab', keys: ['Ctrl', 'W'], matchKey: 'w', primary: true, scope: 'workspace', labelKey: 'shortcuts.items.closeTab' },
  { id: 'workspace.undoPane', keys: ['Ctrl', 'Z'], matchKey: 'z', primary: true, scope: 'workspace', labelKey: 'shortcuts.items.undoPane' },
  // —— 帮助 ——
  { id: 'help.toggle', keys: ['Ctrl', '/'], matchKey: '/', primary: true, scope: 'help', labelKey: 'shortcuts.items.help' },
  { id: 'help.toggleF1', keys: ['F1'], matchKey: 'f1', primary: false, scope: 'help', labelKey: 'shortcuts.items.help' }
] as const

/** 导航快捷键（保持注册表顺序，供 useShortcuts / navItems 顺序一致性断言） */
export const NAV_SHORTCUT_DEFS = SHORTCUT_REGISTRY.filter((s) => s.scope === 'navigation')

/** 按 id 查找 */
export function findShortcut(id: string): ShortcutDef | undefined {
  return SHORTCUT_REGISTRY.find((s) => s.id === id)
}

/** 按作用域分组（帮助面板渲染用） */
export function shortcutsByScope(scope: ShortcutScope): ShortcutDef[] {
  return SHORTCUT_REGISTRY.filter((s) => s.scope === scope)
}
