<template>
  <div v-if="visible" class="dialog-overlay" @click.self="$emit('cancel')">
    <div class="dialog">
      <div class="dialog-header">
        <div class="type-selector header-type-selector" role="radiogroup" :aria-label="$t('session.selectType')">
          <button
            class="type-option"
            :class="{ active: form.type === 'claude' }"
            type="button"
            role="radio"
            :aria-checked="form.type === 'claude'"
            @click="form.type = 'claude'"
          >
            <span>{{ $t('session.claude') }}</span>
          </button>
          <button
            class="type-option"
            :class="{ active: form.type === 'codex' }"
            type="button"
            role="radio"
            :aria-checked="form.type === 'codex'"
            @click="form.type = 'codex'"
          >
            <span>{{ $t('session.codex') }}</span>
          </button>
          <button
            class="type-option"
            :class="{ active: form.type === 'opencode' }"
            type="button"
            role="radio"
            :aria-checked="form.type === 'opencode'"
            @click="form.type = 'opencode'"
          >
            <span>{{ $t('session.opencode') }}</span>
          </button>
        </div>
        <button class="close-btn" type="button" :aria-label="$t('session.dialog.cancel')" @click="$emit('cancel')">&times;</button>
      </div>

      <form class="dialog-body" @submit.prevent="handleSubmit">
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
                  @click="showEmojiPicker = !showEmojiPicker"
                >
                  {{ form.icon || '😀' }}
                </button>
                <div v-if="showEmojiPicker" class="emoji-grid">
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
              <input v-model="form.name" type="text" :placeholder="defaultName" class="form-input" />
            </div>
          </div>
        </section>

        <section v-if="form.type === 'claude' || form.type === 'codex' || form.type === 'opencode'" class="form-section advanced-block">
          <button
            type="button"
            class="advanced-toggle"
            :aria-expanded="showAdvancedOptions"
            @click="showAdvancedOptions = !showAdvancedOptions"
          >
            <span>{{ $t('session.dialog.advancedOptions') }}</span>
            <span class="advanced-toggle-icon" :class="{ open: showAdvancedOptions }">&gt;</span>
          </button>

          <div v-if="showAdvancedOptions" class="advanced-fields">
            <template v-if="form.type === 'codex'">
              <div class="form-group field-wide">
                <label>{{ $t('session.dialog.approvalMode') }}</label>
                <select v-model="codexOptions.permissionsMode" class="form-input">
                  <option value="read-only">Read Only</option>
                  <option value="default">Default</option>
                  <option value="full-access">Full Access</option>
                </select>
                <p v-if="codexOptions.permissionsMode === 'full-access'" class="warning-text">
                  {{ $t('session.dialog.fullAccessHint') }}
                </p>
              </div>
            </template>

            <template v-if="supportsCustomLaunchArgs">
              <div class="custom-args field-wide">
                <div class="custom-args-head">
                  <label>{{ $t('session.dialog.customLaunchArgs') }}</label>
                  <button type="button" class="icon-text-action" @click="addCustomLaunchArg">
                    <UiIcon name="plus" />
                    <span>{{ $t('session.dialog.addCustomArg') }}</span>
                  </button>
                </div>

                <div class="custom-arg-list">
                  <div v-for="arg in customLaunchArgs" :key="arg.id" class="custom-arg-row">
                    <input
                      v-model="arg.name"
                      type="text"
                      class="form-input"
                      :aria-label="$t('session.dialog.customArgName')"
                      :placeholder="$t('session.dialog.customArgNamePlaceholder')"
                    />
                    <input
                      v-model="arg.value"
                      type="text"
                      class="form-input"
                      :aria-label="$t('session.dialog.customArgValue')"
                      :placeholder="$t('session.dialog.customArgValuePlaceholder')"
                    />
                    <button
                      type="button"
                      class="arg-remove-btn"
                      :aria-label="$t('session.dialog.removeCustomArg')"
                      :title="$t('session.dialog.removeCustomArg')"
                      @click="removeCustomLaunchArg(arg.id)"
                    >
                      <UiIcon name="x" />
                    </button>
                  </div>
                </div>
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
              <div class="form-group field-wide">
                <label>{{ $t('session.dialog.opencodePrompt') }}</label>
                <input v-model="opencodeOptions.prompt" type="text" class="form-input" :placeholder="$t('session.dialog.opencodePromptPlaceholder')" />
              </div>
              <div class="form-group field-wide">
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
              <div class="form-group field-wide" v-if="opencodeOptions.serverMode === 'attach'">
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
          </div>
        </section>

        <div class="dialog-footer">
          <Button @click="$emit('cancel')">{{ $t('session.dialog.cancel') }}</Button>
          <Button
            type="submit"
            tone="primary"
            :disabled="!!createDisabledReason"
            :title="createDisabledReason"
          >
            {{ $t('session.dialog.confirm') }}
          </Button>
        </div>
      </form>
    </div>
  </div>
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
import UiIcon from '@/components/ui/UiIcon.vue'
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

type CodexPermissionsMode = 'read-only' | 'default' | 'full-access'
type CliStatus = 'checking' | 'available' | 'unavailable' | 'remote'
interface CustomLaunchArg {
  id: string
  name: string
  value: string
}

let customLaunchArgId = 0

function createCustomLaunchArg(): CustomLaunchArg {
  customLaunchArgId += 1
  return {
    id: `custom-arg-${customLaunchArgId}`,
    name: '',
    value: ''
  }
}

