<template>
  <div class="panel-content">
    <div class="panel-toolbar">
      <span class="board-filter">{{ showArchived ? $t('collab.archivedTitle') : (activeAgentName || $t('collab.target')) }}</span>
      <button type="button" class="rail-all-button" @click="$emit('toggle-archived')">
        {{ showArchived ? $t('collab.backToBoard') : $t('collab.showArchived', { count: archivedCount }) }}
      </button>
    </div>
    <div class="board-region">
      <div v-if="!showArchived" class="board-grid">
        <div v-for="col in columns" :key="col.key" class="board-col">
          <div class="col-head" :class="`col-${col.key}`">
            <span>{{ col.label }}</span>
            <b>{{ col.tasks.length }}</b>
          </div>
          <div class="col-body">
            <article
              v-for="task in col.tasks"
              :key="task.id"
              class="task-card"
              :class="{ selected: selectedTaskId === task.id }"
              @click="$emit('select-task', task.id)"
            >
              <div class="task-top">
                <span class="task-id">{{ task.id }}</span>
                <span class="task-status" :class="`st-${task.status}`">{{ statusLabel(task.status) }}</span>
              </div>
              <h3>{{ task.title }}</h3>
              <div class="task-meta">
                <span>{{ task.fromName }} -> {{ task.toName }}</span>
                <span>{{ relTime(task.updatedAt) }}</span>
              </div>
              <button
                v-if="isArchivable(task)"
                type="button"
                class="card-archive"
                :title="$t('collab.archive')"
                @click.stop="$emit('archive-task', task.id)"
              >
                {{ $t('collab.archive') }}
              </button>
            </article>
            <p v-if="!col.tasks.length" class="empty compact"></p>
          </div>
        </div>
      </div>
      <div v-else class="archived-list">
        <article
          v-for="task in archivedTasks"
          :key="task.id"
          class="archived-row"
          :class="{ selected: selectedTaskId === task.id }"
          @click="$emit('select-task', task.id)"
        >
          <div class="task-top">
            <span class="task-id">{{ task.id }}</span>
            <span class="task-status" :class="`st-${task.status}`">{{ statusLabel(task.status) }}</span>
          </div>
          <h3>{{ task.title }}</h3>
          <div class="archived-foot">
            <span>{{ task.fromName }} -> {{ task.toName }} · {{ relTime(task.archivedAt || task.updatedAt) }}</span>
            <button type="button" class="tiny-button" @click.stop="$emit('unarchive-task', task.id)">
              {{ $t('collab.unarchive') }}
            </button>
          </div>
        </article>
        <p v-if="!archivedTasks.length" class="empty compact">{{ $t('collab.noArchived') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// STAB-11：协作页「任务看板」面板（5 列看板 + 归档视图）。
import type { BoardColumn } from './types'

defineProps<{
  columns: BoardColumn[]
  archivedTasks: import('@/api/agent-bus').AgentTask[]
  archivedCount: number
  selectedTaskId: string | null
  showArchived: boolean
  activeAgentName: string
  statusLabel: (status: string) => string
  relTime: (at: number) => string
  isArchivable: (task: import('@/api/agent-bus').AgentTask) => boolean
}>()

defineEmits<{
  'toggle-archived': []
  'select-task': [taskId: string]
  'archive-task': [taskId: string]
  'unarchive-task': [taskId: string]
}>()
</script>
