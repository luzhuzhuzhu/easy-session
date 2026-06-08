<template>
  <IconButton
    v-bind="$attrs"
    class="toolbar-button"
    :label="label"
    :title="title"
    :active="active"
    :disabled="disabled"
    :type="type"
    :size="size"
    :tone="tone"
  >
    <slot />
  </IconButton>
</template>

<script setup lang="ts">
import IconButton from '@/components/ui/IconButton.vue'

withDefaults(defineProps<{
  label: string
  title?: string
  active?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
  size?: 'xs' | 'sm' | 'md'
  tone?: 'default' | 'primary' | 'danger'
}>(), {
  title: '',
  active: false,
  disabled: false,
  type: 'button',
  size: 'sm',
  tone: 'default'
})
</script>

<style scoped lang="scss">
.toolbar-button {
  opacity: 0.64;

  &:hover:not(:disabled),
  &:focus-visible,
  &.active {
    opacity: 1;
  }
}
</style>
