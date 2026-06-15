<template>
  <section class="history-workbench">
    <div class="history-stage">
      <div v-if="showBranchSelect" class="history-stage-toolbar">
        <GitBranchSelect
          :current-branch="currentBranch"
          :viewed-branch="viewedBranch"
          :branches="branches"
          :loading="loadingBranches"
          @select-branch="emit('select-branch', $event)"
        />
        <div
          v-if="historySyncMessage"
          class="history-sync-summary"
          :class="{ error: hasSyncError }"
          :title="historySyncMessage"
        >
          {{ historySyncMessage }}
        </div>
        <div v-if="historySyncDetails.length" class="history-sync-details">
          <span
            v-for="detail in historySyncDetails"
            :key="detail.key"
            class="history-sync-chip"
            :class="`tone-${detail.tone}`"
            :title="`${detail.label}: ${detail.value}`"
          >
            <span class="history-sync-chip-label">{{ detail.label }}</span>
            <span class="history-sync-chip-value">{{ detail.value }}</span>
          </span>
        </div>
        <div class="history-sync-actions">
          <Button
            size="sm"
            :disabled="!canFetchSync || syncingGitRemote !== null"
            :title="syncActionTitle($t('inspector.history.fetchAction'))"
            :aria-label="$t('inspector.history.fetchAction')"
            @click="emit('fetch')"
          >
            <span v-if="syncingGitRemote === 'fetch'">{{ $t('inspector.loading') }}</span>
            <span v-else>{{ $t('inspector.history.fetchAction') }}</span>
          </Button>
          <Button
            size="sm"
            :disabled="!canPullSync || syncingGitRemote !== null"
            :title="syncActionTitle($t('inspector.history.pullAction'))"
            :aria-label="$t('inspector.history.pullAction')"
            @click="emit('pull')"
          >
            <span v-if="syncingGitRemote === 'pull'">{{ $t('inspector.loading') }}</span>
            <span v-else>{{ $t('inspector.history.pullAction') }}</span>
          </Button>
          <Button
            size="sm"
            :disabled="!canPushSync || syncingGitRemote !== null"
            :title="syncActionTitle($t('inspector.history.pushAction'))"
            :aria-label="$t('inspector.history.pushAction')"
            @click="emit('push')"
          >
            <span v-if="syncingGitRemote === 'push'">{{ $t('inspector.loading') }}</span>
            <span v-else>{{ $t('inspector.history.pushAction') }}</span>
          </Button>
        </div>
      </div>

      <GitHistoryTree
        :commits="commits"
        :has-more="hasMore"
        :loading="loadingGitLog"
        :selected-hash="selectedHash"
        :message="historyMessage"
        @select="emit('select-history', $event)"
        @load-more="emit('load-more')"
      />

      <div
        class="sidebar-resize-handle history-resize-handle"
        :class="{ compact }"
        @pointerdown="emit('start-resize', $event)"
      />
    </div>

    <section class="history-detail-panel" @wheel.capture="emit('viewer-wheel', $event)">
      <div class="viewer-header history-viewer-header">
        <div class="viewer-copy">
          <div class="viewer-title">{{ historyViewerTitle }}</div>
          <div
            v-if="selectedCommitHash"
            class="viewer-subtitle commit-inline-meta"
            :title="selectedCommitHash"
          >
            <span class="commit-hash">{{ selectedCommitHash.slice(0, 7) }}</span>
            <span class="commit-files-count">{{ selectedCommitChanges?.changes.length ?? 0 }} files</span>
          </div>
        </div>
      </div>

      <div class="viewer-content history-viewer-content" :class="{ 'commit-detail-mode': showCommitChanges }">
        <template v-if="showCommitChanges">
          <div class="commit-changes-list">
            <button
              v-for="change in selectedCommitChanges?.changes ?? []"
              :key="change.path"
              class="change-item"
              type="button"
              @click="emit('select-commit-file', change.path)"
            >
              <span class="change-status" :class="change.status">{{ changeStatusLetter(change.status) }}</span>
              <span class="change-path">{{ change.path }}</span>
            </button>
          </div>
          <DiffViewer
            v-if="commitDiff"
            :diff="commitDiff"
            :zoom-percent="viewerZoomPercent"
          />
          <TextFileViewer
            v-else
            content=""
            :zoom-percent="viewerZoomPercent"
            :message="historyDetailMessage"
          />
        </template>
        <TextFileViewer
          v-else
          content=""
          :zoom-percent="viewerZoomPercent"
          :message="historySelectionMessage"
        />
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import GitBranchSelect from '@/components/GitBranchSelect.vue'
import GitHistoryTree from '@/components/GitHistoryTree.vue'
import TextFileViewer from '@/components/TextFileViewer.vue'
import Button from '@/components/ui/Button.vue'
import type {
  ProjectGitBranchItem,
  ProjectGitCommitChangesResult,
  ProjectGitCommitItem
} from '@/api/local-project'

