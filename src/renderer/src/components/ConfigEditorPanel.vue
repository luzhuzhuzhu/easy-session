<template>
  <div class="config-editor-panel">
    <div v-if="!cli" class="tabs">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        class="tab"
        :class="{ active: activeCli === tab.id }"
        @click="configStore.setActiveTab(tab.id)"
      >
        {{ tab.label }}
      </button>
    </div>

    <div class="config-panel">
      <div class="config-meta">
        <div class="file-path">
          <span class="label">{{ $t('config.filePath') }}:</span>
          <code>{{ currentDocument?.path || '—' }}</code>
        </div>
        <span v-if="currentDocument" class="format-badge">{{ currentDocument.format }}</span>
      </div>
      <p class="local-config-note">{{ $t('config.localConfigNote', { cli: currentDisplayName }) }}</p>
      <p v-if="currentDocument && !currentDocument.exists" class="missing-note">{{ $t('config.fileWillBeCreated') }}</p>

      <div class="editor-wrap">
        <textarea
          v-model="editText"
          class="config-editor"
          spellcheck="false"
          :aria-label="$t('config.editorLabel', { cli: currentDisplayName })"
          :class="{ modified: isModified }"
          :readonly="currentLoading"
        />
        <div v-if="currentLoading" class="loading-overlay">{{ $t('config.loading') }}</div>
      </div>
      <div v-if="isModified" class="modified-hint">{{ $t('config.modified') }}</div>

      <div class="actions">
        <Button tone="primary" :disabled="!isModified || currentSaving || currentLoading" @click="handleSave">
          {{ $t('config.save') }}
        </Button>
        <Button :disabled="currentSaving || currentLoading" @click="handleReload">{{ $t('config.reload') }}</Button>
      </div>

      <div v-if="message" class="message" :class="messageType">{{ message }}</div>
    </div>

    <div class="status-bar">
      <span v-if="currentLastSaved">{{ $t('config.lastSaved') }}: {{ currentLastSaved }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useConfigStore, CONFIG_CLI_TYPES } from '@/stores/config'
import type { ConfigCliType } from '@/api/config'
import { CLI_TYPE_DISPLAY_NAMES } from '@shared/cli-types'
import { useToast } from '@/composables/useToast'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  cli?: ConfigCliType
}>()

const { t } = useI18n()
const configStore = useConfigStore()
const toast = useToast()

const tabs = CONFIG_CLI_TYPES.map((id) => ({ id, label: CLI_TYPE_DISPLAY_NAMES[id] }))
const drafts = reactive<Record<ConfigCliType, string>>(createCliRecord(() => ''))
const baselines = reactive<Record<ConfigCliType, string>>(createCliRecord(() => ''))
const messages = reactive<Record<ConfigCliType, string>>(createCliRecord(() => ''))
const messageTypes = reactive<Record<ConfigCliType, 'success' | 'error'>>(createCliRecord(() => 'success'))

function createCliRecord<T>(factory: () => T): Record<ConfigCliType, T> {
  return Object.fromEntries(CONFIG_CLI_TYPES.map((cliType) => [cliType, factory()])) as Record<ConfigCliType, T>
}

const activeCli = computed<ConfigCliType>(() => props.cli ?? configStore.activeTab)
const currentDocument = computed(() => configStore.documents[activeCli.value])
const currentDisplayName = computed(() => CLI_TYPE_DISPLAY_NAMES[activeCli.value])
const currentLoading = computed(() => configStore.loading[activeCli.value])
const currentSaving = computed(() => configStore.saving[activeCli.value])
const currentLastSaved = computed(() => configStore.lastSaved[activeCli.value])
const editText = computed({
  get: () => drafts[activeCli.value],
  set: (value: string) => { drafts[activeCli.value] = value }
})
const isModified = computed(() => drafts[activeCli.value] !== baselines[activeCli.value])
const message = computed(() => messages[activeCli.value])
const messageType = computed(() => messageTypes[activeCli.value])

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function acceptDocument(cliType: ConfigCliType): void {
  const content = configStore.documents[cliType]?.content ?? ''
  drafts[cliType] = content
  baselines[cliType] = content
}

