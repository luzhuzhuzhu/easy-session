<template>
  <div class="text-file-viewer" :style="viewerStyle">
    <div v-if="message" class="viewer-message">{{ message }}</div>
    <pre v-else class="viewer-pre">{{ content }}</pre>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'TextFileViewer' })

const props = defineProps<{
  content: string
  zoomPercent?: number
  message?: string | null
}>()

const viewerStyle = computed(() => ({
  '--viewer-scale': String((props.zoomPercent ?? 100) / 100)
}))
</script>

<style scoped lang="scss">
.text-file-viewer {
  --viewer-scale: 1;

  height: 100%;
  min-height: 0;
  overflow: auto;
  background: var(--bg-primary);
}

.viewer-message {
  padding: 16px;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.viewer-pre {
  margin: 0;
  min-width: 100%;
  width: max-content;
  min-height: 100%;
  padding: 16px 18px 24px;
  color: var(--text-primary);
  font-size: calc(12.5px * var(--viewer-scale));
  line-height: 1.7;
  white-space: pre;
  font-family: var(--font-mono);
}
</style>
