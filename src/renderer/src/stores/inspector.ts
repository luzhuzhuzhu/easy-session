import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import i18n from '@/i18n'
import {
  stageProjectFile,
  unstageProjectFile,
  discardProjectFile,
  type ProjectInspectorTarget
} from '@/api/local-project'
import { createInspectorFileDomain } from '@/features/inspector/file-domain'
import { createInspectorGitHistoryDomain } from '@/features/inspector/git-history-domain'
import {
  buildManualInspectorProjectOptions,
  resolveActiveLocalSessionProject,
  resolveCurrentInspectorProjectOption
} from '@/features/inspector/project-context'
import {
  INSPECTOR_AUTO_FOLLOW_KEY,
  INSPECTOR_PANEL_OPEN_KEY,
  INSPECTOR_SIDEBAR_AUTO_COLLAPSE_KEY,
  INSPECTOR_SIDEBAR_VISIBLE_KEY,
  persistInspectorBoolean,
  persistInspectorTab,
  readStoredInspectorBoolean,
  readStoredInspectorTab
} from '@/features/inspector/preferences'
import type { InspectorProjectOption, InspectorTab } from '@/features/inspector/types'
import { useProjectsStore } from './projects'
import { useSessionsStore } from './sessions'
import { useWorkspaceStore } from './workspace'

