<template>
  <div class="project-detail-page">
    <div class="content-area">
      <div v-if="!project" class="loading-state">{{ $t('config.loading') }}</div>

      <template v-else>
        <nav class="project-detail-tabs" :aria-label="$t('projectDetail.tabsLabel')">
          <button
            v-for="tab in projectDetailTabs"
            :key="tab.id"
            class="project-detail-tab"
            :class="{ active: activeProjectTab === tab.id }"
            type="button"
            @click="activeProjectTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <section v-show="activeProjectTab === 'overview'" class="overview-section">
        <div class="overview-header">
          <input
            v-model="editName"
            class="name-input"
            :class="{ disabled: !canEditProjectName }"
            :readonly="!canEditProjectName"
            @blur="saveName"
            @keydown.enter="($event.target as HTMLInputElement).blur()"
          />
          <span class="path-text">{{ project.path }}</span>
        </div>
        <div class="overview-meta">
          <span>{{ $t('projectDetail.createdAt') }}: {{ formatDate(project.createdAt) }}</span>
          <span v-if="detectResult" class="detect-badges">
            <span class="detect-badge" :class="{ found: detectResult.claude }">.claude/</span>
            <span class="detect-badge" :class="{ found: detectResult.codex }">codex</span>
            <span class="detect-badge" :class="{ found: detectResult.opencode }">.opencode/</span>
          </span>
        </div>
        <div v-if="remoteCapabilityNotice" class="capability-notice">
          {{ remoteCapabilityNotice }}
        </div>
      </section>

      <section v-show="activeProjectTab === 'sessions'" class="panel">
        <div class="panel-header">
          <span class="panel-title">{{ $t('projectDetail.sessions') }} ({{ projectSessions.length }})</span>
          <div class="panel-header-actions">
            <Button
              v-if="canCreateSessions && project"
              size="sm"
              @click="openCreateSessionDialog"
            >
              {{ $t('projectDetail.newSession') }}
            </Button>
          </div>
        </div>
        <div class="panel-body">
          <div v-if="canCreateSessions" class="session-create-hint">
            {{ $t('projectDetail.newSessionPausedHint') }}
          </div>
          <div v-if="projectSessions.length === 0" class="empty-hint">{{ $t('projectDetail.noSessions') }}</div>

            <div v-else class="session-list">
            <div v-for="s in projectSessions" :key="s.globalSessionKey" class="session-card">
              <div class="session-main" @click="toggleSessionExpand(s.sessionId)">
                <div class="session-main-left">
                  <span class="type-badge" :class="s.type">{{ s.type === 'claude' ? 'C' : s.type === 'codex' ? 'X' : 'O' }}</span>
                  <div class="session-main-text">
                    <span class="session-name">{{ s.name }}</span>
                    <span class="session-sub">
                      {{ $t(`session.status.${s.status}`) }} ·
                      {{ $t('session.singleRuntime') }}: {{ formatDuration(getSingleRuntimeMs(s)) }}
                    </span>
                  </div>
                </div>

                <div class="session-actions" @click.stop>
                  <Button size="sm" @click="openSession(s)">{{ $t('projectDetail.enterSession') }}</Button>
                  <Button
                    v-if="canStartSessions && s.status !== 'running'"
                    size="sm"
                    @click="startSessionFromProject(s.sessionId)"
                  >
                    {{ $t('session.start') }}
                  </Button>
                  <Button
                    v-else-if="canPauseSessions"
                    size="sm"
                    @click="pauseSessionFromProject(s.sessionId)"
                  >
                    {{ $t('session.pause') }}
                  </Button>
                  <Button v-if="canRestartSessions" size="sm" @click="restartSessionFromProject(s.sessionId)">{{ $t('session.restart') }}</Button>
                </div>
              </div>

              <div v-if="expandedSessionId === s.sessionId" class="session-expand">
                <div class="detail-grid">
                  <div class="detail-item"><span class="label">{{ $t('session.id') }}</span><span class="value">{{ s.sessionId }}</span></div>
                  <div class="detail-item"><span class="label">{{ $t('projectDetail.sessionType') }}</span><span class="value">{{ s.type }}</span></div>
                  <div class="detail-item"><span class="label">{{ $t('projectDetail.sessionStatus') }}</span><span class="value">{{ $t(`session.status.${s.status}`) }}</span></div>
                  <div class="detail-item"><span class="label">{{ $t('session.project') }}</span><span class="value">{{ s.projectPath }}</span></div>
                  <div class="detail-item"><span class="label">{{ $t('projectDetail.createdAt') }}</span><span class="value">{{ formatDate(s.createdAt) }}</span></div>
                  <div class="detail-item"><span class="label">{{ $t('projectDetail.lastStartAt') }}</span><span class="value">{{ formatDate(s.lastStartAt || s.createdAt) }}</span></div>
                  <div class="detail-item"><span class="label">{{ $t('session.totalRuntime') }}</span><span class="value">{{ formatDuration(getTotalRuntimeMs(s)) }}</span></div>
                  <div class="detail-item"><span class="label">{{ $t('session.singleRuntime') }}</span><span class="value">{{ formatDuration(getSingleRuntimeMs(s)) }}</span></div>
                  <div v-if="s.type === 'codex'" class="detail-item"><span class="label">{{ $t('session.permissionMode') }}</span><span class="value">{{ codexPermissionModeLabel(s) }}</span></div>
                  <div v-if="s.codexSessionId" class="detail-item"><span class="label">{{ $t('projectDetail.codexSessionId') }}</span><span class="value">{{ s.codexSessionId }}</span></div>
                  <div v-if="s.claudeSessionId" class="detail-item"><span class="label">{{ $t('projectDetail.claudeSessionId') }}</span><span class="value">{{ s.claudeSessionId }}</span></div>
                  <div v-if="s.opencodeSessionId" class="detail-item"><span class="label">{{ $t('projectDetail.opencodeSessionId') }}</span><span class="value">{{ s.opencodeSessionId }}</span></div>
                </div>

                <div class="options-wrap">
                  <button class="options-toggle" type="button" @click="toggleSessionOptions(s.sessionId)">
                    <span>{{ $t('projectDetail.sessionOptions') }}</span>
                    <span class="panel-toggle" :class="{ open: isSessionOptionsVisible(s.sessionId) }">&gt;</span>
                  </button>
                  <pre v-if="isSessionOptionsVisible(s.sessionId)" class="options-json">{{ JSON.stringify(s.options || {}, null, 2) }}</pre>
                </div>

                <div v-if="canDestroySessions" class="session-danger-zone">
                  <div>
                    <strong>{{ $t('projectDetail.sessionDangerZone') }}</strong>
                    <p>{{ $t('projectDetail.sessionDestroyHint') }}</p>
                  </div>
                  <Button size="sm" tone="danger" @click="destroySessionFromProject(s.sessionId)">{{ $t('session.destroy') }}</Button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <section v-if="showPromptPanel" v-show="activeProjectTab === 'prompts'" class="panel">
        <div class="panel-header">
          <span class="panel-title">{{ $t('projectDetail.prompts') }}</span>
        </div>
        <div class="panel-body">
          <div class="tabs prompt-tabs">
            <button class="tab" :class="{ active: promptTab === 'claude' }" @click="promptTab = 'claude'">
              {{ $t('projectDetail.promptClaudeTab') }}
            </button>
            <button class="tab" :class="{ active: promptTab === 'codex' }" @click="promptTab = 'codex'">
              {{ $t('projectDetail.promptCodexTab') }}
            </button>
          </div>

          <div class="prompt-file-row">
            <span class="file-label">{{ $t('projectDetail.promptPath') }}:</span>
            <code>{{ promptFilePath }}</code>
          </div>

          <div class="prompt-editor-wrap">
            <textarea
              v-model="promptEditText"
              class="setting-textarea prompt-editor"
              :class="{ modified: promptModified }"
              rows="12"
              spellcheck="false"
              :readonly="promptLoading || !canWritePrompt"
            />
            <div v-if="promptLoading" class="prompt-loading-overlay">{{ $t('config.loading') }}</div>
          </div>

          <div class="prompt-hints">
            <span v-if="!promptExists" class="empty-hint">{{ $t('projectDetail.promptMissing') }}</span>
            <span v-if="promptModified" class="modified-hint">{{ $t('config.modified') }}</span>
            <span v-else-if="hasUnsavedPromptChanges" class="modified-hint">{{ $t('projectDetail.promptOtherTabModified') }}</span>
          </div>

          <div class="actions">
            <Button
              size="sm"
              tone="primary"
              :disabled="!canWritePrompt || !promptModified || promptSaving"
              @click="savePromptContent"
            >
              {{ $t('config.save') }}
            </Button>
            <Button size="sm" :disabled="promptSaving" @click="reloadPromptContent">
              {{ $t('config.reload') }}
            </Button>
          </div>

          <div v-if="promptMessage" class="message" :class="promptMessageType">{{ promptMessage }}</div>
        </div>
      </section>

      <section v-if="showSkillsPanel" v-show="activeProjectTab === 'skills'" class="panel">
        <div class="panel-header">
          <span class="panel-title">{{ $t('projectDetail.skills') }} ({{ projectSkills.length }})</span>
        </div>
        <div class="panel-body">
          <div v-if="projectSkills.length === 0" class="empty-hint">
            {{ $t('projectDetail.noSkills') }}
            <div class="skills-hint">{{ $t('projectDetail.skillsHint') }}</div>
          </div>

          <div v-else class="skill-list">
            <div v-for="sk in projectSkills" :key="sk.id" class="skill-card">
              <div class="skill-main">
                <div class="skill-info">
                  <span class="type-badge" :class="sk.sourceCli">{{ sk.sourceCli === 'claude' ? 'C' : sk.sourceCli === 'codex' ? 'X' : 'O' }}</span>
                  <div class="skill-text">
                    <span class="skill-name">{{ sk.name }}</span>
                    <span class="skill-desc">{{ sk.description || '-' }}</span>
                  </div>
                </div>
                <div class="skill-actions">
                  <Button size="sm" @click="handleOpenSkillPath(sk.filePath)">{{ $t('projectDetail.openSkillPath') }}</Button>
                  <Button v-if="!sk.isBuiltin" size="sm" tone="danger" @click="handleDeleteProjectSkill(sk)">{{ $t('skill.delete') }}</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      </template>
    </div>

    <CreateSessionDialog
      :visible="showCreateSessionDialog"
      :target-instance-id="project?.instanceId || LOCAL_INSTANCE_ID"
      :target-project-id="project?.projectId"
      :target-project-path="project?.path || ''"
      :default-project-path="project?.path || ''"
      :lock-project-path="true"
      :start-paused="true"
      :activate-on-create="false"
      @cancel="closeCreateSessionDialog"
      @created="handleCreateSessionCreated"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectsStore } from '@/stores/projects'