async function loadCli(cliType: ConfigCliType, force = false, replaceDirty = false): Promise<void> {
  messages[cliType] = ''
  try {
    await configStore.loadConfig(cliType, force)
    if (replaceDirty || drafts[cliType] === baselines[cliType]) acceptDocument(cliType)
  } catch (error: unknown) {
    messages[cliType] = `${t('config.loadError')}: ${errorText(error)}`
    messageTypes[cliType] = 'error'
  }
}

async function handleSave(): Promise<void> {
  const cliType = activeCli.value
  messages[cliType] = ''
  try {
    const document = await configStore.saveConfig(
      cliType,
      drafts[cliType],
      configStore.documents[cliType]?.revision
    )
    drafts[cliType] = document.content
    baselines[cliType] = document.content
    messages[cliType] = t('config.saveSuccess')
    messageTypes[cliType] = 'success'
    toast.success(t('toast.configSaved'))
  } catch (error: unknown) {
    messages[cliType] = `${t('config.saveError')}: ${errorText(error)}`
    messageTypes[cliType] = 'error'
    toast.error(`${t('toast.configSaveFail')}: ${errorText(error)}`)
  }
}

async function handleReload(): Promise<void> {
  await loadCli(activeCli.value, true, true)
}

watch(
  activeCli,
  (cliType) => { void loadCli(cliType) },
  { immediate: true }
)

watch(
  () => CONFIG_CLI_TYPES.map((cliType) => configStore.documents[cliType]?.revision),
  (_revisions, previousRevisions) => {
    CONFIG_CLI_TYPES.forEach((cliType, index) => {
      if (configStore.documents[cliType]?.revision === previousRevisions?.[index]) return
      // Store/background updates may refresh the baseline only while the editor is clean.
      if (drafts[cliType] === baselines[cliType]) acceptDocument(cliType)
    })
  }
)
</script>

<style scoped lang="scss">
.config-editor-panel { margin-top: 0; }

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
  overflow-x: auto;
}

.tab {
  flex: 0 0 auto;
  padding: var(--spacing-sm) var(--spacing-md);
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
  &.active { color: var(--accent-primary); border-bottom-color: var(--accent-primary); }
}

.config-panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-md);
}

.config-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xs);
}

.file-path {
  min-width: 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);

  .label { color: var(--text-muted); margin-right: var(--spacing-xs); }
  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: var(--radius-xs);
    overflow-wrap: anywhere;
  }
}

.format-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  font: 600 var(--font-size-xs) var(--font-mono);
  text-transform: uppercase;
}

.local-config-note,
.missing-note {
  margin: 0 0 var(--spacing-md);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.missing-note { color: var(--status-warning); }
.editor-wrap { position: relative; }

.config-editor {
  width: 100%;
  min-height: 400px;
  max-height: 500px;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: var(--spacing-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  resize: vertical;
  tab-size: 2;
  transition: border-color var(--transition-fast);
  overflow-y: auto;

  &:focus { outline: none; border-color: var(--accent-primary); }
  &.modified { border-color: var(--status-warning); }
}

.loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--text-primary) 32%, transparent);
  border-radius: var(--radius-sm);
  backdrop-filter: blur(1px);
}

.modified-hint { font-size: var(--font-size-xs); color: var(--status-warning); margin-top: var(--spacing-xs); }
.actions { display: flex; gap: var(--spacing-sm); margin-top: var(--spacing-md); }

.message {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-sm);

  &.success { color: var(--status-success); background: color-mix(in srgb, var(--status-success) 12%, transparent); }
  &.error { color: var(--status-error); background: color-mix(in srgb, var(--status-error) 12%, transparent); }
}

.status-bar { margin-top: var(--spacing-md); font-size: var(--font-size-xs); color: var(--text-muted); }
</style>
