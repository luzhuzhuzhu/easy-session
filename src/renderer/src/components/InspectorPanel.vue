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

      <InspectorHeader
        :tabs="tabs"
        :active-tab="inspectorStore.activeTab"
        :sidebar-visible="inspectorStore.sidebarVisible"
        :is-history-tab="isHistoryTab"
        :sidebar-auto-collapse="inspectorStore.sidebarAutoCollapse"
        :viewer-zoom-percent="viewerZoomPercent"
        :auto-follow-active-pane-project="inspectorStore.autoFollowActivePaneProject"
        :project-select-title="projectSelectTitle"
        :project-select-value="projectSelectValue"
        :project-select-placeholder="projectSelectPlaceholder"
        :manual-project-options="inspectorStore.manualProjectOptions"
        @set-active-tab="inspectorStore.setActiveTab($event)"
        @toggle-sidebar-visible="inspectorStore.setSidebarVisible($event)"
        @toggle-sidebar-auto-collapse="handleSidebarAutoCollapseToggle($event)"
        @set-viewer-zoom="setViewerZoom($event)"
        @reset-viewer-zoom="resetViewerZoom"
        @refresh="inspectorStore.refresh()"
        @toggle-follow="handleFollowToggle($event)"
        @manual-project-change="handleManualProjectChange($event)"
      />

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
          <InspectorHistoryWorkspace
            :compact="isCompactPanel"
            :show-branch-select="showBranchSelect"
            :current-branch="inspectorStore.gitBranches?.currentBranch ?? null"
            :viewed-branch="inspectorStore.viewedBranchName"
            :branches="inspectorStore.gitBranches?.branches ?? []"
            :loading-branches="inspectorStore.loadingBranches"
            :history-sync-message="historySyncMessage"
            :has-sync-error="!!inspectorStore.gitSyncError"
            :can-fetch-sync="canFetchHistorySync"
            :can-pull-sync="canPullHistorySync"
            :can-push-sync="canPushHistorySync"
            :syncing-git-remote="inspectorStore.syncingGitRemote"
            :commits="inspectorStore.gitLog?.commits ?? []"
            :has-more="inspectorStore.gitLog?.hasMore ?? false"
            :loading-git-log="inspectorStore.loadingGitLog"
            :selected-hash="inspectorStore.selectedCommitHash"
            :history-message="historyMessage"
            :history-viewer-title="historyViewerTitle"
            :selected-commit-hash="inspectorStore.selectedCommitHash"
            :selected-commit-changes="inspectorStore.selectedCommitChanges"
            :commit-diff="inspectorStore.commitDiff"
            :viewer-zoom-percent="viewerZoomPercent"
            :history-detail-message="historyDetailMessage"
            :history-selection-message="historySelectionMessage"
            :show-commit-changes="showCommitChanges"
            @select-branch="handleBranchSelect"
            @fetch="inspectorStore.fetchGitRemote()"
            @pull="inspectorStore.pullGitCurrentBranch()"
            @push="inspectorStore.pushGitCurrentBranch()"
            @select-history="handleHistorySelect"
            @load-more="inspectorStore.loadMoreGitLog"
            @start-resize="startSidebarResize"
            @viewer-wheel="handleViewerWheel"
            @select-commit-file="handleCommitFileSelect"
          />
        </template>
        <template v-else>
          <div
            v-if="inspectorStore.sidebarVisible && inspectorStore.sidebarAutoCollapse"
            class="sidebar-hover-zone"
            :class="{ compact: isCompactPanel }"
            @pointerenter="handleSidebarPointerEnter"
          />
          <InspectorSidebar
            v-if="inspectorStore.sidebarVisible"
            :active-tab="inspectorStore.activeTab"
            :compact="isCompactPanel"
            :expanded="isSidebarExpanded"
            :git-status-items="inspectorStore.gitStatus?.items ?? []"
            :selected-relative-path="inspectorStore.selectedRelativePath"
            :selected-view-mode="inspectorStore.selectedChangeViewMode"
            :changes-message="changesMessage"
            :loading-root="inspectorStore.loadingRoot"
            :tree-index="inspectorStore.fileTreeByParent"
            :loading-directories="inspectorStore.loadingDirectories"
            :expanded-paths="inspectorStore.expandedDirectories"
            @pointer-enter="handleSidebarPointerEnter"
            @pointer-leave="handleSidebarPointerLeave"
            @select-change="handleChangeSelect"
            @stage="inspectorStore.stageFile"
            @unstage="inspectorStore.unstageFile"
            @discard="inspectorStore.discardFile"
            @toggle-directory="inspectorStore.toggleDirectory"
            @select-file="inspectorStore.selectFile"
            @start-resize="startSidebarResize"
          />

          <InspectorViewer
            :viewer-title="viewerTitle"
            :selected-relative-path="inspectorStore.selectedRelativePath"
            :change-viewer-badge="changeViewerBadge"
            :selected-change-view-mode="inspectorStore.selectedChangeViewMode"
            :loading-diff="inspectorStore.loadingDiff"
            :loading-preview="inspectorStore.loadingPreview"
            :current-viewer-mode="inspectorStore.currentViewerMode"
            :git-diff="inspectorStore.gitDiff?.diff ?? null"
            :viewer-zoom-percent="viewerZoomPercent"
            :viewer-message="inspectorStore.viewerMessage"
            :file-preview-content="inspectorStore.filePreview?.content ?? null"
            :file-preview-absolute-path="inspectorStore.filePreview?.absolutePath ?? null"
            :show-commit-box="showCommitBox"
            :commit-message="commitMessage"
            :committing="committing"
            @viewer-wheel="handleViewerWheel"
            @refresh-current-file="handleRefreshCurrentFile"
            @update:commit-message="commitMessage = $event"
            @commit="handleCommit"
          />
        </template>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import InspectorHeader from '@/components/InspectorHeader.vue'
import InspectorHistoryWorkspace from '@/components/InspectorHistoryWorkspace.vue'
import InspectorSidebar from '@/components/InspectorSidebar.vue'
import InspectorViewer from '@/components/InspectorViewer.vue'
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

const { t } = useI18n()
const inspectorStore = useInspectorStore()
const panelRef = ref<HTMLElement | null>(null)
const panelBodyRef = ref<HTMLElement | null>(null)
const panelWidth = ref(readStoredWidth())
const actualPanelWidth = ref(panelWidth.value)
const viewerZoomPercent = ref(readStoredZoom())
const sidebarWidth = ref(readStoredSidebarWidth())
const sidebarHeight = ref(readStoredSidebarHeight())
const sidebarHovered = ref(false)
const sidebarPointerInside = ref(false)
const sidebarResizeLocked = ref(false)
const commitMessage = ref('')
const committing = ref(false)

let resizeObserver: ResizeObserver | null = null
let stopResize: (() => void) | null = null
let stopSidebarResize: (() => void) | null = null
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

function setViewerZoom(percent: number): void {
  viewerZoomPercent.value = clampZoom(percent)
  persistZoom()
}

function resetViewerZoom(): void {
  viewerZoomPercent.value = VIEWER_DEFAULT_ZOOM
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
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  stopResize?.()
  stopSidebarResize?.()
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

.compact .panel-body:not(.has-sidebar) {
  grid-template-rows: minmax(0, 1fr);
}

</style>
