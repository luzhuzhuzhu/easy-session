<template>
  <div class="panel-content">
    <div class="panel-toolbar detail-tools">
      <button v-if="hasTargetSession" class="tiny-button" type="button" @click="$emit('open-session')">
        {{ $t('collab.openSession') }}
      </button>
      <button v-if="task?.result" class="tiny-button" type="button" @click="$emit('copy-result', task.result)">
        {{ $t('collab.copyResult') }}
      </button>
    </div>
    <div class="detail-region">
      <div v-if="task" class="detail-content">
        <div class="detail-title">
          <span class="task-id">{{ task.id }}</span>
          <span class="task-status" :class="`st-${task.status}`">{{ statusLabel(task.status) }}</span>
        </div>
        <h3>{{ task.title }}</h3>
        <p class="detail-flow">{{ task.fromName }} -> {{ task.toName }}</p>

        <div v-if="latestTaskText(task)" class="task-note">
          <span>{{ $t('collab.history') }}</span>
          <p>{{ latestTaskText(task) }}</p>
        </div>

        <div v-if="task.result" class="result-box">
          <span>{{ $t('collab.result') }}</span>
          <p>{{ task.result }}</p>
        </div>

        <div class="task-actions">
          <button
            v-if="task.status === 'review' && task.from === 'user'"
            class="primary-button small"
            type="button"
            @click="$emit('transition', 'confirm')"
          >
            {{ $t('collab.confirmDone') }}
          </button>
          <button
            v-if="task.status === 'blocked' && task.from === 'user'"
            class="secondary-button small"
            type="button"
            @click="$emit('toggle-unblock')"
          >
            {{ $t('collab.unblockTask') }}
          </button>
          <button
            v-if="canCancel(task)"
            class="danger-button small"
            type="button"
            @click="$emit('toggle-cancel')"
          >
            {{ $t('collab.cancelTask') }}
          </button>
          <button
            v-if="isArchivable(task)"
            class="secondary-button small"
            type="button"
            @click="$emit('archive-task', task.id)"
          >
            {{ $t('collab.archive') }}
          </button>
          <button
            v-if="task.archivedAt"
            class="secondary-button small"
            type="button"
            @click="$emit('unarchive-task', task.id)"
          >
            {{ $t('collab.unarchive') }}
          </button>
        </div>

        <div class="manual-status">
          <div class="manual-status-row">
            <label>{{ $t('collab.manualStatus') }}</label>
            <select :value="manualStatus" @change="$emit('update:manualStatus', ($event.target as HTMLSelectElement).value); $emit('status-touched')">
              <option v-for="status in manualStatusOptions" :key="status" :value="status">
                {{ statusLabel(status) }}
              </option>
            </select>
            <button
              class="secondary-button small"
              type="button"
              :disabled="manualStatusBusy || !task || (manualStatus === task.status && !manualStatusNote)"
              @click="$emit('apply-status')"
            >
              {{ $t('collab.applyStatus') }}
            </button>
          </div>
          <textarea
            :value="manualStatusNote"
            :placeholder="$t('collab.manualStatusPlaceholder')"
            @input="$emit('update:manualStatusNote', ($event.target as HTMLTextAreaElement).value.trim())"
          ></textarea>
        </div>

        <div v-if="showUnblock" class="inline-form">
          <textarea
            :value="unblockText"
            :placeholder="$t('collab.unblockPlaceholder')"
            @input="$emit('update:unblockText', ($event.target as HTMLTextAreaElement).value.trim())"
          ></textarea>
          <button class="primary-button small" type="button" @click="$emit('transition', 'unblock', unblockText)">
            {{ $t('collab.unblockTask') }}
          </button>
        </div>

        <div v-if="showCancel" class="inline-form">
          <textarea
            :value="cancelText"
            :placeholder="$t('collab.cancelPlaceholder')"
            @input="$emit('update:cancelText', ($event.target as HTMLTextAreaElement).value.trim())"
          ></textarea>
          <button class="danger-button small" type="button" @click="$emit('transition', 'cancel', cancelText)">
            {{ $t('collab.cancelTask') }}
          </button>
        </div>

        <div class="history">
          <span class="section-label">{{ $t('collab.history') }}</span>
          <ol>
            <li v-for="item in task.history" :key="`${item.at}-${item.status}-${item.by}`">
              <time>{{ clock(item.at) }}</time>
              <b :class="`st-${item.status}`">{{ statusLabel(item.status) }}</b>
              <span v-if="item.text">{{ item.text }}</span>
            </li>
          </ol>
        </div>
      </div>
      <p v-else class="empty">{{ $t('collab.noTaskSelected') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// STAB-11：协作页「任务详情」面板。
import type { AgentTask, AgentTaskStatus } from '@/api/agent-bus'

defineProps<{
  task: AgentTask | null
  hasTargetSession: boolean
  showUnblock: boolean
  showCancel: boolean
  unblockText: string
  cancelText: string
  manualStatus: AgentTaskStatus
  manualStatusNote: string
  manualStatusBusy: boolean
  manualStatusOptions: AgentTaskStatus[]
  statusLabel: (status: string) => string
  clock: (at: number) => string
  canCancel: (task: AgentTask) => boolean
  isArchivable: (task: AgentTask) => boolean
}>()

defineEmits<{
  'open-session': []
  'copy-result': [text: string]
  transition: [action: 'confirm' | 'cancel' | 'unblock', text?: string]
  'toggle-unblock': []
  'toggle-cancel': []
  'archive-task': [taskId: string]
  'unarchive-task': [taskId: string]
  'update:manualStatus': [value: string]
  'update:manualStatusNote': [value: string]
  'update:unblockText': [value: string]
  'update:cancelText': [value: string]
  'status-touched': []
  'apply-status': []
}>()

function latestTaskText(task: AgentTask): string {
  const hit = task.history
    .slice()
    .reverse()
    .find((item) => !!item.text && item.text !== task.title)
  return hit?.text || ''
}
</script>

<style scoped lang="scss">
@use './panel-mixins' as panel;

@include panel.shell;
@include panel.form-controls;
@include panel.action-buttons;
@include panel.status-colors;

.detail-tools {
  justify-content: flex-end;
}

.detail-region {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
}

.detail-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.detail-content h3 {
  margin: 7px 0 3px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1.35;
  word-break: break-word;
}

.task-id {
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
}

.task-status {
  flex-shrink: 0;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--bg-tertiary);
  font-size: var(--font-size-xs);
  line-height: 1;
}

.detail-flow {
  color: var(--text-muted);
  font-size: 10.5px;
}

.task-note,
.result-box {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
}

.task-note span,
.result-box span {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 800;
}

.task-note p,
.result-box p {
  max-height: 180px;
  margin: 5px 0 0;
  overflow-y: auto;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 12px;
  line-height: 1.45;
}

.task-actions,
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.manual-status {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
}

.manual-status-row {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.manual-status-row label {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 800;
  white-space: nowrap;
}

.manual-status-row select {
  height: 28px;
  font-size: 12px;
}

.manual-status textarea {
  height: 44px;
  min-height: 44px;
  margin-top: 6px;
  resize: vertical;
}

.inline-form textarea {
  flex-basis: 100%;
  height: 62px;
}

.history {
  margin-top: 10px;
}

.history ol {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
}

.history li {
  display: grid;
  grid-template-columns: 38px 64px minmax(0, 1fr);
  gap: 6px;
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.35;
}

.history li span {
  min-width: 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.history time {
  color: var(--text-muted);
}
</style>