const form = ref({ name: '', icon: '', type: 'claude' as 'claude' | 'codex' | 'opencode', projectPath: '' })
const codexOptions = ref({ permissionsMode: 'default' as CodexPermissionsMode })
const customLaunchArgs = ref<CustomLaunchArg[]>([createCustomLaunchArg()])
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
const showAdvancedOptions = ref(false)
const cliStatusLoading = ref(false)

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

const isLocalTarget = computed(() => (props.targetInstanceId || LOCAL_INSTANCE_ID) === LOCAL_INSTANCE_ID)
const targetInstance = computed(() => instancesStore.getInstance(props.targetInstanceId || LOCAL_INSTANCE_ID))
const targetCanCreateSession = computed(() => targetInstance.value?.capabilities.sessionCreate ?? true)
const selectedCliDisplayName = computed(() => {
  if (form.value.type === 'claude') return t('session.claude')
  if (form.value.type === 'codex') return t('session.codex')
  return t('session.opencode')
})
const supportsCustomLaunchArgs = computed(() => form.value.type === 'claude' || form.value.type === 'codex')
const selectedCliAvailable = computed(() => {
  if (form.value.type === 'claude') return appStore.claudeAvailable
  if (form.value.type === 'codex') return appStore.codexAvailable
  return appStore.opencodeAvailable
})
const selectedCliStatus = computed<CliStatus>(() => {
  if (!isLocalTarget.value) return 'remote'
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
    codexOptions.value = { permissionsMode: 'default' }
    customLaunchArgs.value = [createCustomLaunchArg()]
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

function addCustomLaunchArg(): void {
  customLaunchArgs.value.push(createCustomLaunchArg())
}

function removeCustomLaunchArg(id: string): void {
  customLaunchArgs.value = customLaunchArgs.value.filter((arg) => arg.id !== id)
  if (customLaunchArgs.value.length === 0) {
    customLaunchArgs.value = [createCustomLaunchArg()]
  }
}

function buildCustomLaunchArgs(): Array<{ name: string; value?: string }> {
  return customLaunchArgs.value
    .map((arg) => ({
      name: arg.name.trim(),
      value: arg.value.trim()
    }))
    .filter((arg) => arg.name)
    .map((arg) => ({
      name: arg.name,
      ...(arg.value ? { value: arg.value } : {})
    }))
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

  const customArgs = supportsCustomLaunchArgs.value ? buildCustomLaunchArgs() : []
  const options =
    form.value.type === 'claude'
      ? Object.fromEntries(Object.entries({
          customArgs: customArgs.length > 0 ? customArgs : undefined
        }).filter(([, v]) => v))
      : form.value.type === 'codex'
        ? Object.fromEntries(Object.entries({
            ...codexOptions.value,
            customArgs: customArgs.length > 0 ? customArgs : undefined
          }).filter(([, v]) => v))
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
  width: min(92vw, 560px);
  max-height: 84vh;
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);
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
  padding: 18px var(--spacing-lg) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

.type-selector {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
}

.header-type-selector {
  flex: 1 1 auto;
  max-width: 360px;
  min-width: 0;
  height: 42px;
  padding: 4px;
  border-color: color-mix(in srgb, var(--border-color) 78%, transparent);
  background: color-mix(in srgb, var(--bg-primary) 70%, var(--bg-secondary));

  .type-option {
    height: 100%;
    min-height: 0;
    padding: 0 10px;
    font-size: 13px;
    line-height: 1;
    white-space: nowrap;
  }
}

.type-option {
  display: grid;
  place-items: center;
  flex: 1 1 0;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: 700;
  line-height: 1;
  overflow: hidden;
  user-select: none;
  vertical-align: top;
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
    height: 14px;
    overflow: hidden;
    line-height: 14px;
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
  gap: 8px;
  min-height: 26px;
  padding: 5px 8px;
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

.form-row {
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: wrap;
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--border-color);

  .form-group,
  .form-row,
  .warning-text {
    min-width: 0;
  }

  .form-row,
  .field-wide,
  .warning-text {
    grid-column: 1 / -1;
  }
}

.custom-args {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.custom-args-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

.icon-text-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-xs);
  line-height: 1;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);

  .ui-icon {
    width: 14px;
    height: 14px;
  }

  &:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 36%, var(--border-color));
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.custom-arg-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.custom-arg-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 30px;
  gap: 6px;
  align-items: center;

  .form-input {
    min-width: 0;
  }
}

.arg-remove-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    color var(--transition-fast);

  .ui-icon {
    width: 14px;
    height: 14px;
  }

  &:hover {
    border-color: color-mix(in srgb, var(--danger-color, #ef4444) 36%, var(--border-color));
    background: color-mix(in srgb, var(--danger-color, #ef4444) 10%, transparent);
    color: var(--text-primary);
  }
}

.path-input {
  display: flex;
  gap: var(--spacing-sm);

  .form-input {
    flex: 1;
    min-width: 0;
  }
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}

.name-row {
  display: flex;
  align-items: center;
  gap: 6px;

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
  width: min(280px, calc(100vw - 48px));
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
  .dialog {
    width: min(94vw, 520px);
  }

  .dialog-header {
    align-items: center;
  }

  .header-type-selector {
    max-width: none;
  }

  .advanced-fields {
    grid-template-columns: 1fr;
  }

  .custom-args-head {
    align-items: stretch;
    flex-direction: column;
  }

  .icon-text-action {
    justify-content: center;
    width: 100%;
  }

  .custom-arg-row {
    grid-template-columns: 1fr 30px;

    .form-input:first-child {
      grid-column: 1 / -1;
    }
  }

  .path-input,
  .dialog-footer {
    flex-direction: column;
  }

  .dialog-footer :deep(.ui-button) {
    width: 100%;
  }
}

</style>
