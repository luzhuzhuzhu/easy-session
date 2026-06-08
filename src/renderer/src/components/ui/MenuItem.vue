<template>
  <button
    v-bind="$attrs"
    class="context-item"
    :class="{ danger }"
    type="button"
    role="menuitem"
    :disabled="disabled"
    :title="title || label"
    :aria-label="label || undefined"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  danger?: boolean
  disabled?: boolean
  label?: string
  title?: string
}>(), {
  danger: false,
  disabled: false,
  label: '',
  title: ''
})
</script>
