import { computed, ref, watch, type Ref } from 'vue'
import type { ProjectRef } from '@/models/unified-resource'
import type { ProjectPromptCliType } from '@/api/local-project'

// STAB-11：ProjectDetail 的项目提示词（CLAUDE.md / AGENTS.md）编辑器逻辑。
// 双 tab 缓存、加载/保存/丢弃确认、beforeunload 守卫全部收敛在此，
// 视图组件只负责呈现与把用户事件转进来。

export interface PromptEditorDeps {
  project: Ref<{ globalProjectKey: string } | null>
  projectRef: Ref<ProjectRef | null>
  enabled: Ref<boolean>
  canWrite: Ref<boolean>
  readPrompt: (projectRef: ProjectRef, cli: ProjectPromptCliType) => Promise<{ path: string; exists: boolean; content: string } | null>
  writePrompt: (projectRef: ProjectRef, cli: ProjectPromptCliType, content: string) => Promise<{ path: string; content: string } | null>
  t: (key: string) => string
  onSaved: () => void
  onSaveFailed: (message: string) => void
  confirmDiscard: (details: { title: string; message: string; details: string; confirmText: string; cancelText: string; tone: 'danger' }) => Promise<boolean>
}

interface PromptTabCache {
  loaded: boolean
  projectKey: string
  path: string
  exists: boolean
  source: string
  edit: string
}

function emptyCache(): PromptTabCache {
  return { loaded: false, projectKey: '', path: '', exists: false, source: '', edit: '' }
}

const PROMPT_TABS: ProjectPromptCliType[] = ['claude', 'codex']

