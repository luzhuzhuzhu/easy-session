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
          <button class="toolbar-icon-btn toolbar-icon-btn-primary" :title="$t('session.create')" @click="emit('create')">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M8 3.25v9.5M3.25 8h9.5" />
            </svg>
          </button>
          <button
            v-if="desktopRemoteMountEnabled"
            class="toolbar-icon-btn"
            type="button"
            :title="refreshingRemoteData ? $t('session.refreshingRemote') : $t('session.refreshRemote')"
            :disabled="refreshingRemoteData"
            @click="emit('refresh-remote')"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M13.5 7.25A5.5 5.5 0 1 1 11.96 3.4M13.5 2.5v3.5H10" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </template>
  <div v-else class="collapsed-toolbar">
    <button class="collapsed-create-btn" :title="$t('session.create')" @click="emit('create')">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 3.25v9.5M3.25 8h9.5" />
      </svg>
    </button>
    <button
      v-if="desktopRemoteMountEnabled"
      class="collapsed-create-btn"
      :title="$t('session.refreshRemote')"
      :disabled="refreshingRemoteData"
      @click="emit('refresh-remote')"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M13.5 7.25A5.5 5.5 0 1 1 11.96 3.4M13.5 2.5v3.5H10" />
      </svg>
    </button>
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

defineProps<{
  isListCollapsed: boolean
  filterType: string
  desktopRemoteMountEnabled: boolean
  refreshingRemoteData: boolean
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