import { useInstancesStore } from '@/stores/instances'
import { useSessionsStore } from '@/stores/sessions'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useToast } from '@/composables/useToast'
import CreateSessionDialog from '@/components/CreateSessionDialog.vue'
import Button from '@/components/ui/Button.vue'
import {
  listProjectSkills,
  deleteProjectSkill,
  openSkillPath,
  type Skill
} from '@/api/skill'
import { LOCAL_INSTANCE_ID, type ProjectRef, type UnifiedProject, type UnifiedSession } from '@/models/unified-resource'
import type { ProjectPromptCliType } from '@/api/local-project'
import { resolveProjectRouteRef } from '@/utils/project-routing'
import { buildSessionDestroyConfirmCopy, buildSessionRestartConfirmCopy } from '@/utils/session-confirm'
import { formatRemoteOperationError, formatSessionOperationTarget } from '@/utils/remote-operation-error'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const instancesStore = useInstancesStore()
const sessionsStore = useSessionsStore()
const { t } = useI18n()
const confirmDialog = useConfirmDialog()
const toast = useToast()

const project = ref<UnifiedProject | null>(null)
const detectResult = ref<{ claude: boolean; codex: boolean; opencode: boolean } | null>(null)
const projectSessions = ref<UnifiedSession[]>([])
const editName = ref('')
const showCreateSessionDialog = ref(false)
const expandedSessionId = ref<string | null>(null)
const expandedSessionOptionsIds = ref<string[]>([])

