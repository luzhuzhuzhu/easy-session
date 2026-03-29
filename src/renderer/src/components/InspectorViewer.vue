<template>
  <section class="panel-viewer" @wheel.capture="emit('viewer-wheel', $event)">
    <div class="viewer-header">
      <div class="viewer-copy">
        <div class="viewer-title">{{ viewerTitle }}</div>
        <div v-if="selectedRelativePath" class="viewer-subtitle-row">
          <span
            v-if="changeViewerBadge"
            class="viewer-source-badge"
            :class="`viewer-source-badge--${selectedChangeViewMode}`"
          >
            {{ changeViewerBadge }}
          </span>
          <div
            class="viewer-subtitle"
            :title="selectedRelativePath"
          >
            {{ selectedRelativePath }}
          </div>
        </div>
      </div>
    </div>

    <div class="viewer-content">
      <button
        v-if="selectedRelativePath"
        class="viewer-refresh-btn"
        type="button"
        :disabled="loadingDiff || loadingPreview"
        :title="$t('inspector.refreshFile')"
        @click="emit('refresh-current-file')"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M14 8a6 6 0 11-1.76-4.24M12 2v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <DiffViewer
        v-if="currentViewerMode === 'diff'"
        :diff="gitDiff ?? ''"
        :zoom-percent="viewerZoomPercent"
        :message="viewerMessage"
      />
      <MarkdownPreview
        v-else-if="currentViewerMode === 'markdown'"
        :content="filePreviewContent ?? ''"
        :source-path="filePreviewAbsolutePath"
        :zoom-percent="viewerZoomPercent"
      />
      <TextFileViewer
        v-else-if="currentViewerMode === 'text'"
        :content="filePreviewContent ?? ''"
        :zoom-percent="viewerZoomPercent"
      />
      <TextFileViewer
        v-else
        content=""
        :zoom-percent="viewerZoomPercent"
        :message="viewerMessage"
      />

      <div v-if="showCommitBox" class="commit-box">
        <input
          :value="commitMessage"
          type="text"
          class="commit-input"
          :placeholder="$t('inspector.commitPlaceholder')"
          @input="emit('update:commit-message', ($event.target as HTMLInputElement).value)"
          @keydown.ctrl.enter="emit('commit')"
        />
        <button
          class="commit-btn"
          type="button"
          :disabled="!commitMessage.trim() || committing"
          @click="emit('commit')"
        >
          {{ $t('inspector.commitButton') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import type { InspectorViewerMode } from '@/features/inspector/types'
import TextFileViewer from '@/components/TextFileViewer.vue'

const DiffViewer = defineAsyncComponent(() => import('@/components/DiffViewer.vue'))
const MarkdownPreview = defineAsyncComponent(() => import('@/components/MarkdownPreview.vue'))

defineProps<{
  viewerTitle: string
  selectedRelativePath: string | null
  changeViewerBadge: string
  selectedChangeViewMode: 'staged' | 'unstaged' | 'auto'
  loadingDiff: boolean
  loadingPreview: boolean
  currentViewerMode: InspectorViewerMode
  gitDiff: string | null
  viewerZoomPercent: number
  viewerMessage: string | null
  filePreviewContent: string | null
  filePreviewAbsolutePath?: string | null
  showCommitBox: boolean
  commitMessage: string
  committing: boolean
}>()

const emit = defineEmits<{
  'viewer-wheel': [event: WheelEvent]
  'refresh-current-file': []
  'update:commit-message': [value: string]
  commit: []
}>()

useI18n()
</script>

<style scoped lang="scss">
.panel-viewer {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-primary);
  display: grid;
  grid-template-rows: auto 1fr;
}

.viewer-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.viewer-copy {
  min-width: 0;
  flex: 1;
}

.viewer-title {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.viewer-subtitle {
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.viewer-subtitle-row {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.viewer-source-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 48px;
  height: 18px;
  padding: 0 7px;
  border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-secondary) 84%, var(--bg-primary) 16%);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.viewer-source-badge--staged {
  color: var(--accent-primary);
  border-color: color-mix(in srgb, var(--accent-primary) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary) 90%);
}

.viewer-source-badge--unstaged {
  color: var(--status-warning);
  border-color: color-mix(in srgb, var(--status-warning) 28%, var(--border-color) 72%);
  background: color-mix(in srgb, var(--status-warning) 10%, var(--bg-secondary) 90%);
}

.viewer-content {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.viewer-refresh-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  height: 26px;
  width: 26px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 160ms ease, color 140ms ease, background 140ms ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.viewer-content:hover .viewer-refresh-btn {
  opacity: 1;
}

.commit-box {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.commit-input {
  flex: 1;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 12px;

  &:focus {
    outline: none;
    border-color: var(--accent-primary);
  }

  &::placeholder {
    color: var(--text-muted);
  }
}

.commit-btn {
  height: 28px;
  padding: 0 14px;
  border: 1px solid var(--accent-primary);
  border-radius: 4px;
  background: var(--accent-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 140ms ease;

  &:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
