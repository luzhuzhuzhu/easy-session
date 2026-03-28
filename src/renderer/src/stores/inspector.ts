import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import i18n from '@/i18n'
import {
  getProjectGitDiff,
  getProjectGitStatus,
  getProjectGitLog,
  getProjectGitBranches,
  getProjectGitFileHistory,
  stageProjectFile,
  unstageProjectFile,
  discardProjectFile,
  commitProjectChanges,
  fetchProjectGitRemote,
  pullProjectGitCurrentBranch,
  pushProjectGitCurrentBranch,
  getCommitChanges,
  getCommitDiff,
  listProjectFiles,
  readProjectFile,
  type ProjectFileReadResult,
  type ProjectFileTreeEntry,
  type ProjectGitDiffResult,
  type ProjectGitStatusResult,
  type ProjectGitLogResult,
  type ProjectGitBranchesResult,
  type ProjectGitFileHistoryResult,
  type ProjectGitCommitChangesResult,
  type ProjectInspectorTarget
} from '@/api/local-project'
import { LOCAL_INSTANCE_ID } from '@/models/unified-resource'
import { useProjectsStore } from './projects'
import { useSessionsStore } from './sessions'
import { useWorkspaceStore } from './workspace'

export type InspectorTab = 'changes' | 'files' | 'history'
export type InspectorViewerMode = 'empty' | 'diff' | 'markdown' | 'text' | 'binary' | 'too_large'

export interface InspectorProjectOption {
  key: string
  projectPath: string
  projectName: string
  source: 'active' | 'running'
}

const INSPECTOR_PANEL_OPEN_KEY = 'easysession.inspector.panel-open'
const INSPECTOR_ACTIVE_TAB_KEY = 'easysession.inspector.active-tab'
const INSPECTOR_AUTO_FOLLOW_KEY = 'easysession.inspector.auto-follow'
const INSPECTOR_SIDEBAR_VISIBLE_KEY = 'easysession.inspector.sidebar-visible'
const INSPECTOR_SIDEBAR_AUTO_COLLAPSE_KEY = 'easysession.inspector.sidebar-auto-collapse'

function basenameOfPath(pathValue: string): string {
  return pathValue.split(/[\\/]/).filter(Boolean).at(-1) ?? pathValue
}

function toProjectPathKey(pathValue: string): string {
  return window.electronAPI.platform === 'win32' ? pathValue.toLowerCase() : pathValue
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  const stored = window.localStorage.getItem(key)
  if (stored == null) return fallback
  return stored === '1'
}

function readStoredTab(): InspectorTab {
  const stored = window.localStorage.getItem(INSPECTOR_ACTIVE_TAB_KEY)
  if (stored === 'changes' || stored === 'files' || stored === 'history') return stored
  return 'changes'
}

