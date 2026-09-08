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
// STAB-11：协作页「任务看板」面板（六列看板 + 归档视图）。
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

<style scoped lang="scss">
.panel-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.panel-toolbar {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
  min-height: 28px;
  padding: 5px 8px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 60%, transparent);
}

.board-filter {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rail-all-button,
.tiny-button {
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  font-weight: 650;
}

.rail-all-button {
  flex: 0 0 auto;
  height: 22px;
  margin-left: auto;
  padding: 0 8px;
  border-radius: 999px;
  font-size: var(--font-size-xs);
}

.rail-all-button:hover,
.tiny-button:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}

.board-region {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 8px;
  overflow: hidden;
}

.board-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(146px, 1fr));
  grid-template-rows: minmax(0, 1fr);
  gap: 8px;
  width: 100%;
  height: 100%;
  overflow-x: auto;
  overscroll-behavior-x: contain;
}

.board-col {
  display: flex;
  flex-direction: column;
  min-width: 146px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
}

.col-head {
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 750;
}

.col-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.task-card,
.archived-row {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;
}

.task-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 96px;
  padding: 9px;
  background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
}

.task-card:hover,
.task-card:focus-within,
.archived-row:hover,
.archived-row:focus-within {
  border-color: color-mix(in srgb, var(--accent-primary) 52%, var(--border-color));
}

.task-card.selected,
.archived-row.selected {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary));
}

.task-card h3,
.archived-row h3 {
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.45;
  word-break: break-word;
}

.task-card h3 {
  display: -webkit-box;
  padding-right: 2px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.task-top,
.task-meta,
.archived-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  min-width: 0;
}

.task-card:has(.card-archive) .task-top {
  padding-right: 50px;
}

.task-id {
  min-width: 0;
  overflow: hidden;
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-status {
  flex-shrink: 0;
  max-width: 74px;
  padding: 3px 6px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--bg-tertiary);
  font-size: var(--font-size-xs);
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-meta {
  margin-top: auto;
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 62%, transparent);
  color: var(--text-muted);
  font-size: 10.5px;
}

.task-meta span:first-child,
.archived-foot span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-archive {
  position: absolute;
  top: 6px;
  right: 6px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-xs);
  font-weight: 650;
  opacity: 0;
  transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease;
}

.task-card:hover .card-archive,
.task-card:focus-within .card-archive,
.card-archive:focus-visible {
  opacity: 1;
}

.card-archive:hover,
.card-archive:focus-visible {
  border-color: var(--accent-primary);
  color: var(--text-primary);
  outline: none;
}

.archived-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(208px, 100%), 1fr));
  align-content: start;
  gap: 8px;
  height: 100%;
  min-width: 0;
  overflow-y: auto;
}

.archived-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 9px;
  background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
}

.archived-foot {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.tiny-button {
  flex: 0 0 auto;
  height: 28px;
  padding: 0 9px;
  border-radius: 6px;
  font-size: 12px;
}

.empty {
  margin: 10px 0;
  padding: 0 8px;
  color: var(--text-muted);
  font-size: 12px;
}

.empty.compact {
  min-height: 10px;
  margin: 0;
  text-align: center;
  opacity: 0.55;
}

.st-done,
.st-review {
  color: var(--status-success);
}

.st-failed,
.st-rejected,
.st-cancelled,
.st-expired {
  color: var(--status-error);
}

.st-blocked {
  color: var(--status-warning);
}

.st-in_progress,
.st-accepted,
.st-created,
.st-delivered {
  color: var(--accent-primary);
}

@media (hover: none) {
  .card-archive {
    opacity: 1;
  }
}
</style>
