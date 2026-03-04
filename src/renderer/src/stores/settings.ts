import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

export interface AppSettings {
  theme: 'dark' | 'light'
  language: 'zh-CN' | 'en'
  claudePath: string
  codexPath: string
  opencodePath: string
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

function toSerializableSettings(value: AppSettings): AppSettings {
  return JSON.parse(JSON.stringify(toRaw(value))) as AppSettings
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...defaults })
  const loaded = ref(false)

  async function load() {
    try {
      const data = await window.electronAPI.invoke('settings:read') as Partial<AppSettings>
      settings.value = { ...defaults, ...data }
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
