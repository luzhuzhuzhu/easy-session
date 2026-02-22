<template>
  <div class="config-page">
    <h1>{{ $t('config.title') }}</h1>

    <div class="tabs">
      <button class="tab" :class="{ active: configStore.activeTab === 'claude' }" @click="configStore.activeTab = 'claude'">{{ $t('config.claudeTab') }}</button>
      <button class="tab" :class="{ active: configStore.activeTab === 'codex' }" @click="configStore.activeTab = 'codex'">{{ $t('config.codexTab') }}</button>
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

const currentPath = computed(() => configStore.activeTab === 'claude' ? claudePath : codexPath)

const currentConfigText = computed(() => {
  const cfg = configStore.activeTab === 'claude' ? configStore.claudeConfig : configStore.codexConfig
  return JSON.stringify(cfg, null, 2)
})

const isModified = computed(() => editText.value !== currentConfigText.value)

function syncEditor() {
  editText.value = currentConfigText.value
}

async function loadCurrent() {
  if (configStore.activeTab === 'claude') {
    await configStore.loadClaudeConfig()
  } else {
    await configStore.loadCodexConfig()
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
    } else {
      await configStore.saveCodexConfig(parsed)
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
  padding: var(--spacing-xl);
  max-width: 960px;

  h1 {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--spacing-lg);
  }
}

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
}

.tab {
  padding: var(--spacing-sm) var(--spacing-lg);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  bottom: -1px;

  &:hover { color: var(--text-primary); }
  &.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }
}

.config-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
}

.file-path {
  margin-bottom: var(--spacing-md);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);

  .label { color: var(--text-muted); margin-right: var(--spacing-xs); }
  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
  }
}

.json-editor {
  width: 100%;
  min-height: 360px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  resize: vertical;
  tab-size: 2;
  transition: border-color var(--transition-fast);

  &:focus { outline: none; border-color: var(--accent-primary); }
  &.modified { border-color: var(--status-warning); }
}

.modified-hint {
  font-size: var(--font-size-xs);
  color: var(--status-warning);
  margin-top: var(--spacing-xs);
}

.loading {
  color: var(--text-muted);
  padding: var(--spacing-xl) 0;
  text-align: center;
}

.actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

// btn, btn-primary 已在 global.scss 中定义

.message {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);

  &.success { color: var(--status-success); background: rgba(52, 211, 153, 0.1); }
  &.error { color: var(--status-error); background: rgba(248, 113, 113, 0.1); }
}

.status-bar {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}
</style>
