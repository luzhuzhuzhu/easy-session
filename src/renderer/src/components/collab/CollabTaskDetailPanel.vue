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
