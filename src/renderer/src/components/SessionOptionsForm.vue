<template>
  <div class="session-options-form">
    <!-- claude / codex：参数预设 -->
    <div v-if="supportsPresets && presetsForType.length > 0" class="preset-row field-wide">
      <label>{{ $t('session.dialog.presets') }}</label>
      <div class="preset-controls">
        <select v-model="selectedPresetId" class="form-input">
          <option value="">{{ $t('session.dialog.presetSelectPlaceholder') }}</option>
          <option v-for="preset in presetsForType" :key="preset.id" :value="preset.id">
            {{ preset.name }}
          </option>
        </select>
        <button type="button" class="icon-text-action" :disabled="!selectedPresetId" @click="applySelectedPreset">
          {{ $t('session.dialog.applyPreset') }}
        </button>
        <button
          type="button"
          class="arg-remove-btn"
          :disabled="!selectedPresetId"
          :aria-label="$t('session.dialog.deletePreset')"
          :title="$t('session.dialog.deletePreset')"
          @click="deleteSelectedPreset"
        >
          <UiIcon name="x" />
        </button>
      </div>
    </div>

    <!-- codex：权限模式（沿用既有 sandbox/approval 映射） -->
    <div v-if="cliType === 'codex'" class="form-group field-wide">
      <label>{{ $t('session.dialog.approvalMode') }}</label>
      <select v-model="codexPermissionsMode" class="form-input">
        <option value="">{{ $t('session.dialog.approvalModeUnset') }}</option>
        <option value="read-only">Read Only</option>
        <option value="default">Default</option>
        <option value="full-access">Full Access</option>
      </select>
      <p v-if="codexPermissionsMode === 'full-access'" class="warning-text">
        {{ $t('session.dialog.fullAccessHint') }}
      </p>
    </div>

    <!-- claude / codex：内置常用参数（全部可选，留空不传） -->
    <div v-if="builtinDescriptors.length > 0" class="builtin-args field-wide">
      <div class="builtin-args-head">
        <label>{{ $t('session.dialog.builtinArgs') }}</label>
        <span class="builtin-args-hint">{{ $t('session.dialog.builtinArgsHint') }}</span>
      </div>
      <div class="builtin-arg-grid">
        <template v-for="descriptor in builtinDescriptors" :key="descriptor.flag">
          <label v-if="descriptor.control === 'toggle'" class="check-label builtin-toggle">
            <input v-model="builtinToggles[descriptor.flag]" type="checkbox" />
            <code>{{ descriptor.flag }}</code>
          </label>
          <div v-else class="form-group">
            <label><code>{{ descriptor.flag }}</code></label>
            <select
              v-if="descriptor.control === 'select'"
              v-model="builtinValues[descriptor.flag]"
              class="form-input"
            >
              <option value="">{{ $t('session.dialog.builtinArgUnset') }}</option>
              <option v-for="option in descriptor.options" :key="option" :value="option">{{ option }}</option>
            </select>
            <input
              v-else
              v-model="builtinValues[descriptor.flag]"
              type="text"
              class="form-input"
              :placeholder="descriptor.placeholder || $t('session.dialog.builtinArgUnset')"
            />
          </div>
        </template>
      </div>
    </div>

    <!-- terminal：shell 选择 + 启动命令 -->
    <template v-if="cliType === 'terminal'">
      <div class="form-group field-wide">
        <label>{{ $t('session.dialog.terminalShell') }}</label>
        <select v-model="shellChoice" class="form-input">
          <option v-for="shell in detectedShells" :key="shell.id" :value="shell.id">
            {{ shell.label }} ({{ shell.path }})
          </option>
          <option value="__custom__">{{ $t('session.dialog.terminalShellCustom') }}</option>
        </select>
      </div>
      <div v-if="shellChoice === '__custom__'" class="form-group field-wide">
        <label>{{ $t('session.dialog.terminalShellCustomPath') }}</label>
        <input
          v-model="customShellPath"
          type="text"
          class="form-input"
          :placeholder="$t('session.dialog.terminalShellCustomPlaceholder')"
        />
      </div>
      <div class="form-group field-wide">
        <label>{{ $t('session.dialog.terminalStartupCommands') }}</label>
        <textarea
          v-model="startupCommandsText"
          class="form-input startup-commands"
          rows="3"
          :placeholder="$t('session.dialog.terminalStartupCommandsPlaceholder')"
        ></textarea>
      </div>
    </template>

    <!-- opencode：沿用原有字段 -->
    <template v-if="cliType === 'opencode'">
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

    <!-- claude / codex / terminal：自定义参数（terminal 为 shell 启动参数） -->
    <div v-if="supportsCustomArgs" class="custom-args field-wide">
      <div class="custom-args-head">
        <label>{{ customArgsLabel }}</label>
        <div class="custom-args-actions">
          <button
            v-if="supportsPresets"
            type="button"
            class="icon-text-action"
            @click="showPresetSave = !showPresetSave"
          >
            <UiIcon name="plus" />
            <span>{{ $t('session.dialog.savePreset') }}</span>
          </button>
          <button type="button" class="icon-text-action" @click="addCustomArg">
            <UiIcon name="plus" />
            <span>{{ $t('session.dialog.addCustomArg') }}</span>
          </button>
        </div>
      </div>

      <div v-if="showPresetSave" class="preset-save-row">
        <input
          v-model="presetName"
          type="text"
          class="form-input"
          :placeholder="$t('session.dialog.presetNamePlaceholder')"
          @keydown.enter.prevent="saveCurrentAsPreset"
        />
        <button type="button" class="icon-text-action" :disabled="!presetName.trim()" @click="saveCurrentAsPreset">
          {{ $t('session.dialog.confirm') }}
        </button>
      </div>

      <div class="custom-arg-list">
        <div v-for="arg in customArgs" :key="arg.id" class="custom-arg-row">
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
            @click="removeCustomArg(arg.id)"
          >
            <UiIcon name="x" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import UiIcon from '@/components/ui/UiIcon.vue'
