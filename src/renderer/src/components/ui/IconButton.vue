<template>
  <button
    v-bind="$attrs"
    class="icon-button"
    :class="[
      `icon-button-${size}`,
      `icon-button-${tone}`,
      {
        active,
        'icon-button-block': block
      }
    ]"
    :type="type"
    :disabled="disabled"
    :title="title || label"
    :aria-label="label"
  >
    <span class="icon-button-glyph" aria-hidden="true">
      <slot />
    </span>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  title?: string
  active?: boolean
  block?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  size?: 'xs' | 'sm' | 'md'
  tone?: 'default' | 'primary' | 'danger'
}>(), {
  title: '',
  active: false,
  block: false,
  disabled: false,
  type: 'button',
  size: 'sm',
  tone: 'default'
})
</script>

<style scoped lang="scss">
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  line-height: 1;
  transition:
    border-color var(--transition-fast),
    color var(--transition-fast),
    opacity var(--transition-fast),
    background var(--transition-fast);

  &:hover:not(:disabled),
  &:focus-visible {
    color: var(--text-primary);
    opacity: 1;
  }

  &:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: 2px;
  }

  &:disabled {
    cursor: default;
    opacity: 0.32;
  }

  &.active {
    border-color: var(--accent-primary);
    color: var(--accent-primary);
    opacity: 1;
  }
}

.icon-button-sm {
  width: 24px;
  height: 24px;
  font-size: 11px;
}

.icon-button-xs {
  width: 22px;
  height: 22px;
  font-size: 10px;
}

.icon-button-md {
  width: 32px;
  height: 32px;
  font-size: 14px;
}

.icon-button-block {
  width: 100%;
}

.icon-button-primary {
  border-color: color-mix(in srgb, var(--accent-primary) 24%, var(--border-color));
  background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-tertiary));
  color: var(--accent-primary);

  &:hover:not(:disabled),
  &:focus-visible {
    border-color: color-mix(in srgb, var(--accent-primary) 52%, var(--border-color));
    color: var(--text-primary);
  }
}

.icon-button-danger {
  &:hover:not(:disabled),
  &:focus-visible {
    border-color: color-mix(in srgb, var(--status-error) 46%, var(--border-color));
    color: var(--status-error);
  }
}

.icon-button-glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1em;
}
</style>
