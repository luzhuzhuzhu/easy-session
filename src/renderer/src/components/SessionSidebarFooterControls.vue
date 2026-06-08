<template>
  <div class="panel-footer">
    <IconButton
      class="panel-btn"
      :label="$t('session.listPosition')"
      @click="emit('toggle-list-position')"
    >
      <UiIcon :name="isTopLayout ? 'list-left' : 'list-top'" />
    </IconButton>
    <IconButton
      class="panel-btn"
      :title="isAutoCollapsed ? $t('session.autoCollapsedList') : isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
      :label="isAutoCollapsed ? $t('session.autoCollapsedList') : isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
      :disabled="isAutoCollapsed"
      @click="emit('toggle-list-collapsed')"
    >
      <UiIcon :name="isListCollapsed ? 'chevron-right' : 'chevron-left'" />
    </IconButton>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

defineProps<{
  isListCollapsed: boolean
  isAutoCollapsed?: boolean
  isTopLayout: boolean
}>()

const emit = defineEmits<{
  'toggle-list-position': []
  'toggle-list-collapsed': []
}>()

useI18n()
</script>