import { detectShells, type DetectedShell } from '@/api/local-session'
import {
  getBuiltinArgDescriptors,
  builtinStateToArgs,
  splitArgsForForm,
  type BuiltinArgState,
  type CustomCliArgument,
  type LaunchArgPreset,
  type PresetCliType
} from '@/models/cli-launch-args'

const props = withDefaults(defineProps<{
  cliType: 'claude' | 'codex' | 'opencode' | 'terminal'
  initialOptions?: Record<string, unknown>
}>(), {
  initialOptions: undefined
})

const { t } = useI18n()
const settingsStore = useSettingsStore()
const toast = useToast()

interface CustomArgRow {
  id: string
  name: string
  value: string
}

let customArgRowId = 0

function createCustomArgRow(name = '', value = ''): CustomArgRow {
  customArgRowId += 1
  return { id: `opt-arg-${customArgRowId}`, name, value }
}

const builtinDescriptors = computed(() => getBuiltinArgDescriptors(props.cliType))
const supportsPresets = computed(() => props.cliType === 'claude' || props.cliType === 'codex')
const supportsCustomArgs = computed(() => props.cliType !== 'opencode')
const customArgsLabel = computed(() =>
  props.cliType === 'terminal'
    ? t('session.dialog.terminalShellArgs')
    : t('session.dialog.customLaunchArgs')
)

// 内置参数控件状态（toggle 与值分开存，避免 v-model 类型混用）
const builtinToggles = reactive<Record<string, boolean>>({})
const builtinValues = reactive<Record<string, string>>({})
const customArgs = ref<CustomArgRow[]>([createCustomArgRow()])
// 空字符串表示"不指定"——不向 codex 强制下发任何沙箱/审批参数
const codexPermissionsMode = ref<'' | 'read-only' | 'default' | 'full-access'>('')

const opencodeOptions = reactive({
  model: '',
  agent: '',
  prompt: '',
  sessionId: '',
  continueLast: false,
  fork: false,
  attachUrl: '',
  serverMode: 'off' as 'off' | 'attach'
})