export const useInspectorStore = defineStore('inspector', () => {
  const sessionsStore = useSessionsStore()
  const workspaceStore = useWorkspaceStore()
  const projectsStore = useProjectsStore()

  const panelOpen = ref(readStoredBoolean(INSPECTOR_PANEL_OPEN_KEY, true))
  const autoFollowActivePaneProject = ref(readStoredBoolean(INSPECTOR_AUTO_FOLLOW_KEY, true))
  const sidebarVisible = ref(readStoredBoolean(INSPECTOR_SIDEBAR_VISIBLE_KEY, true))
  const sidebarAutoCollapse = ref(readStoredBoolean(INSPECTOR_SIDEBAR_AUTO_COLLAPSE_KEY, false))
  const activeTab = ref<InspectorTab>(readStoredTab())
  const manualProjectPath = ref<string | null>(null)
  const selectedRelativePath = ref<string | null>(null)
  const selectionSource = ref<'changes' | 'files' | null>(null)
  const selectedChangeViewMode = ref<'staged' | 'unstaged' | 'auto'>('auto')
  const expandedDirectories = ref<string[]>([])
  const fileTreeByParent = ref<Record<string, ProjectFileTreeEntry[]>>({})
  const gitStatus = ref<ProjectGitStatusResult | null>(null)
  const gitDiff = ref<ProjectGitDiffResult | null>(null)
  const filePreview = ref<ProjectFileReadResult | null>(null)
  const loadingRoot = ref(false)
  const loadingGitStatus = ref(false)
  const loadingDiff = ref(false)
  const loadingPreview = ref(false)
  const loadingDirectories = ref<Record<string, boolean>>({})
  const generalError = ref<string | null>(null)
  const currentTargetPath = ref<string | null>(null)

  const gitLog = ref<ProjectGitLogResult | null>(null)
  const gitBranches = ref<ProjectGitBranchesResult | null>(null)
  const gitFileHistory = ref<ProjectGitFileHistoryResult | null>(null)
  const loadingGitLog = ref(false)
  const loadingBranches = ref(false)
  const loadingFileHistory = ref(false)
  const syncingGitRemote = ref<'fetch' | 'pull' | 'push' | null>(null)
  const gitSyncError = ref<string | null>(null)
  const gitLogSkip = ref(0)
  const viewedBranchName = ref<string | null>(null)

  const selectedCommitHash = ref<string | null>(null)
  const selectedCommitChanges = ref<ProjectGitCommitChangesResult | null>(null)
  const commitDiff = ref<string | null>(null)
  const loadingCommitChanges = ref(false)
  const loadingCommitDiff = ref(false)

  function t(key: string): string {
    return i18n.global.t(key) as string
  }

  function resolveProjectName(projectPath: string): string {
    const existing = projectsStore.unifiedProjects.find((project) =>
      project.instanceId === LOCAL_INSTANCE_ID && project.path === projectPath
    )
    return existing?.name || basenameOfPath(projectPath)
  }

  const activeLocalSessionProject = computed<InspectorProjectOption | null>(() => {
    const sessionRef = workspaceStore.activeSessionRef ?? sessionsStore.activeSessionRef
    if (!sessionRef || sessionRef.instanceId !== LOCAL_INSTANCE_ID) return null
    const session = sessionsStore.getUnifiedSession(sessionRef.globalSessionKey)
    if (!session?.projectPath) return null

    return {
      key: toProjectPathKey(session.projectPath),
      projectPath: session.projectPath,
      projectName: resolveProjectName(session.projectPath),
      source: 'active'
    }
  })

  const manualProjectOptions = computed<InspectorProjectOption[]>(() => {
    const map = new Map<string, InspectorProjectOption>()
    const active = activeLocalSessionProject.value

    if (active) {
      map.set(active.key, active)
    }

    for (const session of sessionsStore.unifiedSessions) {
      if (session.instanceId !== LOCAL_INSTANCE_ID || session.status !== 'running' || !session.projectPath) continue
      const key = toProjectPathKey(session.projectPath)
      if (map.has(key)) continue
      map.set(key, {
        key,
        projectPath: session.projectPath,
        projectName: resolveProjectName(session.projectPath),
        source: 'running'
      })
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.source !== b.source) {
        return a.source === 'active' ? -1 : 1
      }
      return a.projectName.localeCompare(b.projectName, 'zh-CN')
    })
  })

  const currentProjectOption = computed<InspectorProjectOption | null>(() => {
    if (autoFollowActivePaneProject.value) {
      return activeLocalSessionProject.value
    }

    if (manualProjectPath.value) {
      const manualKey = toProjectPathKey(manualProjectPath.value)
      const manual = manualProjectOptions.value.find((item) => item.key === manualKey)
      if (manual) return manual

      return {
        key: manualKey,
        projectPath: manualProjectPath.value,
        projectName: resolveProjectName(manualProjectPath.value),
        source: 'running'
      }
    }

    return activeLocalSessionProject.value
  })

  const currentTarget = computed<ProjectInspectorTarget | null>(() => {
    const option = currentProjectOption.value
    if (!option) return null
    return { projectPath: option.projectPath }
  })

  const currentProjectLabel = computed(() => currentProjectOption.value?.projectName ?? '')
  const currentProjectPath = computed(() => currentProjectOption.value?.projectPath ?? '')
  const gitState = computed(() => gitStatus.value?.state ?? 'ready')
  const gitScopeLabel = computed(() => {
    if (!gitStatus.value || gitStatus.value.state !== 'ready') return ''
    return gitStatus.value.projectSubpath ? `repo:${gitStatus.value.projectSubpath}` : 'repo:root'
  })

  const currentViewerMode = computed<InspectorViewerMode>(() => {
    if (!selectedRelativePath.value) return 'empty'
    if (selectionSource.value === 'changes' && gitDiff.value?.diff) return 'diff'
    if (!filePreview.value) return 'empty'
    if (filePreview.value.kind === 'markdown') return 'markdown'
    if (filePreview.value.kind === 'text') return 'text'
    if (filePreview.value.kind === 'binary') return 'binary'
    if (filePreview.value.kind === 'too_large') return 'too_large'
    return 'empty'
  })

  const viewerMessage = computed(() => {
    if (!currentProjectOption.value) return t('inspector.noProjectHint')
    if (loadingDiff.value || loadingPreview.value) return t('inspector.loading')
    if (generalError.value) return generalError.value
    if (selectionSource.value === 'changes' && gitDiff.value?.message) return gitDiff.value.message

    if (!selectedRelativePath.value) {
      return activeTab.value === 'changes'
        ? t('inspector.hints.selectChange')
        : t('inspector.hints.selectFile')
    }

    if (filePreview.value?.kind === 'binary') return t('inspector.hints.binary')
    if (filePreview.value?.kind === 'too_large') return t('inspector.hints.tooLarge')
    if (!filePreview.value?.content && currentViewerMode.value !== 'diff') return t('inspector.hints.emptyPreview')
    return null
  })

  function clearSelection(): void {
    selectedRelativePath.value = null
    selectionSource.value = null
    selectedChangeViewMode.value = 'auto'
    gitDiff.value = null
    filePreview.value = null
  }

  function clearLoadedProjectState(): void {
    fileTreeByParent.value = {}
    expandedDirectories.value = []
    gitStatus.value = null
    loadingDirectories.value = {}
    clearSelection()
    clearGitHistory()
  }

  async function loadRootState(force = false): Promise<void> {
    const target = currentTarget.value
    const targetPath = currentProjectOption.value?.projectPath ?? null
    if (!target || !targetPath) {
      currentTargetPath.value = null
      clearLoadedProjectState()
      return
    }

    if (!force && currentTargetPath.value === targetPath && gitStatus.value && fileTreeByParent.value['']) {
      return
    }

    currentTargetPath.value = targetPath
    loadingRoot.value = true
    loadingGitStatus.value = true
    generalError.value = null
    clearLoadedProjectState()

    try {
      const [statusResult, rootTree] = await Promise.all([
        getProjectGitStatus(target),
        listProjectFiles(target, '')
      ])

      gitStatus.value = statusResult
      fileTreeByParent.value = { '': rootTree.entries }

      if (statusResult.state !== 'ready' && activeTab.value === 'changes') {
        activeTab.value = 'files'
      }
    } catch (error) {
      generalError.value = error instanceof Error ? error.message : t('inspector.errors.loadRootFailed')
    } finally {
      loadingGitStatus.value = false
      loadingRoot.value = false
    }
  }

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

  async function ensureDirectory(relativePath: string): Promise<void> {
    const target = currentTarget.value
    if (!target || fileTreeByParent.value[relativePath]) return

    loadingDirectories.value = {
      ...loadingDirectories.value,
      [relativePath]: true
    }

    try {
      const result = await listProjectFiles(target, relativePath)
      fileTreeByParent.value = {
        ...fileTreeByParent.value,
        [relativePath]: result.entries
      }
    } finally {
      const next = { ...loadingDirectories.value }
      delete next[relativePath]
      loadingDirectories.value = next
    }
  }

  async function toggleDirectory(relativePath: string): Promise<void> {
    if (expandedDirectories.value.includes(relativePath)) {
      expandedDirectories.value = expandedDirectories.value.filter((item) => item !== relativePath)
      return
    }

    await ensureDirectory(relativePath)
    expandedDirectories.value = [...expandedDirectories.value, relativePath]
  }

  async function ensureFilePreview(relativePath: string): Promise<ProjectFileReadResult | null> {
    const target = currentTarget.value
    if (!target) return null

    loadingPreview.value = true
    try {
      const result = await readProjectFile(target, relativePath)
      filePreview.value = result
      return result
    } finally {
      loadingPreview.value = false
    }
  }

  async function selectFile(relativePath: string): Promise<void> {
    selectedRelativePath.value = relativePath
    selectionSource.value = 'files'
    selectedChangeViewMode.value = 'auto'
    gitDiff.value = null
    await ensureFilePreview(relativePath)
    if (activeTab.value === 'changes') {
      activeTab.value = 'files'
    }
  }

  async function selectChangedFile(
    relativePath: string,
    viewMode: 'staged' | 'unstaged' = 'unstaged'
  ): Promise<void> {
    const target = currentTarget.value
    if (!target) return

    selectedRelativePath.value = relativePath
    selectionSource.value = 'changes'
    selectedChangeViewMode.value = viewMode
    loadingDiff.value = true

    try {
      gitDiff.value = await getProjectGitDiff(target, relativePath, { viewMode })
    } finally {
      loadingDiff.value = false
    }

    if (!gitDiff.value?.diff) {
      await ensureFilePreview(relativePath)
    } else {
      filePreview.value = null
    }
  }

  async function refreshCurrentFile(): Promise<void> {
    const path = selectedRelativePath.value
    if (!path || !currentTarget.value) return

    if (selectionSource.value === 'changes') {
      await selectChangedFile(path, selectedChangeViewMode.value === 'auto' ? 'unstaged' : selectedChangeViewMode.value)
    } else {
      await selectFile(path)
    }
  }

  async function syncAfterGitMutation(
    relativePath: string | null,
    preferredViewMode: 'staged' | 'unstaged' | 'auto' = 'auto'
  ): Promise<void> {
    await loadRootState(true)
    if (!relativePath) return

    const statusItems = gitStatus.value?.items.filter((item) => item.path === relativePath) ?? []
    if (!statusItems.length) {
      clearSelection()
      return
    }

    const nextChangeItem = preferredViewMode === 'staged'
      ? statusItems.find((item) => item.staged) ?? statusItems.find((item) => !item.staged) ?? statusItems[0]
      : preferredViewMode === 'unstaged'
        ? statusItems.find((item) => !item.staged) ?? statusItems.find((item) => item.staged) ?? statusItems[0]
        : statusItems.find((item) => !item.staged) ?? statusItems[0]

    await selectChangedFile(relativePath, nextChangeItem.staged ? 'staged' : 'unstaged')
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

  async function loadGitLog(append = false): Promise<void> {
    const target = currentTarget.value
    if (!target) return

    if (!append) {
      gitLogSkip.value = 0
      gitLog.value = null
    }

    loadingGitLog.value = true
    try {
      const result = await getProjectGitLog(target, {
        skip: gitLogSkip.value,
        maxCount: 50,
        branch: viewedBranchName.value ?? undefined
      })

      if (append && gitLog.value && result.state === 'ready') {
        gitLog.value = {
          ...result,
          commits: [...gitLog.value.commits, ...result.commits]
        }
      } else {
        gitLog.value = result
      }

      if (result.state === 'ready') {
        gitLogSkip.value += result.commits.length
      }
    } finally {
      loadingGitLog.value = false
    }
  }

  async function loadMoreGitLog(): Promise<void> {
    await loadGitLog(true)
  }

  async function loadGitBranches(): Promise<void> {
    const target = currentTarget.value
    if (!target) return

    loadingBranches.value = true
    try {
      gitBranches.value = await getProjectGitBranches(target)
      const currentBranch = gitBranches.value.currentBranch
      const branchNames = new Set(gitBranches.value.branches.map((branch) => branch.name))
      if (viewedBranchName.value && !branchNames.has(viewedBranchName.value)) {
        viewedBranchName.value = currentBranch
      }
      if (!viewedBranchName.value && currentBranch) {
        viewedBranchName.value = currentBranch
      }
    } finally {
      loadingBranches.value = false
    }
  }

  async function refreshGitHistoryContext(): Promise<void> {
    gitSyncError.value = null
    await loadGitBranches()
    if (activeTab.value === 'history') {
      clearSelectedCommit()
      await loadGitLog()
    }
  }

  function normalizeGitSyncError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error ?? '')
    if (/Could not connect to server|Failed to connect to .* port 443/i.test(message)) {
      return '无法连接远端 Git 服务器，请检查当前网络或代理设置'
    }
    if (/unable to access/i.test(message)) {
      return '无法访问远端仓库，请检查仓库地址、网络或代理设置'
    }
    return message || t('inspector.errors.loadRootFailed')
  }

  async function loadGitFileHistory(relativePath: string, append = false): Promise<void> {
    const target = currentTarget.value
    if (!target) return

    if (!append) {
      gitFileHistory.value = null
    }

    loadingFileHistory.value = true
    try {
      const skip = append && gitFileHistory.value ? gitFileHistory.value.commits.length : 0
      const result = await getProjectGitFileHistory(target, relativePath, { skip, maxCount: 50 })

      if (append && gitFileHistory.value && result.state === 'ready') {
        gitFileHistory.value = {
          ...result,
          commits: [...gitFileHistory.value.commits, ...result.commits]
        }
      } else {
        gitFileHistory.value = result
      }
    } finally {
      loadingFileHistory.value = false
    }
  }

  function clearGitHistory(): void {
    gitLog.value = null
    gitBranches.value = null
    gitFileHistory.value = null
    gitLogSkip.value = 0
    viewedBranchName.value = null
  }

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

  async function commitChanges(message: string): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    await commitProjectChanges(target, message)
    await loadRootState(true)
    viewedBranchName.value = gitBranches.value?.currentBranch ?? viewedBranchName.value
    await loadGitLog()
  }

  async function inspectBranch(branchName: string): Promise<void> {
    viewedBranchName.value = branchName
    activeTab.value = 'history'
    clearSelectedCommit()
    if (!gitBranches.value) {
      await loadGitBranches()
    }
    await loadGitLog()
  }

  async function fetchGitRemote(): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    syncingGitRemote.value = 'fetch'
    gitSyncError.value = null
    try {
      await fetchProjectGitRemote(target)
      await refreshGitHistoryContext()
    } catch (error) {
      gitSyncError.value = normalizeGitSyncError(error)
    } finally {
      syncingGitRemote.value = null
    }
  }

  async function pullGitCurrentBranch(): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    syncingGitRemote.value = 'pull'
    gitSyncError.value = null
    try {
      await pullProjectGitCurrentBranch(target)
      await loadRootState(true)
      await refreshGitHistoryContext()
    } catch (error) {
      gitSyncError.value = normalizeGitSyncError(error)
    } finally {
      syncingGitRemote.value = null
    }
  }

  async function pushGitCurrentBranch(): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    syncingGitRemote.value = 'push'
    gitSyncError.value = null
    try {
      await pushProjectGitCurrentBranch(target)
      await refreshGitHistoryContext()
    } catch (error) {
      gitSyncError.value = normalizeGitSyncError(error)
    } finally {
      syncingGitRemote.value = null
    }
  }

  async function selectCommit(commitHash: string): Promise<void> {
    const target = currentTarget.value
    if (!target) return
    selectedCommitHash.value = commitHash
    loadingCommitChanges.value = true
    commitDiff.value = null
    try {
      selectedCommitChanges.value = await getCommitChanges(target, commitHash)
    } catch (e) {
      selectedCommitChanges.value = null
    } finally {
      loadingCommitChanges.value = false
    }
  }

  async function loadCommitFileDiff(relativePath: string): Promise<void> {
    const target = currentTarget.value
    if (!target || !selectedCommitHash.value) return
    loadingCommitDiff.value = true
    try {
      commitDiff.value = await getCommitDiff(target, selectedCommitHash.value, relativePath)
    } catch (e) {
      commitDiff.value = null
    } finally {
      loadingCommitDiff.value = false
    }
  }

  function clearSelectedCommit(): void {
    selectedCommitHash.value = null
    selectedCommitChanges.value = null
    commitDiff.value = null
  }

  watch(
    () => currentProjectOption.value?.projectPath ?? null,
    async () => {
      await loadRootState(true)
    },
    { immediate: true }
  )

  watch(
    () => sessionsStore.unifiedSessions.map((session) => `${session.globalSessionKey}:${session.status}:${session.projectPath ?? ''}`).join('|'),
    () => {
      if (!autoFollowActivePaneProject.value) return
      void loadRootState(true)
    }
  )

  watch(
    () => workspaceStore.activeSessionRef?.globalSessionKey ?? '',
    () => {
      if (!autoFollowActivePaneProject.value) return
      void loadRootState(true)
    }
  )

  watch(panelOpen, (value) => {
    window.localStorage.setItem(INSPECTOR_PANEL_OPEN_KEY, value ? '1' : '0')
  })

  watch(sidebarVisible, (value) => {
    window.localStorage.setItem(INSPECTOR_SIDEBAR_VISIBLE_KEY, value ? '1' : '0')
  })

  watch(sidebarAutoCollapse, (value) => {
    window.localStorage.setItem(INSPECTOR_SIDEBAR_AUTO_COLLAPSE_KEY, value ? '1' : '0')
  })

  watch(activeTab, (value) => {
    window.localStorage.setItem(INSPECTOR_ACTIVE_TAB_KEY, value)
  })

  watch(autoFollowActivePaneProject, (value) => {
    window.localStorage.setItem(INSPECTOR_AUTO_FOLLOW_KEY, value ? '1' : '0')
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
