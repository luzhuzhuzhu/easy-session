import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'

export interface AppSettings {
  theme: 'dark' | 'light'
  language: 'zh-CN' | 'en'
  claudePath: string
  codexPath: string
  bufferSize: number
  terminalFont: string
  sidebarCollapsed: boolean
  sessionWakeConfirm: boolean
  sessionsPanelCollapsed: boolean
  sessionsListPosition: 'left' | 'top'
}

const defaults: AppSettings = {
  theme: 'dark',
  language: 'zh-CN',
  claudePath: '',
  codexPath: '',
  bufferSize: 5000,
  terminalFont: 'Consolas, monospace',
  sidebarCollapsed: false,
  sessionWakeConfirm: true,
  sessionsPanelCollapsed: false,
  sessionsListPosition: 'left'
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
    await window.electronAPI.invoke('settings:write', toRaw(settings.value))
  }

  async function update(partial: Partial<AppSettings>) {
    Object.assign(settings.value, partial)
    await save()
  }

  return { settings, loaded, load, save, update }
})