const detectedShells = ref<DetectedShell[]>([])
const shellChoice = ref('')
const customShellPath = ref('')
const startupCommandsText = ref('')

const selectedPresetId = ref('')
const showPresetSave = ref(false)
const presetName = ref('')

const presetsForType = computed<LaunchArgPreset[]>(() =>
  settingsStore.settings.launchArgPresets.filter((p) => p.cliType === props.cliType)
)

function applyBuiltinState(state: BuiltinArgState): void {
  for (const descriptor of builtinDescriptors.value) {
    const value = state[descriptor.flag]
    if (descriptor.control === 'toggle') {
      builtinToggles[descriptor.flag] = value === true
    } else {
      builtinValues[descriptor.flag] = typeof value === 'string' ? value : ''
    }
  }
}

function applyArgs(args: CustomCliArgument[] | undefined): void {
  const { builtinState, customArgs: remaining } = splitArgsForForm(args, builtinDescriptors.value)
  applyBuiltinState(builtinState)
  customArgs.value = remaining.length > 0
    ? remaining.map((arg) => createCustomArgRow(arg.name, arg.value || ''))
    : [createCustomArgRow()]
}

function resetFromOptions(): void {
  const options = props.initialOptions || {}
  selectedPresetId.value = ''
  showPresetSave.value = false
  presetName.value = ''

  if (props.cliType === 'claude' || props.cliType === 'codex') {
    applyArgs(options.customArgs as CustomCliArgument[] | undefined)
    if (props.cliType === 'codex') {
      const mode = options.permissionsMode
      codexPermissionsMode.value =
        mode === 'read-only' || mode === 'default' || mode === 'full-access' ? mode : ''
    }
    return
  }

  if (props.cliType === 'terminal') {
    customArgs.value = Array.isArray(options.shellArgs) && options.shellArgs.length > 0
      ? (options.shellArgs as CustomCliArgument[]).map((arg) => createCustomArgRow(arg.name, arg.value || ''))
      : [createCustomArgRow()]
    startupCommandsText.value = Array.isArray(options.startupCommands)
      ? (options.startupCommands as string[]).join('\n')
      : ''
    syncShellChoice(typeof options.shell === 'string' ? options.shell : '')
    return
  }

  // opencode
  opencodeOptions.model = typeof options.model === 'string' ? options.model : ''
  opencodeOptions.agent = typeof options.agent === 'string' ? options.agent : ''
  opencodeOptions.prompt = typeof options.prompt === 'string' ? options.prompt : ''
  opencodeOptions.sessionId = typeof options.sessionId === 'string' ? options.sessionId : ''
  opencodeOptions.continueLast = options.continueLast === true
  opencodeOptions.fork = options.fork === true
  opencodeOptions.attachUrl = typeof options.attachUrl === 'string' ? options.attachUrl : ''
  opencodeOptions.serverMode = options.serverMode === 'attach' ? 'attach' : 'off'
}

function syncShellChoice(savedShell: string): void {
  if (!savedShell) {
    shellChoice.value = detectedShells.value[0]?.id || '__custom__'
    customShellPath.value = ''
    return
  }
  const matched = detectedShells.value.find((s) => s.id === savedShell || s.path === savedShell)
  if (matched) {
    shellChoice.value = matched.id
    customShellPath.value = ''
  } else {
    shellChoice.value = '__custom__'
    customShellPath.value = savedShell
  }
}

async function ensureShellsLoaded(): Promise<void> {
  if (props.cliType !== 'terminal' || detectedShells.value.length > 0) return
  try {
    detectedShells.value = await detectShells()
  } catch {
    detectedShells.value = []
  }
  const options = props.initialOptions || {}
  syncShellChoice(typeof options.shell === 'string' ? options.shell : '')
}

