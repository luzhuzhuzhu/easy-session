<template>
  <div class="project-detail-page">
    <div class="breadcrumb">
      <router-link to="/projects" class="breadcrumb-link">{{ $t('project.title') }}</router-link>
      <span class="breadcrumb-sep">/</span>
      <span class="breadcrumb-current">{{ project?.name || '...' }}</span>
    </div>

    <div v-if="!project" class="loading-state">{{ $t('config.loading') }}</div>

    <template v-else>
      <section class="overview-section">
        <div class="overview-header">
          <input
            v-model="editName"
            class="name-input"
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
          </span>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header" @click="sessionsOpen = !sessionsOpen">
          <span class="panel-title">{{ $t('projectDetail.sessions') }} ({{ projectSessions.length }})</span>
          <span class="panel-toggle" :class="{ open: sessionsOpen }">&gt;</span>
        </div>
        <div v-if="sessionsOpen" class="panel-body">
          <div v-if="projectSessions.length === 0" class="empty-hint">{{ $t('projectDetail.noSessions') }}</div>

          <div v-else class="session-list">
            <div v-for="s in projectSessions" :key="s.id" class="session-card">
              <div class="session-main" @click="toggleSessionExpand(s.id)">
                <div class="session-main-left">
                  <span class="type-badge" :class="s.type">{{ s.type === 'claude' ? 'C' : 'X' }}</span>
                  <div class="session-main-text">
                    <span class="session-name">{{ s.name }}</span>
                    <span class="session-sub">
                      {{ $t(`session.status.${s.status}`) }} ·
                      {{ $t('session.singleRuntime') }}: {{ formatDuration(getSingleRuntimeMs(s)) }}
                    </span>
                  </div>
                </div>

                <div class="session-actions" @click.stop>
                  <button class="btn btn-sm" @click="openSession(s.id)">{{ $t('projectDetail.enterSession') }}</button>
                  <button
                    v-if="s.status !== 'running'"
                    class="btn btn-sm"
                    @click="startSessionFromProject(s.id)"
                  >
                    {{ $t('session.start') }}
                  </button>
                  <button
                    v-else
                    class="btn btn-sm"
                    @click="pauseSessionFromProject(s.id)"
                  >
                    {{ $t('session.pause') }}
                  </button>
                  <button class="btn btn-sm" @click="restartSessionFromProject(s.id)">{{ $t('session.restart') }}</button>
                  <button class="btn btn-sm btn-danger" @click="destroySessionFromProject(s.id)">{{ $t('session.destroy') }}</button>
                </div>
              </div>

              <div v-if="expandedSessionId === s.id" class="session-expand">
                <div class="detail-grid">
                  <div class="detail-item"><span class="label">{{ $t('session.id') }}</span><span class="value">{{ s.id }}</span></div>
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
                </div>

                <div class="options-wrap">
                  <div class="options-title">{{ $t('projectDetail.sessionOptions') }}</div>
                  <pre class="options-json">{{ JSON.stringify(s.options || {}, null, 2) }}</pre>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <section class="panel">
        <div class="panel-header" @click="promptsOpen = !promptsOpen">
          <span class="panel-title">{{ $t('projectDetail.prompts') }}</span>
          <span class="panel-toggle" :class="{ open: promptsOpen }">&gt;</span>
        </div>
        <div v-if="promptsOpen" class="panel-body">
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

          <div v-if="promptLoading" class="loading-state">{{ $t('config.loading') }}</div>
          <template v-else>
            <textarea
              v-model="promptEditText"
              class="setting-textarea prompt-editor"
              :class="{ modified: promptModified }"
              rows="12"
              spellcheck="false"
            />

            <div class="prompt-hints">
              <span v-if="!promptExists" class="empty-hint">{{ $t('projectDetail.promptMissing') }}</span>
              <span v-if="promptModified" class="modified-hint">{{ $t('config.modified') }}</span>
            </div>

            <div class="actions">
              <button
                class="btn btn-primary btn-sm"
                :disabled="!promptModified || promptSaving"
                @click="savePromptContent"
              >
                {{ $t('config.save') }}
              </button>
              <button class="btn btn-sm" :disabled="promptSaving" @click="reloadPromptContent">
                {{ $t('config.reload') }}
              </button>
            </div>

            <div v-if="promptMessage" class="message" :class="promptMessageType">{{ promptMessage }}</div>
          </template>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header" @click="skillsOpen = !skillsOpen">
          <span class="panel-title">{{ $t('projectDetail.skills') }} ({{ projectSkills.length }})</span>
          <span class="panel-toggle" :class="{ open: skillsOpen }">&gt;</span>
        </div>
        <div v-if="skillsOpen" class="panel-body">
          <div v-if="projectSkills.length === 0" class="empty-hint">
            {{ $t('projectDetail.noSkills') }}
            <div class="skills-hint">{{ $t('projectDetail.skillsHint') }}</div>
          </div>

          <div v-else class="skill-list">
            <div v-for="sk in projectSkills" :key="sk.id" class="skill-card">
              <div class="skill-main">
                <div class="skill-info">
                  <span class="type-badge" :class="sk.sourceCli">{{ sk.sourceCli === 'claude' ? 'C' : 'X' }}</span>
                  <div class="skill-text">
                    <span class="skill-name">{{ sk.name }}</span>
                    <span class="skill-desc">{{ sk.description || '-' }}</span>
                  </div>
                </div>
                <div class="skill-actions">
                  <button class="btn btn-sm" @click="handleOpenSkillPath(sk.filePath)">{{ $t('projectDetail.openSkillPath') }}</button>
                  <button v-if="!sk.isBuiltin" class="btn btn-sm btn-danger" @click="handleDeleteProjectSkill(sk)">{{ $t('skill.delete') }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useProjectsStore } from '@/stores/projects'
