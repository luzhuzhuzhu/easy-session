import { computed, ref, type ComputedRef, type Ref } from 'vue'
import {
  getProjectGitDiff,
  getProjectGitStatus,
  listProjectFiles,
  readProjectFile,
  type ProjectFileReadResult,
  type ProjectFileTreeEntry,
  type ProjectGitDiffResult,
  type ProjectGitStatusResult,
  type ProjectInspectorTarget
} from '@/api/local-project'
import type { InspectorProjectOption, InspectorTab, InspectorViewerMode } from './types'

type InspectorTextGetter = (key: string) => string

interface CreateInspectorFileDomainOptions {
  currentTarget: ComputedRef<ProjectInspectorTarget | null>
  currentProjectOption: ComputedRef<InspectorProjectOption | null>
  activeTab: Ref<InspectorTab>
  t: InspectorTextGetter
  clearGitHistory: () => void
}

export function createInspectorFileDomain(options: CreateInspectorFileDomainOptions) {
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
    if (!options.currentProjectOption.value) return options.t('inspector.noProjectHint')
    if (loadingDiff.value || loadingPreview.value) return options.t('inspector.loading')
    if (generalError.value) return generalError.value
    if (selectionSource.value === 'changes' && gitDiff.value?.message) return gitDiff.value.message

    if (!selectedRelativePath.value) {
      return options.activeTab.value === 'changes'
        ? options.t('inspector.hints.selectChange')
        : options.t('inspector.hints.selectFile')
    }

    if (filePreview.value?.kind === 'binary') return options.t('inspector.hints.binary')
    if (filePreview.value?.kind === 'too_large') return options.t('inspector.hints.tooLarge')
    if (!filePreview.value?.content && currentViewerMode.value !== 'diff') return options.t('inspector.hints.emptyPreview')
    return null
  })

  const changesMessage = computed(() => {
    if (loadingRoot.value) return options.t('inspector.loading')
    if (gitStatus.value?.state === 'non-git' || gitStatus.value?.state === 'git-unavailable') {
      return gitStatus.value.message
    }
    if (gitStatus.value?.state === 'error') {
      return gitStatus.value.message
    }
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
    options.clearGitHistory()
  }

  async function refreshGitStatusOnly(force = false): Promise<boolean> {
    const target = options.currentTarget.value
    const targetPath = options.currentProjectOption.value?.projectPath ?? null
    if (!target || !targetPath) {
      currentTargetPath.value = null
      gitStatus.value = null
      return false
    }

    if (!force && currentTargetPath.value === targetPath && gitStatus.value) {
      return true
    }

    currentTargetPath.value = targetPath
    loadingGitStatus.value = true
    generalError.value = null

    try {
      const statusResult = await getProjectGitStatus(target)
      gitStatus.value = statusResult

      if (statusResult.state !== 'ready' && options.activeTab.value === 'changes') {
        options.activeTab.value = 'files'
      }

      return true
    } catch (error) {
      gitStatus.value = null
      generalError.value = error instanceof Error ? error.message : options.t('inspector.errors.loadRootFailed')
      return false
    } finally {
      loadingGitStatus.value = false
    }
  }

  async function loadRootState(force = false): Promise<void> {
    const target = options.currentTarget.value
    const targetPath = options.currentProjectOption.value?.projectPath ?? null
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

      if (statusResult.state !== 'ready' && options.activeTab.value === 'changes') {
        options.activeTab.value = 'files'
      }
    } catch (error) {
      generalError.value = error instanceof Error ? error.message : options.t('inspector.errors.loadRootFailed')
    } finally {
      loadingGitStatus.value = false
      loadingRoot.value = false
    }
  }

  async function ensureDirectory(relativePath: string): Promise<void> {
    const target = options.currentTarget.value
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
    const target = options.currentTarget.value
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
    if (options.activeTab.value === 'changes') {
      options.activeTab.value = 'files'
    }
  }

  async function selectChangedFile(
    relativePath: string,
    viewMode: 'staged' | 'unstaged' = 'unstaged'
  ): Promise<void> {
    const target = options.currentTarget.value
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
    if (!path || !options.currentTarget.value) return

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
    const refreshed = await refreshGitStatusOnly(true)
    if (!refreshed) {
      clearSelection()
      return
    }

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

  return {
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
    changesMessage,
    clearSelection,
    refreshGitStatusOnly,
    loadRootState,
    toggleDirectory,
    selectFile,
    selectChangedFile,
    refreshCurrentFile,
    syncAfterGitMutation
  }
}
