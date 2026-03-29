import { onActivated, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

export type DeferredSettingsSection = 'remoteService' | 'cloudflare' | 'remoteInstances'

export type DeferredSettingsSectionExposed = {
  rootEl: HTMLElement | null
}

export type RemoteServiceSettingsSectionExposed = {
  rootEl: HTMLElement | null
}

type SystemInfo = {
  electronVersion: string
  nodeVersion: string
  platform: string
  arch: string
}

interface UseSettingsPageRuntimeOptions {
  loadDeferredSection: (section: DeferredSettingsSection) => void | Promise<void>
  refreshDeferredSection: (section: DeferredSettingsSection) => void | Promise<void>
  onSaveSettings: () => Promise<void>
  onSaveSuccess: () => void
  onSaveError: () => void
}

const SETTINGS_SAVE_DEBOUNCE_MS = 180

export function useSettingsPageRuntime(options: UseSettingsPageRuntimeOptions) {
  const systemInfo = ref<SystemInfo>({ electronVersion: '', nodeVersion: '', platform: '', arch: '' })
  const remoteServiceSectionRef = ref<RemoteServiceSettingsSectionExposed | null>(null)
  const cloudflareSectionRef = ref<DeferredSettingsSectionExposed | null>(null)
  const remoteInstancesSectionRef = ref<DeferredSettingsSectionExposed | null>(null)
  const deferredSections = reactive<Record<DeferredSettingsSection, boolean>>({
    remoteService: false,
    cloudflare: false,
    remoteInstances: false
  })

  let deferredSectionObserver: IntersectionObserver | null = null
  let settingsSaveTimer: ReturnType<typeof setTimeout> | null = null
  let queuedSettingsToast = false

  async function loadSystemInfo(): Promise<void> {
    try {
      const info = await window.electronAPI.invoke('app:getSystemInfo') as SystemInfo
      systemInfo.value = info
    } catch {
      // ignore
    }
  }

  function activateDeferredSection(section: DeferredSettingsSection): void {
    if (deferredSections[section]) return
    deferredSections[section] = true
    void options.loadDeferredSection(section)
  }

  function refreshActiveDeferredSections(): void {
    for (const section of Object.keys(deferredSections) as DeferredSettingsSection[]) {
      if (deferredSections[section]) {
        void options.refreshDeferredSection(section)
      }
    }
  }

  function setupDeferredSectionObserver(): void {
    deferredSectionObserver?.disconnect()

    if (typeof window === 'undefined' || typeof window.IntersectionObserver === 'undefined') {
      activateDeferredSection('remoteService')
      activateDeferredSection('cloudflare')
      activateDeferredSection('remoteInstances')
      return
    }

    deferredSectionObserver = new window.IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        if (entry.target === remoteServiceSectionRef.value?.rootEl) {
          activateDeferredSection('remoteService')
        } else if (entry.target === cloudflareSectionRef.value?.rootEl) {
          activateDeferredSection('cloudflare')
        } else if (entry.target === remoteInstancesSectionRef.value?.rootEl) {
          activateDeferredSection('remoteInstances')
        }
      }
    }, {
      root: null,
      threshold: 0.05
    })

    if (remoteServiceSectionRef.value?.rootEl) {
      deferredSectionObserver.observe(remoteServiceSectionRef.value.rootEl)
    }
    if (cloudflareSectionRef.value?.rootEl) {
      deferredSectionObserver.observe(cloudflareSectionRef.value.rootEl)
    }
    if (remoteInstancesSectionRef.value?.rootEl) {
      deferredSectionObserver.observe(remoteInstancesSectionRef.value.rootEl)
    }
  }

  async function flushSettingsSave(showToast = true): Promise<void> {
    if (settingsSaveTimer) {
      clearTimeout(settingsSaveTimer)
      settingsSaveTimer = null
    }
    const nextShowToast = queuedSettingsToast || showToast
    queuedSettingsToast = false
    try {
      await options.onSaveSettings()
      if (nextShowToast) {
        options.onSaveSuccess()
      }
    } catch {
      options.onSaveError()
    }
  }

  function scheduleSettingsSave(showToast = false): void {
    queuedSettingsToast = queuedSettingsToast || showToast
    if (settingsSaveTimer) {
      clearTimeout(settingsSaveTimer)
    }
    settingsSaveTimer = setTimeout(() => {
      settingsSaveTimer = null
      void flushSettingsSave(false)
    }, SETTINGS_SAVE_DEBOUNCE_MS)
  }

  onMounted(async () => {
    await loadSystemInfo()
    setupDeferredSectionObserver()
  })

  onActivated(() => {
    void loadSystemInfo()
    refreshActiveDeferredSections()
  })

  onBeforeUnmount(() => {
    if (settingsSaveTimer) {
      void flushSettingsSave(false)
    }
    deferredSectionObserver?.disconnect()
    deferredSectionObserver = null
  })

  return {
    systemInfo,
    deferredSections,
    remoteServiceSectionRef,
    cloudflareSectionRef,
    remoteInstancesSectionRef,
    activateDeferredSection,
    loadSystemInfo,
    setupDeferredSectionObserver,
    flushSettingsSave,
    scheduleSettingsSave
  }
}
