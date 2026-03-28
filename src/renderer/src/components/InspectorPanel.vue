<template>
  <aside
    ref="panelRef"
    class="inspector-panel"
    :class="{
      collapsed: !inspectorStore.panelOpen,
      compact: isCompactPanel
    }"
    :style="panelStyle"
  >
    <div class="edge-toggle-anchor">
      <div class="edge-toggle-zone" />
      <button
        class="edge-toggle-btn"
        :class="{ open: inspectorStore.panelOpen, closed: !inspectorStore.panelOpen }"
        type="button"
        :title="inspectorStore.panelOpen ? $t('inspector.close') : $t('inspector.open')"
        @click="inspectorStore.setPanelOpen(!inspectorStore.panelOpen)"
      >
        <svg class="edge-toggle-icon" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 4L6 8L10 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <template v-if="inspectorStore.panelOpen">
      <div class="resize-handle" @pointerdown="startResize" />

      <header class="panel-header">
        <div class="header-main">
          <div class="header-left">
            <nav v-if="inspectorStore.sidebarVisible" class="inline-tabs">
              <button
                v-for="tab in tabs"
                :key="tab.value"
                class="inline-tab-btn"
                :class="{ active: inspectorStore.activeTab === tab.value }"
                type="button"
                :title="tab.label"
                @click="inspectorStore.setActiveTab(tab.value)"
              >
                <svg v-if="tab.value === 'changes'" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="3" r="2" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="3" cy="13" r="2" stroke="currentColor" stroke-width="1.5"/>
                  <circle cx="13" cy="13" r="2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M8 5v3M5 11l2-2m4 2l-2-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                <svg v-else-if="tab.value === 'files'" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M2 3h5l2 2h5v8H2V3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                </svg>
                <svg v-else width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5"/>
                </svg>
              </button>
            </nav>
          </div>

          <div class="header-right">
            <button
              v-if="!isHistoryTab"
              class="mini-toggle-btn icon-btn"
              :class="{ active: inspectorStore.sidebarVisible }"
              type="button"
              :title="inspectorStore.sidebarVisible ? $t('inspector.hideSidebar') : $t('inspector.showSidebar')"
              @click="inspectorStore.setSidebarVisible(!inspectorStore.sidebarVisible)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 3h12v10H2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
                <path d="M6 3v10" stroke="currentColor" stroke-width="1.5"/>
              </svg>
            </button>
            <button
              v-if="!isHistoryTab && inspectorStore.sidebarVisible"
              class="mini-toggle-btn icon-btn"
              :class="{ active: inspectorStore.sidebarAutoCollapse }"
              type="button"
              :title="$t('inspector.sidebarAutoCollapse')"
              @click="handleSidebarAutoCollapseToggle(!inspectorStore.sidebarAutoCollapse)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                <path d="M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div ref="zoomControlRef" class="viewer-zoom-control">
              <button
                class="mini-btn viewer-zoom-btn"
                type="button"
                :title="`${t('terminal.zoomPresets')} / ${t('terminal.resetZoom')}`"
                @click.stop="toggleZoomMenu"
                @dblclick.stop="resetViewerZoom"
              >
                {{ viewerZoomPercent }}%
              </button>
              <div v-if="zoomMenuOpen" class="viewer-zoom-menu" @click.stop>
                <button
                  v-for="percent in ZOOM_PRESET_PERCENTS"
                  :key="percent"
                  class="viewer-zoom-item"
                  :class="{ active: percent === viewerZoomPercent }"
                  type="button"
                  @click="setViewerZoom(percent)"
                >
                  {{ percent }}%
                </button>
              </div>
            </div>
            <button class="ghost-btn utility-btn icon-btn" type="button" :title="$t('inspector.refresh')" @click="inspectorStore.refresh()">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M14 8a6 6 0 11-1.76-4.24M12 2v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <button
              class="mini-toggle-btn icon-btn"
              :class="{ active: inspectorStore.autoFollowActivePaneProject }"
              type="button"
              :title="$t('inspector.followActivePane')"
              @click="handleFollowToggle(!inspectorStore.autoFollowActivePaneProject)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M6.5 9.5l3-3M9 4h2a3 3 0 010 6H9M7 12H5a3 3 0 010-6h2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
              </svg>
            </button>
            <select
              class="project-select compact-select"
              :title="projectSelectTitle"
              :disabled="inspectorStore.autoFollowActivePaneProject"
              :value="projectSelectValue"
              @change="handleManualProjectChange(($event.target as HTMLSelectElement).value)"
            >
              <option value="">{{ projectSelectPlaceholder }}</option>
              <option
                v-for="option in inspectorStore.manualProjectOptions"
                :key="option.key"
                :value="option.projectPath"
              >
                {{ option.projectName }}
              </option>
            </select>
          </div>
        </div>
      </header>

      <div v-if="!inspectorStore.currentProjectOption" class="panel-empty">
        {{ $t('inspector.noProjectHint') }}
      </div>

      <div
        v-else
        ref="panelBodyRef"
        class="panel-body"
        :class="{
          'history-layout': isHistoryTab,
          'has-sidebar': inspectorStore.sidebarVisible,
          'sidebar-auto-collapse': inspectorStore.sidebarAutoCollapse,
          'sidebar-expanded': isSidebarExpanded
        }"
        :style="panelBodyStyle"
      >
        <template v-if="isHistoryTab">
          <section class="history-workbench">
            <div class="history-stage">
              <div v-if="showBranchSelect" class="history-stage-toolbar">
                <GitBranchSelect
                  :current-branch="inspectorStore.gitBranches?.currentBranch ?? null"
                  :viewed-branch="inspectorStore.viewedBranchName"
                  :branches="inspectorStore.gitBranches?.branches ?? []"
                  :loading="inspectorStore.loadingBranches"
                  @select-branch="handleBranchSelect"
                />
                <div
                  v-if="historySyncMessage"
                  class="history-sync-summary"
                  :class="{ error: !!inspectorStore.gitSyncError }"
                  :title="historySyncMessage"
                >
                  {{ historySyncMessage }}
                </div>
                <div class="history-sync-actions">
                  <button
                    class="history-sync-btn"
                    type="button"
                    :disabled="!canFetchHistorySync || inspectorStore.syncingGitRemote !== null"
                    :title="$t('inspector.history.fetchAction')"
                    @click="inspectorStore.fetchGitRemote()"
                  >
                    <span v-if="inspectorStore.syncingGitRemote === 'fetch'">{{ $t('inspector.loading') }}</span>
                    <span v-else>{{ $t('inspector.history.fetchAction') }}</span>
                  </button>
                  <button
                    class="history-sync-btn"
                    type="button"
                    :disabled="!canPullHistorySync || inspectorStore.syncingGitRemote !== null"
                    :title="$t('inspector.history.pullAction')"
                    @click="inspectorStore.pullGitCurrentBranch()"
                  >
                    <span v-if="inspectorStore.syncingGitRemote === 'pull'">{{ $t('inspector.loading') }}</span>
                    <span v-else>{{ $t('inspector.history.pullAction') }}</span>
                  </button>
                  <button
                    class="history-sync-btn"
                    type="button"
                    :disabled="!canPushHistorySync || inspectorStore.syncingGitRemote !== null"
                    :title="$t('inspector.history.pushAction')"
                    @click="inspectorStore.pushGitCurrentBranch()"
                  >
                    <span v-if="inspectorStore.syncingGitRemote === 'push'">{{ $t('inspector.loading') }}</span>
                    <span v-else>{{ $t('inspector.history.pushAction') }}</span>
                  </button>
                </div>
              </div>
              <GitHistoryTree
                class="history-stage-tree"
                :commits="inspectorStore.gitLog?.commits ?? []"
                :has-more="inspectorStore.gitLog?.hasMore ?? false"
                :loading="inspectorStore.loadingGitLog"
                :selected-hash="inspectorStore.selectedCommitHash"
                :message="historyMessage"
                @select="handleHistorySelect"
                @load-more="inspectorStore.loadMoreGitLog"
              />
              <div
                class="sidebar-resize-handle history-resize-handle"
                :class="{ compact: isCompactPanel }"
                @pointerdown="startSidebarResize"
              />
            </div>

            <section class="history-detail-panel" @wheel.capture="handleViewerWheel">
              <div class="viewer-header history-viewer-header">
                <div class="viewer-copy">
                  <div class="viewer-title">{{ historyViewerTitle }}</div>
                  <div
                    v-if="inspectorStore.selectedCommitHash"
                    class="viewer-subtitle commit-inline-meta"
                    :title="inspectorStore.selectedCommitHash"
                  >
                    <span class="commit-hash">{{ inspectorStore.selectedCommitHash.slice(0, 7) }}</span>
                    <span class="commit-files-count">{{ inspectorStore.selectedCommitChanges?.changes.length ?? 0 }} files</span>
                  </div>
                </div>
              </div>

              <div class="viewer-content history-viewer-content" :class="{ 'commit-detail-mode': showCommitChanges }">
                <template v-if="showCommitChanges">
                  <div class="commit-changes-list">
                    <button
                      v-for="change in inspectorStore.selectedCommitChanges?.changes ?? []"
                      :key="change.path"
                      class="change-item"
                      type="button"
                      @click="handleCommitFileSelect(change.path)"
                    >
                      <span class="change-status" :class="change.status">{{ changeStatusLetter(change.status) }}</span>
                      <span class="change-path">{{ change.path }}</span>
                    </button>
                  </div>
                  <DiffViewer
                    v-if="inspectorStore.commitDiff"
                    :diff="inspectorStore.commitDiff"
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
        <template v-else>
          <div
            v-if="inspectorStore.sidebarVisible && inspectorStore.sidebarAutoCollapse"
            class="sidebar-hover-zone"
            :class="{ compact: isCompactPanel }"
            @pointerenter="handleSidebarPointerEnter"
          />
          <section
            v-if="inspectorStore.sidebarVisible"
            class="panel-sidebar"
            :class="{
              compact: isCompactPanel,
              collapsed: !isSidebarExpanded
            }"
            @pointerenter="handleSidebarPointerEnter"
            @pointerleave="handleSidebarPointerLeave"
          >
            <div class="sidebar-scroll">
              <GitChangesTree
                v-if="inspectorStore.activeTab === 'changes'"
                :items="inspectorStore.gitStatus?.items ?? []"
                :selected-relative-path="inspectorStore.selectedRelativePath"
                :selected-view-mode="inspectorStore.selectedChangeViewMode"
                :message="changesMessage"
                @select="handleChangeSelect"
                @stage="inspectorStore.stageFile"
                @unstage="inspectorStore.unstageFile"
                @discard="inspectorStore.discardFile"
              />

              <div v-else class="files-wrap">
                <div v-if="inspectorStore.loadingRoot" class="tree-message">{{ $t('inspector.loading') }}</div>
                <div
                  v-else-if="!Object.keys(inspectorStore.fileTreeByParent).length"
                  class="tree-message"
                >
                  {{ $t('inspector.emptyFiles') }}
                </div>
                <ProjectFilesTree
                  v-else
                  :tree-index="inspectorStore.fileTreeByParent"
                  :loading-directories="inspectorStore.loadingDirectories"
                  :expanded-paths="inspectorStore.expandedDirectories"
                  :selected-relative-path="inspectorStore.selectedRelativePath"
                  @toggle-directory="inspectorStore.toggleDirectory"
                  @select-file="inspectorStore.selectFile"
                />
              </div>
            </div>
            <div
              v-if="isSidebarExpanded"
              class="sidebar-resize-handle"
              :class="{ compact: isCompactPanel }"
              @pointerdown="startSidebarResize"
            />
          </section>

          <section class="panel-viewer" @wheel.capture="handleViewerWheel">
            <div class="viewer-header">
              <div class="viewer-copy">
                <div class="viewer-title">{{ viewerTitle }}</div>
                <div v-if="inspectorStore.selectedRelativePath" class="viewer-subtitle-row">
                  <span
                    v-if="changeViewerBadge"
                    class="viewer-source-badge"
                    :class="`viewer-source-badge--${inspectorStore.selectedChangeViewMode}`"
                  >
                    {{ changeViewerBadge }}
                  </span>
                  <div
                    class="viewer-subtitle"
                    :title="inspectorStore.selectedRelativePath"
                  >
                    {{ inspectorStore.selectedRelativePath }}
                  </div>
                </div>
              </div>
            </div>

            <div class="viewer-content">
              <button
                v-if="inspectorStore.selectedRelativePath"
                class="viewer-refresh-btn"
                type="button"
                :disabled="inspectorStore.loadingDiff || inspectorStore.loadingPreview"
                :title="$t('inspector.refreshFile')"
                @click="handleRefreshCurrentFile"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M14 8a6 6 0 11-1.76-4.24M12 2v4h-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>

              <DiffViewer
                v-if="inspectorStore.currentViewerMode === 'diff'"
                :diff="inspectorStore.gitDiff?.diff ?? ''"
                :zoom-percent="viewerZoomPercent"
                :message="inspectorStore.viewerMessage"
              />
              <MarkdownPreview
                v-else-if="inspectorStore.currentViewerMode === 'markdown'"
                :content="inspectorStore.filePreview?.content ?? ''"
                :source-path="inspectorStore.filePreview?.absolutePath"
                :zoom-percent="viewerZoomPercent"
              />
              <TextFileViewer
                v-else-if="inspectorStore.currentViewerMode === 'text'"
                :content="inspectorStore.filePreview?.content ?? ''"
                :zoom-percent="viewerZoomPercent"
              />
              <TextFileViewer
                v-else
                content=""
                :zoom-percent="viewerZoomPercent"
                :message="inspectorStore.viewerMessage"
              />

              <div v-if="showCommitBox" class="commit-box">
                <input
                  v-model="commitMessage"
                  type="text"
                  class="commit-input"
                  :placeholder="$t('inspector.commitPlaceholder')"
                  @keydown.ctrl.enter="handleCommit"
                />
                <button
                  class="commit-btn"
                  type="button"
                  :disabled="!commitMessage.trim() || committing"
                  @click="handleCommit"
                >
                  {{ $t('inspector.commitButton') }}
                </button>
              </div>
            </div>
          </section>
        </template>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import DiffViewer from '@/components/DiffViewer.vue'
