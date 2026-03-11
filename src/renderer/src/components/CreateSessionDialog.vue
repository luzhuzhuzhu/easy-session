<template>
  <div v-if="visible" class="dialog-overlay" @click.self="$emit('cancel')">
    <div class="dialog">
      <div class="dialog-header">
        <h3>{{ $t('session.create') }}</h3>
        <button class="close-btn" @click="$emit('cancel')">&times;</button>
      </div>

      <form class="dialog-body" @submit.prevent="handleSubmit">
        <div class="form-group">
          <label>{{ $t('session.dialog.name') }}</label>
          <div class="name-row">
            <div class="icon-picker-wrap">
              <button type="button" class="icon-pick-btn" @click="showEmojiPicker = !showEmojiPicker">
                {{ form.icon || '😀' }}
              </button>
              <div v-if="showEmojiPicker" class="emoji-grid">
                <button
                  v-for="e in emojiList" :key="e" type="button" class="emoji-cell"
                  :class="{ selected: form.icon === e }"
                  @click="form.icon = e; showEmojiPicker = false"
                >{{ e }}</button>
                <button type="button" class="emoji-cell clear-cell" @click="form.icon = ''; showEmojiPicker = false">✕</button>
              </div>
            </div>
            <input v-model="form.name" type="text" :placeholder="defaultName" class="form-input" />
          </div>
        </div>

        <div class="form-group">
          <label>{{ $t('session.selectType') }}</label>
          <div class="radio-group">
            <label class="radio-label">
              <input v-model="form.type" type="radio" value="claude" />
              {{ $t('session.claude') }}
            </label>
            <label class="radio-label">
              <input v-model="form.type" type="radio" value="codex" />
              {{ $t('session.codex') }}
            </label>
            <label class="radio-label">
              <input v-model="form.type" type="radio" value="opencode" />
              {{ $t('session.opencode') }}
            </label>
          </div>
        </div>

        <div class="form-group">
          <label>{{ $t('session.dialog.projectPath') }} *</label>
          <div class="path-input">
            <input v-model="form.projectPath" type="text" class="form-input" readonly />
            <button
              v-if="canBrowseProjectPath"
              type="button"
              class="btn btn-sm"
              @click="selectFolder"
            >
              {{ $t('session.dialog.browse') }}
            </button>
          </div>
          <span v-if="pathError" class="error-text">{{ pathError }}</span>
        </div>

        <template v-if="form.type === 'codex'">
          <div class="form-group">
            <label>{{ $t('session.dialog.approvalMode') }}</label>
            <select v-model="codexOptions.permissionsMode" class="form-input">
              <option value="read-only">Read Only</option>
              <option value="default">Default</option>
              <option value="full-access">Full Access</option>
            </select>
          </div>
        </template>

        <template v-if="form.type === 'opencode'">
          <div class="form-group">
            <label>{{ $t('session.dialog.opencodeModel') }}</label>
            <input v-model="opencodeOptions.model" type="text" class="form-input" :placeholder="$t('session.dialog.opencodeModelPlaceholder')" />
          </div>
          <div class="form-group">
            <label>{{ $t('session.dialog.opencodeAgent') }}</label>
            <input v-model="opencodeOptions.agent" type="text" class="form-input" :placeholder="$t('session.dialog.opencodeAgentPlaceholder')" />
          </div>
          <div class="form-group">
            <label>{{ $t('session.dialog.opencodePrompt') }}</label>
            <input v-model="opencodeOptions.prompt" type="text" class="form-input" :placeholder="$t('session.dialog.opencodePromptPlaceholder')" />
          </div>
          <div class="form-group">
            <label>{{ $t('session.dialog.opencodeSessionId') }}</label>
            <input v-model="opencodeOptions.sessionId" type="text" class="form-input" :placeholder="$t('session.dialog.opencodeSessionIdPlaceholder')" />
          </div>
          <div class="form-group">
            <label>{{ $t('session.dialog.opencodeServerMode') }}</label>
            <select v-model="opencodeOptions.serverMode" class="form-input">
              <option value="off">{{ $t('session.dialog.opencodeServerModeOff') }}</option>
              <option value="attach">{{ $t('session.dialog.opencodeServerModeAttach') }}</option>
            </select>
          </div>
          <div class="form-group" v-if="opencodeOptions.serverMode === 'attach'">
            <label>{{ $t('session.dialog.opencodeAttachUrl') }}</label>
            <input v-model="opencodeOptions.attachUrl" type="text" class="form-input" :placeholder="$t('session.dialog.opencodeAttachUrlPlaceholder')" />
          </div>
          <div class="form-row">
            <label class="check-label">
              <input v-model="opencodeOptions.continueLast" type="checkbox" />
              {{ $t('session.dialog.opencodeContinueLast') }}
            </label>
            <label class="check-label">
              <input v-model="opencodeOptions.fork" type="checkbox" />
              {{ $t('session.dialog.opencodeFork') }}
            </label>
          </div>
          <p v-if="opencodeOptions.sessionId && opencodeOptions.continueLast" class="warning-text">
            {{ $t('session.dialog.opencodeConflictHint') }}
          </p>
        </template>

        <div class="dialog-footer">
          <button type="button" class="btn" @click="$emit('cancel')">{{ $t('session.dialog.cancel') }}</button>
          <button type="submit" class="btn btn-primary">{{ $t('session.dialog.confirm') }}</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import { ipc } from '@/api/ipc'
