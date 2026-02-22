<template>
  <slot v-if="!hasError" />
  <div v-else class="error-boundary">
    <div class="error-icon">⚠️</div>
    <p class="error-msg">{{ $t('error.componentCrash') }}</p>
    <p class="error-detail" v-if="errorMsg">{{ errorMsg }}</p>
    <button class="btn btn-primary" @click="reset">{{ $t('error.retry') }}</button>
  </div>
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const hasError = ref(false)
const errorMsg = ref('')

onErrorCaptured((err) => {
  hasError.value = true
  errorMsg.value = err instanceof Error ? err.message : String(err)
  if (import.meta.env.DEV) {
    console.error('[ErrorBoundary]', err)
  }
  return false
})

function reset() {
  hasError.value = false
  errorMsg.value = ''
}

// Expose for e2e testing
;(window as any).__e2e_errorBoundary__ = { hasError, errorMsg }
</script>

<style scoped>
.error-boundary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 200px;
  gap: var(--spacing-md);
  color: var(--text-secondary);
}
.error-icon { font-size: 48px; }
.error-msg { font-size: var(--font-size-lg); margin: 0; }
.error-detail {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  max-width: 480px;
  text-align: center;
  word-break: break-word;
  margin: 0;
}
</style>