import GitBranchSelect from '@/components/GitBranchSelect.vue'
import GitChangesTree from '@/components/GitChangesTree.vue'
import GitHistoryTree from '@/components/GitHistoryTree.vue'
import MarkdownPreview from '@/components/MarkdownPreview.vue'
import ProjectFilesTree from '@/components/ProjectFilesTree.vue'
import TextFileViewer from '@/components/TextFileViewer.vue'
import { useInspectorStore } from '@/stores/inspector'

defineOptions({ name: 'InspectorPanel' })

const INSPECTOR_WIDTH_KEY = 'easysession.inspector.width'
const INSPECTOR_ZOOM_KEY = 'easysession.inspector.zoom'
const INSPECTOR_SIDEBAR_WIDTH_KEY = 'easysession.inspector.sidebar-width'
const INSPECTOR_SIDEBAR_HEIGHT_KEY = 'easysession.inspector.sidebar-height'
const INSPECTOR_MIN_WIDTH = 420
const INSPECTOR_MAX_WIDTH = 920
const INSPECTOR_DEFAULT_WIDTH = 520
const INSPECTOR_COMPACT_WIDTH = 600
const INSPECTOR_SIDEBAR_MIN_WIDTH = 180
const INSPECTOR_HISTORY_STAGE_MIN_WIDTH = 96
const INSPECTOR_SIDEBAR_MAX_WIDTH = 420
const INSPECTOR_SIDEBAR_DEFAULT_WIDTH = 220
const INSPECTOR_SIDEBAR_MIN_HEIGHT = 132
const INSPECTOR_SIDEBAR_MAX_HEIGHT = 320
const INSPECTOR_SIDEBAR_DEFAULT_HEIGHT = 180
const VIEWER_MIN_ZOOM = 80
const VIEWER_MAX_ZOOM = 150
const VIEWER_DEFAULT_ZOOM = 100
const ZOOM_PRESET_PERCENTS = [80, 90, 100, 110, 125, 150] as const

