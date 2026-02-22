import { defineStore } from 'pinia'
import { ref } from 'vue'
import { readClaudeConfig, writeClaudeConfig, readCodexConfig, writeCodexConfig } from '@/api/config'

export const useConfigStore = defineStore('config', () => {
  const claudeConfig = ref<Record<string, unknown>>({})
  const codexConfig = ref<Record<string, unknown>>({})
  const loading = ref(false)
  const lastSaved = ref<string | null>(null)
  const activeTab = ref<'claude' | 'codex'>('claude')

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

  return { claudeConfig, codexConfig, loading, lastSaved, activeTab, loadClaudeConfig, saveClaudeConfig, loadCodexConfig, saveCodexConfig }
})
