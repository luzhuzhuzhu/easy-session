<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    :class="['tree-icon', `tree-icon--${name}`]"
  >
    <template v-if="name === 'caret-expanded'">
      <path d="M4 6l4 4l4-4" :stroke="computedColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    </template>
    <template v-else-if="name === 'caret-collapsed'">
      <path d="M6 4l4 4l-4 4" :stroke="computedColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
    </template>
    <template v-else-if="name === 'directory'">
      <path d="M2 4h4l2 2h6v8H2V4z" :stroke="computedColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
    </template>
    <template v-else-if="name === 'directory-open'">
      <path d="M2 3h5l1 2h5v9H2V3zM2 5h12" :stroke="computedColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
    </template>
    <template v-else-if="name === 'spinner'">
      <circle cx="8" cy="8" r="5" :stroke="computedColor" stroke-width="1.5" fill="none" stroke-dasharray="8 16"/>
    </template>
    <template v-else-if="name === 'file'">
      <path d="M3 2h7l3 3v9H3V2zM10 2v3h3" :stroke="computedColor" stroke-width="1.5" stroke-linejoin="round" fill="none"/>
    </template>
    <template v-else-if="name === 'file-md'">
      <rect x="2" y="2" width="12" height="12" rx="1" :stroke="computedColor" stroke-width="1.5" fill="none"/>
    </template>
    <template v-else-if="name === 'file-ts'">
      <rect x="2" y="2" width="12" height="12" rx="1" :stroke="computedColor" stroke-width="1.5" fill="none"/>
      <text x="8" y="10" :fill="computedColor" font-size="7" font-family="monospace" text-anchor="middle" font-weight="600">TS</text>
    </template>
    <template v-else-if="name === 'file-json'">
      <rect x="2" y="2" width="12" height="12" rx="1" :stroke="computedColor" stroke-width="1.5" fill="none"/>
    </template>
    <template v-else-if="name === 'file-image'">
      <rect x="2" y="2" width="12" height="12" rx="1" :stroke="computedColor" stroke-width="1.5" fill="none"/>
      <path d="M2 12h12l-3-4-2 2-2-2-3 4zM6 6a2 2 0 100 4 2 2 0 000-4z" :stroke="computedColor" stroke-width="1.25" fill="none"/>
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'TreeIcon' })

const props = withDefaults(defineProps<{
  name: 'caret-expanded' | 'caret-collapsed' | 'directory' | 'directory-open' | 'file' | 'file-md' | 'file-ts' | 'file-json' | 'file-image' | 'spinner'
  size?: number
  color?: string
}>(), {
  size: 14,
  color: undefined
})

const computedColor = computed(() => props.color ?? 'currentColor')
</script>

<style scoped lang="scss">
.tree-icon {
  display: inline-flex;
  flex-shrink: 0;
}

.tree-icon--spinner {
  animation: tree-icon-spin 1.2s linear infinite;
}

@keyframes tree-icon-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>