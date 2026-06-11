<template>
  <div class="session-options-form">
    <!-- codex：权限模式（包装 --sandbox / --ask-for-approval） -->
    <section v-if="cliType === 'codex'" class="opts-section">
      <div class="opts-section-head">
        <span class="opts-section-title">{{ $t('session.dialog.approvalMode') }}</span>
      </div>
      <select v-model="codexPermissionsMode" class="form-input">
        <option value="">{{ $t('session.dialog.approvalModeUnset') }}</option>
        <option value="read-only">{{ $t('session.dialog.approvalModeReadOnly') }}</option>
        <option value="default">{{ $t('session.dialog.approvalModeDefault') }}</option>
        <option value="full-access">{{ $t('session.dialog.approvalModeFullAccess') }}</option>
      </select>
      <p v-if="codexPermissionsMode === 'full-access'" class="warning-text">
        {{ $t('session.dialog.fullAccessHint') }}
      </p>
      <p v-if="hasCodexSandboxConflict" class="warning-text">
        {{ $t('session.dialog.codexSandboxConflictHint') }}
      </p>
    </section>

    <!-- claude / codex：启动参数（常用 + 自定义为其子块），预设对整组保存/套用 -->
    <section v-if="supportsPresets" class="opts-section">
      <div class="opts-section-head">
        <span class="opts-section-title">{{ $t('session.dialog.launchArgs') }}</span>
        <div class="preset-toolbar">
          <template v-if="presetsForType.length > 0">
            <select
              v-model="selectedPresetId"
              class="form-input preset-select"
              :aria-label="$t('session.dialog.presets')"
              @change="applySelectedPreset"
            >
              <option value="">{{ $t('session.dialog.presetSelectPlaceholder') }}</option>
              <option v-for="preset in presetsForType" :key="preset.id" :value="preset.id">
                {{ preset.name }}
              </option>
            </select>
            <button
              v-if="selectedPresetId"
              type="button"
              class="arg-remove-btn"
              :aria-label="$t('session.dialog.deletePreset')"
              :title="$t('session.dialog.deletePreset')"
              @click="deleteSelectedPreset"
            >
              <UiIcon name="x" />
            </button>
          </template>
          <button type="button" class="icon-text-action" @click="showPresetSave = !showPresetSave">
            <UiIcon name="plus" />
            <span>{{ $t('session.dialog.savePreset') }}</span>
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

      <div v-if="builtinDescriptors.length > 0" class="opts-subsection">
        <div class="opts-subhead">
          <label>{{ $t('session.dialog.builtinArgs') }}</label>
          <span class="opts-section-hint">{{ $t('session.dialog.builtinArgsHint') }}</span>
        </div>
      <div v-if="builtinValueDescriptors.length > 0" class="builtin-arg-grid">
        <div v-for="descriptor in builtinValueDescriptors" :key="descriptor.flag" class="form-group">
          <label class="arg-label">
            <code>{{ descriptor.flag }}</code>
            <span
              v-if="descriptor.help"
              class="arg-help"
              :title="$t(`session.dialog.argHelp.${descriptor.help}`)"
              :aria-label="$t(`session.dialog.argHelp.${descriptor.help}`)"
              role="img"
            >?</span>
          </label>
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
      </div>
      <div v-if="builtinToggleDescriptors.length > 0" class="builtin-toggle-row">
        <label v-for="descriptor in builtinToggleDescriptors" :key="descriptor.flag" class="check-label">
          <input v-model="builtinToggles[descriptor.flag]" type="checkbox" />
          <code>{{ descriptor.flag }}</code>
          <span
            v-if="descriptor.help"
            class="arg-help"
            :title="$t(`session.dialog.argHelp.${descriptor.help}`)"
            :aria-label="$t(`session.dialog.argHelp.${descriptor.help}`)"
            role="img"
          >?</span>
        </label>
      </div>
      </div>

      <div class="opts-subsection">
        <div class="opts-subhead">
          <label>{{ $t('session.dialog.customLaunchArgs') }}</label>
          <button type="button" class="icon-text-action" @click="addCustomArg">
            <UiIcon name="plus" />
            <span>{{ $t('session.dialog.addCustomArg') }}</span>
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
    </section>

    <!-- terminal：shell 选择 + 启动命令 -->
    <section v-if="cliType === 'terminal'" class="opts-section">
      <div class="opts-section-head">
        <span class="opts-section-title">{{ $t('session.dialog.terminalShell') }}</span>
      </div>
      <select v-model="shellChoice" class="form-input">
        <option v-for="shell in detectedShells" :key="shell.id" :value="shell.id">
          {{ shell.label }} ({{ shell.path }})
        </option>
        <option value="__custom__">{{ $t('session.dialog.terminalShellCustom') }}</option>
      </select>
      <div v-if="shellChoice === '__custom__'" class="form-group">
        <label>{{ $t('session.dialog.terminalShellCustomPath') }}</label>
        <input
          v-model="customShellPath"
          type="text"
          class="form-input"
          :placeholder="$t('session.dialog.terminalShellCustomPlaceholder')"
        />
      </div>
      <div class="form-group">
        <label>{{ $t('session.dialog.terminalStartupCommands') }}</label>
        <textarea
          v-model="startupCommandsText"
          class="form-input startup-commands"
          rows="3"
          :placeholder="$t('session.dialog.terminalStartupCommandsPlaceholder')"
        ></textarea>
      </div>
    </section>

    <!-- opencode：沿用原有字段 -->
    <section v-if="cliType === 'opencode'" class="opts-section">
      <div class="opencode-grid">
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
        <div v-if="opencodeOptions.serverMode === 'attach'" class="form-group field-wide">
          <label>{{ $t('session.dialog.opencodeAttachUrl') }}</label>
          <input v-model="opencodeOptions.attachUrl" type="text" class="form-input" :placeholder="$t('session.dialog.opencodeAttachUrlPlaceholder')" />
        </div>
      </div>
      <div class="check-row">
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
    </section>

    <!-- terminal：shell 启动参数 -->
    <section v-if="cliType === 'terminal'" class="opts-section">
      <div class="opts-section-head">
        <span class="opts-section-title">{{ $t('session.dialog.terminalShellArgs') }}</span>
        <button type="button" class="icon-text-action" @click="addCustomArg">
          <UiIcon name="plus" />
          <span>{{ $t('session.dialog.addCustomArg') }}</span>
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
    </section>

    <!-- 所有类型：终端外观（字体/字重），留空跟随全局设置，保存即生效 -->
    <section class="opts-section">
      <div class="opts-section-head">
        <span class="opts-section-title">{{ $t('session.dialog.appearance') }}</span>
        <span class="opts-section-hint">{{ $t('session.dialog.appearanceHint') }}</span>
      </div>
      <div class="builtin-arg-grid">
        <div class="form-group">
          <label>{{ $t('session.dialog.appearanceFontFamily') }}</label>
          <select :value="appearanceFontChoice" class="form-input" @change="onAppearanceFontChoiceChange">
            <option value="">{{ $t('session.dialog.appearanceFollowGlobal') }}</option>
            <optgroup v-if="fontGroups.cjkMono.length" :label="$t('settings.fontGroupCjkMono')">
              <option v-for="font in fontGroups.cjkMono" :key="font" :value="font">{{ font }}</option>
            </optgroup>
            <optgroup v-if="fontGroups.mono.length" :label="$t('settings.fontGroupMono')">
              <option v-for="font in fontGroups.mono" :key="font" :value="font">{{ font }}</option>
            </optgroup>
            <optgroup v-if="fontGroups.other.length" :label="$t('settings.fontGroupOther')">
              <option v-for="font in fontGroups.other" :key="font" :value="font">{{ font }}</option>
            </optgroup>
            <option value="__custom__">{{ $t('settings.fontCustomOption') }}</option>
          </select>
          <input
            v-if="appearanceFontChoice === '__custom__'"
            v-model="appearanceFontFamily"
            type="text"
            class="form-input"
            :placeholder="DEFAULT_TERMINAL_FONT_FAMILY"
          />
          <span v-if="appearanceFontMissing" class="warning-text">{{ $t('settings.fontNotInstalled') }}</span>
        </div>
        <div class="form-group">
          <label>{{ $t('session.dialog.appearanceFontWeight') }}</label>
          <select v-model="appearanceFontWeight" class="form-input">
            <option value="">{{ $t('session.dialog.appearanceFollowGlobal') }}</option>
            <option v-for="weight in TERMINAL_FONT_WEIGHTS" :key="weight" :value="weight">
              {{ $t(`settings.fontWeightValue.${weight}`) }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>{{ $t('session.dialog.appearanceFontWeightBold') }}</label>
          <select v-model="appearanceFontWeightBold" class="form-input">
            <option value="">{{ $t('session.dialog.appearanceFollowGlobal') }}</option>
            <option v-for="weight in TERMINAL_FONT_WEIGHTS" :key="weight" :value="weight">
              {{ $t(`settings.fontWeightValue.${weight}`) }}
            </option>
          </select>
        </div>
        <div class="form-group">
          <label>{{ $t('session.dialog.appearanceLineHeight') }}</label>
          <input
            v-model="appearanceLineHeightText"
            type="number"
            class="form-input"
            :min="MIN_TERMINAL_LINE_HEIGHT"
            :max="MAX_TERMINAL_LINE_HEIGHT"
            step="0.05"
            :placeholder="$t('session.dialog.appearanceFollowGlobal')"
          />
        </div>
        <div class="form-group">
          <label>{{ $t('session.dialog.appearanceLetterSpacing') }}</label>
          <input
            v-model="appearanceLetterSpacingText"
            type="number"
            class="form-input"
            :min="MIN_TERMINAL_LETTER_SPACING"
            :max="MAX_TERMINAL_LETTER_SPACING"
            step="0.5"
            :placeholder="$t('session.dialog.appearanceFollowGlobal')"
          />
        </div>
      </div>
      <div class="font-preview" :style="appearancePreviewStyle">
        <span v-for="line in TERMINAL_FONT_PREVIEW_LINES" :key="line">{{ line }}</span>
        <span :style="{ fontWeight: appearanceBoldPreviewWeight }">{{ TERMINAL_FONT_PREVIEW_BOLD_LINE }}</span>
      </div>
      <p class="opts-section-hint">{{ appearanceDistinctWeightsLabel }}</p>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/settings'
import { useToast } from '@/composables/useToast'
import UiIcon from '@/components/ui/UiIcon.vue'
import { detectShells, type DetectedShell } from '@/api/local-session'
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  ensureMonospaceFallback,
  MAX_TERMINAL_LETTER_SPACING,
  MAX_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_LETTER_SPACING,
  MIN_TERMINAL_LINE_HEIGHT,
  TERMINAL_FONT_PREVIEW_BOLD_LINE,
  TERMINAL_FONT_PREVIEW_LINES,
  TERMINAL_FONT_WEIGHTS,
  clampTerminalLetterSpacing,
  clampTerminalLineHeight,
  detectDistinctFontWeights,
  fallbackFontGroups,
  isFontInstalled,
  isTerminalFontWeight,
  listSystemFontGroups,
  parseSessionAppearance,
  primaryFontFamily,
  type SessionAppearanceOptions,
  type SystemFontGroups
} from '@/models/terminal-appearance'
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
const builtinValueDescriptors = computed(() =>
  builtinDescriptors.value.filter((d) => d.control !== 'toggle')
)
const builtinToggleDescriptors = computed(() =>
  builtinDescriptors.value.filter((d) => d.control === 'toggle')
)
const supportsPresets = computed(() => props.cliType === 'claude' || props.cliType === 'codex')

