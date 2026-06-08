<template>
  <div
    v-if="contextMenuVisible"
    ref="contextMenuRef"
    class="context-menu"
    role="menu"
    tabindex="-1"
    :style="{ left: `${contextMenuX}px`, top: `${contextMenuY}px` }"
    @keydown="handleMenuKeydown"
  >
    <MenuItem :label="$t('session.openInFocusedPane')" @click="emit('open-in-pane')">
      {{ $t('session.openInFocusedPane') }}
    </MenuItem>
    <MenuItem :label="$t('session.splitRightOpen')" @click="emit('split-open', 'horizontal')">
      {{ $t('session.splitRightOpen') }}
    </MenuItem>
    <MenuItem :label="$t('session.splitDownOpen')" @click="emit('split-open', 'vertical')">
      {{ $t('session.splitDownOpen') }}
    </MenuItem>
    <div
      v-if="showLifecycleGroup"
      class="context-separator"
      role="separator"
    ></div>
    <MenuItem
      v-if="showStartAction"
      :disabled="!canStartContextAction"
      :title="formatActionTitle($t('session.start'), canStartContextAction)"
      :label="formatActionTitle($t('session.start'), canStartContextAction)"
      @click="emit('start-context')"
    >
      {{ $t('session.start') }}
    </MenuItem>
    <MenuItem
      v-if="showPauseAction"
      :disabled="!canPauseContextAction"
      :title="formatActionTitle($t('session.pause'), canPauseContextAction)"
      :label="formatActionTitle($t('session.pause'), canPauseContextAction)"
      @click="emit('pause-context')"
    >
      {{ $t('session.pause') }}
    </MenuItem>
    <MenuItem
      v-if="showRestartAction"
      :disabled="!canRestartContextAction"
      :title="formatActionTitle($t('session.restart'), canRestartContextAction)"
      :label="formatActionTitle($t('session.restart'), canRestartContextAction)"
      @click="emit('restart-context')"
    >
      {{ $t('session.restart') }}
    </MenuItem>
    <div v-if="contextSession?.instanceId === 'local'" class="context-separator" role="separator"></div>
    <MenuItem
      v-if="contextSession?.instanceId === 'local'"
      :label="$t('session.rename')"
      @click="emit('rename')"
    >
      {{ $t('session.rename') }}
    </MenuItem>
    <MenuItem
      v-if="contextSession?.instanceId === 'local'"
      :label="$t('session.changeIcon')"
      @click="emit('change-icon')"
    >
      {{ $t('session.changeIcon') }}
    </MenuItem>
    <div v-if="showDestroyAction" class="context-separator" role="separator"></div>
    <MenuItem
      v-if="showDestroyAction"
      danger
      :disabled="!canDestroyContextAction"
      :title="formatActionTitle($t('session.destroy'), canDestroyContextAction)"
      :label="formatActionTitle($t('session.destroy'), canDestroyContextAction)"
      @click="emit('destroy-context')"
    >
      {{ $t('session.destroy') }}
    </MenuItem>
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
        <Button size="sm" @click="emit('close-rename')">{{ $t('session.dialog.cancel') }}</Button>
        <Button size="sm" tone="primary" :disabled="!renameInput.trim()" @click="emit('confirm-rename')">
          {{ $t('session.dialog.confirm') }}
        </Button>
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
        <Button size="sm" @click="emit('close-wake')">{{ $t('session.dialog.cancel') }}</Button>
        <Button size="sm" tone="primary" @click="emit('confirm-wake')">{{ $t('session.wakeDialogStart') }}</Button>
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
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SessionTreeSessionItem } from '@/features/sessions/session-tree'
import type { InstanceCapabilities } from '@/models/unified-resource'
import type { WorkspaceSplitDirection } from '@/api/workspace'
import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import { useOverlayStack } from '@/composables/useOverlayStack'
import Button from '@/components/ui/Button.vue'
import MenuItem from '@/components/ui/MenuItem.vue'

const props = defineProps<{
  contextMenuVisible: boolean
  contextMenuX: number
  contextMenuY: number
  contextSession: SessionTreeSessionItem | null
  contextSessionCapabilities: InstanceCapabilities | null
  contextSessionPassthroughOnly: boolean
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

const { t } = useI18n()
const contextMenuRef = ref<HTMLElement | null>(null)

const showStartAction = computed(() => !!props.contextSession && props.contextSession.status !== 'running')
const showPauseAction = computed(() => !!props.contextSession && props.contextSession.status === 'running')
const showRestartAction = computed(() => !!props.contextSession)
const showDestroyAction = computed(() => !!props.contextSession)

const canStartContextAction = computed(() => !!props.contextSessionCapabilities?.sessionStart)
const canPauseContextAction = computed(() => !!props.contextSessionCapabilities?.sessionPause)
const canRestartContextAction = computed(() => !!props.contextSessionCapabilities?.sessionRestart)
const canDestroyContextAction = computed(() => !!props.contextSessionCapabilities?.sessionDestroy)
const showLifecycleGroup = computed(
  () => showStartAction.value || showPauseAction.value || showRestartAction.value
)

const { handleMenuKeydown } = useMenuKeyboard({
  menuRef: contextMenuRef,
  isOpen: () => props.contextMenuVisible,
  onClose: () => emit('close-context')
})

useOverlayStack({
  isOpen: () => props.showRenameDialog,
  onEscape: () => emit('close-rename')
})

useOverlayStack({
  isOpen: () => props.showWakeDialog,
  onEscape: () => emit('close-wake')
})

useOverlayStack({
  isOpen: () => props.showIconPicker,
  onEscape: () => emit('close-icon-picker')
})

function capabilityUnavailableReason(): string {
  return props.contextSessionPassthroughOnly
    ? t('session.capabilityUnavailablePassthrough')
    : t('session.capabilityUnavailable')
}

function formatActionTitle(label: string, available: boolean): string {
  if (available) return label
  return `${label} - ${capabilityUnavailableReason()}`
}

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
    background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
  }

  &.clear-cell {
    color: var(--text-muted);
    font-size: 12px;
  }
}
</style>
