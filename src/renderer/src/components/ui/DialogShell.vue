<template>
  <div
    class="dialog-overlay ui-dialog-overlay"
    :class="overlayClass"
    @click.self="handleBackdropClick"
  >
    <section
      ref="panelRef"
      class="dialog ui-dialog"
      :class="panelClass"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titleId"
      :aria-label="ariaLabel"
      tabindex="-1"
    >
      <slot />
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

type ClassValue = string | string[] | Record<string, boolean> | Array<string | Record<string, boolean>>

const props = withDefaults(defineProps<{
  titleId?: string
  ariaLabel?: string
  overlayClass?: ClassValue
  panelClass?: ClassValue
  closeOnBackdrop?: boolean
}>(), {
  titleId: undefined,
  ariaLabel: undefined,
  overlayClass: '',
  panelClass: '',
  closeOnBackdrop: true
})

const emit = defineEmits<{
  backdrop: []
}>()

const panelRef = ref<HTMLElement | null>(null)

function handleBackdropClick(): void {
  if (props.closeOnBackdrop) {
    emit('backdrop')
  }
}

function getElement(): HTMLElement | null {
  return panelRef.value
}

function focus(): void {
  panelRef.value?.focus()
}

defineExpose({ focus, getElement })
</script>

<style scoped lang="scss">
.ui-dialog {
  outline: none;
}
</style>
