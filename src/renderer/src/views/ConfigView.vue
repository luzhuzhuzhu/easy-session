<template>
  <div class="config-page">
    <h1>{{ $t('config.title') }}</h1>

    <div class="tabs">
      <button class="tab" :class="{ active: configStore.activeTab === 'claude' }" @click="configStore.activeTab = 'claude'">{{ $t('config.claudeTab') }}</button>
      <button class="tab" :class="{ active: configStore.activeTab === 'codex' }" @click="configStore.activeTab = 'codex'">{{ $t('config.codexTab') }}</button>
      <button class="tab" :class="{ active: configStore.activeTab === 'opencode' }" @click="configStore.activeTab = 'opencode'">{{ $t('config.opencodeTab') }}</button>
    </div>

    <div class="config-panel">
      <div class="file-path">
        <span class="label">{{ $t('config.filePath') }}:</span>
        <code>{{ currentPath }}</code>
      </div>

      <div v-if="configStore.loading" class="loading">{{ $t('config.loading') }}</div>
      <template v-else>
        <textarea
          v-model="editText"
          class="json-editor"
          spellcheck="false"
          :class="{ modified: isModified }"
        />
        <div v-if="isModified" class="modified-hint">{{ $t('config.modified') }}</div>
      </template>

      <div class="actions">
        <button class="btn btn-primary" :disabled="!isModified || saving" @click="handleSave">{{ $t('config.save') }}</button>
        <button class="btn" @click="handleReload">{{ $t('config.reload') }}</button>
      </div>

      <div v-if="message" class="message" :class="messageType">{{ message }}</div>
    </div>

    <div class="status-bar">
      <span v-if="configStore.lastSaved">{{ $t('config.lastSaved') }}: {{ configStore.lastSaved }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigStore } from '@/stores/config'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()
const configStore = useConfigStore()
const toast = useToast()

const editText = ref('')
const saving = ref(false)
const message = ref('')
const messageType = ref<'success' | 'error'>('success')

const claudePath = '~/.claude/settings.json'
const codexPath = '~/.codex/config.json'
const opencodePath = '~/.config/opencode/opencode.json'

const currentPath = computed(() => {
  if (configStore.activeTab === 'claude') return claudePath
  if (configStore.activeTab === 'codex') return codexPath
  return opencodePath
})

const currentConfigText = computed(() => {
  const cfg = configStore.activeTab === 'claude'
    ? configStore.claudeConfig
    : configStore.activeTab === 'codex'
      ? configStore.codexConfig
      : configStore.opencodeConfig
  return JSON.stringify(cfg, null, 2)
})

const isModified = computed(() => editText.value !== currentConfigText.value)

function syncEditor() {
  editText.value = currentConfigText.value
}

async function loadCurrent() {
  if (configStore.activeTab === 'claude') {
    await configStore.loadClaudeConfig()
  } else if (configStore.activeTab === 'codex') {
    await configStore.loadCodexConfig()
  } else {
    await configStore.loadOpenCodeConfig()
  }
  syncEditor()
}

async function handleSave() {
  saving.value = true
  message.value = ''
  try {
    const parsed = JSON.parse(editText.value)
    if (configStore.activeTab === 'claude') {
      await configStore.saveClaudeConfig(parsed)
    } else if (configStore.activeTab === 'codex') {
      await configStore.saveCodexConfig(parsed)
    } else {
      await configStore.saveOpenCodeConfig(parsed)
    }
    message.value = t('config.saveSuccess')
    messageType.value = 'success'
    toast.success(t('toast.configSaved'))
  } catch (e: unknown) {
    message.value = t('config.saveError') + ': ' + (e instanceof Error ? e.message : String(e))
    messageType.value = 'error'
    toast.error(t('toast.configSaveFail') + ': ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    saving.value = false
  }
}

async function handleReload() {
  message.value = ''
  await loadCurrent()
}

watch(() => configStore.activeTab, () => {
  message.value = ''
  loadCurrent()
})

watch(currentConfigText, (val) => {
  if (editText.value !== val) editText.value = val
})

onMounted(() => loadCurrent())
</script>

<style scoped lang="scss">
.config-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;

  h1 {
    font-size: var(--font-size-lg);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-bottom: 1px solid var(--border-color);
    background: var(--bg-secondary);
    margin: 0;
    flex-shrink: 0;
  }
}

.tabs {
  display: flex;
  gap: 0;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.tab {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }
  &.active {
    color: var(--accent-primary);
    background: var(--bg-card);
    border-color: var(--border-color);
    border-bottom-color: var(--bg-card);
  }
}

.config-panel {
  flex: 1;
  overflow: auto;
  background: var(--bg-card);
  padding: var(--spacing-sm);
  border-radius: 0;
}

.file-path {
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);

  .label {
    color: var(--text-muted);
    margin-right: var(--spacing-xs);
  }
  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 0;
  }
}

.json-editor {
  width: 100%;
  min-height: 300px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  padding: var(--spacing-sm);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  resize: vertical;
  tab-size: 2;
  transition: border-color var(--transition-fast);

  &:focus {
    outline: none;
    border-color: var(--accent-primary);
  }
  &.modified {
    border-color: var(--status-warning);
  }
}

.modified-hint {
  font-size: var(--font-size-xs);
  color: var(--status-warning);
  margin-top: var(--spacing-xs);
}

.loading {
  color: var(--text-muted);
  padding: var(--spacing-lg) 0;
  text-align: center;
}

.actions {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-sm);
}

.message {
  margin-top: var(--spacing-sm);
  font-size: var(--font-size-xs);
  padding: var(--spacing-xs) var(--spacing-sm);
  border-radius: 0;

  &.success {
    color: var(--status-success);
    background: rgba(52, 211, 153, 0.1);
  }
  &.error {
    color: var(--status-error);
    background: rgba(248, 113, 113, 0.1);
  }
}

.status-bar {
  padding: var(--spacing-xs) var(--spacing-sm);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  background: var(--bg-secondary);
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
</style>
