import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import { normalizeLaunchArgPresets, type LaunchArgPreset } from '@/models/cli-launch-args'
import {
  clampTerminalLetterSpacing,
  clampTerminalLineHeight,
  isTerminalFontWeight,
  type TerminalFontWeight
} from '@/models/terminal-appearance'

export interface AppSettings {
  theme: AppTheme
  language: 'zh-CN' | 'en'
  claudePath: string
  codexPath: string
  opencodePath: string
  desktopRemoteMountEnabled: boolean
  bufferSize: number
  terminalFont: string
  terminalFontWeight: TerminalFontWeight
  terminalFontWeightBold: TerminalFontWeight
  terminalLineHeight: number
  terminalLetterSpacing: number
  terminalFontSize: number
  terminalFontSizeByPane: Record<string, number>
  sessionWakeConfirm: boolean
  sessionsPanelCollapsed: boolean
  sessionsListPosition: 'left' | 'top'
  smartPriorityEnabled: boolean
  smartPriorityScope: 'projects' | 'sessions' | 'both'
  smartPriorityMode: 'recent' | 'balanced'
  manualProjectOrder: string[]
  manualSessionOrder: Record<string, string[]>
  launchArgPresets: LaunchArgPreset[]
}

export type AppTheme =
  | 'chatgpt-dark'
  | 'gemini-dark'

const supportedThemes = new Set<AppTheme>([
  'chatgpt-dark',
  'gemini-dark'
])

const legacyThemeAliases: Record<string, AppTheme> = {
  dark: 'chatgpt-dark',
  light: 'chatgpt-dark',
  chatgpt: 'chatgpt-dark',
  'chatgpt-light': 'chatgpt-dark',
  'claude-light': 'chatgpt-dark',
  'claude-dark': 'chatgpt-dark',
  opencode: 'chatgpt-dark',
  'opencode-light': 'chatgpt-dark',
  'opencode-dark': 'chatgpt-dark',
  gemini: 'gemini-dark',
  'gemini-light': 'gemini-dark',
  graphite: 'chatgpt-dark',
  forest: 'chatgpt-dark',
  amber: 'chatgpt-dark',
  indigo: 'chatgpt-dark'
}

