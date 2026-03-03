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
  const lastSaved = ref<string | null>(null)
  const activeTab = ref<'claude' | 'codex' | 'opencode'>('claude')

  async function loadClaudeConfig() {
    loading.value = true
    try {
      claudeConfig.value = (await readClaudeConfig()) as Record<string, unknown>
    } finally {
      loading.value = false
    }
  }

  async function saveClaudeConfig(config: Record<string, unknown>) {
    await writeClaudeConfig(config)
    claudeConfig.value = config
    lastSaved.value = new Date().toLocaleString('zh-CN')
  }

  async function loadCodexConfig() {
    loading.value = true
    try {
      codexConfig.value = (await readCodexConfig()) as Record<string, unknown>
    } finally {
      loading.value = false
    }
  }

  async function saveCodexConfig(config: Record<string, unknown>) {
    await writeCodexConfig(config)
    codexConfig.value = config
    lastSaved.value = new Date().toLocaleString('zh-CN')
  }

  async function loadOpenCodeConfig() {
    loading.value = true
    try {
      opencodeConfig.value = (await readOpenCodeConfig()) as Record<string, unknown>
    } finally {
      loading.value = false
    }
  }

  async function saveOpenCodeConfig(config: Record<string, unknown>) {
    await writeOpenCodeConfig(config)
    opencodeConfig.value = config
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
