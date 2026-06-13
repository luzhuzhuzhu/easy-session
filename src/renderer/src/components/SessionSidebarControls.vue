<template>
  <template v-if="!isListCollapsed">
    <div class="list-toolbar">
      <select
        :value="filterType"
        class="filter-select session-filter"
        :class="{ filtering: !!filterType }"
        @change="onFilterChange"
      >
        <option value="">{{ $t('session.filter') }}</option>
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
        <option value="opencode">OpenCode</option>
        <option value="terminal">{{ $t('session.terminal') }}</option>
      </select>
      <div class="toolbar-actions">
        <IconButton
          tone="primary"
          :label="$t('session.create')"
          @click="emit('create')"
        >
          <UiIcon name="plus" />
        </IconButton>
        <IconButton
          v-if="desktopRemoteMountEnabled"
          :title="refreshingRemoteData ? $t('session.refreshingRemote') : $t('session.refreshRemote')"
          :label="refreshingRemoteData ? $t('session.refreshingRemote') : $t('session.refreshRemote')"
          :disabled="refreshingRemoteData"
          @click="emit('refresh-remote')"
        >
          <UiIcon name="refresh" />
        </IconButton>
        <span class="toolbar-divider" aria-hidden="true"></span>
        <IconButton
          :label="$t('session.listPosition')"
          @click="emit('toggle-list-position')"
        >
          <UiIcon :name="isTopLayout ? 'list-left' : 'list-top'" />
        </IconButton>
        <IconButton
          :label="$t('session.collapseList')"
          @click="emit('toggle-list-collapsed')"
        >
          <UiIcon name="chevron-left" />
        </IconButton>
      </div>
    </div>
  </template>
  <div v-else class="collapsed-toolbar">
    <IconButton
      :title="isAutoCollapsed ? $t('session.autoCollapsedList') : $t('session.expandList')"
      :label="isAutoCollapsed ? $t('session.autoCollapsedList') : $t('session.expandList')"
      :disabled="isAutoCollapsed"
      @click="emit('toggle-list-collapsed')"
    >
      <UiIcon name="chevron-right" />
    </IconButton>
    <IconButton
      tone="primary"
      :label="$t('session.create')"
      @click="emit('create')"
    >
      <UiIcon name="plus" />
    </IconButton>
    <IconButton
      v-if="desktopRemoteMountEnabled"
      :title="remoteRefreshSummary || $t('session.refreshRemote')"
      :label="$t('session.refreshRemote')"
      :disabled="refreshingRemoteData"
      @click="emit('refresh-remote')"
    >
      <UiIcon name="refresh" />
    </IconButton>
    <IconButton
      :label="$t('session.listPosition')"
      @click="emit('toggle-list-position')"
    >
      <UiIcon :name="isTopLayout ? 'list-left' : 'list-top'" />
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
  filterType: string
  desktopRemoteMountEnabled: boolean
  refreshingRemoteData: boolean
  remoteRefreshSummary: string
}>()

const emit = defineEmits<{
  create: []
  'refresh-remote': []
  'toggle-list-position': []
  'toggle-list-collapsed': []
  'update:filterType': [value: string]
}>()

useI18n()

function onFilterChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  emit('update:filterType', target?.value ?? '')
}
</script>
