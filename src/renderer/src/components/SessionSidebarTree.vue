<template>
  <VirtualTree
    class="session-tree"
    :items="nodes"
    :threshold="48"
    :item-height="52"
    :buffer-size="220"
    dynamic
  >
    <template #default="{ node }">
      <div
        v-if="node.type === 'instance'"
        class="instance-group sidebar-tree-row"
      >
        <div
          class="instance-node"
          :title="formatInstanceTooltip(node.instance)"
          @click="onToggleInstance(node.instance.key)"
        >
          <span class="tree-caret" :class="{ expanded: isInstanceExpanded(node.instance.key) }" aria-hidden="true">
            <UiIcon name="chevron-right" />
          </span>
          <span class="tree-node-icon instance-node-icon" :class="node.instance.instanceType" aria-hidden="true">
            <UiIcon :name="node.instance.instanceType === 'local' ? 'desktop' : 'globe'" />
          </span>
          <div class="instance-info">
            <div class="instance-main">
              <span class="instance-name" :title="node.instance.instanceName">{{ node.instance.instanceName }}</span>
              <span
                v-if="node.instance.instanceType === 'remote'"
                class="instance-status-badge"
                :class="`status-${node.instance.instanceStatus}`"
              >
                {{ formatInstanceStatus(node.instance.instanceStatus) }}
              </span>
              <span class="instance-count">{{ formatInstanceCounts(node.instance) }}</span>
            </div>
            <span
              v-if="node.instance.instanceType === 'remote' && node.instance.instanceLastError"
              class="instance-error"
              :title="formatInstanceErrorTitle(node.instance)"
            >
              {{ node.instance.instanceLastError }}
            </span>
          </div>
        </div>
      </div>

      <div
        v-else-if="node.type === 'project'"
        class="tree-group sidebar-tree-row sidebar-project-shell"
        :class="{ 'drop-target': dragOverProjectKey === node.project.key }"
        draggable="true"
        tabindex="0"
        :aria-label="node.project.projectName"
        :aria-keyshortcuts="'Alt+ArrowUp Alt+ArrowDown'"
        @dragstart="onProjectDragStart($event, node.project)"
        @dragenter.prevent="dragOverProjectKey = node.project.key"
        @dragover.prevent="onProjectDragOver($event)"
        @dragleave="handleDropTargetLeave($event, 'project', node.project.key)"
        @drop="handleProjectDrop($event, node.project.key)"
        @dragend="handleProjectDragEnd()"
        @keydown.alt.up.prevent="onProjectReorder(orderedProjectKeys(), node.project.key, -1)"
        @keydown.alt.down.prevent="onProjectReorder(orderedProjectKeys(), node.project.key, 1)"
      >
        <div class="project-node" @click="onToggleProject(node.project.key)">
          <span class="tree-caret" :class="{ expanded: isProjectExpanded(node.project.key) }" aria-hidden="true">
            <UiIcon name="chevron-right" />
          </span>
          <span class="tree-node-icon project-node-icon" aria-hidden="true">
            <UiIcon name="folder" />
          </span>
          <span class="project-name" :title="node.project.projectName">{{ node.project.projectName }}</span>
          <div class="project-right">
            <span class="project-count">{{ node.project.sessions.length }}</span>
            <div class="project-actions" @click.stop>
              <IconButton
                v-if="node.project.canCreateSession"
                size="xs"
                tone="primary"
                :label="$t('session.create')"
                @click="onOpenCreateDialog(node.project)"
              >
                <UiIcon name="plus" />
              </IconButton>
              <IconButton
                v-if="node.project.canOpenProjectDetail"
                size="xs"
                :label="$t('project.settings')"
                @click="onOpenProject(node.project)"
              >
                <UiIcon name="settings" />
              </IconButton>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="node.type === 'session'"
        class="sidebar-tree-row sidebar-session-shell"
      >
        <div
          class="session-item tree-child"
          :class="{
            active: activeGlobalSessionKey === node.session.id,
            'drop-target': dragOverSessionId === node.session.id
          }"
          role="button"
          tabindex="0"
          draggable="true"
          :aria-keyshortcuts="'Alt+ArrowUp Alt+ArrowDown'"
          @click="onSessionClick(node.session)"
          @keydown.enter.prevent="onSessionClick(node.session)"
          @keydown.space.prevent="onSessionClick(node.session)"
          @keydown.alt.up.prevent="onSessionReorder(node.projectKey, siblingSessionIds(node.projectKey), node.session.id, -1)"
          @keydown.alt.down.prevent="onSessionReorder(node.projectKey, siblingSessionIds(node.projectKey), node.session.id, 1)"
          @dragstart="onSessionDragStart($event, node.session)"
          @dragenter.prevent="dragOverSessionId = node.session.id"
          @dragover.prevent="onSessionDragOver($event, node.projectKey)"
          @dragleave="handleDropTargetLeave($event, 'session', node.session.id)"
          @drop="handleSessionDrop($event, node.projectKey, node.session.id)"
          @dragend="handleSessionDragEnd()"
          @contextmenu.prevent="onSessionContextMenu($event, node.session)"
        >
          <span v-if="node.session.icon" class="session-icon">{{ node.session.icon }}</span>
          <span v-else class="type-badge" :class="node.session.type">{{ cliTypeBadgeLetter(node.session.type) }}</span>
          <div class="item-info">
            <span class="item-name">{{ node.session.name }}</span>
            <span class="item-time">{{ formatTime(node.session.createdAt) }}</span>
          </div>
          <span
            class="status-dot"
            :class="node.session.status"
            role="img"
            :title="formatSessionStatus(node.session.status)"
            :aria-label="formatSessionStatus(node.session.status)"
          ></span>
        </div>
      </div>

      <div v-else-if="node.type === 'spacer'" class="instance-gap" aria-hidden="true"></div>

      <div
        v-else
        class="project-empty sidebar-tree-row"
        :class="{
          'sidebar-empty-instance': node.parentType === 'instance',
          'sidebar-empty-project': node.parentType === 'project'
        }"
      >
        {{ node.parentType === 'instance' ? $t('session.instanceEmpty') : $t('session.noSessionsInProject') }}
      </div>
