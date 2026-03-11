import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

export interface AppSettings {
  theme: 'dark' | 'light'
  language: 'zh-CN' | 'en'
  claudePath: string
  codexPath: string
  opencodePath: string
  desktopRemoteMountEnabled: boolean
  bufferSize: number
  terminalFont: string
  terminalFontSize: number
  terminalFontSizeByPane: Record<string, number>
  sidebarCollapsed: boolean
  sessionWakeConfirm: boolean
  sessionsPanelCollapsed: boolean
  sessionsListPosition: 'left' | 'top'
  smartPriorityEnabled: boolean
  smartPriorityScope: 'projects' | 'sessions' | 'both'
  smartPriorityMode: 'recent' | 'balanced'
  manualProjectOrder: string[]
  manualSessionOrder: Record<string, string[]>
}

const defaults: AppSettings = {
  theme: 'dark',
  language: 'zh-CN',
  claudePath: '',
  codexPath: '',
  opencodePath: '',
  desktopRemoteMountEnabled: false,
  bufferSize: 5000,
  terminalFont: 'Consolas, monospace',
  terminalFontSize: 13,
  terminalFontSizeByPane: {},
  sidebarCollapsed: false,
  sessionWakeConfirm: true,
  sessionsPanelCollapsed: false,
  sessionsListPosition: 'left',
  smartPriorityEnabled: false,
  smartPriorityScope: 'both',
  smartPriorityMode: 'balanced',
  manualProjectOrder: [],
  manualSessionOrder: {}
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

  return {
    theme: raw.theme === 'light' ? 'light' : defaults.theme,
    language: raw.language === 'en' ? 'en' : defaults.language,
    claudePath: normalizeString(raw.claudePath, defaults.claudePath),
    codexPath: normalizeString(raw.codexPath, defaults.codexPath),
    opencodePath: normalizeString(raw.opencodePath, defaults.opencodePath),
    desktopRemoteMountEnabled: normalizeBoolean(raw.desktopRemoteMountEnabled, defaults.desktopRemoteMountEnabled),
    bufferSize: normalizeNumber(raw.bufferSize, defaults.bufferSize),
    terminalFont: normalizeString(raw.terminalFont, defaults.terminalFont),
    terminalFontSize: normalizeNumber(raw.terminalFontSize, defaults.terminalFontSize),
    terminalFontSizeByPane: normalizeFontSizeByPane(),
    sidebarCollapsed: normalizeBoolean(raw.sidebarCollapsed, defaults.sidebarCollapsed),
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
    manualSessionOrder: normalizeManualSessionOrder()
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

  return { settings, loaded, load, save, update }
})
