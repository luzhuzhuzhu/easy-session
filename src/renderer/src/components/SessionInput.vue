<template>
  <div class="session-input-bar">
    <input
      ref="inputRef"
      v-model="text"
      class="session-input"
      :placeholder="disabled ? t('session.input.disabledPlaceholder') : t('session.input.placeholder')"
      :disabled="disabled"
      @keydown.enter="handleSend"
      @keydown.up.prevent="historyUp"
      @keydown.down.prevent="historyDown"
    />
    <span class="shortcut-hint">{{ t('session.input.history') }}</span>
    <button
      class="btn btn-primary btn-sm"
      :disabled="disabled || !text.trim()"
      @click="handleSend"
    >Enter</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ send: [input: string] }>()

const text = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const history = ref<string[]>([])
const historyIdx = ref(-1)

function handleSend() {
  if (!text.value.trim()) return
  history.value.push(text.value)
  if (history.value.length > 100) history.value.shift()
  historyIdx.value = -1
  emit('send', text.value)
  text.value = ''
}

function historyUp() {
  if (!history.value.length) return
  if (historyIdx.value === -1) historyIdx.value = history.value.length - 1
  else if (historyIdx.value > 0) historyIdx.value--
  text.value = history.value[historyIdx.value]
}

function historyDown() {
  if (historyIdx.value === -1) return
  if (historyIdx.value < history.value.length - 1) {
    historyIdx.value++
    text.value = history.value[historyIdx.value]
  } else {
    historyIdx.value = -1
    text.value = ''
  }
}
</script>

<style scoped lang="scss">
.session-input-bar {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.session-input {
  flex: 1;
  background: var(--bg-primary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: var(--spacing-sm) var(--spacing-md);
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  &:focus { outline: none; border-color: var(--accent-primary); }
  &:disabled { opacity: 0.4; cursor: not-allowed; }
}

.shortcut-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  white-space: nowrap;
  background: var(--bg-primary);
  padding: 1px 6px;
  border-radius: 3px;
}

// btn, btn-sm, btn-primary 已在 global.scss 中定义
</style>