const { t } = useI18n()
const inspectorStore = useInspectorStore()
const panelRef = ref<HTMLElement | null>(null)
const panelBodyRef = ref<HTMLElement | null>(null)
const zoomControlRef = ref<HTMLElement | null>(null)
const panelWidth = ref(readStoredWidth())
const actualPanelWidth = ref(panelWidth.value)
const viewerZoomPercent = ref(readStoredZoom())
const sidebarWidth = ref(readStoredSidebarWidth())
const sidebarHeight = ref(readStoredSidebarHeight())
const sidebarHovered = ref(false)
const sidebarPointerInside = ref(false)
const sidebarResizeLocked = ref(false)
const zoomMenuOpen = ref(false)
const commitMessage = ref('')
const committing = ref(false)

let resizeObserver: ResizeObserver | null = null
let stopResize: (() => void) | null = null
let stopSidebarResize: (() => void) | null = null
let teardownGlobalListeners: (() => void) | null = null
let sidebarHoverCloseTimer: number | null = null
let sidebarResizeCooldownTimer: number | null = null

const tabs = computed(() => [
  { value: 'changes', label: t('inspector.tabs.changes') },
  { value: 'files', label: t('inspector.tabs.files') },
  { value: 'history', label: t('inspector.tabs.history') }
] as const)

