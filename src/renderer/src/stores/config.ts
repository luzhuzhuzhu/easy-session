import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  readClaudeConfig,
  writeClaudeConfig,
  readCodexConfig,
  writeCodexConfig,
  readOpenCodeConfig,
  writeOpenCodeConfig
} from '@/api/config'

export const useConfigStore = defineStore('config', () => {
  const claudeConfig = ref<Record<string, unknown>>({})
  const codexConfig = ref<Record<string, unknown>>({})
  const opencodeConfig = ref<Record<string, unknown>>({})
  const loading = ref(false)
  const loadingCount = ref(0)
  const loadedTabs = ref({
    claude: false,
    codex: false,
    opencode: false
  })
  const lastSaved = ref<string | null>(null)
  const activeTab = ref<'claude' | 'codex' | 'opencode'>('claude')

  function beginLoading() {
    loadingCount.value += 1
    loading.value = loadingCount.value > 0
  }

  function endLoading() {
    loadingCount.value = Math.max(0, loadingCount.value - 1)
    loading.value = loadingCount.value > 0
  }

  async function loadClaudeConfig(force = false) {
    if (!force && loadedTabs.value.claude) return
    beginLoading()
    try {
      claudeConfig.value = (await readClaudeConfig()) as Record<string, unknown>
      loadedTabs.value.claude = true
    } finally {
      endLoading()
    }
  }

  async function saveClaudeConfig(config: Record<string, unknown>) {
    await writeClaudeConfig(config)
    claudeConfig.value = config
    loadedTabs.value.claude = true
    lastSaved.value = new Date().toLocaleString('zh-CN')
  }

  async function loadCodexConfig(force = false) {
    if (!force && loadedTabs.value.codex) return
    beginLoading()
    try {
      codexConfig.value = (await readCodexConfig()) as Record<string, unknown>
      loadedTabs.value.codex = true
    } finally {
      endLoading()
    }
  }

  async function saveCodexConfig(config: Record<string, unknown>) {
    await writeCodexConfig(config)
    codexConfig.value = config
    loadedTabs.value.codex = true
    lastSaved.value = new Date().toLocaleString('zh-CN')
  }

  async function loadOpenCodeConfig(force = false) {
    if (!force && loadedTabs.value.opencode) return
    beginLoading()
    try {
      opencodeConfig.value = (await readOpenCodeConfig()) as Record<string, unknown>
      loadedTabs.value.opencode = true
    } finally {
      endLoading()
    }
  }

  async function saveOpenCodeConfig(config: Record<string, unknown>) {
    await writeOpenCodeConfig(config)
    opencodeConfig.value = config
    loadedTabs.value.opencode = true
    lastSaved.value = new Date().toLocaleString('zh-CN')
  }

  return {
    claudeConfig,
    codexConfig,
    opencodeConfig,
    loading,
    lastSaved,
    activeTab,
    loadClaudeConfig,
    saveClaudeConfig,
    loadCodexConfig,
    saveCodexConfig,
    loadOpenCodeConfig,
    saveOpenCodeConfig
  }
})
