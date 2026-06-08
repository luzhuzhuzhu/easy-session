<template>
  <section class="session-top-panel" :class="{ collapsed: isListCollapsed }">
    <div class="top-inline-row">
      <IconButton
        :title="$t('session.create')"
        :label="$t('session.create')"
        size="md"
        @click="onCreate()"
      >
        <UiIcon name="plus" />
      </IconButton>
      <IconButton
        v-if="desktopRemoteMountEnabled"
        :title="remoteRefreshSummary || $t('session.refreshRemote')"
        :label="$t('session.refreshRemote')"
        size="md"
        :disabled="refreshingRemoteData"
        @click="onRefreshRemote()"
      >
        <UiIcon name="refresh" />
      </IconButton>
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
        <div v-if="projectSessionTree.length === 0" class="top-empty-inline">
          <span>{{ $t('session.emptyGuideTitle') }}</span>
          <Button size="sm" @click="onOpenProjects()">{{ $t('session.emptyGuideAddProject') }}</Button>
          <Button size="sm" tone="primary" @click="onCreate()">{{ $t('session.emptyGuideCreateSession') }}</Button>
          <Button
            v-if="desktopRemoteMountEnabled"
            size="sm"
            :disabled="refreshingRemoteData"
            @click="onRefreshRemote()"
          >
            {{ refreshingRemoteData ? $t('session.refreshingRemote') : $t('session.refreshRemote') }}
          </Button>
          <Button v-else size="sm" @click="onOpenRemoteSettings()">
            {{ $t('session.emptyGuideEnableRemote') }}
          </Button>
        </div>
        <div v-else class="top-flow-row">
          <div
            v-for="group in projectSessionTree"
            :key="group.key"
            class="top-group-card"
            :class="{ 'drop-target': dragOverGroupKey === group.key }"
            v-show="group.sessions.length > 0"
            draggable="true"
            @dragstart="onTopProjectDragStart($event, group)"
            @dragenter.prevent="dragOverGroupKey = group.key"
            @dragover.prevent="onTopProjectDragOver($event)"
            @dragleave="handleDropTargetLeave($event, 'group', group.key)"
            @drop="handleTopProjectDrop($event, group.key)"
            @dragend="handleTopProjectDragEnd()"
          >
            <span class="top-group-label" :title="group.projectPath">{{ group.projectName }}</span>
            <span v-if="group.instanceId !== 'local'" class="top-group-label" :title="group.instanceName">{{ group.instanceName }}</span>
            <div
              v-for="session in group.sessions"
              :key="session.id"
              class="session-top-item"
              :class="{
                active: activeGlobalSessionKey === session.id,
                'drop-target': dragOverSessionId === session.id
              }"
              role="button"
              tabindex="0"
              draggable="true"
              @click="onSessionClick(session)"
              @keydown.enter.prevent="onSessionClick(session)"
              @keydown.space.prevent="onSessionClick(session)"
              @dragstart="onSessionDragStart($event, session)"
              @dragenter.prevent="dragOverSessionId = session.id"
              @dragover.prevent="onSessionDragOver($event, group.key)"
              @dragleave="handleDropTargetLeave($event, 'session', session.id)"
              @drop="handleSessionDrop($event, group.key, session.id)"
              @dragend="handleSessionDragEnd()"
              @contextmenu.prevent="onSessionContextMenu($event, session)"
            >
              <span v-if="session.icon" class="session-icon">{{ session.icon }}</span>
              <span v-else class="type-badge" :class="session.type">{{ session.type === 'claude' ? 'C' : session.type === 'codex' ? 'X' : 'O' }}</span>
              <span v-if="!isListCollapsed" class="top-item-name">{{ session.name }}</span>
              <span
                class="status-dot"
                :class="session.status"
                role="img"
                :title="formatSessionStatus(session.status)"
                :aria-label="formatSessionStatus(session.status)"
              ></span>
            </div>
          </div>
        </div>
      </div>

      <div class="top-actions">
        <IconButton
          :title="$t('session.listPosition')"
          :label="$t('session.listPosition')"
          size="md"
          @click="onToggleListPosition()"
        >
          <UiIcon :name="isTopLayout ? 'list-left' : 'list-top'" />
        </IconButton>
        <IconButton
          :title="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
          :label="isListCollapsed ? $t('session.expandList') : $t('session.collapseList')"
          size="md"
          @click="onToggleListCollapsed()"
        >
          <UiIcon :name="isListCollapsed ? 'chevron-down' : 'chevron-up'" />
        </IconButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ProjectSessionGroup, SessionTreeSessionItem } from '@/features/sessions/session-tree'
import Button from '@/components/ui/Button.vue'
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'

const props = defineProps<{
  projectSessionTree: ProjectSessionGroup[]
  activeGlobalSessionKey: string | null
  filterType: string
  isListCollapsed: boolean
  isTopLayout: boolean
  desktopRemoteMountEnabled: boolean
  refreshingRemoteData: boolean
  remoteRefreshSummary: string
  onCreate: () => void
  onRefreshRemote: () => void
  onOpenProjects: () => void
  onOpenRemoteSettings: () => void
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

const { t } = useI18n()
const dragOverGroupKey = ref('')
const dragOverSessionId = ref('')

function onFilterChange(event: Event): void {
  const target = event.target as HTMLSelectElement | null
  emit('update:filterType', target?.value ?? '')
}

function formatSessionStatus(status: SessionTreeSessionItem['status']): string {
  return t(`session.status.${status}`)
}

function isLeavingCurrentTarget(event: DragEvent): boolean {
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  return !(current && related && current.contains(related))
}

function handleDropTargetLeave(event: DragEvent, type: 'group' | 'session', key: string): void {
  if (!isLeavingCurrentTarget(event)) return
  if (type === 'group' && dragOverGroupKey.value === key) {
    dragOverGroupKey.value = ''
  }
  if (type === 'session' && dragOverSessionId.value === key) {
    dragOverSessionId.value = ''
  }
}

function clearDropTargets(): void {
  dragOverGroupKey.value = ''
  dragOverSessionId.value = ''
}

function handleTopProjectDrop(event: DragEvent, key: string): void {
  props.onTopProjectDrop(event, key)
  clearDropTargets()
}

function handleTopProjectDragEnd(): void {
  props.onTopProjectDragEnd()
  clearDropTargets()
}

function handleSessionDrop(event: DragEvent, projectKey: string, sessionId: string): void {
  props.onSessionDrop(event, projectKey, sessionId)
  clearDropTargets()
}

function handleSessionDragEnd(): void {
  props.onSessionDragEnd()
  clearDropTargets()
}
</script>
