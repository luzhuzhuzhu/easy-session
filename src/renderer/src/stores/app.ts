import { defineStore } from 'pinia'
import { ref } from 'vue'

interface CliCheckResult {
  available: boolean
  path?: string
  version?: string
}

interface CliPathSettings {
  claudePath?: string
  codexPath?: string
  opencodePath?: string
}

export const useAppStore = defineStore('app', () => {
  const platform = ref('')
  const version = ref('')
  const claudeAvailable = ref(false)
  const codexAvailable = ref(false)
  const opencodeAvailable = ref(false)
  const claudeInfo = ref<CliCheckResult>({ available: false })
  const codexInfo = ref<CliCheckResult>({ available: false })
  const opencodeInfo = ref<CliCheckResult>({ available: false })
  // Start in the "checking" state so the top bar shows a pulsing indicator on
  // launch instead of a misleading offline dot before the first probe lands.
  const cliChecking = ref(true)
  const cliChecked = ref(false)
  let cliCheckInflight: Promise<void> | null = null

  async function init() {
    platform.value = (await window.electronAPI.invoke('app:getPlatform')) as string
    version.value = (await window.electronAPI.invoke('app:getVersion')) as string
  }

  async function checkCliStatus(): Promise<void> {
    // Dedupe concurrent probes (top bar + dashboard mount together) so the
    // shared status is computed once per request burst.
    if (cliCheckInflight) return cliCheckInflight
    cliChecking.value = true
    cliCheckInflight = (async () => {
      try {
        const settings = (await window.electronAPI.invoke('settings:read')) as CliPathSettings
        const claudePath = typeof settings?.claudePath === 'string' ? settings.claudePath : ''
        const codexPath = typeof settings?.codexPath === 'string' ? settings.codexPath : ''
        const opencodePath = typeof settings?.opencodePath === 'string' ? settings.opencodePath : ''

        const [claude, codex, opencode] = await Promise.all([
          window.electronAPI.invoke('cli:check', 'claude', claudePath) as Promise<CliCheckResult>,
          window.electronAPI.invoke('cli:check', 'codex', codexPath) as Promise<CliCheckResult>,
          window.electronAPI.invoke('cli:check', 'opencode', opencodePath) as Promise<CliCheckResult>
        ])
        claudeInfo.value = claude
        claudeAvailable.value = claude.available
        codexInfo.value = codex
        codexAvailable.value = codex.available
        opencodeInfo.value = opencode
        opencodeAvailable.value = opencode.available
      } finally {
        cliChecking.value = false
        cliChecked.value = true
        cliCheckInflight = null
      }
    })()
    return cliCheckInflight
  }

  return {
    platform,
    version,
    claudeAvailable,
    codexAvailable,
    opencodeAvailable,
    claudeInfo,
    codexInfo,
    opencodeInfo,
    cliChecking,
    cliChecked,
    init,
    checkCliStatus
  }
})
