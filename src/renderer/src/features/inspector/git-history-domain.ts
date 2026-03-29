import { ref, type ComputedRef, type Ref } from 'vue'
import {
  commitProjectChanges,
  fetchProjectGitRemote,
  getCommitChanges,
  getCommitDiff,
  getProjectGitBranches,
  getProjectGitFileHistory,
  getProjectGitLog,
  pullProjectGitCurrentBranch,
  pushProjectGitCurrentBranch,
  type ProjectGitBranchesResult,
  type ProjectGitCommitChangesResult,
  type ProjectGitFileHistoryResult,
  type ProjectGitLogResult,
  type ProjectInspectorTarget
} from '@/api/local-project'
import type { InspectorProjectOption, InspectorTab } from './types'

type InspectorTextGetter = (key: string) => string

interface CreateInspectorGitHistoryDomainOptions {
  currentTarget: ComputedRef<ProjectInspectorTarget | null>
  currentProjectOption: ComputedRef<InspectorProjectOption | null>
  activeTab: Ref<InspectorTab>
  t: InspectorTextGetter
  loadRootState: (force?: boolean) => Promise<void>
  refreshGitStatusOnly: (force?: boolean) => Promise<boolean>
  clearSelection: () => void
}

export function createInspectorGitHistoryDomain(options: CreateInspectorGitHistoryDomainOptions) {
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

  async function loadGitLog(append = false): Promise<void> {
    const target = options.currentTarget.value
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
    const target = options.currentTarget.value
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
    if (options.activeTab.value === 'history') {
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
    return message || options.t('inspector.errors.loadRootFailed')
  }

  async function loadGitFileHistory(relativePath: string, append = false): Promise<void> {
    const target = options.currentTarget.value
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

  async function commitChanges(message: string): Promise<void> {
    const target = options.currentTarget.value
    if (!target) return
    const wasHistoryTab = options.activeTab.value === 'history'
    await commitProjectChanges(target, message)
    options.clearSelection()
    await options.refreshGitStatusOnly(true)
    await refreshGitHistoryContext()
    viewedBranchName.value = gitBranches.value?.currentBranch ?? viewedBranchName.value
    if (!wasHistoryTab) {
      await loadGitLog()
    }
  }

  async function inspectBranch(branchName: string): Promise<void> {
    viewedBranchName.value = branchName
    options.activeTab.value = 'history'
    clearSelectedCommit()
    if (!gitBranches.value) {
      await loadGitBranches()
    }
    await loadGitLog()
  }

  async function fetchGitRemote(): Promise<void> {
    const target = options.currentTarget.value
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
    const target = options.currentTarget.value
    if (!target) return
    syncingGitRemote.value = 'pull'
    gitSyncError.value = null
    try {
      await pullProjectGitCurrentBranch(target)
      await options.loadRootState(true)
      await refreshGitHistoryContext()
    } catch (error) {
      gitSyncError.value = normalizeGitSyncError(error)
    } finally {
      syncingGitRemote.value = null
    }
  }

  async function pushGitCurrentBranch(): Promise<void> {
    const target = options.currentTarget.value
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
    const target = options.currentTarget.value
    if (!target) return
    selectedCommitHash.value = commitHash
    loadingCommitChanges.value = true
    commitDiff.value = null
    try {
      selectedCommitChanges.value = await getCommitChanges(target, commitHash)
    } catch {
      selectedCommitChanges.value = null
    } finally {
      loadingCommitChanges.value = false
    }
  }

  async function loadCommitFileDiff(relativePath: string): Promise<void> {
    const target = options.currentTarget.value
    if (!target || !selectedCommitHash.value) return
    loadingCommitDiff.value = true
    try {
      commitDiff.value = await getCommitDiff(target, selectedCommitHash.value, relativePath)
    } catch {
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

  return {
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
  }
}
