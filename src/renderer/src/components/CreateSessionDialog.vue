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
          </div>
        </div>

        <div class="form-group">
          <label>{{ $t('session.dialog.projectPath') }} *</label>
          <div class="path-input">
            <input v-model="form.projectPath" type="text" class="form-input" readonly />
            <button
              v-if="!props.lockProjectPath"
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
import { useToast } from '@/composables/useToast'
import { ipc } from '@/api/ipc'

const props = withDefaults(defineProps<{
  visible: boolean
  defaultProjectPath?: string
  lockProjectPath?: boolean
  startPaused?: boolean
  activateOnCreate?: boolean
}>(), {
  defaultProjectPath: '',
  lockProjectPath: false,
  startPaused: false,
  activateOnCreate: true
})

const emit = defineEmits<{ (e: 'cancel'): void; (e: 'created', sessionId?: string): void }>()

const { t } = useI18n()
const sessionsStore = useSessionsStore()
const toast = useToast()

type CodexPermissionsMode = 'read-only' | 'default' | 'full-access'

const form = ref({ name: '', icon: '', type: 'claude' as 'claude' | 'codex', projectPath: '' })
const codexOptions = ref({ permissionsMode: 'default' as CodexPermissionsMode })
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
  const count = sessionsStore.sessions.filter((s) => s.type === form.value.type).length + 1
  return `${form.value.type === 'claude' ? 'Claude' : 'Codex'}-${String(count).padStart(3, '0')}`
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.value = { name: '', icon: '', type: 'claude', projectPath: props.defaultProjectPath || '' }
    showEmojiPicker.value = false
    codexOptions.value = { permissionsMode: 'default' }
    pathError.value = ''
  }
)

async function selectFolder() {
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
  if (!form.value.projectPath) {
    pathError.value = t('session.dialog.pathRequired')
    return
  }

  const options =
    form.value.type === 'codex'
      ? Object.fromEntries(Object.entries(codexOptions.value).filter(([, v]) => v))
      : undefined

  try {
    const session = await sessionsStore.createSession({
      name: form.value.name || defaultName.value,
      icon: form.value.icon || undefined,
      type: form.value.type,
      projectPath: form.value.projectPath,
      options: options && Object.keys(options).length > 0 ? options : undefined,
      startPaused: props.startPaused
    }, { activate: props.activateOnCreate })

    toast.success(t('toast.sessionCreated'))
    emit('created', session.id)
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