import { useToast } from '@/composables/useToast'
import {
  getProject,
  detectProject,
  getProjectSessions,
  readProjectPrompt,
  writeProjectPrompt,
  type ProjectPromptCliType
} from '@/api/project'
import {
  startSession as startSessionApi,
  pauseSession as pauseSessionApi,
  restartSession as restartSessionApi,
  destroySession as destroySessionApi,
  type Session
} from '@/api/session'
import {
  listProjectSkills,
  deleteProjectSkill,
  openSkillPath,
  type Skill
} from '@/api/skill'

const route = useRoute()
const router = useRouter()
const projectsStore = useProjectsStore()
const { t } = useI18n()
const toast = useToast()

const project = ref<Awaited<ReturnType<typeof getProject>>>(null)
const detectResult = ref<{ claude: boolean; codex: boolean } | null>(null)
const projectSessions = ref<Session[]>([])
const editName = ref('')
const sessionsOpen = ref(true)
const promptsOpen = ref(true)
const expandedSessionId = ref<string | null>(null)

const skillsOpen = ref(true)
const projectSkills = ref<Skill[]>([])

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

function getTotalRuntimeMs(session: Session): number {
  const base = Number.isFinite(session.totalRunMs) ? Number(session.totalRunMs) : 0
  if (session.status === 'running' && Number.isFinite(session.lastStartAt)) {
    return base + Math.max(0, now.value - Number(session.lastStartAt))
  }
  return base
}

function getSingleRuntimeMs(session: Session): number {
  if (session.status === 'running' && Number.isFinite(session.lastStartAt)) {
    return Math.max(0, now.value - Number(session.lastStartAt))
  }
  return Number.isFinite(session.lastRunMs) ? Number(session.lastRunMs) : 0
}