</template>
  </VirtualTree>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import VirtualTree from '@/components/tree/VirtualTree.vue'
import { cliTypeBadgeLetter } from '@shared/cli-types'
import IconButton from '@/components/ui/IconButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import type {
  InstanceTreeGroup,
  ProjectSessionGroup,
  SessionSidebarTreeNode,
  SessionTreeSessionItem
} from '@/features/sessions/session-tree'

const props = defineProps<{
  nodes: SessionSidebarTreeNode[]
  activeGlobalSessionKey: string | null
  expandedInstances: Record<string, boolean>
  expandedProjects: Record<string, boolean>
  onToggleInstance: (key: string) => void
  onToggleProject: (key: string) => void
  onProjectDragStart: (event: DragEvent, group: ProjectSessionGroup) => void
  onProjectDragOver: (event: DragEvent) => void
  onProjectDrop: (event: DragEvent, targetProjectKey: string) => void
  onProjectDragEnd: () => void
  onOpenCreateDialog: (group: ProjectSessionGroup) => void
  onOpenProject: (group: ProjectSessionGroup) => void
  onSessionClick: (session: SessionTreeSessionItem) => void
  onSessionDragStart: (event: DragEvent, session: SessionTreeSessionItem) => void
  onSessionDragOver: (event: DragEvent, projectKey: string) => void
  onSessionDrop: (event: DragEvent, projectKey: string, targetSessionId: string) => void
  onSessionDragEnd: () => void
  onSessionContextMenu: (event: MouseEvent, session: SessionTreeSessionItem) => void
  onSessionReorder: (projectKey: string, orderedSessionIds: string[], sessionId: string, direction: -1 | 1) => void
  onProjectReorder: (orderedProjectKeys: string[], projectKey: string, direction: -1 | 1) => void
}>()

const { t } = useI18n()

type SessionNode = Extract<SessionSidebarTreeNode, { type: 'session' }>
type ProjectNode = Extract<SessionSidebarTreeNode, { type: 'project' }>

function siblingSessionIds(projectKey: string): string[] {
  return props.nodes
    .filter((n): n is SessionNode => n.type === 'session' && n.projectKey === projectKey)
    .map((n) => n.session.id)
}

