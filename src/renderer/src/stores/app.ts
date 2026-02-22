import { defineStore } from 'pinia'
import { ref } from 'vue'

interface CliCheckResult {
  available: boolean
  path?: string
  version?: string
}

export const useAppStore = defineStore('app', () => {
  const platform = ref('')
  const version = ref('')
  const claudeAvailable = ref(false)
  const codexAvailable = ref(false)
  const claudeInfo = ref<CliCheckResult>({ available: false })
  const codexInfo = ref<CliCheckResult>({ available: false })

  async function init() {
    platform.value = (await window.electronAPI.invoke('app:getPlatform')) as string
    version.value = (await window.electronAPI.invoke('app:getVersion')) as string
  }

  async function checkCliStatus() {
    const [claude, codex] = await Promise.all([
      window.electronAPI.invoke('cli:check', 'claude') as Promise<CliCheckResult>,
      window.electronAPI.invoke('cli:check', 'codex') as Promise<CliCheckResult>
    ])
    claudeInfo.value = claude
    claudeAvailable.value = claude.available
    codexInfo.value = codex
    codexAvailable.value = codex.available
  }

  return { platform, version, claudeAvailable, codexAvailable, claudeInfo, codexInfo, init, checkCliStatus }
})