// 同一次打开内按类型缓存表单状态，切换类型选项卡不丢已填内容
interface FormSnapshot {
  toggles: Record<string, boolean>
  values: Record<string, string>
  customArgs: CustomArgRow[]
  codexPermissionsMode: typeof codexPermissionsMode.value
  opencode: typeof opencodeOptions
  shellChoice: string
  customShellPath: string
  startupCommandsText: string
}

const snapshotsByType = new Map<string, FormSnapshot>()

function captureSnapshot(): FormSnapshot {
  return {
    toggles: { ...builtinToggles },
    values: { ...builtinValues },
    customArgs: customArgs.value.map((row) => ({ ...row })),
    codexPermissionsMode: codexPermissionsMode.value,
    opencode: { ...opencodeOptions },
    shellChoice: shellChoice.value,
    customShellPath: customShellPath.value,
    startupCommandsText: startupCommandsText.value
  }
}

function restoreSnapshot(snapshot: FormSnapshot): void {
  for (const descriptor of builtinDescriptors.value) {
    if (descriptor.control === 'toggle') {
      builtinToggles[descriptor.flag] = snapshot.toggles[descriptor.flag] === true
    } else {
      builtinValues[descriptor.flag] = snapshot.values[descriptor.flag] ?? ''
    }
  }
  customArgs.value = snapshot.customArgs.map((row) => ({ ...row }))
  codexPermissionsMode.value = snapshot.codexPermissionsMode
  Object.assign(opencodeOptions, snapshot.opencode)
  shellChoice.value = snapshot.shellChoice
  customShellPath.value = snapshot.customShellPath
  startupCommandsText.value = snapshot.startupCommandsText
}

watch(
  () => props.cliType,
  (_newType, oldType) => {
    if (oldType) snapshotsByType.set(oldType, captureSnapshot())
    const cached = snapshotsByType.get(props.cliType)
    if (cached) {
      restoreSnapshot(cached)
    } else {
      resetFromOptions()
    }
    void ensureShellsLoaded()
  },
  { immediate: true }
)

watch(
  () => props.initialOptions,
  () => {
    snapshotsByType.clear()
    resetFromOptions()
    void ensureShellsLoaded()
  }
)

function addCustomArg(): void {
  customArgs.value.push(createCustomArgRow())
}

function removeCustomArg(id: string): void {
  customArgs.value = customArgs.value.filter((arg) => arg.id !== id)
  if (customArgs.value.length === 0) {
    customArgs.value = [createCustomArgRow()]
  }
}

function collectBuiltinState(): BuiltinArgState {
  const state: BuiltinArgState = {}
  for (const descriptor of builtinDescriptors.value) {
    state[descriptor.flag] =
      descriptor.control === 'toggle'
        ? builtinToggles[descriptor.flag] === true
        : builtinValues[descriptor.flag] || ''
  }
  return state
}

function collectCustomArgRows(): CustomCliArgument[] {
  return customArgs.value
    .map((arg) => ({ name: arg.name.trim(), value: arg.value.trim() }))
    .filter((arg) => arg.name)
    .map((arg) => (arg.value ? { name: arg.name, value: arg.value } : { name: arg.name }))
}

function collectAllArgs(): CustomCliArgument[] {
  return [
    ...builtinStateToArgs(collectBuiltinState(), builtinDescriptors.value),
    ...collectCustomArgRows()
  ]
}

function applySelectedPreset(): void {
  const preset = presetsForType.value.find((p) => p.id === selectedPresetId.value)
  if (!preset) return
  applyArgs(preset.args)
  toast.success(t('session.dialog.presetApplied', { name: preset.name }))
}

async function deleteSelectedPreset(): Promise<void> {
  const preset = presetsForType.value.find((p) => p.id === selectedPresetId.value)
  if (!preset) return
  await settingsStore.deleteLaunchArgPreset(preset.id)
  selectedPresetId.value = ''
}

async function saveCurrentAsPreset(): Promise<void> {
  const name = presetName.value.trim()
  if (!name || !supportsPresets.value) return

  const preset: LaunchArgPreset = {
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    cliType: props.cliType as PresetCliType,
    args: collectAllArgs()
  }
  await settingsStore.saveLaunchArgPreset(preset)
  presetName.value = ''
  showPresetSave.value = false
  selectedPresetId.value = preset.id
  toast.success(t('session.dialog.presetSaved', { name }))
}