const panelStyle = computed(() => {
  if (!inspectorStore.panelOpen) return undefined
  const width = `${panelWidth.value}px`
  return {
    width,
    minWidth: width,
    maxWidth: width,
    flexBasis: width
  }
})

const isCompactPanel = computed(() => actualPanelWidth.value < INSPECTOR_COMPACT_WIDTH)
const isHistoryTab = computed(() => inspectorStore.activeTab === 'history')
const isSidebarExpanded = computed(() => {
  if (!inspectorStore.sidebarVisible) return false
  if (!inspectorStore.sidebarAutoCollapse) return true
  return sidebarHovered.value
})
const panelBodyStyle = computed(() => {
  if (isHistoryTab.value) {
    return {
      '--history-stage-width': `${sidebarWidth.value}px`,
      '--history-stage-height': `${sidebarHeight.value}px`
    }
  }

  if (!inspectorStore.sidebarVisible) {
    return {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr)'
    }
  }

  const sidebarSize = isCompactPanel.value
    ? `${isSidebarExpanded.value ? Math.max(sidebarHeight.value, INSPECTOR_SIDEBAR_MIN_HEIGHT) : 0}px`
    : `${isSidebarExpanded.value ? Math.max(sidebarWidth.value, INSPECTOR_SIDEBAR_MIN_WIDTH) : 0}px`

  return isCompactPanel.value
    ? {
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: `${sidebarSize} minmax(0, 1fr)`
      }
    : {
        gridTemplateColumns: `${sidebarSize} minmax(0, 1fr)`,
        gridTemplateRows: 'minmax(0, 1fr)'
      }
})

const changesMessage = computed(() => {
  if (inspectorStore.loadingRoot) return t('inspector.loading')
  if (inspectorStore.gitStatus?.state === 'non-git' || inspectorStore.gitStatus?.state === 'git-unavailable') {
    return inspectorStore.gitStatus.message
  }
  if (inspectorStore.gitStatus?.state === 'error') {
    return inspectorStore.gitStatus.message
  }
  return null
})

const viewerTitle = computed(() => {
  if (!inspectorStore.selectedRelativePath) {
    return inspectorStore.activeTab === 'changes'
      ? t('inspector.viewerTitles.diff')
      : t('inspector.viewerTitles.preview')
  }
  if (inspectorStore.selectionSource === 'changes') {
    if (inspectorStore.selectedChangeViewMode === 'staged') {
      return inspectorStore.currentViewerMode === 'diff'
        ? t('inspector.viewerTitles.stagedDiff')
        : t('inspector.viewerTitles.stagedPreview')
    }
    if (inspectorStore.selectedChangeViewMode === 'unstaged') {
      return inspectorStore.currentViewerMode === 'diff'
        ? t('inspector.viewerTitles.unstagedDiff')
        : t('inspector.viewerTitles.unstagedPreview')
    }
  }
  if (inspectorStore.currentViewerMode === 'diff') return t('inspector.viewerTitles.diff')
  return t('inspector.viewerTitles.preview')
})

const changeViewerBadge = computed(() => {
  if (inspectorStore.selectionSource !== 'changes') return ''
  if (inspectorStore.selectedChangeViewMode === 'staged') return t('inspector.staged')
  if (inspectorStore.selectedChangeViewMode === 'unstaged') return t('inspector.unstaged')
  return ''
})

const showBranchSelect = computed(() => {
  if (!inspectorStore.currentProjectOption) return false
  return inspectorStore.gitState === 'ready'
})

const historyMessage = computed(() => {
  if (inspectorStore.gitLog?.state === 'non-git') {
    return t('inspector.history.nonGit')
  }
  if (inspectorStore.gitLog?.state === 'git-unavailable') {
    return t('inspector.history.gitUnavailable')
  }
  if (inspectorStore.gitLog?.state === 'error') {
    return inspectorStore.gitLog.message
  }
  return null
})

const historyViewerTitle = computed(() => {
  if (!inspectorStore.selectedCommitHash) {
    return t('inspector.history.detailTitle')
  }
  return t('inspector.history.commit')
})

const currentSyncBranch = computed(() => {
  const currentBranch = inspectorStore.gitBranches?.currentBranch
  if (!currentBranch) return null
  return inspectorStore.gitBranches?.branches.find((branch) => branch.name === currentBranch) ?? null
})

const historySyncSummary = computed(() => {
  const branch = currentSyncBranch.value
  if (!branch) return ''
  const parts: string[] = []
  if (branch.ahead > 0) {
    parts.push(t('inspector.history.outgoingSummary', { branch: branch.upstream || branch.name, count: branch.ahead }))
  }
  if (branch.behind > 0) {
    parts.push(t('inspector.history.incomingSummary', { branch: branch.upstream || branch.name, count: branch.behind }))
  }
  return parts.join(' · ')
})

const historySyncMessage = computed(() => {
  return inspectorStore.gitSyncError || historySyncSummary.value
})

const canFetchHistorySync = computed(() => {
  return inspectorStore.gitState === 'ready'
})