// 内置参数控件状态（toggle 与值分开存，避免 v-model 类型混用）
const builtinToggles = reactive<Record<string, boolean>>({})
const builtinValues = reactive<Record<string, string>>({})
const customArgs = ref<CustomArgRow[]>([createCustomArgRow()])
// 空字符串表示"不指定"——不向 codex 强制下发任何沙箱/审批参数
const codexPermissionsMode = ref<'' | 'read-only' | 'default' | 'full-access'>('')

// 权限模式已包装 -s/-a 时，自定义参数里再写同类 flag 会重复下发
const CODEX_SANDBOX_FLAGS = new Set(['-s', '--sandbox', '-a', '--ask-for-approval'])
const hasCodexSandboxConflict = computed(() => {
  if (props.cliType !== 'codex' || !codexPermissionsMode.value) return false
  return customArgs.value.some((arg) => CODEX_SANDBOX_FLAGS.has(arg.name.trim()))
})

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

// 终端外观（所有类型通用）：空值表示跟随全局设置
const appearanceFontFamily = ref('')
const appearanceFontWeight = ref('')
const appearanceFontWeightBold = ref('')
const appearanceLineHeightText = ref('')
const appearanceLetterSpacingText = ref('')

// 先用静态探测列表占位，系统字体枚举完成后替换为完整分组清单
const fontGroups = ref<SystemFontGroups>(fallbackFontGroups())