const projectSkills = ref<Skill[]>([])

type ProjectDetailTab = 'overview' | 'sessions' | 'prompts' | 'skills'

const activeProjectTab = ref<ProjectDetailTab>('overview')
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

const projectRef = computed<ProjectRef | null>(() => resolveProjectRouteRef(route))
const projectCapabilities = computed(() => {
  if (!project.value) return null
  return instancesStore.getInstance(project.value.instanceId)?.capabilities ?? null
})
const canCreateSessions = computed(() => !!projectCapabilities.value?.sessionCreate)
const canEditProjectName = computed(() => !!projectCapabilities.value?.projectUpdate)
const canStartSessions = computed(() => !!projectCapabilities.value?.sessionStart)
const canPauseSessions = computed(() => !!projectCapabilities.value?.sessionPause)
const canRestartSessions = computed(() => !!projectCapabilities.value?.sessionRestart)
const canDestroySessions = computed(() => !!projectCapabilities.value?.sessionDestroy)
const canReadPrompt = computed(() => !!projectCapabilities.value?.projectPromptRead)
const canWritePrompt = computed(() => !!projectCapabilities.value?.projectPromptWrite)
const showPromptPanel = computed(() => canReadPrompt.value || canWritePrompt.value)
const showSkillsPanel = computed(() => project.value?.instanceId === LOCAL_INSTANCE_ID)
const projectDetailTabs = computed<Array<{ id: ProjectDetailTab; label: string }>>(() => {
  const tabs: Array<{ id: ProjectDetailTab; label: string }> = [
    { id: 'overview', label: t('projectDetail.overview') },
    { id: 'sessions', label: t('projectDetail.sessions') }
  ]
  if (showPromptPanel.value) tabs.push({ id: 'prompts', label: t('projectDetail.prompts') })
  if (showSkillsPanel.value) tabs.push({ id: 'skills', label: t('projectDetail.skills') })
  return tabs
})
const remoteCapabilityNotice = computed(() => {
  if (!project.value || project.value.instanceId === LOCAL_INSTANCE_ID) return ''
  const capabilities = projectCapabilities.value
  if (!capabilities) return t('projectDetail.remoteCapabilityUnknown')

  const missing: string[] = []
  if (!capabilities.projectUpdate) missing.push(t('projectDetail.capabilityRenameProject'))
  if (!capabilities.sessionCreate) missing.push(t('projectDetail.capabilityCreateSession'))
  if (!capabilities.projectPromptRead && !capabilities.projectPromptWrite) {
    missing.push(t('projectDetail.capabilityProjectPrompt'))
  }
  missing.push(t('projectDetail.capabilityLocalSkills'))

  if (!missing.length) return ''
  return t('projectDetail.remoteCapabilityLimited', { capabilities: missing.join('、') })
})