function codexPermissionModeLabel(session: Session): string {
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

async function reloadProjectSessions() {
  if (!project.value) return
  projectSessions.value = await getProjectSessions(project.value.id)
  if (expandedSessionId.value && !projectSessions.value.some((item) => item.id === expandedSessionId.value)) {
    expandedSessionId.value = null
  }
}

async function startSessionFromProject(id: string) {
  try {
    await startSessionApi(id)
    await reloadProjectSessions()
    toast.success(t('toast.sessionStarted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function pauseSessionFromProject(id: string) {
  try {
    await pauseSessionApi(id)
    await reloadProjectSessions()
    toast.success(t('toast.sessionPaused'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function restartSessionFromProject(id: string) {
  try {
    await restartSessionApi(id)
    await reloadProjectSessions()
    toast.success(t('toast.sessionRestarted'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

async function destroySessionFromProject(id: string) {
  if (!confirm(t('session.confirmDestroy'))) return
  try {
    const ok = await destroySessionApi(id)
    if (!ok) throw new Error('Failed to destroy session')
    await reloadProjectSessions()
    toast.success(t('toast.sessionDestroyed'))
  } catch (e: unknown) {
    toast.error(t('toast.operationFailed') + ': ' + (e instanceof Error ? e.message : String(e)))
  }
}

function openSession(sessionId: string) {
  void router.push({ path: '/sessions', query: { sessionId } })
}

async function loadPromptContent() {
  if (!project.value) return
  promptLoading.value = true
  promptMessage.value = ''
  try {
    const promptFile = await readProjectPrompt(project.value.id, promptTab.value)
    if (!promptFile) {
      promptMessage.value = t('config.saveError') + ': Project not found'
      promptMessageType.value = 'error'
      return
    }
    promptFilePath.value = promptFile.path
    promptExists.value = promptFile.exists
    promptSourceText.value = promptFile.content
    promptEditText.value = promptFile.content
  } catch (e: unknown) {
    promptMessage.value = t('config.saveError') + ': ' + (e instanceof Error ? e.message : String(e))
    promptMessageType.value = 'error'
  } finally {
    promptLoading.value = false
  }
}

async function savePromptContent() {
  if (!project.value) return
  promptSaving.value = true
  promptMessage.value = ''
  try {
    const saved = await writeProjectPrompt(project.value.id, promptTab.value, promptEditText.value)
    if (!saved) throw new Error('Project not found')

    promptFilePath.value = saved.path
    promptExists.value = true
    promptSourceText.value = saved.content
    promptEditText.value = saved.content
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
  await loadPromptContent()
}

async function loadProjectSkills() {
  if (!project.value) return
  projectSkills.value = await listProjectSkills(project.value.id)
}

async function handleDeleteProjectSkill(skill: Skill) {
  if (!project.value || !confirm(t('skill.confirmDelete'))) return
  try {
    await deleteProjectSkill(project.value.id, skill.id)
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
  if (!project.value || editName.value === project.value.name) return
  try {
    const updated = await projectsStore.updateProject(project.value.id, { name: editName.value })
    project.value = updated
  } catch {
    // handled by global error boundary
  }
}

async function loadProject() {
  const id = route.params.id as string
  try {
    const p = await getProject(id)
    if (!p) {
      router.replace('/projects')
      return
    }
    project.value = p
    editName.value = p.name
    expandedSessionId.value = null

    detectResult.value = await detectProject(p.path)
    await reloadProjectSessions()
    await loadPromptContent()
    await loadProjectSkills()
  } catch {
    router.replace('/projects')
  }
}

onMounted(() => {
  void loadProject()
  timer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

watch(() => route.params.id, () => {
  void loadProject()
})

watch(promptTab, () => {
  if (project.value) {
    void loadPromptContent()
  }
})
</script>

<style scoped lang="scss">
.project-detail-page {
  padding: var(--spacing-xl);
  max-width: 960px;
  overflow-y: auto;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  margin-bottom: var(--spacing-lg);
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.breadcrumb-link {
  color: var(--accent-primary);
  text-decoration: none;
  &:hover { text-decoration: underline; }
}

.breadcrumb-sep { color: var(--text-muted); }
.breadcrumb-current { color: var(--text-primary); }

.loading-state {
  text-align: center;
  padding: var(--spacing-xl);
  color: var(--text-muted);
}

.overview-section {
  margin-bottom: var(--spacing-lg);
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
  border-radius: var(--radius-sm);
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

.detect-badges { display: flex; gap: 4px; }

.detect-badge {
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  background: var(--bg-tertiary);
  color: var(--text-muted);
  &.found { color: var(--status-success); background: rgba(52, 211, 153, 0.1); }
}

.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  margin-bottom: var(--spacing-md);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md) var(--spacing-lg);
  cursor: pointer;
  user-select: none;
  &:hover { background: var(--bg-hover); border-radius: var(--radius-lg); }
}

.panel-title { font-weight: 600; font-size: var(--font-size-md); }

.panel-toggle {
  color: var(--text-muted);
  transition: transform var(--transition-fast);
  &.open { transform: rotate(90deg); }
}

.panel-body { padding: 0 var(--spacing-lg) var(--spacing-lg); }

.empty-hint {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin-bottom: var(--spacing-sm);
}

.session-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.session-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

.session-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
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
  padding: var(--spacing-sm);
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

.options-title {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
  margin-bottom: 4px;
}

.options-json {
  margin: 0;
  padding: var(--spacing-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: var(--font-size-xs);
  font-family: var(--font-mono);
  white-space: pre-wrap;
  word-break: break-word;
}

.setting-textarea {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
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
  padding: 6px 12px;
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
    border-radius: var(--radius-sm);
    word-break: break-all;
  }
}

.prompt-editor {
  min-height: 280px;
  background: var(--bg-primary);
  line-height: 1.6;
  &.modified { border-color: var(--status-warning); }
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
  border-radius: var(--radius-md);
  &.success { color: var(--status-success); background: rgba(52, 211, 153, 0.1); }
  &.error { color: var(--status-error); background: rgba(248, 113, 113, 0.1); }
}

// type-badge, btn, btn-sm, btn-primary, btn-danger are defined in global.scss

.skill-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.skill-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-secondary);
}

.skill-main {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-sm);
  padding: var(--spacing-sm);
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
