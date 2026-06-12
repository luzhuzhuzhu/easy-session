<template>
  <ModalDialog
    v-if="visible"
    :aria-label="$t('session.create')"
    :close-label="$t('session.dialog.cancel')"
    @close="$emit('cancel')"
  >
    <template #header>
      <div class="type-selector" role="radiogroup" :aria-label="$t('session.selectType')">
        <button
          v-for="type in CLI_TYPES"
          :key="type"
          class="type-option"
          :class="{ active: form.type === type }"
          type="button"
          role="radio"
          :aria-checked="form.type === type"
          @click="form.type = type"
        >
          <span>{{ $t(`session.${type}`) }}</span>
        </button>
      </div>
    </template>

    <section class="form-section">
      <div
        v-if="statusMessage"
        class="cli-status-row"
        :class="{
          available: selectedCliStatus === 'available' && targetCanCreateSession,
          unavailable: selectedCliStatus === 'unavailable' || !targetCanCreateSession,
          muted: selectedCliStatus === 'remote' || selectedCliStatus === 'checking'
        }"
      >
        <span>{{ statusMessage }}</span>
        <button
          v-if="selectedCliStatus === 'unavailable'"
          type="button"
          class="text-action"
          @click="openCliSettings"
        >
          {{ $t('session.dialog.openCliSettings') }}
        </button>
      </div>

      <div class="form-group">
        <label>{{ $t('session.dialog.projectPath') }} *</label>
        <div class="path-input">
          <input v-model="form.projectPath" type="text" class="form-input" readonly />
          <Button
            v-if="canBrowseProjectPath"
            size="sm"
            @click="selectFolder"
          >
            {{ $t('session.dialog.browse') }}
          </Button>
        </div>
        <span v-if="projectPathHint" class="path-hint">{{ projectPathHint }}</span>
        <span v-if="pathError" class="error-text">{{ pathError }}</span>
      </div>

      <div class="form-group">
        <label>{{ $t('session.dialog.name') }}</label>
        <div class="name-row">
          <div class="icon-picker-wrap">
            <button
              type="button"
              class="icon-pick-btn"
              :aria-label="$t('session.dialog.pickIcon')"
              @click="toggleEmojiPicker"
            >
              {{ form.icon || '😀' }}
            </button>
            <!-- fixed 定位脱离 modal-body 的 overflow 裁剪，z 轴高于弹窗遮罩(300) -->
            <div
              v-if="showEmojiPicker"
              class="emoji-grid"
              :style="{ top: `${emojiPickerPos.top}px`, left: `${emojiPickerPos.left}px` }"
            >
              <button
                v-for="e in emojiList" :key="e" type="button" class="emoji-cell"
                :class="{ selected: form.icon === e }"
                @click="form.icon = e; showEmojiPicker = false"
              >{{ e }}</button>
              <button
                type="button"
                class="emoji-cell clear-cell"
                :aria-label="$t('session.dialog.clearIcon')"
                @click="form.icon = ''; showEmojiPicker = false"
              >✕</button>
            </div>
          </div>
          <input
            v-model="form.name"
            type="text"
            :placeholder="defaultName"
            class="form-input"
            @keydown.enter.prevent="handleSubmit"
          />
        </div>
      </div>
    </section>

    <section class="advanced-block">
      <button
        type="button"
        class="advanced-toggle"
        :aria-expanded="showAdvancedOptions"
        @click="showAdvancedOptions = !showAdvancedOptions"
      >
        <span>{{ $t('session.dialog.advancedOptions') }}</span>
        <span class="advanced-toggle-icon" :class="{ open: showAdvancedOptions }">&gt;</span>
      </button>

      <!-- v-show 而非 v-if：折叠面板时保留表单状态，提交时参数不丢失 -->
      <div v-show="showAdvancedOptions" class="advanced-fields">
        <SessionOptionsForm ref="optionsFormRef" :cli-type="form.type" />
      </div>
    </section>

    <template #footer>
      <Button @click="$emit('cancel')">{{ $t('session.dialog.cancel') }}</Button>
      <Button
        tone="primary"
        :disabled="!!createDisabledReason"
        :title="createDisabledReason"
        @click="handleSubmit"
      >
        {{ $t('session.dialog.confirm') }}
      </Button>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useSessionsStore } from '@/stores/sessions'
