import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  readCliConfig,
  writeCliConfig,
  type ConfigCliType,
  type ConfigDocument
} from '@/api/config'

export const CONFIG_CLI_TYPES: readonly ConfigCliType[] = [
  'claude',
  'codex',
  'opencode',
  'gemini',
  'pi',
  'omp',
  'grok',
  'hermes'
]

function keyed<T>(create: () => T): Record<ConfigCliType, T> {
  return Object.fromEntries(CONFIG_CLI_TYPES.map((cliType) => [cliType, create()])) as Record<ConfigCliType, T>
}

function legacyConfig(document: ConfigDocument | null): Record<string, unknown> {
  if (!document?.content.trim()) return {}
  try {
    const value: unknown = JSON.parse(document.content)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {}
  } catch {
    return {}
  }
}

export const useConfigStore = defineStore('config', () => {
  const documents = reactive<Record<ConfigCliType, ConfigDocument | null>>(keyed(() => null))
  const loaded = reactive<Record<ConfigCliType, boolean>>(keyed(() => false))
  const loading = reactive<Record<ConfigCliType, boolean>>(keyed(() => false))
  const saving = reactive<Record<ConfigCliType, boolean>>(keyed(() => false))
  const lastSaved = reactive<Record<ConfigCliType, string | null>>(keyed(() => null))
  const activeTab = ref<ConfigCliType>('claude')

  // Compatibility aliases retained for callers built against the original three-CLI store.
  const claudeConfig = computed(() => legacyConfig(documents.claude))
  const codexConfig = computed(() => legacyConfig(documents.codex))
  const opencodeConfig = computed(() => legacyConfig(documents.opencode))

  function setActiveTab(tab: ConfigCliType): void {
    activeTab.value = tab
  }

  async function loadConfig(cliType: ConfigCliType, force = false): Promise<ConfigDocument> {
    if (!force && loaded[cliType] && documents[cliType]) return documents[cliType]
    if (loading[cliType] && documents[cliType]) return documents[cliType]

    loading[cliType] = true
    try {
      const document = await readCliConfig(cliType)
      documents[cliType] = document
      loaded[cliType] = true
      return document
    } finally {
      loading[cliType] = false
    }
  }

  async function saveConfig(
    cliType: ConfigCliType,
    content: string,
    expectedRevision?: string | null
  ): Promise<ConfigDocument> {
    saving[cliType] = true
    try {
      const document = await writeCliConfig(cliType, content, expectedRevision)
      documents[cliType] = document
      loaded[cliType] = true
      lastSaved[cliType] = new Date().toLocaleString('zh-CN')
      return document
    } finally {
      saving[cliType] = false
    }
  }

  function loadClaudeConfig(force = false) {
    return loadConfig('claude', force)
  }

  function loadCodexConfig(force = false) {
    return loadConfig('codex', force)
  }

  function loadOpenCodeConfig(force = false) {
    return loadConfig('opencode', force)
  }

  function saveClaudeConfig(config: Record<string, unknown>) {
    return saveConfig('claude', JSON.stringify(config, null, 2), documents.claude?.revision)
  }

  function saveCodexConfig(config: Record<string, unknown>) {
    return saveConfig('codex', JSON.stringify(config, null, 2), documents.codex?.revision)
  }

  function saveOpenCodeConfig(config: Record<string, unknown>) {
    return saveConfig('opencode', JSON.stringify(config, null, 2), documents.opencode?.revision)
  }

  return {
    documents,
    loaded,
    loading,
    saving,
    lastSaved,
    activeTab,
    claudeConfig,
    codexConfig,
    opencodeConfig,
    setActiveTab,
    loadConfig,
    saveConfig,
    loadClaudeConfig,
    saveClaudeConfig,
    loadCodexConfig,
    saveCodexConfig,
    loadOpenCodeConfig,
    saveOpenCodeConfig
  }
})