onMounted(() => {
  void listSystemFontGroups().then((groups) => {
    fontGroups.value = groups
  })
})

const allSuggestedFonts = computed(() => [
  ...fontGroups.value.cjkMono,
  ...fontGroups.value.mono,
  ...fontGroups.value.other
])

// 用户显式选择"自定义…"后保持文本框显示
const appearanceFontCustom = ref(false)

const appearanceFontChoice = computed(() => {
  if (appearanceFontCustom.value) return '__custom__'
  const value = appearanceFontFamily.value.trim()
  if (!value) return ''
  const primary = primaryFontFamily(value)
  if (allSuggestedFonts.value.includes(primary)) return primary
  return '__custom__'
})

function onAppearanceFontChoiceChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value ?? ''
  if (value === '__custom__') {
    appearanceFontCustom.value = true
    return
  }
  appearanceFontCustom.value = false
  appearanceFontFamily.value = value
}

const appearanceFontMissing = computed(() => {
  const value = appearanceFontFamily.value.trim()
  return !!value && !isFontInstalled(value)
})

// 预览按"会话覆盖 → 全局设置 → 内置默认"的实际生效优先级渲染
const appearancePreviewStyle = computed(() => {
  const lineHeight =
    parseLineHeightInput() ?? clampTerminalLineHeight(settingsStore.settings.terminalLineHeight)
  const letterSpacing =
    parseLetterSpacingInput() ?? clampTerminalLetterSpacing(settingsStore.settings.terminalLetterSpacing)
  return {
    // 与终端实际使用的字体栈完全一致（统一补引号与等宽回退）
    fontFamily: ensureMonospaceFallback(
      appearanceFontFamily.value.trim() || settingsStore.settings.terminalFont.trim()
    ),
    fontWeight: appearanceFontWeight.value || settingsStore.settings.terminalFontWeight || 'normal',
    lineHeight: String(lineHeight * 1.5),
    letterSpacing: `${letterSpacing}px`
  }
})