import { useSettingsStore } from '@/stores/settings'
import { useAppStore } from '@/stores/app'
import { useInstancesStore } from '@/stores/instances'
import { useToast } from '@/composables/useToast'
import { useOverlayStack } from '@/composables/useOverlayStack'
import Button from '@/components/ui/Button.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import SessionOptionsForm from '@/components/SessionOptionsForm.vue'
import { ipc } from '@/api/ipc'
import { LOCAL_INSTANCE_ID } from '@/models/unified-resource'
import { SESSION_EMOJI_LIST } from '@/models/session-emoji'
import { CLI_TYPES, CLI_TYPE_DISPLAY_NAMES } from '@shared/cli-types'

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
const router = useRouter()
const sessionsStore = useSessionsStore()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const instancesStore = useInstancesStore()
const toast = useToast()

useOverlayStack({
  isOpen: () => props.visible,
  onEscape: () => emit('cancel')
})

type SessionType = 'claude' | 'codex' | 'opencode' | 'terminal'
type CliStatus = 'checking' | 'available' | 'unavailable' | 'remote'

const form = ref({ name: '', icon: '', type: 'claude' as SessionType, projectPath: '' })
const optionsFormRef = ref<InstanceType<typeof SessionOptionsForm> | null>(null)
const pathError = ref('')
const showEmojiPicker = ref(false)
const emojiPickerPos = ref({ top: 0, left: 0 })
const showAdvancedOptions = ref(false)

const EMOJI_GRID_WIDTH = 280
const EMOJI_GRID_MAX_HEIGHT = 248

// fixed 定位的面板需要按按钮位置计算坐标，并夹取到视口内
function toggleEmojiPicker(event: MouseEvent): void {
  if (showEmojiPicker.value) {
    showEmojiPicker.value = false
    return
  }
  const button = event.currentTarget as HTMLElement | null
  if (!button) return
  const rect = button.getBoundingClientRect()
  emojiPickerPos.value = {
    top: Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - EMOJI_GRID_MAX_HEIGHT - 8)),
    left: Math.min(rect.left, Math.max(8, window.innerWidth - EMOJI_GRID_WIDTH - 16))
  }
  showEmojiPicker.value = true
}
const cliStatusLoading = ref(false)

const emojiList = SESSION_EMOJI_LIST

const defaultName = computed(() => {
  const count = sessionsStore.unifiedSessions.filter((s) => s.type === form.value.type).length + 1
  return `${CLI_TYPE_DISPLAY_NAMES[form.value.type]}-${String(count).padStart(3, '0')}`
})

const canBrowseProjectPath = computed(() => {
  return !props.lockProjectPath && (props.targetInstanceId || LOCAL_INSTANCE_ID) === LOCAL_INSTANCE_ID
})

const isLocalTarget = computed(() => (props.targetInstanceId || LOCAL_INSTANCE_ID) === LOCAL_INSTANCE_ID)
const targetInstance = computed(() => instancesStore.getInstance(props.targetInstanceId || LOCAL_INSTANCE_ID))
const targetCanCreateSession = computed(() => targetInstance.value?.capabilities.sessionCreate ?? true)
const selectedCliDisplayName = computed(() => t(`session.${form.value.type}`))
const selectedCliAvailable = computed(() => {
  if (form.value.type === 'claude') return appStore.claudeAvailable
  if (form.value.type === 'codex') return appStore.codexAvailable
  if (form.value.type === 'opencode') return appStore.opencodeAvailable
  // 终端会话不依赖外部 CLI，系统 shell 总是可用
  return true
})
const selectedCliStatus = computed<CliStatus>(() => {
  if (!isLocalTarget.value) return 'remote'
  if (form.value.type === 'terminal') return 'available'
  if (cliStatusLoading.value) return 'checking'
  return selectedCliAvailable.value ? 'available' : 'unavailable'
})
const selectedCliStatusLabel = computed(() => {
  if (selectedCliStatus.value === 'remote') {
    return t('session.dialog.remoteCliStatusHint')
  }
  if (selectedCliStatus.value === 'checking') {
    return t('session.dialog.cliChecking', { cli: selectedCliDisplayName.value })
  }
  if (selectedCliStatus.value === 'available') {
    return t('session.dialog.cliAvailable', { cli: selectedCliDisplayName.value })
  }
  return t('session.dialog.cliUnavailable', { cli: selectedCliDisplayName.value })
})
const statusMessage = computed(() => {
  if (!targetCanCreateSession.value) return t('session.dialog.targetCreateDisabled')
  if (selectedCliStatus.value === 'checking' || selectedCliStatus.value === 'unavailable') {
    return selectedCliStatusLabel.value
  }
  return ''
})
const projectPathHint = computed(() => {
  if (!props.lockProjectPath) return ''
  return isLocalTarget.value
    ? t('session.dialog.projectPathLockedLocal')
    : t('session.dialog.projectPathLockedRemote')
})
const createDisabledReason = computed(() => {
  if (!targetCanCreateSession.value) return t('session.dialog.targetCreateDisabled')
  if (selectedCliStatus.value === 'checking') return t('session.dialog.cliChecking', { cli: selectedCliDisplayName.value })
  if (selectedCliStatus.value === 'unavailable') return t('session.dialog.cliUnavailable', { cli: selectedCliDisplayName.value })
  return ''
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
    showAdvancedOptions.value = false
    pathError.value = ''
    refreshCliStatus()
  }
)

