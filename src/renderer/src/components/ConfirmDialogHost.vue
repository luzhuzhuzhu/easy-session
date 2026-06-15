<template>
  <Transition name="confirm-dialog">
    <DialogShell
      v-if="confirmStore.current"
      ref="dialogShellRef"
      overlay-class="confirm-overlay"
      :panel-class="['confirm-dialog', `tone-${confirmStore.current.tone}`]"
      :title-id="titleId"
      @backdrop="confirmStore.cancel"
    >
      <div class="confirm-mark" aria-hidden="true">
        {{ confirmStore.current.tone === 'danger' ? '!' : '?' }}
      </div>
      <div class="confirm-content">
        <h3 :id="titleId">{{ confirmStore.current.title }}</h3>
        <p v-if="confirmStore.current.message" class="confirm-message">
          {{ confirmStore.current.message }}
        </p>
        <p v-if="confirmStore.current.details" class="confirm-details">
          {{ confirmStore.current.details }}
        </p>
      </div>
      <div class="dialog-actions confirm-actions">
        <Button ref="cancelButtonRef" size="sm" @click="confirmStore.cancel">
          {{ confirmStore.current.cancelText || $t('confirm.cancel') }}
        </Button>
        <Button
          ref="confirmButtonRef"
          size="sm"
          :tone="confirmStore.current.tone === 'danger' ? 'danger' : 'primary'"
          @click="confirmStore.accept"
        >
          {{ confirmStore.current.confirmText || $t('confirm.ok') }}
        </Button>
      </div>
    </DialogShell>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useConfirmDialogStore } from '@/composables/useConfirmDialog'
import { useOverlayStack } from '@/composables/useOverlayStack'
import Button from '@/components/ui/Button.vue'
import DialogShell from '@/components/ui/DialogShell.vue'

const confirmStore = useConfirmDialogStore()
type DialogShellExpose = { getElement: () => HTMLElement | null }
const dialogShellRef = ref<DialogShellExpose | null>(null)
type ButtonExpose = { focus: () => void }
const cancelButtonRef = ref<ButtonExpose | null>(null)
const confirmButtonRef = ref<ButtonExpose | null>(null)
let previousFocus: HTMLElement | null = null

const titleId = computed(() => `confirm-dialog-title-${confirmStore.current?.id ?? 'idle'}`)

function getFocusableElements(): HTMLElement[] {
  const dialog = dialogShellRef.value?.getElement() ?? null
  if (!dialog) return []
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.offsetParent !== null)
}

function handleKeydown(event: KeyboardEvent): void {
  if (!confirmStore.current) return

  if (event.key !== 'Tab') return
  const focusable = getFocusableElements()
  if (focusable.length === 0) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement

  if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

// Open/close edge: only capture & restore focus when the dialog host actually
// appears/disappears, not when the queue swaps one confirmation for the next.
watch(
  () => !!confirmStore.current,
  (isOpen) => {
    if (isOpen) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      document.addEventListener('keydown', handleKeydown)
      return
    }
    document.removeEventListener('keydown', handleKeydown)
    previousFocus?.focus()
    previousFocus = null
  }
)

// Per-dialog focus: re-focus the default button whenever a (possibly queued)
// confirmation becomes current.
watch(
  () => confirmStore.current?.id,
  async (id) => {
    if (id == null) return
    await nextTick()
    const target = confirmStore.current?.tone === 'danger' ? cancelButtonRef.value : confirmButtonRef.value
    target?.focus()
  }
)

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
})

useOverlayStack({
  isOpen: () => !!confirmStore.current,
  onEscape: () => confirmStore.cancel()
})
</script>

<style scoped lang="scss">
.confirm-overlay {
  z-index: 1200;
}

.confirm-dialog {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 14px;
  width: min(92vw, 460px);
  border-radius: var(--radius-sm);
}

.confirm-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  color: var(--accent-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.tone-danger .confirm-mark {
  border-color: color-mix(in srgb, var(--status-error) 52%, var(--border-color));
  color: var(--status-error);
  background: color-mix(in srgb, var(--status-error) 12%, transparent);
}

.confirm-content {
  min-width: 0;

  h3 {
    margin: 0 0 8px;
    font-size: var(--font-size-md);
    line-height: 1.35;
  }
}

.confirm-message,
.confirm-details {
  margin: 0;
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.55;
  word-break: break-word;
}

.confirm-details {
  margin-top: 10px;
  color: var(--text-muted);
  white-space: pre-line;
}

.confirm-actions {
  grid-column: 1 / -1;
}

.confirm-dialog-enter-active,
.confirm-dialog-leave-active {
  transition: opacity 0.14s ease;
}

.confirm-dialog-enter-from,
.confirm-dialog-leave-to {
  opacity: 0;
}
</style>