import { LOCAL_INSTANCE_ID } from '@/models/unified-resource'

const props = withDefaults(defineProps<{
  visible: boolean
  defaultProjectPath?: string
  targetInstanceId?: string
  targetProjectId?: string
  targetProjectPath?: string
  lockProjectPath?: boolean
  startPaused?: boolean
  activateOnCreate?: boolean
}>(), {
  defaultProjectPath: '',
  targetInstanceId: LOCAL_INSTANCE_ID,
  targetProjectId: undefined,
  targetProjectPath: '',
  lockProjectPath: false,
  startPaused: false,
  activateOnCreate: true
})

interface CreateSessionDialogCreatedPayload {
  instanceId: string
  sessionId: string
  globalSessionKey: string
}

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'created', payload?: CreateSessionDialogCreatedPayload): void
}>()

const { t } = useI18n()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const toast = useToast()

type CodexPermissionsMode = 'read-only' | 'default' | 'full-access'

const form = ref({ name: '', icon: '', type: 'claude' as 'claude' | 'codex' | 'opencode', projectPath: '' })
const codexOptions = ref({ permissionsMode: 'default' as CodexPermissionsMode })
const opencodeOptions = ref({
  model: '',
  agent: '',
  prompt: '',
  sessionId: '',
  continueLast: false,
  fork: false,
  attachUrl: '',
  serverMode: 'off' as 'off' | 'attach'
})
const pathError = ref('')
const showEmojiPicker = ref(false)

const emojiList = [
  '🤖','🧠','💡','🔥','⚡','🚀','🎯','🛠️',
  '📦','📁','🔧','🔍','💻','🖥️','📝','✏️',
  '🧪','🔬','🎨','🌟','⭐','💎','🏗️','🔗',
  '📊','📈','🗂️','🧩','🎮','🕹️','🤝','👾',
  '🐛','🐍','🦀','🐳','🐙','🦊','🐱','🐶'
]

const defaultName = computed(() => {
  const count = sessionsStore.unifiedSessions.filter((s) => s.type === form.value.type).length + 1
  const typeDisplayName = form.value.type === 'claude' ? 'Claude' : form.value.type === 'codex' ? 'Codex' : 'OpenCode'
  return `${typeDisplayName}-${String(count).padStart(3, '0')}`
})

const canBrowseProjectPath = computed(() => {
  return !props.lockProjectPath && (props.targetInstanceId || LOCAL_INSTANCE_ID) === LOCAL_INSTANCE_ID
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = {
      name: '',
      icon: '',
      type: 'claude',
      projectPath: props.targetProjectPath || props.defaultProjectPath || ''
    }
    showEmojiPicker.value = false
    codexOptions.value = { permissionsMode: 'default' }
    opencodeOptions.value = {
      model: '',
      agent: '',
      prompt: '',
      sessionId: '',
      continueLast: false,
      fork: false,
      attachUrl: '',
      serverMode: 'off'
    }
    pathError.value = ''
  }
)