export function useProjectPromptEditor(deps: PromptEditorDeps) {
  const { t } = deps

  const promptTab = ref<ProjectPromptCliType>('claude')
  const promptLoading = ref(false)
  const promptSaving = ref(false)
  const promptExists = ref(false)
  const promptFilePath = ref('')
  const promptSourceText = ref('')
  const promptEditText = ref('')
  const promptMessage = ref('')
  const promptMessageType = ref<'success' | 'error'>('success')
  const promptModified = computed(() => promptEditText.value !== promptSourceText.value)
  let promptLoadToken = 0

  const promptCache = ref<Record<ProjectPromptCliType, PromptTabCache>>(
    Object.fromEntries(PROMPT_TABS.map((tab) => [tab, emptyCache()])) as Record<ProjectPromptCliType, PromptTabCache>
  )

  const hasUnsavedPromptChanges = computed(() => {
    if (!deps.project.value) return false
    if (promptModified.value) return true
    return Object.values(promptCache.value).some((cached) => {
      return cached.loaded &&
        cached.projectKey === deps.project.value?.globalProjectKey &&
        cached.edit !== cached.source
    })
  })

  function resetPromptCache(): void {
    promptCache.value = Object.fromEntries(PROMPT_TABS.map((tab) => [tab, emptyCache()])) as Record<ProjectPromptCliType, PromptTabCache>
  }

  function cacheCurrentPromptState(tab: ProjectPromptCliType): void {
    if (!deps.project.value) return
    promptCache.value[tab] = {
      loaded: true,
      projectKey: deps.project.value.globalProjectKey,
      path: promptFilePath.value,
      exists: promptExists.value,
      source: promptSourceText.value,
      edit: promptEditText.value
    }
  }

  function applyPromptCache(tab: ProjectPromptCliType): boolean {
    if (!deps.project.value) return false
    const cached = promptCache.value[tab]
    if (!cached.loaded || cached.projectKey !== deps.project.value.globalProjectKey) return false
    promptFilePath.value = cached.path
    promptExists.value = cached.exists
    promptSourceText.value = cached.source
    promptEditText.value = cached.edit
    return true
  }

  async function loadPromptContent(force = false): Promise<void> {
    if (!deps.projectRef.value || !deps.enabled.value) return
    if (!force && applyPromptCache(promptTab.value)) return
    const token = ++promptLoadToken
    promptLoading.value = true
    promptMessage.value = ''
    try {
      const promptFile = await deps.readPrompt(deps.projectRef.value, promptTab.value)
      if (token !== promptLoadToken) return
      if (!promptFile) {
        promptMessage.value = t('config.saveError') + ': Project not found'
        promptMessageType.value = 'error'
        return
      }
      promptFilePath.value = promptFile.path
      promptExists.value = promptFile.exists
      promptSourceText.value = promptFile.content
      promptEditText.value = promptFile.content
      cacheCurrentPromptState(promptTab.value)
    } catch (e: unknown) {
      if (token !== promptLoadToken) return
      promptMessage.value = t('config.saveError') + ': ' + (e instanceof Error ? e.message : String(e))
      promptMessageType.value = 'error'
    } finally {
      if (token === promptLoadToken) promptLoading.value = false
    }
  }

  async function savePromptContent(): Promise<void> {
    if (!deps.projectRef.value || !deps.canWrite.value) return
    promptSaving.value = true
    promptMessage.value = ''
    try {
      const saved = await deps.writePrompt(deps.projectRef.value, promptTab.value, promptEditText.value)
      if (!saved) throw new Error('Project not found')
      promptFilePath.value = saved.path
      promptExists.value = true
      promptSourceText.value = saved.content
      promptEditText.value = saved.content
      cacheCurrentPromptState(promptTab.value)
      promptMessage.value = t('projectDetail.promptSaved')
      promptMessageType.value = 'success'
      deps.onSaved()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e)
      promptMessage.value = t('config.saveError') + ': ' + message
      promptMessageType.value = 'error'
      deps.onSaveFailed(message)
    } finally {
      promptSaving.value = false
    }
  }

  async function confirmDiscardUnsavedPromptChanges(): Promise<boolean> {
    cacheCurrentPromptState(promptTab.value)
    if (!hasUnsavedPromptChanges.value) return true
    return deps.confirmDiscard({
      title: t('projectDetail.promptUnsavedTitle'),
      message: t('projectDetail.promptUnsavedMessage'),
      details: promptFilePath.value
        ? t('projectDetail.promptUnsavedDetails') + '\n' + promptFilePath.value
        : t('projectDetail.promptUnsavedDetails'),
      confirmText: t('confirm.continue'),
      cancelText: t('confirm.cancel'),
      tone: 'danger'
    })
  }

  async function reloadPromptContent(): Promise<void> {
    const confirmed = await confirmDiscardUnsavedPromptChanges()
    if (!confirmed) return
    await loadPromptContent(true)
  }

  function handleBeforeUnload(event: BeforeUnloadEvent): void {
    cacheCurrentPromptState(promptTab.value)
    if (!hasUnsavedPromptChanges.value) return
    event.preventDefault()
    event.returnValue = ''
  }

  function onTabChanged(_next: ProjectPromptCliType, prev?: ProjectPromptCliType): void {
    if (prev) cacheCurrentPromptState(prev)
    void loadPromptContent()
  }

  // tab 切换：缓存旧 tab、加载新 tab（视图里 watch promptTab 或直接调 onTabChanged）。
  watch(promptTab, (_next, prev) => onTabChanged(_next, prev))

  return {
    PROMPT_TABS,
    promptTab,
    promptLoading,
    promptSaving,
    promptExists,
    promptFilePath,
    promptSourceText,
    promptEditText,
    promptMessage,
    promptMessageType,
    promptModified,
    hasUnsavedPromptChanges,
    resetPromptCache,
    cacheCurrentPromptState,
    loadPromptContent,
    savePromptContent,
    reloadPromptContent,
    confirmDiscardUnsavedPromptChanges,
    handleBeforeUnload
  }
}

export type ProjectPromptEditor = ReturnType<typeof useProjectPromptEditor>
