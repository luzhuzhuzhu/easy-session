<template>
  <section class="session-top-panel" :class="{ collapsed: isListCollapsed }">
    <div class="top-inline-row">
      <button class="tool-btn" :title="$t('session.create')" @click="onCreate()">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 3.25v9.5M3.25 8h9.5" />
        </svg>
      </button>
      <button
        v-if="desktopRemoteMountEnabled"
        class="tool-btn"
        :title="$t('session.refreshRemote')"
        :disabled="refreshingRemoteData"
        @click="onRefreshRemote()"
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M13.5 7.25A5.5 5.5 0 1 1 11.96 3.4M13.5 2.5v3.5H10" />
        </svg>
      </button>
      <select
        :value="filterType"
        class="filter-select top-filter"
        :class="{ compact: isListCollapsed }"
        @change="onFilterChange"
      >
        <option value="">{{ $t('session.filter') }}</option>
        <option value="claude">Claude</option>
        <option value="codex">Codex</option>
        <option value="opencode">OpenCode</option>
      </select>

      <div class="top-list-area">
        <div v-if="projectSessionTree.length === 0" class="top-empty-inline">{{ $t('session.noSessions') }}</div>
        <div v-else class="top-flow-row">
          <div
            v-for="group in projectSessionTree"
            :key="group.key"
            class="top-group-card"
            v-show="group.sessions.length > 0"
            draggable="true"
            @dragstart="onTopProjectDragStart($event, group)"
            @dragover.prevent="onTopProjectDragOver($event)"
            @drop="onTopProjectDrop($event, group.key)"
            @dragend="onTopProjectDragEnd()"
          >
            <span class="top-group-label" :title="group.projectPath">{{ group.projectName }}</span>
            <span v-if="group.instanceId !== 'local'" class="top-group-label" :title="group.instanceName">{{ group.instanceName }}</span>
            <button
              v-for="session in group.sessions"
              :key="session.id"
              class="session-top-item"
              :class="{ active: activeGlobalSessionKey === session.id }"
              draggable="true"
              @click="onSessionClick(session)"
              @dragstart="onSessionDragStart($event, session)"
              @dragover.prevent="onSessionDragOver($event, group.key)"
              @drop="onSessionDrop($event, group.key, session.id)"
              @dragend="onSessionDragEnd()"
              @contextmenu.prevent="onSessionContextMenu($event, session)"
            >
              <span v-if="session.icon" class="session-icon">{{ session.icon }}</span>
              <span v-else class="type-badge" :class="session.type">{{ session.type === 'claude' ? 'C' : session.type === 'codex' ? 'X' : 'O' }}</span>
              <span v-if="!isListCollapsed" class="top-item-name">{{ session.name }}</span>
              <span class="status-dot" :class="session.status"></span>
            </button>
          </div>
        </div>
      </div>

      <div class="top-actions">
        <button class="tool-btn" :title="$t('session.listPosition')" @click="onToggleListPosition()">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path v-if="isTopLayout" d="M3 4.25h10M3 8h6.5M3 11.75h10" />
            <path v-else d="M4.25 3v10M8 3v6.5M11.75 3v10" />
          </svg>
        </button>
        <button
          class="tool-btn"
          :title="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
          @click="onToggleListCollapsed()"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path v-if="isListCollapsed" d="M4 6l4 4 4-4" />
            <path v-else d="M4 10l4-4 4 4" />
          </svg>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ProjectSessionGroup, SessionTreeSessionItem } from '@/features/sessions/session-tree'

const props = defineProps<{
  projectSessionTree: ProjectSessionGroup[]
  activeGlobalSessionKey: string | null
  filterType: string
  isListCollapsed: boolean
  isTopLayout: boolean
  desktopRemoteMountEnabled: boolean
  refreshingRemoteData: boolean
  onCreate: () => void
  onRefreshRemote: () => void
  onToggleListPosition: () => void
  onToggleListCollapsed: () => void
  onSessionClick: (session: SessionTreeSessionItem) => void
  onSessionDragStart: (event: DragEvent, session: SessionTreeSessionItem) => void
  onSessionDragOver: (event: DragEvent, projectKey: string) => void
  onSessionDrop: (event: DragEvent, projectKey: string, targetSessionId: string) => void
  onSessionDragEnd: () => void
  onSessionContextMenu: (event: MouseEvent, session: SessionTreeSessionItem) => void
  onTopProjectDragStart: (event: DragEvent, group: ProjectSessionGroup) => void
  onTopProjectDragOver: (event: DragEvent) => void
  onTopProjectDrop: (event: DragEvent, targetProjectKey: string) => void
  onTopProjectDragEnd: () => void
}>()

const emit = defineEmits<{
  'update:filterType': [value: string]
}>()

useI18n()

function onFilterChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  emit('update:filterType', target?.value ?? '')
}
</script>