async function refreshCliStatus(): Promise<void> {
  if (!isLocalTarget.value) return
  cliStatusLoading.value = true
  try {
    await appStore.checkCliStatus()
  } catch {
    // Status row will fall back to the unavailable state.
  } finally {
    cliStatusLoading.value = false
  }
}

function openCliSettings(): void {
  emit('cancel')
  void router.push('/settings')
}

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
  if (createDisabledReason.value) {
    toast.warning(createDisabledReason.value)
    return
  }

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

  let options = optionsFormRef.value?.buildOptions() ?? {}
  if (form.value.type === 'opencode') {
    const cliPath = settingsStore.settings.opencodePath?.trim()
    if (cliPath && !options.cliPath) {
      options = { cliPath, ...options }
    }
  }

  try {
    if (optionsFormRef.value?.hasOpencodeConflict()) {
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
        options: Object.keys(options).length > 0 ? options : undefined,
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
.form-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

// form-input and error-text are defined in global.scss

.type-selector {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex: 1 1 auto;
  max-width: 480px;
  min-width: 0;
  height: 42px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--border-color) 78%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));
}

.type-option {
  display: grid;
  place-items: center;
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  user-select: none;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);

  span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    color: var(--text-primary);
    background: var(--bg-tertiary);
  }

  &.active {
    border-color: color-mix(in srgb, var(--accent-primary) 36%, var(--border-color));
    background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-tertiary));
    color: var(--text-primary);
  }
}

.cli-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  min-height: 26px;
  padding: 5px var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.35;

  &.available {
    border-color: color-mix(in srgb, var(--success-color) 28%, var(--border-color));
    color: var(--success-color);
  }

  &.unavailable {
    border-color: color-mix(in srgb, var(--status-warning) 34%, var(--border-color));
    color: var(--status-warning);
  }
}

.text-action {
  flex-shrink: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--accent-primary);
  cursor: pointer;
  font-size: var(--font-size-xs);

  &:hover {
    text-decoration: underline;
  }
}

.path-hint {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.advanced-block {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-tertiary) 42%, transparent);
  overflow: hidden;
}

.advanced-toggle {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: transparent;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  border: none;
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.advanced-toggle-icon {
  transition: transform var(--transition-fast);

  &.open {
    transform: rotate(90deg);
  }
}

.advanced-fields {
  padding: var(--spacing-md) 12px;
  border-top: 1px solid var(--border-color);
}

.path-input {
  display: flex;
  gap: var(--spacing-sm);

  .form-input {
    flex: 1;
    min-width: 0;
  }
}

.name-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);

  .form-input {
    flex: 1;
    min-width: 0;
  }
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
  // fixed：脱离 modal-body 的 overflow 裁剪；z-index 高于弹窗遮罩(300)
  position: fixed;
  z-index: 400;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: 6px;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  width: min(280px, calc(100vw - 48px));
  max-height: 248px;
  overflow-y: auto;
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
  &.selected { background: color-mix(in srgb, var(--accent-primary) 15%, transparent); }
}

.clear-cell {
  color: var(--text-muted);
  font-size: 12px;
}

@media (max-width: 560px) {
  .type-selector {
    max-width: none;
  }

  .path-input {
    flex-direction: column;
  }
}
</style>
