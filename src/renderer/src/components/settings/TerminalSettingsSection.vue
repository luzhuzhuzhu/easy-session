<template>
  <section class="settings-section">
    <h2>{{ $t('settings.terminal') }}</h2>
    <div class="setting-row">
      <label>{{ $t('settings.bufferSize') }}</label>
      <input
        :value="bufferSize"
        type="number"
        min="1000"
        max="50000"
        step="1000"
        @change="$emit('update:buffer-size', Number(($event.target as HTMLInputElement).value))"
      />
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.terminalFont') }}</label>
      <div class="font-field">
        <select :value="fontChoice" @change="onFontChoiceChange">
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
          v-if="fontChoice === '__custom__'"
          :value="terminalFont"
          type="text"
          :placeholder="DEFAULT_TERMINAL_FONT_FAMILY"
          @input="$emit('update:terminal-font', ($event.target as HTMLInputElement).value)"
        />
        <span v-if="fontMissing" class="field-warning">{{ $t('settings.fontNotInstalled') }}</span>
      </div>
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.terminalFontWeight') }}</label>
      <div class="font-field">
        <select
          :value="terminalFontWeight"
          @change="$emit('update:terminal-font-weight', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="weight in TERMINAL_FONT_WEIGHTS" :key="weight" :value="weight">
            {{ $t(`settings.fontWeightValue.${weight}`) }}
          </option>
        </select>
        <span class="field-hint">{{ distinctWeightsLabel }}</span>
      </div>
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.terminalFontWeightBold') }}</label>
      <div class="font-field">
        <select
          :value="terminalFontWeightBold"
          @change="$emit('update:terminal-font-weight-bold', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="weight in TERMINAL_FONT_WEIGHTS" :key="weight" :value="weight">
            {{ $t(`settings.fontWeightValue.${weight}`) }}
          </option>
        </select>
        <span class="field-hint">{{ $t('settings.fontWeightBoldHint') }}</span>
      </div>
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.terminalLineHeight') }}</label>
      <input
        :value="terminalLineHeight"
        type="number"
        :min="MIN_TERMINAL_LINE_HEIGHT"
        :max="MAX_TERMINAL_LINE_HEIGHT"
        step="0.05"
        @change="onLineHeightChange"
      />
    </div>
    <div class="setting-row">
      <label>{{ $t('settings.terminalLetterSpacing') }}</label>
      <input
        :value="terminalLetterSpacing"
        type="number"
        :min="MIN_TERMINAL_LETTER_SPACING"
        :max="MAX_TERMINAL_LETTER_SPACING"
        step="0.5"
        @change="onLetterSpacingChange"
      />
    </div>
    <div class="setting-row font-preview-row">
      <label>{{ $t('settings.fontPreview') }}</label>
      <div class="font-preview" :style="previewStyle">
        <span v-for="line in TERMINAL_FONT_PREVIEW_LINES" :key="line">{{ line }}</span>
        <span :style="{ fontWeight: terminalFontWeightBold || 'bold' }">{{ TERMINAL_FONT_PREVIEW_BOLD_LINE }}</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
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
  listSystemFontGroups,
  primaryFontFamily,
  type SystemFontGroups
} from '@/models/terminal-appearance'

const props = defineProps<{
  bufferSize: number
  terminalFont: string
  terminalFontWeight: string
  terminalFontWeightBold: string
  terminalLineHeight: number
  terminalLetterSpacing: number
}>()

const emit = defineEmits<{
  'update:buffer-size': [value: number]
  'update:terminal-font': [value: string]
  'update:terminal-font-weight': [value: string]
  'update:terminal-font-weight-bold': [value: string]
  'update:terminal-line-height': [value: number]
  'update:terminal-letter-spacing': [value: number]
}>()

function onLineHeightChange(event: Event): void {
  const raw = (event.target as HTMLInputElement | null)?.value
  emit('update:terminal-line-height', clampTerminalLineHeight(raw))
}

function onLetterSpacingChange(event: Event): void {
  const raw = (event.target as HTMLInputElement | null)?.value
  emit('update:terminal-letter-spacing', clampTerminalLetterSpacing(raw))
}

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

// 用户显式选择"自定义…"后保持文本框，即使输入内容恰好匹配某个枚举字体
const customFontSelected = ref(false)

const fontChoice = computed(() => {
  if (customFontSelected.value) return '__custom__'
  const primary = primaryFontFamily(props.terminalFont)
  if (primary && allSuggestedFonts.value.includes(primary)) return primary
  return '__custom__'
})

function onFontChoiceChange(event: Event): void {
  const value = (event.target as HTMLSelectElement | null)?.value ?? ''
  if (value === '__custom__') {
    customFontSelected.value = true
    return
  }
  customFontSelected.value = false
  emit('update:terminal-font', value)
}

const fontMissing = computed(() => {
  const value = props.terminalFont.trim()
  return !!value && !isFontInstalled(value)
})

const { t } = useI18n()

// 实测当前字体能区分的字重档位，直接告诉用户哪些选项有视觉差异
const distinctWeightsLabel = computed(() => {
  const weights = detectDistinctFontWeights(props.terminalFont)
  if (weights.length >= TERMINAL_FONT_WEIGHTS.length) {
    return t('settings.fontWeightAllDistinct')
  }
  const labels = weights.map((weight) => t(`settings.fontWeightValue.${weight}`)).join(' / ')
  return t('settings.fontWeightDetected', { weights: labels })
})

// 与终端实际使用的字体栈完全一致（统一补引号与等宽回退）
const previewStyle = computed(() => ({
  fontFamily: ensureMonospaceFallback(props.terminalFont),
  fontWeight: props.terminalFontWeight || 'normal',
  lineHeight: String(clampTerminalLineHeight(props.terminalLineHeight) * 1.5),
  letterSpacing: `${clampTerminalLetterSpacing(props.terminalLetterSpacing)}px`
}))
</script>

<style scoped lang="scss">
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  margin-bottom: var(--spacing-lg);

  h2 {
    font-size: var(--font-size-lg);
    margin-bottom: var(--spacing-md);
    color: var(--text-secondary);
  }
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: 10px 0;

  & + .setting-row {
    border-top: 1px solid color-mix(in srgb, var(--border-color) 62%, transparent);
  }

  label {
    font-size: var(--font-size-md);
    color: var(--text-primary);
  }

  input,
  select {
    background: var(--bg-primary);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    font-size: var(--font-size-sm);
    min-width: 200px;

    &:focus {
      outline: none;
      border-color: var(--accent-primary);
    }
  }

  input[type='number'] {
    width: 120px;
    min-width: auto;
  }
}

.font-preview-row {
  align-items: flex-start;
}

.font-field {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  min-width: 0;

  input,
  select {
    width: 100%;
  }
}

.field-warning {
  font-size: var(--font-size-xs);
  color: var(--status-warning);
}

.field-hint {
  max-width: 320px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  text-align: right;
}

.font-preview {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  max-width: 560px;
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

@media (max-width: 960px) {
  .setting-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