export const useInspectorStore = defineStore('inspector', () => {
  const sessionsStore = useSessionsStore()
  const workspaceStore = useWorkspaceStore()
  const projectsStore = useProjectsStore()

  const panelOpen = ref(readStoredInspectorBoolean(INSPECTOR_PANEL_OPEN_KEY, false))
  const autoFollowActivePaneProject = ref(readStoredInspectorBoolean(INSPECTOR_AUTO_FOLLOW_KEY, true))
  const sidebarVisible = ref(readStoredInspectorBoolean(INSPECTOR_SIDEBAR_VISIBLE_KEY, true))
  const sidebarAutoCollapse = ref(readStoredInspectorBoolean(INSPECTOR_SIDEBAR_AUTO_COLLAPSE_KEY, false))
  const activeTab = ref<InspectorTab>(readStoredInspectorTab())
  const manualProjectPath = ref<string | null>(null)

  function t(key: string): string {
    return i18n.global.t(key) as string
  }

  const activeLocalSessionProject = computed<InspectorProjectOption | null>(() => {
    return resolveActiveLocalSessionProject({
      activeSessionRef: workspaceStore.activeSessionRef,
      fallbackSessionRef: sessionsStore.activeSessionRef ?? undefined,
      getSessionByKey: (globalSessionKey) => sessionsStore.getUnifiedSession(globalSessionKey) ?? undefined,
      projects: projectsStore.unifiedProjects,
      platform: window.electronAPI.platform
    })
  })

  const manualProjectOptions = computed<InspectorProjectOption[]>(() => {
    return buildManualInspectorProjectOptions({
      activeProjectOption: activeLocalSessionProject.value,
      sessions: sessionsStore.unifiedSessions,
      projects: projectsStore.unifiedProjects,
      platform: window.electronAPI.platform
    })
  })

  const currentProjectOption = computed<InspectorProjectOption | null>(() => {
    return resolveCurrentInspectorProjectOption({
      autoFollowActivePaneProject: autoFollowActivePaneProject.value,
      activeProjectOption: activeLocalSessionProject.value,
      manualProjectPath: manualProjectPath.value,
      manualProjectOptions: manualProjectOptions.value,
      projects: projectsStore.unifiedProjects,
      platform: window.electronAPI.platform
    })
  })

  const currentTarget = computed<ProjectInspectorTarget | null>(() => {
    const option = currentProjectOption.value
    if (!option) return null
    return { projectPath: option.projectPath }
  })

  const currentProjectLabel = computed(() => currentProjectOption.value?.projectName ?? '')
  const currentProjectPath = computed(() => currentProjectOption.value?.projectPath ?? '')
  let clearGitHistoryRef: (() => void) | null = null

  const fileDomain = createInspectorFileDomain({
    currentTarget,
    currentProjectOption,
    activeTab,
    t,
    clearGitHistory: () => clearGitHistoryRef?.()
  })

  const {
    selectedRelativePath,
    selectionSource,
    selectedChangeViewMode,
    expandedDirectories,
    fileTreeByParent,
    gitStatus,
    gitDiff,
    filePreview,
    loadingRoot,
    loadingGitStatus,
    loadingDiff,
    loadingPreview,
    loadingDirectories,
    generalError,
    gitState,
    gitScopeLabel,
    currentViewerMode,
    viewerMessage,
    clearSelection,
    refreshGitStatusOnly,
    loadRootState,
    toggleDirectory,
    selectFile,
    selectChangedFile,
    refreshCurrentFile,
    syncAfterGitMutation
  } = fileDomain

  async function refresh(): Promise<void> {
    if (activeTab.value === 'history') {
      await refreshGitHistoryContext()
      return
    }

    const relativePath = selectedRelativePath.value
    const source = selectionSource.value
    const changeViewMode = selectedChangeViewMode.value
    await loadRootState(true)
    if (!relativePath) return

    if (source === 'changes') {
      await selectChangedFile(relativePath, changeViewMode === 'auto' ? 'unstaged' : changeViewMode)
      return
    }

    await selectFile(relativePath)
  }

  function setAutoFollow(enabled: boolean): void {
    autoFollowActivePaneProject.value = enabled
    if (enabled) {
      manualProjectPath.value = null
    } else if (!manualProjectPath.value && currentProjectOption.value?.projectPath) {
      manualProjectPath.value = currentProjectOption.value.projectPath
    }
  }

  function setManualProjectPath(projectPath: string | null): void {
    manualProjectPath.value = projectPath
  }

  function setPanelOpen(nextOpen: boolean): void {
    panelOpen.value = nextOpen
  }

  function setSidebarVisible(visible: boolean): void {
    sidebarVisible.value = visible
  }

  function setSidebarAutoCollapse(enabled: boolean): void {
    sidebarAutoCollapse.value = enabled
  }

  function setActiveTab(tab: InspectorTab): void {
    activeTab.value = tab
  }

  const gitHistoryDomain = createInspectorGitHistoryDomain({
    currentTarget,
    currentProjectOption,
    activeTab,
    t,
    loadRootState,
    refreshGitStatusOnly,
    clearSelection
  })

  clearGitHistoryRef = gitHistoryDomain.clearGitHistory

  const {
    gitLog,
    gitBranches,
    gitFileHistory,
    loadingGitLog,
    loadingBranches,
    loadingFileHistory,
    syncingGitRemote,
    gitSyncError,
    viewedBranchName,
    selectedCommitHash,
    selectedCommitChanges,
    commitDiff,
    loadingCommitChanges,
    loadingCommitDiff,
    loadGitLog,
    loadMoreGitLog,
    loadGitBranches,
    refreshGitHistoryContext,
    loadGitFileHistory,
    clearGitHistory,
    commitChanges,
    inspectBranch,
    fetchGitRemote,
    pullGitCurrentBranch,
    pushGitCurrentBranch,
    selectCommit,
    loadCommitFileDiff,
    clearSelectedCommit
  } = gitHistoryDomain

  async function stageFile(relativePath: string): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    await stageProjectFile(target, relativePath)
    await syncAfterGitMutation(relativePath, 'staged')
  }

  async function unstageFile(relativePath: string): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    await unstageProjectFile(target, relativePath)
    await syncAfterGitMutation(relativePath, 'unstaged')
  }

  async function discardFile(relativePath: string): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    await discardProjectFile(target, relativePath)
    await syncAfterGitMutation(relativePath, 'unstaged')
  }

  watch(
    () => currentProjectOption.value?.projectPath ?? null,
    async () => {
      await loadRootState(true)
    },
    { immediate: true }
  )

  watch(panelOpen, (value) => {
    persistInspectorBoolean(INSPECTOR_PANEL_OPEN_KEY, value)
  })

  watch(sidebarVisible, (value) => {
    persistInspectorBoolean(INSPECTOR_SIDEBAR_VISIBLE_KEY, value)
  })

  watch(sidebarAutoCollapse, (value) => {
    persistInspectorBoolean(INSPECTOR_SIDEBAR_AUTO_COLLAPSE_KEY, value)
  })

  watch(activeTab, (value) => {
    persistInspectorTab(value)
  })

  watch(autoFollowActivePaneProject, (value) => {
    persistInspectorBoolean(INSPECTOR_AUTO_FOLLOW_KEY, value)
  })

  return {
    panelOpen,
    autoFollowActivePaneProject,
    sidebarVisible,
    sidebarAutoCollapse,
    activeTab,
    manualProjectPath,
    selectedRelativePath,
    selectionSource,
    expandedDirectories,
    fileTreeByParent,
    gitStatus,
    gitDiff,
    filePreview,
    selectedChangeViewMode,
    loadingRoot,
    loadingGitStatus,
    loadingDiff,
    loadingPreview,
    loadingDirectories,
    generalError,
    currentProjectOption,
    currentProjectLabel,
    currentProjectPath,
    currentTarget,
    manualProjectOptions,
    gitState,
    gitScopeLabel,
    currentViewerMode,
    viewerMessage,
    gitLog,
    gitBranches,
    gitFileHistory,
    viewedBranchName,
    gitSyncError,
    loadingGitLog,
    loadingBranches,
    loadingFileHistory,
    syncingGitRemote,
    selectedCommitHash,
    selectedCommitChanges,
    commitDiff,
    loadingCommitChanges,
    loadingCommitDiff,
    setPanelOpen,
    setSidebarVisible,
    setSidebarAutoCollapse,
    setAutoFollow,
    setManualProjectPath,
    setActiveTab,
    loadRootState,
    refresh,
    toggleDirectory,
    selectFile,
    selectChangedFile,
    refreshCurrentFile,
    loadGitLog,
    loadMoreGitLog,
    loadGitBranches,
    loadGitFileHistory,
    fetchGitRemote,
    pullGitCurrentBranch,
    pushGitCurrentBranch,
    clearGitHistory,
    stageFile,
    unstageFile,
    discardFile,
    commitChanges,
    inspectBranch,
    selectCommit,
    loadCommitFileDiff,
    clearSelectedCommit
  }
})