const canPullHistorySync = computed(() => {
  const branch = currentSyncBranch.value
  return inspectorStore.gitState === 'ready' && !!branch?.upstream && (branch.behind > 0 || branch.ahead >= 0)
})

const canPushHistorySync = computed(() => {
  const branch = currentSyncBranch.value
  return inspectorStore.gitState === 'ready' && !!branch?.upstream && (branch.ahead > 0 || branch.behind >= 0)
})

const projectSelectValue = computed(() => {
  if (inspectorStore.autoFollowActivePaneProject) {
    return inspectorStore.currentProjectOption?.projectPath ?? ''
  }
  return inspectorStore.manualProjectPath ?? ''
})

const projectSelectPlaceholder = computed(() => {
  return inspectorStore.currentProjectLabel || t('inspector.projectShort')
})

const projectSelectTitle = computed(() => {
  return inspectorStore.currentProjectPath || t('inspector.manualProjectPlaceholder')
})

const historySelectionMessage = computed(() => {
  if (historyMessage.value) return historyMessage.value
  if (inspectorStore.loadingCommitChanges) return t('inspector.loading')
  return t('inspector.history.selectCommitHint')
})

const historyDetailMessage = computed(() => {
  if (inspectorStore.loadingCommitDiff) return t('inspector.loading')
  return t('inspector.history.selectCommitFileHint')
})

const showCommitBox = computed(() => {
  if (inspectorStore.activeTab !== 'changes') return false
  if (inspectorStore.gitState !== 'ready') return false
  const stagedCount = inspectorStore.gitStatus?.items.filter((item) => item.staged).length ?? 0
  return stagedCount > 0
})

const showCommitChanges = computed(() => {
  if (inspectorStore.activeTab !== 'history') return false
  return !!inspectorStore.selectedCommitHash
})

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

function handleCommitFileSelect(path: string): void {
  inspectorStore.loadCommitFileDiff(path)
}

function clampWidth(width: number): number {
  return Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, Math.round(width)))
}

function readStoredWidth(): number {
  const stored = window.localStorage.getItem(INSPECTOR_WIDTH_KEY)
  const parsed = Number(stored)
  if (!Number.isFinite(parsed)) return INSPECTOR_DEFAULT_WIDTH
  return clampWidth(parsed)
}

function clampZoom(percent: number): number {
  return Math.min(VIEWER_MAX_ZOOM, Math.max(VIEWER_MIN_ZOOM, Math.round(percent)))
}

function readStoredZoom(): number {
  const stored = Number(window.localStorage.getItem(INSPECTOR_ZOOM_KEY))
  if (!Number.isFinite(stored)) return VIEWER_DEFAULT_ZOOM
  return clampZoom(stored)
}

function readStoredSidebarWidth(): number {
  const stored = Number(window.localStorage.getItem(INSPECTOR_SIDEBAR_WIDTH_KEY))
  if (!Number.isFinite(stored)) return INSPECTOR_SIDEBAR_DEFAULT_WIDTH
  return Math.min(INSPECTOR_SIDEBAR_MAX_WIDTH, Math.max(INSPECTOR_HISTORY_STAGE_MIN_WIDTH, Math.round(stored)))
}

function readStoredSidebarHeight(): number {
  const stored = Number(window.localStorage.getItem(INSPECTOR_SIDEBAR_HEIGHT_KEY))
  if (!Number.isFinite(stored)) return INSPECTOR_SIDEBAR_DEFAULT_HEIGHT
  return Math.min(INSPECTOR_SIDEBAR_MAX_HEIGHT, Math.max(INSPECTOR_SIDEBAR_MIN_HEIGHT, Math.round(stored)))
}

function persistWidth(): void {
  window.localStorage.setItem(INSPECTOR_WIDTH_KEY, String(panelWidth.value))
}

function persistZoom(): void {
  window.localStorage.setItem(INSPECTOR_ZOOM_KEY, String(viewerZoomPercent.value))
}

function persistSidebarWidth(): void {
  window.localStorage.setItem(INSPECTOR_SIDEBAR_WIDTH_KEY, String(sidebarWidth.value))
}

function persistSidebarHeight(): void {
  window.localStorage.setItem(INSPECTOR_SIDEBAR_HEIGHT_KEY, String(sidebarHeight.value))
}

function clearSidebarHoverCloseTimer(): void {
  if (sidebarHoverCloseTimer == null) return
  window.clearTimeout(sidebarHoverCloseTimer)
  sidebarHoverCloseTimer = null
}

function clearSidebarResizeCooldownTimer(): void {
  if (sidebarResizeCooldownTimer == null) return
  window.clearTimeout(sidebarResizeCooldownTimer)
  sidebarResizeCooldownTimer = null
}

function scheduleSidebarAutoCollapse(delay = 390): void {
  if (!inspectorStore.sidebarAutoCollapse || sidebarResizeLocked.value) return
  clearSidebarHoverCloseTimer()
  sidebarHoverCloseTimer = window.setTimeout(() => {
    if (!sidebarPointerInside.value) {
      sidebarHovered.value = false
    }
    sidebarHoverCloseTimer = null
  }, delay)
}

function handleSidebarPointerEnter(): void {
  if (!inspectorStore.sidebarAutoCollapse) return
  sidebarPointerInside.value = true
  clearSidebarHoverCloseTimer()
  clearSidebarResizeCooldownTimer()
  sidebarHovered.value = true
}

function handleSidebarPointerLeave(): void {
  if (!inspectorStore.sidebarAutoCollapse) return
  sidebarPointerInside.value = false
  scheduleSidebarAutoCollapse()
}