function orderedProjectKeys(): string[] {
  return props.nodes
    .filter((n): n is ProjectNode => n.type === 'project')
    .map((n) => n.project.key)
}
const dragOverProjectKey = ref('')
const dragOverSessionId = ref('')

function isInstanceExpanded(key: string): boolean {
  return props.expandedInstances[key] ?? true
}

function isProjectExpanded(key: string): boolean {
  return props.expandedProjects[key] ?? true
}

function formatInstanceType(type: InstanceTreeGroup['instanceType']): string {
  return type === 'local' ? t('session.instanceLocal') : t('session.instanceRemote')
}

function formatInstanceStatus(status: InstanceTreeGroup['instanceStatus']): string {
  return t(`settings.remoteStatus.${status}`)
}

function formatInstanceMode(group: InstanceTreeGroup): string {
  if (group.instanceType !== 'remote') return ''
  return group.instancePassthroughOnly ? t('settings.remoteModePassthrough') : t('settings.remoteModeManaged')
}

function formatSessionStatus(status: SessionTreeSessionItem['status']): string {
  return t(`session.status.${status}`)
}

function formatInstanceLatency(latencyMs: number | null): string {
  if (latencyMs === null || !Number.isFinite(latencyMs)) {
    return t('settings.remoteLatencyUnknown')
  }

  if (latencyMs <= 200) {
    return t('settings.remoteLatencyFast')
  }

  if (latencyMs <= 800) {
    return t('settings.remoteLatencyNormal')
  }

  return t('settings.remoteLatencySlow')
}

function formatInstanceCounts(group: InstanceTreeGroup): string {
  return t('session.instanceCounts', {
    projects: group.projects.length,
    sessions: group.sessionCount
  })
}

function formatInstanceLastChecked(timestamp: number | null): string {
  if (!timestamp) return t('settings.remoteNeverChecked')
  return new Date(timestamp).toLocaleString()
}

function formatInstanceErrorTitle(group: InstanceTreeGroup): string {
  return [
    `${t('settings.remoteLastError')}: ${group.instanceLastError}`,
    `${t('settings.remoteLastChecked')}: ${formatInstanceLastChecked(group.instanceLastCheckedAt)}`
  ].filter(Boolean).join('\n')
}

function formatInstanceTooltip(group: InstanceTreeGroup): string {
  const lines = [group.instanceName, formatInstanceCounts(group)]

  if (group.instanceType === 'remote') {
    lines.splice(1, 0, `${formatInstanceType(group.instanceType)} · ${formatInstanceStatus(group.instanceStatus)}`)
    lines.splice(2, 0, formatInstanceMode(group))
    lines.push(`${t('settings.remoteLastChecked')}: ${formatInstanceLastChecked(group.instanceLastCheckedAt)}`)
    if (Number.isFinite(group.instanceLatencyMs)) {
      lines.push(`${t('settings.remoteLatency')}: ${formatInstanceLatency(group.instanceLatencyMs)}`)
    }
    if (group.instanceLastError) {
      lines.push(`${t('settings.remoteLastError')}: ${group.instanceLastError}`)
    }
  }

  return lines.join('\n')
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function isLeavingCurrentTarget(event: DragEvent): boolean {
  const current = event.currentTarget as HTMLElement | null
  const related = event.relatedTarget as Node | null
  return !(current && related && current.contains(related))
}

function handleDropTargetLeave(event: DragEvent, type: 'project' | 'session', key: string): void {
  if (!isLeavingCurrentTarget(event)) return
  if (type === 'project' && dragOverProjectKey.value === key) {
    dragOverProjectKey.value = ''
  }
  if (type === 'session' && dragOverSessionId.value === key) {
    dragOverSessionId.value = ''
  }
}

function clearDropTargets(): void {
  dragOverProjectKey.value = ''
  dragOverSessionId.value = ''
}

function handleProjectDrop(event: DragEvent, projectKey: string): void {
  props.onProjectDrop(event, projectKey)
  clearDropTargets()
}

function handleProjectDragEnd(): void {
  props.onProjectDragEnd()
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
