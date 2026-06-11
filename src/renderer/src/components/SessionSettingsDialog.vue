<template>
  <ModalDialog
    v-if="visible && session"
    :title="$t('session.settingsTitle', { name: session.name })"
    :close-label="$t('session.dialog.cancel')"
    @close="$emit('cancel')"
  >
    <p class="restart-hint">{{ $t('session.settingsRestartHint') }}</p>

    <SessionOptionsForm
      ref="optionsFormRef"
      :cli-type="session.type"
      :initial-options="session.options"
    />

    <template #footer>
      <Button @click="$emit('cancel')">{{ $t('session.dialog.cancel') }}</Button>
      <Button tone="primary" :disabled="saving" @click="handleSubmit">
        {{ $t('session.dialog.confirm') }}
      </Button>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/composables/useToast'
import { useOverlayStack } from '@/composables/useOverlayStack'
import Button from '@/components/ui/Button.vue'
import ModalDialog from '@/components/ui/ModalDialog.vue'
import SessionOptionsForm from '@/components/SessionOptionsForm.vue'
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

const optionsFormRef = ref<InstanceType<typeof SessionOptionsForm> | null>(null)
const saving = ref(false)

useOverlayStack({
  isOpen: () => props.visible,
  onEscape: () => emit('cancel')
})

async function handleSubmit(): Promise<void> {
  if (!props.session || saving.value) return

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
      // 会话在对话框打开期间被销毁（其他窗格/远程调用），保存并未发生
      toast.error(t('session.settingsSessionGone'))
      emit('cancel')
      return
    }
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
.restart-hint {
  margin: 0;
  padding: 6px var(--spacing-sm);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}
</style>