function clampSidebarWidth(width: number): number {
  const minWidth = isHistoryTab.value ? INSPECTOR_HISTORY_STAGE_MIN_WIDTH : INSPECTOR_SIDEBAR_MIN_WIDTH
  const panelBoundsWidth = panelRef.value?.getBoundingClientRect().width ?? panelWidth.value
  const maxByPanel = Math.max(
    minWidth,
    Math.min(INSPECTOR_SIDEBAR_MAX_WIDTH, panelBoundsWidth - 180)
  )
  return Math.min(maxByPanel, Math.max(minWidth, Math.round(width)))
}

function clampSidebarHeight(height: number): number {
  const bodyBoundsHeight = panelBodyRef.value?.getBoundingClientRect().height ?? 0
  const maxByBody = bodyBoundsHeight > 0
    ? Math.max(INSPECTOR_SIDEBAR_MIN_HEIGHT, Math.min(INSPECTOR_SIDEBAR_MAX_HEIGHT, bodyBoundsHeight - 160))
    : INSPECTOR_SIDEBAR_MAX_HEIGHT
  return Math.min(maxByBody, Math.max(INSPECTOR_SIDEBAR_MIN_HEIGHT, Math.round(height)))
}

function updateActualWidth(): void {
  actualPanelWidth.value = panelRef.value?.getBoundingClientRect().width ?? panelWidth.value
}

function toggleZoomMenu(): void {
  zoomMenuOpen.value = !zoomMenuOpen.value
}

function setViewerZoom(percent: number): void {
  viewerZoomPercent.value = clampZoom(percent)
  zoomMenuOpen.value = false
  persistZoom()
}

function resetViewerZoom(): void {
  viewerZoomPercent.value = VIEWER_DEFAULT_ZOOM
  zoomMenuOpen.value = false
  persistZoom()
}

function handleFollowToggle(checked: boolean): void {
  inspectorStore.setAutoFollow(checked)
}

function handleSidebarAutoCollapseToggle(checked: boolean): void {
  inspectorStore.setSidebarAutoCollapse(checked)
  if (checked) {
    sidebarPointerInside.value = false
    sidebarHovered.value = false
    return
  }
  clearSidebarHoverCloseTimer()
  clearSidebarResizeCooldownTimer()
  sidebarHovered.value = true
}

function handleManualProjectChange(value: string): void {
  inspectorStore.setManualProjectPath(value || null)
}

function handleViewerWheel(event: WheelEvent): void {
  if (!(event.ctrlKey || event.metaKey)) return
  event.preventDefault()
  event.stopPropagation()
  const next = viewerZoomPercent.value + (event.deltaY < 0 ? 5 : -5)
  setViewerZoom(next)
}

function handleRefreshCurrentFile(): void {
  inspectorStore.refreshCurrentFile()
}

function handleChangeSelect(payload: { relativePath: string; viewMode: 'staged' | 'unstaged' }): void {
  inspectorStore.selectChangedFile(payload.relativePath, payload.viewMode)
}

async function handleCommit(): Promise<void> {
  if (!commitMessage.value.trim() || committing.value) return
  committing.value = true
  try {
    await inspectorStore.commitChanges(commitMessage.value.trim())
    commitMessage.value = ''
  } finally {
    committing.value = false
  }
}

function handleHistorySelect(commit: { hash: string; kind?: string }): void {
  if (commit.kind === 'incoming-changes' || commit.kind === 'outgoing-changes') {
    inspectorStore.clearSelectedCommit()
    return
  }
  inspectorStore.selectCommit(commit.hash)
}

function handleBranchSelect(branchName: string): void {
  inspectorStore.inspectBranch(branchName)
}

function startResize(event: PointerEvent): void {
  if (!inspectorStore.panelOpen) return

  event.preventDefault()
  const startX = event.clientX
  const startWidth = panelRef.value?.getBoundingClientRect().width ?? panelWidth.value

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const nextWidth = clampWidth(startWidth + (startX - moveEvent.clientX))
    panelWidth.value = nextWidth
    actualPanelWidth.value = nextWidth
  }

  const handlePointerUp = () => {
    persistWidth()
    cleanupResize()
  }

  const cleanupResize = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    stopResize = null
  }

  stopResize?.()
  stopResize = cleanupResize
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

function startSidebarResize(event: PointerEvent): void {
  if (!inspectorStore.panelOpen) return
  if (!isHistoryTab.value && !inspectorStore.sidebarVisible) return

  event.preventDefault()
  event.stopPropagation()
  if (!isHistoryTab.value) {
    sidebarResizeLocked.value = true
    sidebarPointerInside.value = true
    handleSidebarPointerEnter()
  }

  const startX = event.clientX
  const startY = event.clientY
  const startSize = isHistoryTab.value
    ? (isCompactPanel.value ? sidebarHeight.value : sidebarWidth.value)
    : isCompactPanel.value
      ? sidebarHeight.value
      : sidebarWidth.value

  const handlePointerMove = (moveEvent: PointerEvent) => {
    if (isHistoryTab.value) {
      if (isCompactPanel.value) {
        sidebarHeight.value = clampSidebarHeight(startSize + (moveEvent.clientY - startY))
      } else {
        sidebarWidth.value = clampSidebarWidth(startSize + (moveEvent.clientX - startX))
      }
      return
    }

    if (isCompactPanel.value) {
      sidebarHeight.value = clampSidebarHeight(startSize + (moveEvent.clientY - startY))
      return
    }

    sidebarWidth.value = clampSidebarWidth(startSize + (moveEvent.clientX - startX))
  }

  const handlePointerUp = () => {
    if (isHistoryTab.value) {
      if (isCompactPanel.value) {
        persistSidebarHeight()
      } else {
        persistSidebarWidth()
      }
    } else if (isCompactPanel.value) {
      persistSidebarHeight()
    } else {
      persistSidebarWidth()
    }
    if (!isHistoryTab.value) {
      sidebarResizeLocked.value = false
      clearSidebarResizeCooldownTimer()
      sidebarResizeCooldownTimer = window.setTimeout(() => {
        if (!sidebarPointerInside.value) {
          scheduleSidebarAutoCollapse(480)
        }
        sidebarResizeCooldownTimer = null
      }, 630)
    }
    cleanupResize()
  }

  const cleanupResize = () => {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    stopSidebarResize = null
  }

  stopSidebarResize?.()
  stopSidebarResize = cleanupResize
  document.body.style.userSelect = 'none'
  document.body.style.cursor = isCompactPanel.value ? 'row-resize' : 'col-resize'
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
}

