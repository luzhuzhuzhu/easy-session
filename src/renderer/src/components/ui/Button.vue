<template>
  <button
    ref="buttonRef"
    v-bind="$attrs"
    class="ui-button"
    :class="[
      `ui-button-${size}`,
      `ui-button-${tone}`,
      { 'ui-button-block': block }
    ]"
    :type="type"
    :disabled="disabled"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

withDefaults(defineProps<{
  block?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  size?: 'sm' | 'md'
  tone?: 'default' | 'primary' | 'danger'
}>(), {
  block: false,
  disabled: false,
  type: 'button',
  size: 'md',
  tone: 'default'
})

const buttonRef = ref<HTMLButtonElement | null>(null)

function focus(): void {
  buttonRef.value?.focus()
}

defineExpose({ focus })
</script>

<style scoped lang="scss">
.ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 6px;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 0;
  background: var(--bg-card);
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 600;
  line-height: 1.2;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    color var(--transition-fast),
    opacity var(--transition-fast);

  &:hover:not(:disabled),
  &:focus-visible {
    border-color: var(--border-light);
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
}

.ui-button-sm {
  min-height: 24px;
  padding: 3px 9px;
  font-size: 11px;
}

.ui-button-md {
  min-height: 32px;
  padding: 6px 12px;
  font-size: 12px;
}

.ui-button-block {
  width: 100%;
}

.ui-button-primary {
  border-color: color-mix(in srgb, var(--accent-primary) 40%, var(--border-color));
  background: var(--accent-primary);
  color: var(--bg-primary);

  &:hover:not(:disabled),
  &:focus-visible {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 86%, var(--text-primary));
    color: var(--bg-primary);
  }
}

.ui-button-danger {
  border-color: color-mix(in srgb, var(--status-error) 54%, var(--border-color));
  color: var(--status-error);

  &:hover:not(:disabled),
  &:focus-visible {
    border-color: var(--status-error);
    background: color-mix(in srgb, var(--status-error) 14%, var(--bg-card));
    color: var(--status-error);
  }
}
</style>
