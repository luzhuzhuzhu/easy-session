<template>
  <div class="panel-footer">
    <button class="panel-btn" :title="$t('session.listPosition')" @click="emit('toggle-list-position')">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path
          v-if="isTopLayout"
          d="M2.75 3.25h10.5v9.5H2.75zM5.5 3.25v9.5M7.5 5.5h4M7.5 8h2.5M7.5 10.5h4"
        />
        <path
          v-else
          d="M2.75 3.25h10.5v9.5H2.75zM2.75 5.75h10.5M4.5 8.25h2.25M8 8.25h3.5M8 12.5V8.75M6.5 10.25 8 8.75l1.5 1.5"
        />
      </svg>
    </button>
    <button
      class="panel-btn"
      :title="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
      @click="emit('toggle-list-collapsed')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path v-if="isListCollapsed" d="M6 4l4 4-4 4" />
        <path v-else d="M10 4L6 8l4 4" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  isListCollapsed: boolean
  isTopLayout: boolean
}>()

const emit = defineEmits<{
  'toggle-list-position': []
  'toggle-list-collapsed': []
}>()

useI18n()
</script>