const DiffViewer = defineAsyncComponent(() => import('@/components/DiffViewer.vue'))

type HistorySyncDetail = {
  key: string
  label: string
  value: string
  tone: 'default' | 'incoming' | 'outgoing' | 'warning'
}

const props = defineProps<{
  compact: boolean
  showBranchSelect: boolean
  currentBranch: string | null
  viewedBranch: string | null
  branches: ProjectGitBranchItem[]
  loadingBranches: boolean
  historySyncMessage: string
  historySyncDetails: HistorySyncDetail[]
  hasSyncError: boolean
  canFetchSync: boolean
  canPullSync: boolean
  canPushSync: boolean
  syncingGitRemote: 'fetch' | 'pull' | 'push' | null
  commits: ProjectGitCommitItem[]
  hasMore: boolean
  loadingGitLog: boolean
  selectedHash: string | null
  historyMessage: string | null
  historyViewerTitle: string
  selectedCommitHash: string | null
  selectedCommitChanges: ProjectGitCommitChangesResult | null
  commitDiff: string | null
  viewerZoomPercent: number
  historyDetailMessage: string | null
  historySelectionMessage: string | null
  showCommitChanges: boolean
}>()

const emit = defineEmits<{
  'select-branch': [branchName: string]
  fetch: []
  pull: []
  push: []
  'select-history': [commit: { hash: string; kind?: string }]
  'load-more': []
  'start-resize': [event: PointerEvent]
  'viewer-wheel': [event: WheelEvent]
  'select-commit-file': [path: string]
}>()

function changeStatusLetter(status: string): string {
  switch (status) {
    case 'added': return 'A'
    case 'deleted': return 'D'
    case 'modified': return 'M'
    case 'renamed': return 'R'
    case 'copied': return 'C'
    default: return 'M'
  }
}

function syncActionTitle(action: string): string {
  const details = props.historySyncDetails.map((detail) => `${detail.label}: ${detail.value}`).join('\n')
  return details ? `${action}\n${details}` : action
}
</script>

<style scoped lang="scss">
.history-workbench {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(96px, var(--history-stage-width, 220px)) minmax(0, 1fr);
}

.history-stage {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--bg-secondary);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.history-stage-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px 10px 6px;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 76%, transparent);
  background: color-mix(in srgb, var(--bg-secondary) 86%, var(--bg-primary) 14%);
}

.history-sync-details {
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  gap: 4px;
  overflow: hidden;
}

.history-sync-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 148px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  background: color-mix(in srgb, var(--bg-card) 82%, transparent);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  line-height: 20px;
  white-space: nowrap;

  &.tone-incoming {
    border-color: color-mix(in srgb, var(--accent-primary) 28%, var(--border-color));
    color: var(--accent-primary);
  }

  &.tone-outgoing {
    border-color: color-mix(in srgb, var(--warning-color) 34%, var(--border-color));
    color: var(--warning-color);
  }

  &.tone-warning {
    border-color: color-mix(in srgb, var(--error-color) 30%, var(--border-color));
    color: var(--error-color);
  }
}

.history-sync-chip-label {
  flex-shrink: 0;
  color: var(--text-muted);
}

.history-sync-chip-value {
  min-width: 0;
  overflow: hidden;
  color: currentColor;
  font-weight: 700;
  text-overflow: ellipsis;
}

.history-sync-summary {
  min-width: 0;
  flex: 1;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.error {
    color: var(--status-error);
  }
}

.history-sync-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.history-detail-panel {
  min-width: 0;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  background: var(--bg-primary);
}

.history-viewer-header {
  border-bottom-color: color-mix(in srgb, var(--border-color) 82%, transparent);
}

.history-viewer-content {
  padding-top: 0;

  &.commit-detail-mode {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }
}

.commit-inline-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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

.viewer-content {
  position: relative;
  min-height: 0;
  overflow: hidden;
}

.commit-hash {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-primary);
}

.commit-files-count {
  font-size: 11px;
  color: var(--text-muted);
}

.commit-changes-list {
  min-height: 0;
  max-height: 200px;
  overflow-y: auto;
  border-bottom: 1px solid var(--border-color);
}

.change-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }
}

.change-status {
  width: 16px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;

  &.added { color: var(--success-color); }
  &.deleted { color: var(--error-color); }
  &.modified { color: var(--accent-primary); }
  &.renamed { color: var(--warning-color); }
  &.copied { color: var(--text-muted); }
}

.change-path {
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-resize-handle {
  position: absolute;
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;
  background: transparent;
}

.sidebar-resize-handle.compact.history-resize-handle {
  top: auto;
  right: auto;
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 10px;
  cursor: row-resize;
}

:deep(.history-stage-tree) {
  min-width: 0;
  min-height: 0;
}

@media (max-width: 599px) {
  .history-workbench {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(120px, var(--history-stage-height, 180px)) minmax(0, 1fr);
  }

  .history-stage {
    border-bottom: 1px solid var(--border-color);
  }
}
</style>
