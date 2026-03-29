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
            <svg viewBox="0 0 16 16">
              <path d="M5 3.5L10 8l-5 4.5" />
            </svg>
          </span>
          <span class="tree-node-icon instance-node-icon" :class="node.instance.instanceType" aria-hidden="true">
            <svg v-if="node.instance.instanceType === 'local'" viewBox="0 0 16 16">
              <rect x="2.25" y="3" width="11.5" height="9.75" rx="1.5" />
              <path d="M2.25 6h11.5" />
              <circle cx="5" cy="4.5" r="0.7" />
              <circle cx="7" cy="4.5" r="0.7" />
            </svg>
            <svg v-else viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="5.5" />
              <ellipse cx="8" cy="8" rx="2.4" ry="5.5" />
              <path d="M2.5 8h11" />
            </svg>
          </span>
          <div class="instance-info">
            <span class="instance-name" :title="node.instance.instanceName">{{ node.instance.instanceName }}</span>
            <div class="instance-meta">
              <span
                class="instance-type-badge"
                :class="node.instance.instanceType"
              >
                {{ formatInstanceType(node.instance.instanceType) }}
              </span>
              <span
                v-if="node.instance.instanceType === 'remote'"
                class="instance-status-badge"
                :class="`status-${node.instance.instanceStatus}`"
              >
                {{ formatInstanceStatus(node.instance.instanceStatus) }}
              </span>
              <span class="instance-count">{{ formatInstanceCounts(node.instance) }}</span>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="node.type === 'project'"
        class="tree-group sidebar-tree-row sidebar-project-shell"
        draggable="true"
        @dragstart="onProjectDragStart($event, node.project)"
        @dragover.prevent="onProjectDragOver($event)"
        @drop="onProjectDrop($event, node.project.key)"
        @dragend="onProjectDragEnd()"
      >
        <div class="project-node" @click="onToggleProject(node.project.key)">
          <span class="tree-caret" :class="{ expanded: isProjectExpanded(node.project.key) }" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M5 3.5L10 8l-5 4.5" />
            </svg>
          </span>
          <span class="tree-node-icon project-node-icon" aria-hidden="true">
            <svg viewBox="0 0 16 16">
              <path d="M2 4.25h4l1.75 1.75H14v5.75a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.25Z" />
            </svg>
          </span>
          <span class="project-name" :title="node.project.projectName">{{ node.project.projectName }}</span>
          <div class="project-right">
            <span class="project-count">{{ node.project.sessions.length }}</span>
            <div class="project-actions" @click.stop>
            <button
              v-if="node.project.canCreateSession"
              class="project-action-btn"
              :title="$t('session.create')"
              @click="onOpenCreateDialog(node.project)"
            >
              +
            </button>
            <button
              v-if="node.project.canOpenProjectDetail"
              class="project-action-btn"
              :title="$t('project.settings')"
              @click="onOpenProject(node.project)"
            >
              P
            </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="node.type === 'session'"
        class="sidebar-tree-row sidebar-session-shell"
      >
        <button
          class="session-item tree-child"
          :class="{ active: activeGlobalSessionKey === node.session.id }"
          draggable="true"
          @click="onSessionClick(node.session)"
          @dragstart="onSessionDragStart($event, node.session)"
          @dragover.prevent="onSessionDragOver($event, node.projectKey)"
          @drop="onSessionDrop($event, node.projectKey, node.session.id)"
          @dragend="onSessionDragEnd()"
          @contextmenu.prevent="onSessionContextMenu($event, node.session)"
        >
          <span v-if="node.session.icon" class="session-icon">{{ node.session.icon }}</span>
          <span v-else class="type-badge" :class="node.session.type">{{ node.session.type === 'claude' ? 'C' : node.session.type === 'codex' ? 'X' : 'O' }}</span>
          <div class="item-info">
            <span class="item-name">{{ node.session.name }}</span>
            <span class="item-time">{{ formatTime(node.session.createdAt) }}</span>
          </div>
          <span class="status-dot" :class="node.session.status"></span>
        </button>
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
import { useI18n } from 'vue-i18n'
import VirtualTree from '@/components/tree/VirtualTree.vue'
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
}>()

const { t } = useI18n()

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

function formatInstanceTooltip(group: InstanceTreeGroup): string {
  const lines = [group.instanceName, formatInstanceCounts(group)]

  if (group.instanceType === 'remote') {
    lines.splice(1, 0, `${formatInstanceType(group.instanceType)} · ${formatInstanceStatus(group.instanceStatus)}`)
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
</script>
