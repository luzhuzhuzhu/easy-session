<template>
  <div v-if="contextMenuVisible" class="context-menu" :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }">
    <button class="context-item" @click="emit('open-in-pane')">{{ $t('session.openInFocusedPane') }}</button>
    <button class="context-item" @click="emit('split-open', 'horizontal')">{{ $t('session.splitRightOpen') }}</button>
    <button class="context-item" @click="emit('split-open', 'vertical')">{{ $t('session.splitDownOpen') }}</button>
    <button
      v-if="contextSessionCapabilities?.sessionStart && contextSession?.status !== 'running'"
      class="context-item"
      @click="emit('start-context')"
    >
      {{ $t('session.start') }}
    </button>
    <button
      v-if="contextSessionCapabilities?.sessionPause && contextSession?.status === 'running'"
      class="context-item"
      @click="emit('pause-context')"
    >
      {{ $t('session.pause') }}
    </button>
    <button
      v-if="contextSessionCapabilities?.sessionRestart"
      class="context-item"
      @click="emit('restart-context')"
    >
      {{ $t('session.restart') }}
    </button>
    <button
      v-if="contextSession?.instanceId === 'local'"
      class="context-item"
      @click="emit('rename')"
    >
      {{ $t('session.rename') }}
    </button>
    <button
      v-if="contextSession?.instanceId === 'local'"
      class="context-item"
      @click="emit('change-icon')"
    >
      {{ $t('session.changeIcon') }}
    </button>
    <button
      v-if="contextSessionCapabilities?.sessionDestroy"
      class="context-item danger"
      @click="emit('destroy-context')"
    >
      {{ $t('session.destroy') }}
    </button>
  </div>
  <div v-if="contextMenuVisible" class="context-overlay" @click="emit('close-context')"></div>

  <div v-if="showRenameDialog" class="dialog-overlay" @click.self="emit('close-rename')">
    <div class="dialog">
      <h3>{{ $t('session.renameTitle') }}</h3>
      <input
        :value="renameInput"
        class="dialog-input"
        :placeholder="$t('session.renameTitle')"
        @input="handleRenameInput"
        @keydown.enter="emit('confirm-rename')"
      />
      <div class="dialog-actions">
        <button class="btn btn-sm" @click="emit('close-rename')">{{ $t('session.dialog.cancel') }}</button>
        <button class="btn btn-sm btn-primary" :disabled="!renameInput.trim()" @click="emit('confirm-rename')">
          {{ $t('session.dialog.confirm') }}
        </button>
      </div>
    </div>
  </div>

  <div v-if="showWakeDialog" class="dialog-overlay" @click.self="emit('close-wake')">
    <div class="dialog">
      <h3>{{ $t('session.wakeDialogTitle') }}</h3>
      <p class="dialog-hint">
        <span v-if="pendingWakeSession">{{ pendingWakeSession.name }} · </span>
        {{ $t('session.wakeDialogMessage') }}
      </p>
      <label class="dialog-check">
        <input :checked="wakeSkipReminder" type="checkbox" @change="handleWakeReminderChange" />
        <span>{{ $t('session.wakeDialogNoRemind') }}</span>
      </label>
      <div class="dialog-actions">
        <button class="btn btn-sm" @click="emit('close-wake')">{{ $t('session.dialog.cancel') }}</button>
        <button class="btn btn-sm btn-primary" @click="emit('confirm-wake')">{{ $t('session.wakeDialogStart') }}</button>
      </div>
    </div>
  </div>

  <div v-if="showIconPicker" class="dialog-overlay" @click.self="emit('close-icon-picker')">
    <div class="dialog icon-picker-dialog">
      <h3>{{ $t('session.changeIcon') }}</h3>
      <div class="icon-grid">
        <button
          v-for="emoji in iconEmojiList"
          :key="emoji"
          class="icon-grid-cell"
          :class="{ selected: iconPickerSessionIcon === emoji }"
          @click="emit('pick-icon', emoji)"
        >
          {{ emoji }}
        </button>
        <button class="icon-grid-cell clear-cell" @click="emit('pick-icon', null)">✕</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { SessionTreeSessionItem } from '@/features/sessions/session-tree'
import type { InstanceCapabilities } from '@/models/unified-resource'
import type { WorkspaceSplitDirection } from '@/api/workspace'

defineProps<{
  contextMenuVisible: boolean
  contextMenuX: number
  contextMenuY: number
  contextSession: SessionTreeSessionItem | null
  contextSessionCapabilities: InstanceCapabilities | null
  showRenameDialog: boolean
  renameInput: string
  showWakeDialog: boolean
  pendingWakeSession: SessionTreeSessionItem | null
  wakeSkipReminder: boolean
  showIconPicker: boolean
  iconEmojiList: string[]
  iconPickerSessionIcon: string | null
}>()

const emit = defineEmits<{
  'close-context': []
  'open-in-pane': []
  'split-open': [direction: WorkspaceSplitDirection]
  'start-context': []
  'pause-context': []
  'restart-context': []
  'rename': []
  'change-icon': []
  'destroy-context': []
  'update:renameInput': [value: string]
  'close-rename': []
  'confirm-rename': []
  'update:wakeSkipReminder': [value: boolean]
  'close-wake': []
  'confirm-wake': []
  'close-icon-picker': []
  'pick-icon': [emoji: string | null]
}>()

useI18n()

function handleRenameInput(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:renameInput', target?.value ?? '')
}

function handleWakeReminderChange(event: Event): void {
  const target = event.target as HTMLInputElement | null
  emit('update:wakeSkipReminder', target?.checked ?? false)
}
</script>

<style scoped lang="scss">
.dialog-check {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.dialog-check input {
  width: 16px;
  height: 16px;
  accent-color: var(--accent-primary);
}

.icon-picker-dialog {
  width: 320px;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 2px;
  padding: var(--spacing-sm) 0;
}

.icon-grid-cell {
  width: 34px;
  height: 34px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: var(--bg-hover);
  }

  &.selected {
    background: rgba(108, 158, 255, 0.15);
  }

  &.clear-cell {
    color: var(--text-muted);
    font-size: 12px;
  }
}
</style>