function parseLetterSpacingInput(): number | undefined {
  const raw = appearanceLetterSpacingText.value.trim()
  if (!raw) return undefined
  const num = Number(raw)
  if (!Number.isFinite(num)) return undefined
  return clampTerminalLetterSpacing(num)
}

const appearanceBoldPreviewWeight = computed(
  () => appearanceFontWeightBold.value || settingsStore.settings.terminalFontWeightBold || 'bold'
)

// 实测当前生效字体能区分的字重档位
const appearanceDistinctWeightsLabel = computed(() => {
  const family =
    appearanceFontFamily.value.trim() ||
    settingsStore.settings.terminalFont.trim() ||
    DEFAULT_TERMINAL_FONT_FAMILY
  const weights = detectDistinctFontWeights(family)
  if (weights.length >= TERMINAL_FONT_WEIGHTS.length) {
    return t('settings.fontWeightAllDistinct')
  }
  const labels = weights.map((weight) => t(`settings.fontWeightValue.${weight}`)).join(' / ')
  return t('settings.fontWeightDetected', { weights: labels })
})

// 输入框为空或非法时返回 undefined（跟随全局）
function parseLineHeightInput(): number | undefined {
  const raw = appearanceLineHeightText.value.trim()
  if (!raw) return undefined
  const num = Number(raw)
  if (!Number.isFinite(num)) return undefined
  return clampTerminalLineHeight(num)
}

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

  const appearance = parseSessionAppearance(options)
  appearanceFontFamily.value = appearance.fontFamily || ''
  appearanceFontWeight.value = isTerminalFontWeight(appearance.fontWeight) ? appearance.fontWeight : ''
  appearanceFontWeightBold.value = isTerminalFontWeight(appearance.fontWeightBold) ? appearance.fontWeightBold : ''
  appearanceLineHeightText.value = typeof appearance.lineHeight === 'number' ? String(appearance.lineHeight) : ''
  appearanceLetterSpacingText.value =
    typeof appearance.letterSpacing === 'number' ? String(appearance.letterSpacing) : ''
  appearanceFontCustom.value = false

  if (props.cliType === 'claude' || props.cliType === 'codex') {
    const args = Array.isArray(options.customArgs)
      ? [...(options.customArgs as CustomCliArgument[])]
      : []
    // 旧版 options.model 字段迁移进参数体系：表单展示为 --model，
    // 保存时统一由 customArgs 表达并删除旧字段，避免 adapter 重复下发 --model
    const legacyModel = typeof options.model === 'string' ? options.model.trim() : ''
    if (legacyModel && !args.some((arg) => typeof arg?.name === 'string' && arg.name.trim() === '--model')) {
      args.push({ name: '--model', value: legacyModel })
    }
    applyArgs(args)
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
  appearanceFontFamily: string
  appearanceFontWeight: string
  appearanceFontWeightBold: string
  appearanceLineHeightText: string
  appearanceLetterSpacingText: string
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
    startupCommandsText: startupCommandsText.value,
    appearanceFontFamily: appearanceFontFamily.value,
    appearanceFontWeight: appearanceFontWeight.value,
    appearanceFontWeightBold: appearanceFontWeightBold.value,
    appearanceLineHeightText: appearanceLineHeightText.value,
    appearanceLetterSpacingText: appearanceLetterSpacingText.value
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
  appearanceFontFamily.value = snapshot.appearanceFontFamily
  appearanceFontWeight.value = snapshot.appearanceFontWeight
  appearanceFontWeightBold.value = snapshot.appearanceFontWeightBold
  appearanceLineHeightText.value = snapshot.appearanceLineHeightText
  appearanceLetterSpacingText.value = snapshot.appearanceLetterSpacingText
  appearanceFontCustom.value = false
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

// 下拉选中即套用；选回占位项（空值）时不动当前表单
function applySelectedPreset(): void {
  if (!selectedPresetId.value) return
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
// inlineMode 或远程 API 写入的扩展字段）原样保留，
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

// 表单中的终端外观 → options.appearance（全部为空时整个字段删除）
function buildAppearance(): SessionAppearanceOptions | undefined {
  const fontFamily = appearanceFontFamily.value.trim()
  const fontWeight = isTerminalFontWeight(appearanceFontWeight.value) ? appearanceFontWeight.value : ''
  const fontWeightBold = isTerminalFontWeight(appearanceFontWeightBold.value) ? appearanceFontWeightBold.value : ''
  const lineHeight = parseLineHeightInput()
  const letterSpacing = parseLetterSpacingInput()
  if (!fontFamily && !fontWeight && !fontWeightBold && lineHeight === undefined && letterSpacing === undefined) {
    return undefined
  }
  return {
    ...(fontFamily ? { fontFamily } : {}),
    ...(fontWeight ? { fontWeight } : {}),
    ...(fontWeightBold ? { fontWeightBold } : {}),
    ...(lineHeight !== undefined ? { lineHeight } : {}),
    ...(letterSpacing !== undefined ? { letterSpacing } : {})
  }
}

// 由父组件在提交时调用，构建最终 options（空对象表示无参数）
function buildOptions(): Record<string, unknown> {
  const appearance = buildAppearance()

  if (props.cliType === 'claude') {
    const args = collectAllArgs()
    return mergeWithInitial({
      customArgs: args.length > 0 ? args : undefined,
      appearance,
      // 模型已迁移进 customArgs 体系，旧字段删除以防 adapter 重复下发 --model；
      // --max-turns 在新版 Claude CLI 中已移除，旧数据一并清理
      model: undefined,
      maxTurns: undefined
    })
  }

  if (props.cliType === 'codex') {
    const args = collectAllArgs()
    return mergeWithInitial({
      // 不指定时不向 codex 下发任何沙箱/审批参数，遵循用户本机 CLI 默认
      permissionsMode: codexPermissionsMode.value || undefined,
      customArgs: args.length > 0 ? args : undefined,
      appearance,
      // 模型已迁移进 customArgs 体系（--model），旧字段删除避免重复下发
      model: undefined
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
      startupCommands: startupCommands.length > 0 ? startupCommands : undefined,
      appearance
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
    serverMode: opencodeOptions.serverMode,
    appearance
  })
}

function hasOpencodeConflict(): boolean {
  return props.cliType === 'opencode' && !!opencodeOptions.sessionId && opencodeOptions.continueLast
}

defineExpose({ buildOptions, hasOpencodeConflict })
</script>

<style scoped lang="scss">
.session-options-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  min-width: 0;
}

.opts-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
  min-width: 0;

  & + & {
    padding-top: var(--spacing-md);
    border-top: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
  }
}

.opts-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  min-height: 28px;
}