watch(
  () => inspectorStore.activeTab,
  async (tab) => {
    if (tab === 'history' && inspectorStore.currentTarget) {
      if (!inspectorStore.gitBranches) {
        await inspectorStore.loadGitBranches()
      }
      if (!inspectorStore.gitLog) {
        await inspectorStore.loadGitLog()
      }
    }
  }
)

watch(
  () => inspectorStore.currentTarget,
  async (target, prevTarget) => {
    if (!target) return
    if (target.projectPath === prevTarget?.projectPath) return
    await inspectorStore.loadGitBranches()
    if (inspectorStore.activeTab === 'history') {
      await inspectorStore.loadGitLog()
    }
  }
)

onMounted(() => {
  updateActualWidth()
  resizeObserver = new ResizeObserver(() => updateActualWidth())
  if (panelRef.value) {
    resizeObserver.observe(panelRef.value)
  }

  const handleDocumentPointerDown = (event: PointerEvent) => {
    if (!zoomMenuOpen.value) return
    const host = zoomControlRef.value
    if (host && event.target instanceof Node && !host.contains(event.target)) {
      zoomMenuOpen.value = false
    }
  }

  const handleEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      zoomMenuOpen.value = false
    }
  }

  window.addEventListener('pointerdown', handleDocumentPointerDown)
  window.addEventListener('keydown', handleEscape)
  teardownGlobalListeners = () => {
    window.removeEventListener('pointerdown', handleDocumentPointerDown)
    window.removeEventListener('keydown', handleEscape)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  stopResize?.()
  stopSidebarResize?.()
  teardownGlobalListeners?.()
  clearSidebarHoverCloseTimer()
  clearSidebarResizeCooldownTimer()
})
</script>

<style scoped lang="scss">
.inspector-panel {
  position: relative;
  width: 520px;
  min-width: 520px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border-color);
  background: var(--bg-secondary);
  min-height: 0;
  overflow: visible;

  &.collapsed {
    width: 6px;
    min-width: 6px;
    flex-basis: 6px;
    background: transparent;
  }
}

.resize-handle {
  position: absolute;
  top: 0;
  left: 0;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 6;
}

.panel-header {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-primary);
  position: relative;
}

.edge-toggle-anchor {
  position: absolute;
  top: 50%;
  left: 0;
  z-index: 4;
  width: 0;
  height: 0;
  transform: translateY(-50%);
}

.edge-toggle-zone {
  position: absolute;
  left: -20px;
  top: -58px;
  width: 20px;
  height: 116px;
}

.edge-toggle-btn {
  position: absolute;
  top: -20px;
  left: 0;
  width: 28px;
  height: 40px;
  border: 1px solid var(--border-color);
  border-right: none;
  border-radius: 6px 0 0 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transform: translateX(-100%);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 120ms ease,
    color 140ms ease,
    background 140ms ease,
    border-color 140ms ease,
    transform 140ms ease,
    box-shadow 140ms ease;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.05);
}

.edge-toggle-anchor:hover .edge-toggle-btn,
.edge-toggle-anchor:focus-within .edge-toggle-btn,
.edge-toggle-btn:focus-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-100%);
}

.edge-toggle-btn:hover,
.edge-toggle-btn:focus-visible {
  color: var(--text-primary);
  background: var(--bg-hover);
  border-color: var(--accent-primary);
  box-shadow: -2px 0 12px rgba(108, 158, 255, 0.15);
}

.edge-toggle-icon {
  width: 16px;
  height: 16px;
  transition: transform 140ms ease;
}

.edge-toggle-btn.open .edge-toggle-icon {
  transform: rotate(180deg);
}

.edge-toggle-btn.closed .edge-toggle-icon {
  transform: rotate(0deg);
}

.header-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.header-left {
  min-width: 0;
  flex: 0 1 auto;
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.inline-tabs {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  border-radius: 3px;
  flex-shrink: 0;
  width: fit-content;
  max-width: 100%;
}

.inline-tab-btn {
  height: 22px;
  width: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 11px;
  white-space: nowrap;
  border-radius: 2px;
  transition: all 140ms ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    background: color-mix(in srgb, var(--bg-tertiary) 78%, var(--accent-primary) 22%);
    color: var(--text-primary);
  }
}