// 在 initialOptions 基础上合并表单控制的字段：表单不认识的字段（如 cliPath、
// model、maxTurns、inlineMode 或远程 API 写入的扩展字段）原样保留，
// 只有表单建模的字段会被覆盖或（清空时）删除。
function mergeWithInitial(controlled: Record<string, unknown | undefined>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(props.initialOptions || {}) }
  for (const [key, value] of Object.entries(controlled)) {
    if (value === undefined) {
      delete merged[key]
    } else {
      merged[key] = value
    }
  }
  return merged
}

// 由父组件在提交时调用，构建最终 options（空对象表示无参数）
function buildOptions(): Record<string, unknown> {
  if (props.cliType === 'claude') {
    const args = collectAllArgs()
    return mergeWithInitial({ customArgs: args.length > 0 ? args : undefined })
  }

  if (props.cliType === 'codex') {
    const args = collectAllArgs()
    return mergeWithInitial({
      // 不指定时不向 codex 下发任何沙箱/审批参数，遵循用户本机 CLI 默认
      permissionsMode: codexPermissionsMode.value || undefined,
      customArgs: args.length > 0 ? args : undefined
    })
  }

  if (props.cliType === 'terminal') {
    const shell = shellChoice.value === '__custom__' ? customShellPath.value.trim() : shellChoice.value
    const shellArgs = collectCustomArgRows()
    const startupCommands = startupCommandsText.value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return mergeWithInitial({
      shell: shell || undefined,
      shellArgs: shellArgs.length > 0 ? shellArgs : undefined,
      startupCommands: startupCommands.length > 0 ? startupCommands : undefined
    })
  }

  // opencode：cliPath 等未建模字段经 mergeWithInitial 自动保留
  return mergeWithInitial({
    model: opencodeOptions.model.trim() || undefined,
    agent: opencodeOptions.agent.trim() || undefined,
    prompt: opencodeOptions.prompt.trim() || undefined,
    sessionId: opencodeOptions.sessionId.trim() || undefined,
    continueLast: opencodeOptions.continueLast || undefined,
    fork: opencodeOptions.fork || undefined,
    attachUrl:
      opencodeOptions.serverMode === 'attach'
        ? opencodeOptions.attachUrl.trim() || undefined
        : undefined,
    serverMode: opencodeOptions.serverMode
  })
}

function hasOpencodeConflict(): boolean {
  return props.cliType === 'opencode' && !!opencodeOptions.sessionId && opencodeOptions.continueLast
}

defineExpose({ buildOptions, hasOpencodeConflict })
</script>

<style scoped lang="scss">
.session-options-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

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

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
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

.preset-row {
  display: flex;
  flex-direction: column;
  gap: 4px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

.preset-controls {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 30px;
  gap: 6px;
  align-items: center;

  .form-input {
    min-width: 0;
  }
}

.preset-save-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.builtin-args {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.builtin-args-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

.builtin-args-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.builtin-arg-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.builtin-toggle {
  align-self: end;
  padding-bottom: 6px;

  code {
    font-size: var(--font-size-xs);
  }
}

.startup-commands {
  resize: vertical;
  min-height: 60px;
  font-family: var(--font-mono, monospace);
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

.custom-args-actions {
  display: flex;
  align-items: center;
  gap: 6px;
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

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent-primary) 36%, var(--border-color));
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  &:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--danger-color, #ef4444) 36%, var(--border-color));
    background: color-mix(in srgb, var(--danger-color, #ef4444) 10%, transparent);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

@media (max-width: 560px) {
  .session-options-form,
  .builtin-arg-grid {
    grid-template-columns: 1fr;
  }

  .custom-arg-row {
    grid-template-columns: 1fr 30px;

    .form-input:first-child {
      grid-column: 1 / -1;
    }
  }
}
</style>