type PromptTabCache = {
  loaded: boolean
  projectKey: string
  path: string
  exists: boolean
  source: string
  edit: string
}

const promptCache = ref<Record<ProjectPromptCliType, PromptTabCache>>({
  claude: { loaded: false, projectKey: '', path: '', exists: false, source: '', edit: '' },
  codex: { loaded: false, projectKey: '', path: '', exists: false, source: '', edit: '' }
})

const hasUnsavedPromptChanges = computed(() => {
  if (!project.value) return false
  if (promptModified.value) return true
  return Object.values(promptCache.value).some((cached) => {
    return cached.loaded &&
      cached.projectKey === project.value?.globalProjectKey &&
      cached.edit !== cached.source
  })
})

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

function formatDate(ts: number) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

function formatDuration(ms: number): string {
  const safeMs = Math.max(0, Math.floor(ms))
  const totalSec = Math.floor(safeMs / 1000)
  const days = Math.floor(totalSec / 86400)
  const hours = Math.floor((totalSec % 86400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts: string[] = []

  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`)
  parts.push(`${seconds}s`)
  return parts.join(' ')
}

function getTotalRuntimeMs(session: UnifiedSession): number {
  const base = Number.isFinite(session.totalRunMs) ? Number(session.totalRunMs) : 0
  if (session.status === 'running' && Number.isFinite(session.lastStartAt)) {
    return base + Math.max(0, now.value - Number(session.lastStartAt))
  }
  return base
}

function getSingleRuntimeMs(session: UnifiedSession): number {
  if (session.status === 'running' && Number.isFinite(session.lastStartAt)) {
    return Math.max(0, now.value - Number(session.lastStartAt))
  }
  return Number.isFinite(session.lastRunMs) ? Number(session.lastRunMs) : 0
}

function codexPermissionModeLabel(session: UnifiedSession): string {
  if (session.type !== 'codex') return '-'

  const options = session.options || {}
  const mode = typeof options.permissionsMode === 'string' ? options.permissionsMode : ''
  if (mode === 'read-only') return 'Read Only'
  if (mode === 'full-access') return 'Full Access'
  if (mode === 'default') return 'Default'

  const sandbox = typeof options.sandboxMode === 'string' ? options.sandboxMode : ''
  const approval = typeof options.approvalMode === 'string' ? options.approvalMode : ''
  if (sandbox === 'read-only') return 'Read Only'
  if (sandbox === 'danger-full-access' || approval === 'never' || approval === 'full-auto') {
    return 'Full Access'
  }

  return 'Default'
}

function toggleSessionExpand(id: string) {
  expandedSessionId.value = expandedSessionId.value === id ? null : id
}

function isSessionOptionsVisible(id: string): boolean {
  return expandedSessionOptionsIds.value.includes(id)
}

function toggleSessionOptions(id: string): void {
  expandedSessionOptionsIds.value = isSessionOptionsVisible(id)
    ? expandedSessionOptionsIds.value.filter((item) => item !== id)
    : [...expandedSessionOptionsIds.value, id]
}

function openCreateSessionDialog() {
  showCreateSessionDialog.value = true
}

function closeCreateSessionDialog() {
  showCreateSessionDialog.value = false
}

async function reloadProjectSessions() {
  if (!projectRef.value) return
  projectSessions.value = await projectsStore.listProjectSessionsForRef(projectRef.value)
  if (expandedSessionId.value && !projectSessions.value.some((item) => item.sessionId === expandedSessionId.value)) {
    expandedSessionId.value = null
  }
  expandedSessionOptionsIds.value = expandedSessionOptionsIds.value.filter((id) =>
    projectSessions.value.some((item) => item.sessionId === id)
  )
}

async function startSessionFromProject(id: string) {
  let target: UnifiedSession | undefined
  try {
    target = projectSessions.value.find((session) => session.sessionId === id)
    if (!target) throw new Error('Session not found')
    await sessionsStore.startSessionRef({
      instanceId: target.instanceId,
      sessionId: target.sessionId,
      globalSessionKey: target.globalSessionKey
    })
    await reloadProjectSessions()
    toast.success(t('toast.sessionStarted'))
  } catch (e: unknown) {
    toast.error(formatRemoteOperationError({
      t,
      instancesStore,
      instanceId: target?.instanceId || project.value?.instanceId || LOCAL_INSTANCE_ID,
      action: t('session.start'),
      target: target
        ? formatSessionOperationTarget({
            instanceId: target.instanceId,
            sessionId: target.sessionId,
            globalSessionKey: target.globalSessionKey
          }, target.name)
        : id,
      error: e
    }))
  }
}

async function pauseSessionFromProject(id: string) {
  let target: UnifiedSession | undefined
  try {
    target = projectSessions.value.find((session) => session.sessionId === id)
    if (!target) throw new Error('Session not found')
    await sessionsStore.pauseSessionRef({
      instanceId: target.instanceId,
      sessionId: target.sessionId,
      globalSessionKey: target.globalSessionKey
    })
    await reloadProjectSessions()
    toast.success(t('toast.sessionPaused'))
  } catch (e: unknown) {
    toast.error(formatRemoteOperationError({
      t,
      instancesStore,
      instanceId: target?.instanceId || project.value?.instanceId || LOCAL_INSTANCE_ID,
      action: t('session.pause'),
      target: target
        ? formatSessionOperationTarget({
            instanceId: target.instanceId,
            sessionId: target.sessionId,
            globalSessionKey: target.globalSessionKey
          }, target.name)
        : id,
      error: e
    }))
  }
}

async function restartSessionFromProject(id: string) {
  let target: UnifiedSession | undefined
  try {
    target = projectSessions.value.find((session) => session.sessionId === id)
    if (!target) throw new Error('Session not found')
    if (target.status === 'running') {
      const copy = buildSessionRestartConfirmCopy(target, t)
      const confirmed = await confirmDialog.confirm({
        title: copy.title,
        message: copy.message,
        details: copy.details,
        confirmText: t('confirm.restart'),
        cancelText: t('confirm.cancel'),
        tone: 'danger'
      })
      if (!confirmed) return
    }
    await sessionsStore.restartSessionRef({
      instanceId: target.instanceId,
      sessionId: target.sessionId,
      globalSessionKey: target.globalSessionKey
    })
    await reloadProjectSessions()
    toast.success(t('toast.sessionRestarted'))
  } catch (e: unknown) {
    toast.error(formatRemoteOperationError({
      t,
      instancesStore,
      instanceId: target?.instanceId || project.value?.instanceId || LOCAL_INSTANCE_ID,
      action: t('session.restart'),
      target: target
        ? formatSessionOperationTarget({
            instanceId: target.instanceId,
            sessionId: target.sessionId,
            globalSessionKey: target.globalSessionKey
          }, target.name)
        : id,
      error: e
    }))
  }
}

async function destroySessionFromProject(id: string) {
  const target = projectSessions.value.find((session) => session.sessionId === id)
  if (!target) {
    toast.error(t('toast.operationFailed') + ': Session not found')
    return
  }
  const copy = buildSessionDestroyConfirmCopy(target, t)
  const confirmed = await confirmDialog.confirm({
    title: copy.title,
    message: copy.message,
    details: copy.details,
    confirmText: t('confirm.destroy'),
    cancelText: t('confirm.cancel'),
    tone: 'danger'
  })
  if (!confirmed) return
  try {
    await sessionsStore.destroySessionRef({
      instanceId: target.instanceId,
      sessionId: target.sessionId,
      globalSessionKey: target.globalSessionKey
    })
    await reloadProjectSessions()
    toast.success(t('toast.sessionDestroyed'))
  } catch (e: unknown) {
    toast.error(formatRemoteOperationError({
      t,
      instancesStore,
      instanceId: target.instanceId,
      action: t('session.destroy'),
      target: formatSessionOperationTarget({
        instanceId: target.instanceId,
        sessionId: target.sessionId,
        globalSessionKey: target.globalSessionKey
      }, target.name),
      error: e
    }))
  }
}

function openSession(session: UnifiedSession) {
  void router.push({ path: '/sessions', query: { globalSessionKey: session.globalSessionKey } })
}

async function handleCreateSessionCreated() {
  closeCreateSessionDialog()
  await reloadProjectSessions()
}

function resetPromptCache() {
  promptCache.value = {
    claude: { loaded: false, projectKey: '', path: '', exists: false, source: '', edit: '' },
    codex: { loaded: false, projectKey: '', path: '', exists: false, source: '', edit: '' }
  }
}

function cacheCurrentPromptState(tab: ProjectPromptCliType) {
  if (!project.value) return
  promptCache.value[tab] = {
    loaded: true,
    projectKey: project.value.globalProjectKey,
    path: promptFilePath.value,
    exists: promptExists.value,
    source: promptSourceText.value,
    edit: promptEditText.value
  }
}

function applyPromptCache(tab: ProjectPromptCliType): boolean {
  if (!project.value) return false
  const cached = promptCache.value[tab]
  if (!cached.loaded || cached.projectKey !== project.value.globalProjectKey) return false
  promptFilePath.value = cached.path
  promptExists.value = cached.exists
  promptSourceText.value = cached.source
  promptEditText.value = cached.edit
  return true
}

async function loadPromptContent(force = false) {
  if (!project.value || !projectRef.value || !showPromptPanel.value) return
  if (!force && applyPromptCache(promptTab.value)) return
  const token = ++promptLoadToken
  promptLoading.value = true
  promptMessage.value = ''
  try {
    const promptFile = await projectsStore.readProjectPromptForRef(projectRef.value, promptTab.value)
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

async function savePromptContent() {
  if (!project.value || !projectRef.value || !canWritePrompt.value) return
  promptSaving.value = true
  promptMessage.value = ''
  try {
    const saved = await projectsStore.writeProjectPromptForRef(projectRef.value, promptTab.value, promptEditText.value)
    if (!saved) throw new Error('Project not found')

    promptFilePath.value = saved.path
    promptExists.value = true
    promptSourceText.value = saved.content
    promptEditText.value = saved.content
    cacheCurrentPromptState(promptTab.value)
    promptMessage.value = t('projectDetail.promptSaved')
    promptMessageType.value = 'success'
    toast.success(t('projectDetail.promptSaved'))
  } catch (e: unknown) {
    promptMessage.value = t('config.saveError') + ': ' + (e instanceof Error ? e.message : String(e))
    promptMessageType.value = 'error'
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  } finally {
    promptSaving.value = false
  }
}

async function reloadPromptContent() {
  const confirmed = await confirmDiscardUnsavedPromptChanges()
  if (!confirmed) return
  await loadPromptContent(true)
}

async function confirmDiscardUnsavedPromptChanges(): Promise<boolean> {
  cacheCurrentPromptState(promptTab.value)
  if (!hasUnsavedPromptChanges.value) return true

  return confirmDialog.confirm({
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

function handleBeforeUnload(event: BeforeUnloadEvent): void {
  cacheCurrentPromptState(promptTab.value)
  if (!hasUnsavedPromptChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

async function loadProjectSkills() {
  if (!project.value || project.value.instanceId !== LOCAL_INSTANCE_ID) {
    projectSkills.value = []
    return
  }
  projectSkills.value = await listProjectSkills(project.value.projectId)
}

async function handleDeleteProjectSkill(skill: Skill) {
  if (!project.value || project.value.instanceId !== LOCAL_INSTANCE_ID) return
  const confirmed = await confirmDialog.confirm({
    title: t('skill.confirmDeleteTitle'),
    message: t('skill.confirmDeleteMessage'),
    details: t('skill.confirmDeleteDetails'),
    confirmText: t('confirm.delete'),
    cancelText: t('confirm.cancel'),
    tone: 'danger'
  })
  if (!confirmed) return
  try {
    await deleteProjectSkill(project.value.projectId, skill.id)
    await loadProjectSkills()
    toast.success(t('projectDetail.skillDeleted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function handleOpenSkillPath(filePath: string) {
  await openSkillPath(filePath)
}

async function saveName() {
  if (!project.value || !projectRef.value || !canEditProjectName.value) return
  const nextName = editName.value.trim()
  if (!nextName) {
    editName.value = project.value.name
    return
  }
  if (nextName === project.value.name) return
  try {
    const updated = await projectsStore.updateProjectRef(projectRef.value, { name: nextName })
    if (!updated) {
      throw new Error('Project not found')
    }
    project.value = updated
    editName.value = updated.name
    toast.success(t('toast.projectUpdated'))
  } catch (e: unknown) {
    editName.value = project.value.name
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function loadProject() {
  const currentProjectRef = projectRef.value
  if (!currentProjectRef) {
    router.replace('/projects')
    return
  }
  try {
    const initialProject = await projectsStore.getProjectByRef(currentProjectRef)
    if (!initialProject) {
      router.replace('/projects')
      return
    }

    const shouldOpenProject = !!instancesStore.getInstance(initialProject.instanceId)?.capabilities?.projectOpen
    const p = shouldOpenProject
      ? (await projectsStore.openProjectRef(currentProjectRef).catch(() => initialProject)) ?? initialProject
      : initialProject

    if (!shouldOpenProject) {
      projectsStore.setActiveProjectRef(currentProjectRef)
    }

    if (!p) {
      router.replace('/projects')
      return
    }
    project.value = p
    projectsStore.setActiveProjectRef(currentProjectRef)
    editName.value = p.name
    expandedSessionId.value = null
    expandedSessionOptionsIds.value = []
    resetPromptCache()

    if (projectCapabilities.value?.projectDetect) {
      try {
        detectResult.value = await projectsStore.detectProjectForRef(currentProjectRef)
      } catch {
        detectResult.value = null
      }
    } else {
      detectResult.value = null
    }

    try {
      await reloadProjectSessions()
    } catch {
      projectSessions.value = []
      expandedSessionId.value = null
      expandedSessionOptionsIds.value = []
    }

    if (showPromptPanel.value) {
      await loadPromptContent()
    } else {
      promptFilePath.value = ''
      promptExists.value = false
      promptSourceText.value = ''
      promptEditText.value = ''
      promptMessage.value = ''
    }
    try {
      await loadProjectSkills()
    } catch {
      projectSkills.value = []
    }
  } catch {
    router.replace('/projects')
  }
}

onMounted(() => {
  void loadProject()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave(async () => {
  return confirmDiscardUnsavedPromptChanges()
})

onBeforeRouteUpdate(async () => {
  return confirmDiscardUnsavedPromptChanges()
})

watch(() => [route.name, route.params.id, route.params.instanceId, route.params.projectId], () => {
  void loadProject()
})

watch(promptTab, (_next, prev) => {
  if (prev) {
    cacheCurrentPromptState(prev)
  }
  if (project.value) {
    void loadPromptContent()
  }
})

watch(projectDetailTabs, (tabs) => {
  if (tabs.some((tab) => tab.id === activeProjectTab.value)) return
  activeProjectTab.value = tabs[0]?.id ?? 'overview'
})
</script>

<style scoped lang="scss">
.project-detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-md);
}

.loading-state {
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--text-muted);
}

.project-detail-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.project-detail-tab {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--font-size-sm);
  position: relative;
  bottom: -1px;

  &:hover {
    color: var(--text-primary);
    background: color-mix(in srgb, var(--bg-hover) 72%, transparent);
  }

  &.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }
}

.overview-section {
  margin-bottom: var(--spacing-sm);
}

.overview-header {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-xs);
}

.name-input {
  font-size: var(--font-size-lg);
  font-weight: 600;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0;
  color: var(--text-primary);
  padding: 2px 6px;
  transition: border-color var(--transition-fast);

  &:hover { border-color: var(--border-color); }
  &:focus { border-color: var(--accent-primary); outline: none; }
}

.path-text {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.overview-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-md);
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  padding-left: 8px;
}

.capability-notice {
  margin-top: var(--spacing-sm);
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--status-warning) 30%, var(--border-color));
  background: color-mix(in srgb, var(--status-warning) 8%, var(--bg-card));
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1.5;
}

.detect-badges { display: flex; gap: 4px; }

.detect-badge {
  padding: 1px 6px;
  border-radius: 0;
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  &.found { color: var(--status-success); background: color-mix(in srgb, var(--status-success) 12%, transparent); }
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 0;
  margin-bottom: var(--spacing-sm);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  cursor: default;
  user-select: none;
}

.panel-title { font-weight: 600; font-size: var(--font-size-sm); }

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
}

.panel-toggle {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
  &.open { transform: rotate(90deg); }
}

.panel-body { padding: 0 var(--spacing-md) var(--spacing-md); }

.session-create-hint {
  margin: var(--spacing-sm) 0;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.empty-hint {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-sm);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.session-card {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
  border-radius: 0;
  background: transparent;
}

.session-card:last-child {
  border-bottom: 0;
}

.session-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 10px 0;
}

.session-main-left {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.session-main-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.session-name {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-sub {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.session-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-wrap: wrap;
}

.session-expand {
  border-top: 1px solid var(--border-color);
  padding: 10px 0 12px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--spacing-xs) var(--spacing-sm);
}

.detail-item {
  display: flex;
  gap: var(--spacing-xs);
  font-size: var(--font-size-xs);
  align-items: baseline;
}

.detail-item .label {
  color: var(--text-muted);
  min-width: 86px;
}

.detail-item .value {
  color: var(--text-primary);
  word-break: break-all;
}

.options-wrap {
  margin-top: var(--spacing-sm);
}

.options-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 3px 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: var(--font-size-xs);
  margin-bottom: 6px;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
}

.options-json {
  margin: 0;
  padding: var(--spacing-sm);
  border-radius: 0;
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

.session-danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  margin-top: var(--spacing-sm);
  padding: var(--spacing-sm);
  border: 1px solid color-mix(in srgb, var(--status-error) 30%, var(--border-color));
  background: color-mix(in srgb, var(--status-error) 7%, var(--bg-tertiary));

  strong {
    color: var(--status-error);
    font-size: var(--font-size-xs);
  }

  p {
    margin: 3px 0 0;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    line-height: 1.45;
  }
}

.setting-textarea {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 0;
  font-size: var(--font-size-sm);
  font-family: var(--font-mono);
  resize: vertical;
  &:focus { border-color: var(--accent-primary); outline: none; }
}

.tabs {
  display: flex;
  gap: 0;
  margin-bottom: var(--spacing-sm);
  border-bottom: 1px solid var(--border-color);
}

.tab {
  padding: 4px 8px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
  bottom: -1px;

  &:hover { color: var(--text-primary); }
  &.active {
    color: var(--accent-primary);
    border-bottom-color: var(--accent-primary);
  }
}

.prompt-tabs { margin-top: var(--spacing-xs); }

.prompt-file-row {
  margin-bottom: var(--spacing-sm);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);

  .file-label { color: var(--text-muted); }

  code {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
    background: var(--bg-tertiary);
    padding: 2px 6px;
    border-radius: 0;
    word-break: break-all;
  }
}

.prompt-editor {
  min-height: 280px;
  background: var(--bg-primary);
  line-height: 1.6;
  &.modified { border-color: var(--status-warning); }
}

.prompt-editor-wrap {
  position: relative;
}

.prompt-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  background: rgba(15, 20, 25, 0.32);
  border-radius: 0;
  backdrop-filter: blur(1px);
}

.prompt-hints {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-xs);
}

.modified-hint {
  font-size: var(--font-size-xs);
  color: var(--status-warning);
}

.actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.message {
  margin-top: var(--spacing-md);
  font-size: var(--font-size-sm);
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: 0;
  &.success { color: var(--status-success); background: color-mix(in srgb, var(--status-success) 12%, transparent); }
  &.error { color: var(--status-error); background: color-mix(in srgb, var(--status-error) 12%, transparent); }
}

// type-badge is defined in global.scss

.skill-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.skill-card {
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--border-color) 72%, transparent);
  border-radius: 0;
  background: transparent;
}

.skill-card:last-child {
  border-bottom: 0;
}

.skill-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: 10px 0;
}

.skill-info {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  min-width: 0;
}

.skill-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.skill-name {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  font-weight: 600;
}

.skill-desc {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skill-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  flex-shrink: 0;
}

.skills-hint {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-top: var(--spacing-xs);
}
</style>