.meta-pill {
  flex-shrink: 0;
  padding: 2px 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  border-radius: 3px;

  &.state-ready {
    color: #0f766e;
    border-color: color-mix(in srgb, #0f766e 30%, var(--border-color) 70%);
  }

  &.state-non-git,
  &.state-git-unavailable {
    color: #a16207;
    border-color: color-mix(in srgb, #a16207 30%, var(--border-color) 70%);
  }

  &.state-error {
    color: #b91c1c;
    border-color: color-mix(in srgb, #b91c1c 30%, var(--border-color) 70%);
  }
}

.header-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.viewer-zoom-control {
  position: relative;
  flex-shrink: 0;
}

.viewer-zoom-btn {
  min-width: 48px;
  padding: 0 6px;
}

.viewer-zoom-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 72px;
  padding: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
  box-shadow: var(--shadow-md);
}

.viewer-zoom-item {
  border: 0;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: right;
  padding: 6px 8px;
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &.active {
    color: var(--accent-primary);
    background: rgba(108, 158, 255, 0.12);
  }
}

.mini-btn,
.ghost-btn,
.tab-btn,
.project-select {
  height: 24px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.mini-btn,
.ghost-btn,
.tab-btn {
  padding: 0 8px;
  cursor: pointer;
  font-size: 11px;
}

.ghost-btn {
  background: transparent;
}

.utility-btn {
  border-color: transparent;
  color: var(--text-secondary);
  padding-inline: 6px;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
    border-color: transparent;
  }
}

.focus-btn {
  padding-inline: 8px;
}

.panel-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-left: auto;
}

.project-select {
  width: 100%;
  min-width: 0;
  padding: 0 8px;
}

.compact-select {
  max-width: 180px;
  flex: 1;
  font-size: 12px;
}

.mini-toggle-btn {
  height: 24px;
  width: 28px;
  padding: 0;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;

  &.active {
    color: var(--accent-primary);
    background: color-mix(in srgb, var(--bg-tertiary) 82%, var(--accent-primary) 18%);
  }
}

.utility-btn {
  border-color: transparent;
  color: var(--text-secondary);
  width: 28px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
    border-color: transparent;
  }
}

.panel-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex: 1;
  padding: 2px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.tab-btn {
  flex: 0 0 auto;
  min-width: 0;
  white-space: nowrap;
  height: 22px;
  border-color: transparent;
  background: transparent;
  color: var(--text-secondary);
  padding-inline: 10px;
}

.tab-btn.active {
  background: color-mix(in srgb, var(--bg-tertiary) 78%, var(--accent-primary) 22%);
  color: var(--text-primary);
}

.tab-btn:not(.active):hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.panel-empty,
.tree-message {
  padding: 14px 16px;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.panel-body {
  position: relative;
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(180px, 34%) minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  transition:
    grid-template-columns 360ms ease,
    grid-template-rows 360ms ease;
}

.panel-body:not(.has-sidebar) {
  grid-template-columns: 1fr;
}

.panel-body.history-layout {
  display: block;
}

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

.history-sync-summary {
  min-width: 0;
  flex: 1;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-sync-summary.error {
  color: var(--status-error);
}

.history-sync-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.history-sync-btn {
  height: 24px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--border-color) 84%, transparent);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition:
    background 140ms ease,
    color 140ms ease,
    border-color 140ms ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--bg-hover);
  }

  &:disabled {
    opacity: 0.48;
    cursor: not-allowed;
  }
}

.history-stage-tree {
  min-width: 0;
  min-height: 0;
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
}

.history-viewer-content.commit-detail-mode {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
}

.commit-inline-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.panel-sidebar {
  min-width: 0;
  min-height: 0;
  border-right: 1px solid var(--border-color);
  background: var(--bg-secondary);
  overflow: hidden;
  position: relative;
  transition:
    border-color 330ms ease,
    opacity 330ms ease;
}

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

.commit-changes-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
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

.files-wrap {
  height: 100%;
  overflow: auto;
}

.sidebar-scroll {
  height: 100%;
  min-height: 0;
  overflow: auto;
}

.sidebar-resize-handle {
  position: absolute;
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;

  &::after {
    content: '';
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 50%;
    width: 2px;
    transform: translateX(-50%);
    background: color-mix(in srgb, var(--border-color) 82%, var(--bg-primary) 18%);
    transition: background 140ms ease;
  }

  &:hover::after {
    background: color-mix(in srgb, var(--accent-primary) 42%, var(--border-color) 58%);
  }
}

.sidebar-resize-handle.compact {
  top: auto;
  right: auto;
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 10px;
  cursor: row-resize;

  &::after {
    top: 50%;
    bottom: auto;
    left: 10px;
    right: 10px;
    width: auto;
    height: 2px;
    transform: translateY(-50%);
  }
}

.sidebar-hover-zone {
  position: absolute;
  inset: 0 auto 0 8px;
  width: 16px;
  z-index: 4;
}

.sidebar-hover-zone.compact {
  inset: 8px 0 auto 0;
  width: auto;
  height: 16px;
}

.sidebar-auto-collapse .panel-sidebar.collapsed {
  border-color: transparent;
  opacity: 0.96;
}

.compact .header-toolbar {
  flex-wrap: wrap;
  align-items: stretch;
}

.compact .panel-controls {
  margin-left: 0;
  width: 100%;
}

.compact .panel-tabs {
  width: 100%;
}

.compact .edge-toggle-btn {
  width: 26px;
  height: 36px;
  top: -18px;
}

.compact .edge-toggle-zone {
  left: -18px;
  top: -54px;
  width: 18px;
  height: 108px;
}

.compact .panel-body {
  grid-template-columns: 1fr;
  grid-template-rows: minmax(150px, 36%) minmax(0, 1fr);
}

.compact .panel-sidebar {
  border-right: none;
  border-bottom: 1px solid var(--border-color);
}

.compact .panel-body:not(.has-sidebar) {
  grid-template-rows: minmax(0, 1fr);
}

.compact .history-workbench {
  grid-template-columns: 1fr;
  grid-template-rows: minmax(120px, var(--history-stage-height, 180px)) minmax(0, 1fr);
}

.compact .history-stage {
  border-bottom: 1px solid var(--border-color);
}

.compact .history-resize-handle {
  top: auto;
  right: auto;
  left: 0;
  bottom: -5px;
  width: 100%;
  height: 10px;
  cursor: row-resize;
}
</style>
