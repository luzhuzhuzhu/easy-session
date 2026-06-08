<template>
  <template v-if="!isListCollapsed">
    <div class="list-toolbar">
      <div class="toolbar-head">
        <select :value="filterType" class="filter-select session-filter" @change="onFilterChange">
          <option value="">{{ $t('session.filter') }}</option>
          <option value="claude">Claude</option>
          <option value="codex">Codex</option>
          <option value="opencode">OpenCode</option>
        </select>
        <div class="toolbar-actions">
          <IconButton
            class="toolbar-icon-btn toolbar-icon-btn-primary"
            tone="primary"
            :label="$t('session.create')"
            @click="emit('create')"
          >
            <UiIcon name="plus" />
          </IconButton>
          <IconButton
            v-if="desktopRemoteMountEnabled"
            class="toolbar-icon-btn"
            :title="refreshingRemoteData ? $t('session.refreshingRemote') : $t('session.refreshRemote')"
            :label="refreshingRemoteData ? $t('session.refreshingRemote') : $t('session.refreshRemote')"
            :disabled="refreshingRemoteData"
            @click="emit('refresh-remote')"
          >
            <UiIcon name="refresh" />
          </IconButton>
        </div>
      </div>
    </div>
  </template>
  <div v-else class="collapsed-toolbar">
    <IconButton
      class="collapsed-create-btn"
      tone="primary"
      block
      :label="$t('session.create')"
      @click="emit('create')"
    >
      <UiIcon name="plus" />
    </IconButton>
    <IconButton
      v-if="desktopRemoteMountEnabled"
      class="collapsed-create-btn"
      :title="remoteRefreshSummary || $t('session.refreshRemote')"
      :label="$t('session.refreshRemote')"
      :disabled="refreshingRemoteData"
      block
      @click="emit('refresh-remote')"
    >
      <UiIcon name="refresh" />
    </IconButton>
    <select :value="filterType" class="collapsed-filter" :title="$t('session.filter')" @change="onFilterChange">
      <option value="">*</option>
      <option value="claude">C</option>
      <option value="codex">X</option>
      <option value="opencode">O</option>
    </select>
  </div>

</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

defineProps<{
  isListCollapsed: boolean
  filterType: string
  desktopRemoteMountEnabled: boolean
  refreshingRemoteData: boolean
  remoteRefreshSummary: string
}>()

const emit = defineEmits<{
  create: []
  'refresh-remote': []
  'update:filterType': [value: string]
}>()

useI18n()

function onFilterChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  emit('update:filterType', target?.value ?? '')
}
</script>
