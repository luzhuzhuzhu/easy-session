<template>
  <div v-if="visible && session" class="dialog-overlay" @click.self="$emit('cancel')">
    <div class="dialog">
      <div class="dialog-header">
        <h3>{{ $t('session.settingsTitle', { name: session.name }) }}</h3>
        <button class="close-btn" type="button" :aria-label="$t('session.dialog.cancel')" @click="$emit('cancel')">&times;</button>
      </div>

      <form class="dialog-body" @submit.prevent="handleSubmit">
        <p class="restart-hint">{{ $t('session.settingsRestartHint') }}</p>

        <SessionOptionsForm
          ref="optionsFormRef"
          :cli-type="session.type"
          :initial-options="session.options"
        />

        <div class="dialog-footer">
          <Button @click="$emit('cancel')">{{ $t('session.dialog.cancel') }}</Button>
          <Button type="submit" tone="primary" :disabled="saving">
            {{ $t('session.dialog.confirm') }}
          </Button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSessionsStore } from '@/stores/sessions'
import { useToast } from '@/composables/useToast'
import { useOverlayStack } from '@/composables/useOverlayStack'
import Button from '@/components/ui/Button.vue'
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
.dialog {
  width: min(92vw, 760px);
  max-height: 88vh;
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px var(--spacing-lg);
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 0;
    font-size: var(--font-size-md);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.close-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all var(--transition-fast);

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }
}

.dialog-body {
  padding: 14px var(--spacing-lg) var(--spacing-lg);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.restart-hint {
  margin: 0;
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 1.4;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  padding-top: 14px;
  border-top: 1px solid var(--border-color);
}
</style>
