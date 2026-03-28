<template>
  <div class="diff-viewer" :style="viewerStyle">
    <div v-if="message" class="viewer-message">{{ message }}</div>
    <div v-else-if="!lines.length" class="viewer-message">{{ $t('inspector.emptyDiff') }}</div>
    <div v-else class="diff-lines">
      <div
        v-for="(line, index) in lines"
        :key="`${index}-${line.text}`"
        class="diff-line"
        :class="line.kind"
      >
        <span class="line-gutter">{{ line.gutter }}</span>
        <code class="line-text">{{ line.text }}</code>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'DiffViewer' })

const { t } = useI18n()

const props = defineProps<{
  diff: string
  zoomPercent?: number
  message?: string | null
}>()

const viewerStyle = computed(() => ({
  '--viewer-scale': String((props.zoomPercent ?? 100) / 100)
}))

const lines = computed(() => {
  return props.diff.split(/\r?\n/).filter(Boolean).map((line) => {
    if (line.startsWith('@@')) {
      return { kind: 'hunk', gutter: '@@', text: line }
    }
    if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
      return { kind: 'meta', gutter: '=', text: line }
    }
    if (line.startsWith('+')) {
      return { kind: 'addition', gutter: '+', text: line.slice(1) }
    }
    if (line.startsWith('-')) {
      return { kind: 'deletion', gutter: '-', text: line.slice(1) }
    }
    return { kind: 'context', gutter: ' ', text: line.startsWith(' ') ? line.slice(1) : line }
  })
})
</script>

<style scoped lang="scss">
.diff-viewer {
  --viewer-scale: 1;
  --diff-meta-bg: color-mix(in srgb, var(--bg-secondary) 92%, var(--accent-primary) 8%);
  --diff-hunk-bg: color-mix(in srgb, var(--bg-secondary) 72%, var(--accent-primary) 28%);
  --diff-hunk-text: color-mix(in srgb, var(--text-primary) 82%, var(--accent-primary) 18%);
  --diff-add-bg: color-mix(in srgb, var(--bg-primary) 91%, var(--status-success) 9%);
  --diff-add-accent: color-mix(in srgb, var(--status-success) 68%, var(--bg-primary) 32%);
  --diff-add-gutter-bg: color-mix(in srgb, var(--bg-secondary) 82%, var(--status-success) 18%);
  --diff-add-gutter-text: color-mix(in srgb, var(--text-primary) 84%, var(--status-success) 16%);
  --diff-add-text: color-mix(in srgb, var(--text-primary) 96%, var(--status-success) 4%);
  --diff-del-bg: color-mix(in srgb, var(--bg-primary) 84%, var(--status-error) 16%);
  --diff-del-accent: color-mix(in srgb, var(--status-error) 80%, var(--bg-primary) 20%);
  --diff-del-gutter-bg: color-mix(in srgb, var(--bg-secondary) 70%, var(--status-error) 30%);
  --diff-del-gutter-text: color-mix(in srgb, var(--text-primary) 72%, var(--status-error) 28%);
  --diff-del-text: color-mix(in srgb, var(--text-primary) 84%, var(--status-error) 16%);

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

.diff-lines {
  display: flex;
  flex-direction: column;
  min-width: 100%;
  width: max-content;
}

.diff-line {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: stretch;
  min-width: 100%;
  border-bottom: 1px solid var(--border-light);
  box-shadow: inset 3px 0 0 transparent;

  &.meta {
    background: var(--diff-meta-bg);
  }

  &.hunk {
    background: var(--diff-hunk-bg);

    .line-gutter,
    .line-text {
      color: var(--diff-hunk-text);
    }
  }

  &.addition {
    background: var(--diff-add-bg);
    box-shadow: inset 3px 0 0 var(--diff-add-accent);
  }

  &.deletion {
    background: var(--diff-del-bg);
    box-shadow: inset 3px 0 0 var(--diff-del-accent);
  }
}

.line-gutter {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: calc(11px * var(--viewer-scale));
  font-weight: 700;
  font-family: var(--font-mono);

  .meta &,
  .hunk & {
    background: color-mix(in srgb, var(--bg-secondary) 86%, var(--bg-primary) 14%);
  }

  .addition & {
    color: var(--diff-add-gutter-text);
    background: var(--diff-add-gutter-bg);
    border-right-color: color-mix(in srgb, var(--diff-add-accent) 58%, var(--border-color) 42%);
  }

  .deletion & {
    color: var(--diff-del-gutter-text);
    background: var(--diff-del-gutter-bg);
    border-right-color: color-mix(in srgb, var(--diff-del-accent) 58%, var(--border-color) 42%);
  }
}

.line-text {
  display: block;
  margin: 0;
  padding: calc(6px * var(--viewer-scale)) calc(12px * var(--viewer-scale));
  white-space: pre;
  color: var(--text-primary);
  font-size: calc(12.5px * var(--viewer-scale));
  line-height: 1.55;
  font-family: var(--font-mono);

  .meta & {
    color: var(--text-secondary);
  }

  .addition & {
    color: var(--diff-add-text);
  }

  .deletion & {
    color: var(--diff-del-text);
  }
}
</style>