.opts-section-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.opts-section-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  text-align: right;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }

  code {
    font-size: var(--font-size-xs);
    color: var(--text-secondary);
  }
}

.check-row {
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.check-label {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--text-primary);

  code {
    font-size: var(--font-size-xs);
  }
}

.warning-text {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--status-warning);
}

.arg-label {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-xs);
}

.arg-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  cursor: help;
  user-select: none;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast);

  &:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 50%, var(--border-color));
    color: var(--text-primary);
  }
}

.preset-toolbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  min-width: 0;
}

.preset-select {
  width: 170px;
  min-width: 0;
  height: 28px;
  padding-top: 0;
  padding-bottom: 0;
}

.opts-subsection {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
}

.opts-subhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  min-height: 24px;

  label {
    font-size: var(--font-size-sm);
    color: var(--text-secondary);
  }
}

.preset-save-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--spacing-xs);
  align-items: center;
}

.builtin-arg-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);
}

.builtin-toggle-row {
  display: flex;
  gap: var(--spacing-md);
  flex-wrap: wrap;
}

.opencode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-sm);

  .field-wide {
    grid-column: 1 / -1;
  }
}

.startup-commands {
  resize: vertical;
  min-height: 60px;
  font-family: var(--font-mono, monospace);
}

.font-preview {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.5;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.icon-text-action {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 var(--spacing-sm);
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
  gap: var(--spacing-xs);
}

.custom-arg-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 30px;
  gap: var(--spacing-xs);
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
    border-color: color-mix(in srgb, var(--status-error) 36%, var(--border-color));
    background: color-mix(in srgb, var(--status-error) 10%, transparent);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

@media (max-width: 560px) {
  .builtin-arg-grid,
  .opencode-grid {
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
