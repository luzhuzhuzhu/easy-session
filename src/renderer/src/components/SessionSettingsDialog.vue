<template>
  <ModalDialog
    v-if="visible && session"
    :title="''"
    :aria-label="$t('session.settingsTitle', { name: session.name })"
    :close-label="$t('session.dialog.cancel')"
    :close-on-backdrop="!saving"
    :close-disabled="saving"
    @close="handleClose"
  >
    <template #header>
      <div class="settings-header">
        <div class="settings-heading">
          <CliTypeIcon :type="session.type" />
          <div class="settings-heading-copy">
            <h3 class="modal-title">{{ $t('session.settingsTitle', { name: session.name }) }}</h3>
            <p class="settings-context">
              {{ $t(`session.${session.type}`) }} · {{ session.instanceId === 'local' ? $t('session.instanceLocal') : $t('session.instanceRemote') }}
            </p>
          </div>
        </div>
      </div>
    </template>

    <div class="settings-notices">
      <p class="restart-hint">
        <strong>{{ $t('session.settingsRestartTitle') }}</strong>
        {{ $t('session.settingsRestartHint') }}
      </p>
      <p v-if="session.instanceId !== 'local'" class="restart-hint remote">
        {{ $t('session.remoteSessionSettingsHint') }}
      </p>
      <p v-if="externalSessionChanged" class="restart-hint conflict" role="alert">
        {{ $t('session.settingsChangedExternally') }}
      </p>
    </div>

    <SessionOptionsForm
      ref="optionsFormRef"
      mode="edit"
      :cli-type="session.type"
      :initial-options="session.options"
      :project-path="session.projectPath"
      :instance-id="session.instanceId"
      :initial-native-id="readNativeSessionId(session)"
    />

    <template #footer>
      <Button :disabled="saving" @click="handleClose">{{ $t('session.dialog.cancel') }}</Button>
      <Button
        tone="primary"
        :disabled="saving || !isDirty || externalSessionChanged"
        @click="handleSubmit"
      >
        {{ $t('session.dialog.confirm') }}
      </Button>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionsStore } from '@/stores/sessions'
import { readNativeSessionId } from '@/models/unified-resource'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useOverlayStack } from '@/composables/useOverlayStack'
import Button from '@/components/ui/Button.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import SessionOptionsForm from '@/components/SessionOptionsForm.vue'
import CliTypeIcon from '@/components/CliTypeIcon.vue'
import type { UnifiedSession } from '@/models/unified-resource'

const props = defineProps<{
  visible: boolean
  session: UnifiedSession | null
}>()

const emit = defineEmits<{
  (e: 'cancel'): void
  (e: 'saved'): void
}>()

const { t } = useI18n()
const sessionsStore = useSessionsStore()
const toast = useToast()
const confirmDialog = useConfirmDialog()

const optionsFormRef = ref<InstanceType<typeof SessionOptionsForm> | null>(null)
const saving = ref(false)
const baselineSessionSignature = ref('')

function stableSerialize(value: unknown): string {
  if (value === undefined) return 'undefined'
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(',')}}`
}

function sessionSignature(
  session: (Parameters<typeof readNativeSessionId>[0]) & { options: Record<string, unknown> } | null
): string {
  if (!session) return ''
  return stableSerialize({ options: session.options, nativeSessionId: readNativeSessionId(session) })
}

const currentSession = computed(() => {
  if (!props.session) return null
  return sessionsStore.getUnifiedSession(props.session.globalSessionKey) ?? props.session
})
const externalSessionChanged = computed(() => {
  return !!props.session && !!baselineSessionSignature.value && sessionSignature(currentSession.value) !== baselineSessionSignature.value
})
const isDirty = computed(() => optionsFormRef.value?.isDirty?.() ?? false)

watch(
  [() => props.visible, () => props.session?.globalSessionKey],
  ([visible]) => {
    if (!visible) {
      baselineSessionSignature.value = ''
      return
    }
    baselineSessionSignature.value = sessionSignature(props.session)
  },
  { immediate: true }
)

async function handleClose(): Promise<void> {
  if (saving.value) return
  if (!isDirty.value) {
    emit('cancel')
    return
  }

  const discard = await confirmDialog.confirm({
    title: t('session.settingsUnsavedTitle'),
    message: t('session.settingsUnsavedMessage'),
    details: t('session.settingsUnsavedDetails'),
    confirmText: t('confirm.discard'),
    cancelText: t('confirm.continue'),
    tone: 'danger'
  })
  if (discard) emit('cancel')
}

useOverlayStack({
  isOpen: () => props.visible,
  onEscape: () => { void handleClose() },
  closeOnEscape: () => !saving.value
})

async function handleSubmit(): Promise<void> {
  if (!props.session || saving.value || externalSessionChanged.value) {
    if (externalSessionChanged.value) toast.warning(t('session.settingsChangedExternally'))
    return
  }

  const options = optionsFormRef.value?.buildOptions() ?? {}
  saving.value = true
  try {
    const updated = await sessionsStore.updateSessionOptionsRef(
      {
        instanceId: props.session.instanceId,
        sessionId: props.session.sessionId,
        globalSessionKey: props.session.globalSessionKey
      },
      options
    )
    if (!updated) {
      toast.error(t('session.settingsSessionGone'))
      emit('cancel')
      return
    }
    optionsFormRef.value?.markBaseline()
    baselineSessionSignature.value = sessionSignature(updated)
    toast.success(t('session.settingsSaved'))
    emit('saved')
  } catch (error: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped lang="scss">
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  min-width: 0;
  width: 100%;
}

.settings-heading {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.settings-heading-copy {
  min-width: 0;
}

.settings-context {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.modal-close {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 20px;
}

.modal-close:hover:not(:disabled),
.modal-close:focus-visible {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.modal-close:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.settings-notices {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.restart-hint {
  margin: 0;
  padding: 8px var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.45;
}

.restart-hint strong {
  margin-right: 4px;
  color: var(--text-secondary);
}

.restart-hint.remote {
  border-color: color-mix(in srgb, var(--accent-primary) 30%, var(--border-color));
}

.restart-hint.conflict {
  border-color: color-mix(in srgb, var(--status-warning) 50%, var(--border-color));
  color: var(--status-warning);
}
</style>