const defaults: AppSettings = {
  theme: 'chatgpt-dark',
  language: 'zh-CN',
  claudePath: '',
  codexPath: '',
  opencodePath: '',
  desktopRemoteMountEnabled: false,
  bufferSize: 5000,
  terminalFont: 'Consolas, monospace',
  terminalFontWeight: 'normal',
  terminalFontWeightBold: 'bold',
  terminalLineHeight: 1,
  terminalLetterSpacing: 0,
  terminalFontSize: 13,
  terminalFontSizeByPane: {},
  sessionWakeConfirm: true,
  sessionsPanelCollapsed: false,
  sessionsListPosition: 'left',
  smartPriorityEnabled: false,
  smartPriorityScope: 'both',
  smartPriorityMode: 'balanced',
  manualProjectOrder: [],
  manualSessionOrder: {},
  launchArgPresets: []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeSettings(input: unknown): AppSettings {
  const raw = isRecord(input) ? input : {}

  const normalizeString = (value: unknown, fallback: string): string => {
    return typeof value === 'string' ? value : fallback
  }

  const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
    return typeof value === 'boolean' ? value : fallback
  }

  const normalizeNumber = (value: unknown, fallback: number): number => {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback
  }

  const normalizeStringArray = (value: unknown, fallback: string[]): string[] => {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback
  }

  const normalizeFontSizeByPane = (): Record<string, number> => {
    const value = raw.terminalFontSizeByPane
    if (!isRecord(value)) return { ...defaults.terminalFontSizeByPane }

    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'number' && Number.isFinite(entry[1])
      )
    )
  }

  const normalizeManualSessionOrder = (): Record<string, string[]> => {
    const value = raw.manualSessionOrder
    if (!isRecord(value)) return { ...defaults.manualSessionOrder }

    return Object.fromEntries(
      Object.entries(value).map(([groupKey, order]) => [
        groupKey,
        Array.isArray(order) ? order.filter((item): item is string => typeof item === 'string') : []
      ])
    )
  }

  const normalizeTheme = (value: unknown): AppTheme => {
    if (typeof value !== 'string') return defaults.theme
    if (supportedThemes.has(value as AppTheme)) return value as AppTheme
    return legacyThemeAliases[value] ?? defaults.theme
  }

  return {
    theme: normalizeTheme(raw.theme),
    language: raw.language === 'en' ? 'en' : defaults.language,
    claudePath: normalizeString(raw.claudePath, defaults.claudePath),
    codexPath: normalizeString(raw.codexPath, defaults.codexPath),
    opencodePath: normalizeString(raw.opencodePath, defaults.opencodePath),
    desktopRemoteMountEnabled: normalizeBoolean(raw.desktopRemoteMountEnabled, defaults.desktopRemoteMountEnabled),
    bufferSize: normalizeNumber(raw.bufferSize, defaults.bufferSize),
    terminalFont: normalizeString(raw.terminalFont, defaults.terminalFont),
    terminalFontWeight: isTerminalFontWeight(raw.terminalFontWeight)
      ? raw.terminalFontWeight
      : defaults.terminalFontWeight,
    terminalFontWeightBold: isTerminalFontWeight(raw.terminalFontWeightBold)
      ? raw.terminalFontWeightBold
      : defaults.terminalFontWeightBold,
    terminalLineHeight: clampTerminalLineHeight(
      normalizeNumber(raw.terminalLineHeight, defaults.terminalLineHeight)
    ),
    terminalLetterSpacing: clampTerminalLetterSpacing(
      normalizeNumber(raw.terminalLetterSpacing, defaults.terminalLetterSpacing)
    ),
    terminalFontSize: normalizeNumber(raw.terminalFontSize, defaults.terminalFontSize),
    terminalFontSizeByPane: normalizeFontSizeByPane(),
    sessionWakeConfirm: normalizeBoolean(raw.sessionWakeConfirm, defaults.sessionWakeConfirm),
    sessionsPanelCollapsed: normalizeBoolean(raw.sessionsPanelCollapsed, defaults.sessionsPanelCollapsed),
    sessionsListPosition: raw.sessionsListPosition === 'top' ? 'top' : defaults.sessionsListPosition,
    smartPriorityEnabled: normalizeBoolean(raw.smartPriorityEnabled, defaults.smartPriorityEnabled),
    smartPriorityScope:
      raw.smartPriorityScope === 'projects' || raw.smartPriorityScope === 'sessions'
        ? raw.smartPriorityScope
        : defaults.smartPriorityScope,
    smartPriorityMode: raw.smartPriorityMode === 'recent' ? 'recent' : defaults.smartPriorityMode,
    manualProjectOrder: normalizeStringArray(raw.manualProjectOrder, defaults.manualProjectOrder),
    manualSessionOrder: normalizeManualSessionOrder(),
    launchArgPresets: normalizeLaunchArgPresets(raw.launchArgPresets)
  }
}

function toSerializableSettings(value: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(toRaw(value))) as AppSettings
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...defaults })
  const loaded = ref(false)

  async function load() {
    try {
      const data = await window.electronAPI.invoke('settings:read') as Partial<AppSettings>
      settings.value = normalizeSettings(data)
    } catch {
      settings.value = { ...defaults }
    }
    loaded.value = true
  }

  async function save() {
    await window.electronAPI.invoke('settings:write', toSerializableSettings(settings.value))
  }

  async function update(partial: Partial<AppSettings>) {
    Object.assign(settings.value, partial)
    await save()
  }

  async function saveLaunchArgPreset(preset: LaunchArgPreset) {
    const others = settings.value.launchArgPresets.filter((p) => p.id !== preset.id)
    settings.value.launchArgPresets = [...others, preset]
    await save()
  }

  async function deleteLaunchArgPreset(id: string) {
    settings.value.launchArgPresets = settings.value.launchArgPresets.filter((p) => p.id !== id)
    await save()
  }

  return { settings, loaded, load, save, update, saveLaunchArgPreset, deleteLaunchArgPreset }
})