async function selectFolder() {
  if (!canBrowseProjectPath.value) return
  try {
    const result = await ipc.invoke<string | null>('dialog:selectFolder')
    if (!result) return
    form.value.projectPath = result
    pathError.value = ''
  } catch {
    // User cancelled.
  }
}

async function handleSubmit() {
  const instanceId = props.targetInstanceId || LOCAL_INSTANCE_ID
  const resolvedProjectPath = form.value.projectPath || props.targetProjectPath || ''

  if (instanceId === LOCAL_INSTANCE_ID && !resolvedProjectPath) {
    pathError.value = t('session.dialog.pathRequired')
    return
  }

  if (instanceId !== LOCAL_INSTANCE_ID && !props.targetProjectId && !resolvedProjectPath) {
    pathError.value = t('session.dialog.pathRequired')
    return
  }

  const options =
    form.value.type === 'codex'
      ? Object.fromEntries(Object.entries(codexOptions.value).filter(([, v]) => v))
      : form.value.type === 'opencode'
        ? Object.fromEntries(
            Object.entries({
              cliPath: settingsStore.settings.opencodePath?.trim() || undefined,
              model: opencodeOptions.value.model.trim() || undefined,
              agent: opencodeOptions.value.agent.trim() || undefined,
              prompt: opencodeOptions.value.prompt.trim() || undefined,
              sessionId: opencodeOptions.value.sessionId.trim() || undefined,
              continueLast: opencodeOptions.value.continueLast || undefined,
              fork: opencodeOptions.value.fork || undefined,
              attachUrl:
                opencodeOptions.value.serverMode === 'attach'
                  ? opencodeOptions.value.attachUrl.trim() || undefined
                  : undefined,
              serverMode: opencodeOptions.value.serverMode
            }).filter(([, v]) => v)
          )
        : undefined

  try {
    if (form.value.type === 'opencode' && opencodeOptions.value.sessionId && opencodeOptions.value.continueLast) {
      toast.warning(t('session.dialog.opencodeConflictHint'))
    }
    const session = await sessionsStore.createSessionForInstance(
      instanceId,
      {
        name: form.value.name || defaultName.value,
        icon: form.value.icon || undefined,
        type: form.value.type,
        projectId: props.targetProjectId || undefined,
        projectPath: resolvedProjectPath || undefined,
        options: options && Object.keys(options).length > 0 ? options : undefined,
        startPaused: props.startPaused
      },
      { activate: props.activateOnCreate }
    )

    toast.success(t('toast.sessionCreated'))
    emit('created', {
      instanceId: session.instanceId,
      sessionId: session.sessionId,
      globalSessionKey: session.globalSessionKey
    })
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}
</script>

<style scoped lang="scss">
// dialog-overlay is defined in global.scss
.dialog {
  width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-md) var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 0;
    font-size: var(--font-size-lg);
  }
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.dialog-body {
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

// form-input and error-text are defined in global.scss

.radio-group {
  display: flex;
  gap: var(--spacing-lg);
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.form-row {
  display: flex;
  gap: var(--spacing-md);
}

.check-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
}

.warning-text {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--status-warning);
}

.path-input {
  display: flex;
  gap: var(--spacing-sm);

  .form-input {
    flex: 1;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}

.name-row {
  display: flex;
  align-items: center;
  gap: 6px;

  .form-input { flex: 1; }
}

.icon-picker-wrap {
  position: relative;
  flex-shrink: 0;
}

.icon-pick-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color var(--transition-fast);

  &:hover { border-color: var(--accent-primary); }
}

.emoji-grid {
  position: absolute;
  top: 40px;
  left: 0;
  z-index: 100;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  width: 280px;
}

.emoji-cell {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover { background: var(--bg-hover); }
  &.selected { background: rgba(108, 158, 255, 0.15); }
}

.clear-cell {
  color: var(--text-muted);
  font-size: 12px;
}

// btn, btn-sm and btn-primary are defined in global.scss
</style>
