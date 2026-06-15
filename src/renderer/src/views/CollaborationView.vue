<template>
  <div class="collab-view">
    <header class="collab-topbar">
      <div class="title-block">
        <h2>{{ $t('collab.title') }}</h2>
        <div class="top-stats">
          <span>{{ snapshot.agents.length }} {{ $t('collab.agents') }}</span>
          <span>{{ openTaskCount }} {{ $t('collab.tasks') }}</span>
          <span>{{ unreadTotal }} {{ $t('collab.messages') }}</span>
        </div>
      </div>
      <div class="composer">
        <select v-model="draftTarget" class="target-select" :aria-label="$t('collab.target')">
          <option value="" disabled>{{ $t('collab.targetPlaceholder') }}</option>
          <option v-for="agent in snapshot.agents" :key="agent.sessionId" :value="agent.sessionId">
            {{ agent.name }}
          </option>
        </select>
        <div class="mode-toggle" role="group">
          <button type="button" :class="{ active: draftMode === 'task' }" @click="draftMode = 'task'">
            {{ $t('collab.modeTask') }}
          </button>
          <button type="button" :class="{ active: draftMode === 'message' }" @click="draftMode = 'message'">
            {{ $t('collab.modeMessage') }}
          </button>
        </div>
        <textarea
          v-model.trim="draftText"
          :placeholder="draftMode === 'task' ? $t('collab.taskPlaceholder') : $t('collab.messagePlaceholder')"
          @keydown="handleDraftKeydown"
        ></textarea>
        <button class="primary-button" type="button" :disabled="submitting || !canSubmit" @click="submitDraft">
          {{ draftMode === 'task' ? $t('collab.createTask') : $t('collab.send') }}
        </button>
      </div>
      <div class="topbar-actions">
        <button
          class="secondary-button copy-skill-button"
          type="button"
          :disabled="copyingSkill"
          :title="$t('collab.copySkillHint')"
          @click="copyCollabSkill"
        >
          {{ $t('collab.copySkill') }}
        </button>
        <button class="icon-button" type="button" :title="$t('collab.refresh')" @click="refresh">
          <span class="live-dot" :class="{ on: connected }"></span>
        </button>
      </div>
    </header>

    <div v-if="snapshot.ready === false" class="warning-band">
      {{ $t('collab.unavailable') }}<span v-if="snapshot.error"> - {{ snapshot.error }}</span>
    </div>
    <div v-else-if="skillInstallFailed" class="warning-band">
      {{ $t('collab.skillInstallFailed') }}
      <button class="tiny-button" type="button" @click="copyCollabSkill">{{ $t('collab.copySkill') }}</button>
    </div>

    <main class="collab-main">
      <aside class="agent-rail">
        <div class="rail-head">
          <span class="section-label">{{ $t('collab.agents') }}</span>
          <span class="count">{{ snapshot.agents.length }}</span>
        </div>
        <div v-if="snapshot.agents.length" class="agent-list">
          <article
            v-for="agent in snapshot.agents"
            :key="agent.sessionId"
            class="agent-row"
            :class="{ selected: draftTarget === agent.sessionId }"
            @click="draftTarget = agent.sessionId"
          >
            <div class="agent-main">
              <span class="agent-avatar" :class="`type-${agent.type}`">
                <span v-if="agentIcon(agent)" class="session-emoji">{{ agentIcon(agent) }}</span>
                <span v-else class="type-letter">{{ cliTypeBadgeLetter(agent.type) }}</span>
              </span>
              <div class="agent-name">
                <strong>{{ agent.name }}</strong>
                <small>
                  <span>{{ agent.type }}</span>
                  <span v-if="agentSession(agent.sessionId)"> · {{ statusLabelForSession(agent.sessionId) }}</span>
                </small>
              </div>
              <span class="mode-chip" :class="{ muted: !agent.injectable }">{{ shortModeLabel(agent.collabMode) }}</span>
            </div>
            <div class="agent-badges">
              <span class="badge">{{ agent.unread || 0 }}</span>
              <span class="badge">{{ agent.activeTaskCount || 0 }}</span>
            </div>
            <div v-if="agent.type === 'terminal'" class="terminal-mode" :title="$t('collab.terminalRisk')" @click.stop>
              <select :value="agent.collabMode" @change="handleModeSelect(agent.sessionId, $event)">
                <option value="terminal-readonly">{{ modeLabel('terminal-readonly') }}</option>
                <option value="terminal-nudge">{{ modeLabel('terminal-nudge') }}</option>
                <option value="terminal-inject">{{ modeLabel('terminal-inject') }}</option>
              </select>
            </div>
          </article>
        </div>
        <p v-else class="empty">{{ $t('collab.noAgents') }}</p>
      </aside>

      <section class="task-board">
        <div class="board-head">
          <span class="section-label">{{ $t('collab.tasks') }}</span>
          <span class="board-filter">{{ selectedAgentName || $t('collab.target') }}</span>
        </div>
        <div class="board-grid">
          <div v-for="col in taskColumns" :key="col.key" class="board-col">
            <div class="col-head" :class="`col-${col.key}`">
              <span>{{ col.label }}</span>
              <b>{{ col.tasks.length }}</b>
            </div>
            <div class="col-body">
              <article
                v-for="task in col.tasks"
                :key="task.id"
                class="task-card"
                :class="{ selected: selectedTaskId === task.id }"
                @click="selectedTaskId = task.id"
              >
                <div class="task-top">
                  <span class="task-id">{{ task.id }}</span>
                  <span class="task-status" :class="`st-${task.status}`">{{ statusLabel(task.status) }}</span>
                </div>
                <h3>{{ task.title }}</h3>
                <div class="task-meta">
                  <span>{{ task.fromName }} -> {{ task.toName }}</span>
                  <span>{{ relTime(task.updatedAt) }}</span>
                </div>
              </article>
              <p v-if="!col.tasks.length" class="empty compact"></p>
            </div>
          </div>
        </div>
      </section>

      <aside class="detail-pane">
        <div class="detail-head">
          <span class="section-label">{{ $t('collab.detail') }}</span>
          <div class="detail-tools">
            <button
              v-if="targetSessionRef"
              class="tiny-button"
              type="button"
              @click="openTargetSession"
            >
              {{ $t('collab.openSession') }}
            </button>
            <button
              v-if="selectedTask?.result"
              class="tiny-button"
              type="button"
              @click="copyResult(selectedTask.result)"
            >
              {{ $t('collab.copyResult') }}
            </button>
          </div>
        </div>
        <div v-if="selectedTask" class="detail-content">
          <div class="detail-title">
            <span class="task-id">{{ selectedTask.id }}</span>
            <span class="task-status" :class="`st-${selectedTask.status}`">{{ statusLabel(selectedTask.status) }}</span>
          </div>
          <h3>{{ selectedTask.title }}</h3>
          <p class="detail-flow">{{ selectedTask.fromName }} -> {{ selectedTask.toName }}</p>

          <div v-if="latestTaskText(selectedTask)" class="task-note">
            <span>{{ $t('collab.history') }}</span>
            <p>{{ latestTaskText(selectedTask) }}</p>
          </div>

          <div v-if="selectedTask.result" class="result-box">
            <span>{{ $t('collab.result') }}</span>
            <p>{{ selectedTask.result }}</p>
          </div>

          <div class="task-actions">
            <button
              v-if="selectedTask.status === 'review' && selectedTask.from === 'user'"
              class="primary-button small"
              type="button"
              @click="transitionTask('confirm')"
            >
              {{ $t('collab.confirmDone') }}
            </button>
            <button
              v-if="selectedTask.status === 'blocked' && selectedTask.from === 'user'"
              class="secondary-button small"
              type="button"
              @click="showUnblock = !showUnblock"
            >
              {{ $t('collab.unblockTask') }}
            </button>
            <button
              v-if="canCancel(selectedTask)"
              class="danger-button small"
              type="button"
              @click="showCancel = !showCancel"
            >
              {{ $t('collab.cancelTask') }}
            </button>
          </div>

          <div class="manual-status">
            <div class="manual-status-row">
              <label>{{ $t('collab.manualStatus') }}</label>
              <select v-model="manualStatus" @change="manualStatusTouched = true">
                <option v-for="status in manualStatusOptions" :key="status" :value="status">
                  {{ statusLabel(status) }}
                </option>
              </select>
              <button
                class="secondary-button small"
                type="button"
                :disabled="manualStatusBusy || !selectedTask || (manualStatus === selectedTask.status && !manualStatusNote)"
                @click="applyManualStatus"
              >
                {{ $t('collab.applyStatus') }}
              </button>
            </div>
            <textarea v-model.trim="manualStatusNote" :placeholder="$t('collab.manualStatusPlaceholder')"></textarea>
          </div>

          <div v-if="showUnblock" class="inline-form">
            <textarea v-model.trim="unblockText" :placeholder="$t('collab.unblockPlaceholder')"></textarea>
            <button class="primary-button small" type="button" @click="transitionTask('unblock', unblockText)">
              {{ $t('collab.unblockTask') }}
            </button>
          </div>

          <div v-if="showCancel" class="inline-form">
            <textarea v-model.trim="cancelText" :placeholder="$t('collab.cancelPlaceholder')"></textarea>
            <button class="danger-button small" type="button" @click="transitionTask('cancel', cancelText)">
              {{ $t('collab.cancelTask') }}
            </button>
          </div>

          <div class="history">
            <span class="section-label">{{ $t('collab.history') }}</span>
            <ol>
              <li v-for="item in selectedTask.history" :key="`${item.at}-${item.status}-${item.by}`">
                <time>{{ clock(item.at) }}</time>
                <b :class="`st-${item.status}`">{{ statusLabel(item.status) }}</b>
                <span v-if="item.text">{{ item.text }}</span>
              </li>
            </ol>
          </div>
        </div>
        <p v-else class="empty">{{ $t('collab.noTaskSelected') }}</p>

        <div class="session-preview">
          <div class="detail-head">
            <span class="section-label">{{ $t('collab.sessionPreview') }}</span>
            <span class="count">{{ activeTerminalName || '-' }}</span>
          </div>
          <TerminalOutput
            v-if="targetSessionRef"
            class="collab-terminal"
            :session-ref="targetSessionRef"
            :process-key="targetProcessKey"
            pane-id="collaboration"
            @clear="clearTargetSessionOutput"
          />
          <p v-else class="empty compact">{{ $t('collab.noOutputPreview') }}</p>
        </div>

        <div class="recent-messages">
          <div class="detail-head">
            <span class="section-label">{{ $t('collab.messages') }}</span>
            <span class="count">{{ chatMessages.length }}</span>
          </div>
          <article v-for="msg in reversedMessages.slice(0, 6)" :key="msg.id" class="msg-row">
            <div>
              <strong>{{ msg.fromName }}</strong>
              <span>-> {{ nameOf(msg.to) }}</span>
              <time>{{ clock(msg.createdAt) }}</time>
            </div>
            <p>{{ msg.body }}</p>
          </article>
          <p v-if="!chatMessages.length" class="empty compact">{{ $t('collab.noMessages') }}</p>
        </div>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TerminalOutput from '@/components/TerminalOutput.vue'
import {
  createBusTask,
  getCollabSkillMarkdown,
  getBusSnapshot,
  onBusChanged,
  sendBusMessage,
  setBusTaskStatus,
  setSessionCollabMode,
  transitionBusTask,
  type AgentCollabMode,
  type AgentTask,
  type AgentTaskStatus,
  type BusSnapshot
} from '@/api/agent-bus'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useSessionsStore } from '@/stores/sessions'
import {
  buildGlobalSessionKey,
  LOCAL_INSTANCE_ID,
  type SessionRef,
  type UnifiedSession
} from '@/models/unified-resource'
import { cliTypeBadgeLetter } from '@shared/cli-types'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const confirmDialog = useConfirmDialog()
const sessionsStore = useSessionsStore()

const snapshot = ref<BusSnapshot>({ agents: [], tasks: [], messages: [], ready: true, error: null })
const connected = ref(false)
const draftTarget = ref('')
const draftMode = ref<'message' | 'task'>('task')
const draftText = ref('')
const submitting = ref(false)
const selectedTaskId = ref<string | null>(null)
const showUnblock = ref(false)
const showCancel = ref(false)
const unblockText = ref('')
const cancelText = ref('')
const manualStatus = ref<AgentTaskStatus>('created')
const manualStatusNote = ref('')
const manualStatusBusy = ref(false)
const manualStatusTouched = ref(false)
const copyingSkill = ref(false)
let unsubscribe: (() => void) | null = null
let refetchTimer: ReturnType<typeof setTimeout> | null = null
let reqSeq = 0

const OPEN_STATUSES: AgentTaskStatus[] = ['created', 'delivered', 'accepted', 'in_progress', 'blocked', 'review']
const manualStatusOptions: AgentTaskStatus[] = [
  'created',
  'delivered',
  'accepted',
  'in_progress',
  'blocked',
  'review',
  'done',
  'failed',
  'rejected',
  'cancelled',
  'expired'
]

const canSubmit = computed(() => !!draftTarget.value && !!draftText.value.trim())
const selectedTask = computed(() => snapshot.value.tasks.find((task) => task.id === selectedTaskId.value) || null)
const chatMessages = computed(() => snapshot.value.messages.filter((m) => m.kind !== 'event'))
const reversedMessages = computed(() => chatMessages.value.slice().reverse())
const openTaskCount = computed(() => snapshot.value.tasks.filter((task) => OPEN_STATUSES.includes(task.status)).length)
const unreadTotal = computed(() => snapshot.value.agents.reduce((sum, agent) => sum + (agent.unread || 0), 0))
const skillInstallFailed = computed(() => {
  const install = snapshot.value.skillInstall
  return !!install && !install.ok && install.failed.length > 0
})
const selectedAgentName = computed(() => snapshot.value.agents.find((agent) => agent.sessionId === draftTarget.value)?.name || '')
const sessionById = computed(() => {
  const index = new Map<string, UnifiedSession>()
  for (const session of sessionsStore.unifiedSessions) {
    index.set(session.sessionId, session)
  }
  return index
})
const activeTerminalSessionId = computed(() => {
  const task = selectedTask.value
  if (task) return task.to === 'user' ? task.from : task.to
  return draftTarget.value
})
const activeTerminalSession = computed(() => agentSession(activeTerminalSessionId.value))
const activeTerminalName = computed(() => activeTerminalSession.value?.name || nameOf(activeTerminalSessionId.value))
const targetSessionRef = computed<SessionRef | null>(() => {
  const sessionId = activeTerminalSessionId.value
  if (!sessionId || sessionId === 'user') return null
  return {
    instanceId: LOCAL_INSTANCE_ID,
    sessionId,
    globalSessionKey: buildGlobalSessionKey(LOCAL_INSTANCE_ID, sessionId)
  }
})
const targetProcessKey = computed(() => activeTerminalSession.value?.processId ?? null)

const taskColumns = computed(() => {
  const tasks = snapshot.value.tasks
  return [
    { key: 'pending', label: t('collab.colPending'), tasks: tasks.filter((x) => x.status === 'created' || x.status === 'delivered') },
    { key: 'active', label: t('collab.colActive'), tasks: tasks.filter((x) => x.status === 'accepted' || x.status === 'in_progress') },
    { key: 'blocked', label: t('collab.colBlocked'), tasks: tasks.filter((x) => x.status === 'blocked') },
    { key: 'review', label: t('collab.colReview'), tasks: tasks.filter((x) => x.status === 'review') },
    { key: 'done', label: t('collab.colDone'), tasks: tasks.filter((x) => x.status === 'done') },
    {
      key: 'closed',
      label: t('collab.colClosed'),
      tasks: tasks.filter((x) => x.status === 'failed' || x.status === 'rejected' || x.status === 'cancelled' || x.status === 'expired')
    }
  ]
})

watch(
  () => snapshot.value.agents,
  (agents) => {
    if (!draftTarget.value && agents[0]) draftTarget.value = agents[0].sessionId
    if (draftTarget.value && !agents.some((agent) => agent.sessionId === draftTarget.value)) {
      draftTarget.value = agents[0]?.sessionId || ''
    }
  },
  { immediate: true }
)

watch(selectedTaskId, () => {
  showUnblock.value = false
  showCancel.value = false
  unblockText.value = ''
  cancelText.value = ''
  manualStatusNote.value = ''
  manualStatusTouched.value = false
  manualStatus.value = selectedTask.value?.status ?? 'created'
})

watch(
  () => selectedTask.value?.status,
  (status) => {
    if (status && !manualStatusTouched.value && !manualStatusBusy.value) manualStatus.value = status
  }
)

function modeLabel(mode: AgentCollabMode): string {
  return t(`collab.collabModeLabel.${mode}`)
}

function shortModeLabel(mode: AgentCollabMode): string {
  switch (mode) {
    case 'known-agent':
      return 'agent'
    case 'terminal-readonly':
      return 'ro'
    case 'terminal-nudge':
      return 'nudge'
    case 'terminal-inject':
      return 'inject'
    default:
      return mode
  }
}

function statusLabel(status: string): string {
  return t(`collab.status.${status}`)
}

function nameOf(sessionId: string): string {
  const hit = snapshot.value.agents.find((a) => a.sessionId === sessionId)
  return hit ? hit.name : sessionId === 'user' ? t('collab.you') : sessionId.slice(0, 8)
}

function agentSession(sessionId: string): UnifiedSession | undefined {
  return sessionById.value.get(sessionId)
}

function agentIcon(agent: { sessionId: string }): string | null {
  return agentSession(agent.sessionId)?.icon ?? null
}

function statusLabelForSession(sessionId: string): string {
  const status = agentSession(sessionId)?.status
  return status ? t(`session.status.${status}`) : ''
}

function latestTaskText(task: AgentTask): string {
  const hit = task.history
    .slice()
    .reverse()
    .find((item) => !!item.text && item.text !== task.title)
  return hit?.text || ''
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function relTime(at: number): string {
  const diff = Math.max(0, Date.now() - at)
  if (diff < 60_000) return t('collab.justNow')
  if (diff < 3_600_000) return t('collab.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('collab.hoursAgo', { n: Math.floor(diff / 3_600_000) })
  return clock(at)
}

function canCancel(task: AgentTask): boolean {
  return task.from === 'user' && OPEN_STATUSES.includes(task.status)
}

function handleDraftKeydown(e: KeyboardEvent): void {
  // Send on Ctrl/Cmd+Enter instead of bare Enter, so multi-line drafts are not
  // fired off accidentally on the first newline.
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    void submitDraft()
  }
}

async function submitDraft(): Promise<void> {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    const result =
      draftMode.value === 'task'
        ? await createBusTask(draftTarget.value, draftText.value)
        : await sendBusMessage(draftTarget.value, draftText.value)
    if (!result.ok) {
      toast.error(t('collab.actionFailed', { error: result.error || '-' }))
      return
    }
    if (draftMode.value === 'task') {
      toast.success(t('collab.taskCreated', { id: result.taskId || '' }))
      selectedTaskId.value = result.taskId || selectedTaskId.value
    } else {
      toast.success(t('collab.messageSent'))
    }
    draftText.value = ''
    await refresh()
  } finally {
    submitting.value = false
  }
}

async function transitionTask(action: 'confirm' | 'cancel' | 'unblock', text?: string): Promise<void> {
  if (!selectedTask.value) return
  const taskId = selectedTask.value.id
  if (action === 'cancel') {
    const confirmed = await confirmDialog.confirm({
      title: t('collab.confirmCancelTitle'),
      message: t('collab.confirmCancelMessage', { id: taskId }),
      confirmText: t('collab.cancelTask'),
      cancelText: t('confirm.cancel'),
      tone: 'danger'
    })
    if (!confirmed) return
  }
  const result = await transitionBusTask(taskId, action, text)
  if (!result.ok) {
    toast.error(t('collab.actionFailed', { error: result.error || '-' }))
    return
  }
  showUnblock.value = false
  showCancel.value = false
  unblockText.value = ''
  cancelText.value = ''
  await refresh()
  selectedTaskId.value = taskId
}

async function applyManualStatus(): Promise<void> {
  if (!selectedTask.value || manualStatusBusy.value) return
  const taskId = selectedTask.value.id
  const confirmed = await confirmDialog.confirm({
    title: t('collab.confirmManualStatusTitle'),
    message: t('collab.confirmManualStatusMessage', {
      id: taskId,
      status: statusLabel(manualStatus.value)
    }),
    confirmText: t('collab.applyStatus'),
    cancelText: t('confirm.cancel'),
    tone: 'danger'
  })
  if (!confirmed) return
  manualStatusBusy.value = true
  try {
    const result = await setBusTaskStatus(taskId, manualStatus.value, manualStatusNote.value)
    if (!result.ok) {
      toast.error(t('collab.actionFailed', { error: result.error || '-' }))
      return
    }
    toast.success(t('collab.statusUpdated'))
    showUnblock.value = false
    showCancel.value = false
    unblockText.value = ''
    cancelText.value = ''
    manualStatusNote.value = ''
    manualStatusTouched.value = false
    await refresh()
    selectedTaskId.value = taskId
  } finally {
    manualStatusBusy.value = false
  }
}

async function copyCollabSkill(): Promise<void> {
  if (copyingSkill.value) return
  copyingSkill.value = true
  try {
    const markdown = await getCollabSkillMarkdown()
    await navigator.clipboard.writeText(markdown)
    toast.success(t('collab.skillCopied'))
  } catch {
    toast.error(t('collab.copyFailed'))
  } finally {
    copyingSkill.value = false
  }
}

function openTargetSession(): void {
  const sessionRef = targetSessionRef.value
  if (!sessionRef) return
  void router.push({ path: '/sessions', query: { globalSessionKey: sessionRef.globalSessionKey } })
}

async function clearTargetSessionOutput(): Promise<void> {
  const sessionRef = targetSessionRef.value
  if (!sessionRef) return
  await sessionsStore.clearSessionOutputRef(sessionRef)
}

async function changeMode(sessionId: string, rawMode: string): Promise<void> {
  const mode = rawMode as AgentCollabMode
  const result = await setSessionCollabMode(sessionId, mode)
  if (!result.ok) {
    toast.error(t('collab.actionFailed', { error: result.error || '-' }))
    return
  }
  toast.success(t('collab.modeSaved'))
  await refresh()
}

function handleModeSelect(sessionId: string, event: Event): void {
  const value = event.target instanceof HTMLSelectElement ? event.target.value : ''
  if (value) void changeMode(sessionId, value)
}

async function copyResult(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  toast.success(t('collab.copied'))
}

async function refresh(): Promise<void> {
  const seq = ++reqSeq
  try {
    const snap = await getBusSnapshot()
    if (seq !== reqSeq) return
    snapshot.value = snap
    connected.value = snap.ready !== false
    if (selectedTaskId.value && !snap.tasks.some((task) => task.id === selectedTaskId.value)) {
      selectedTaskId.value = null
    }
  } catch {
    if (seq === reqSeq) connected.value = false
  }
}

function scheduleRefetch(): void {
  if (refetchTimer) return
  refetchTimer = setTimeout(() => {
    refetchTimer = null
    void sessionsStore.fetchSessions()
    void refresh()
  }, 180)
}

onMounted(() => {
  void sessionsStore.fetchSessions()
  void refresh()
  unsubscribe = onBusChanged(scheduleRefetch)
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  if (refetchTimer) clearTimeout(refetchTimer)
})
</script>

<style scoped lang="scss">
.collab-view {
  height: calc(100vh - 44px);
  min-height: 0;
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--bg-primary);
}

.collab-topbar {
  min-height: 44px;
  display: grid;
  grid-template-columns: minmax(170px, 220px) minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.title-block {
  min-width: 0;

  h2 {
    margin: 0;
    color: var(--text-primary);
    font-size: 16px;
    font-weight: 750;
    line-height: 1.1;
  }
}

.top-stats {
  display: flex;
  gap: 8px;
  margin-top: 4px;
  color: var(--text-muted);
  font-size: 11px;
  white-space: nowrap;
}

.composer {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(130px, 180px) 112px minmax(180px, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.copy-skill-button {
  white-space: nowrap;
}

select,
textarea {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font: inherit;
}

select {
  height: 32px;
  padding: 0 8px;
}

textarea {
  height: 32px;
  min-height: 32px;
  max-height: 86px;
  padding: 7px 9px;
  resize: vertical;
  line-height: 1.25;
}

.primary-button,
.secondary-button,
.danger-button,
.tiny-button,
.icon-button,
.mode-toggle button {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease, transform 120ms ease;

  &:hover:not(:disabled) {
    color: var(--text-primary);
    border-color: var(--accent-primary);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}

.primary-button {
  height: 32px;
  padding: 0 12px;
  border-color: var(--accent-primary);
  background: var(--accent-primary);
  color: var(--bg-primary);
  font-weight: 750;
  white-space: nowrap;
}

.secondary-button,
.danger-button,
.tiny-button {
  height: 28px;
  padding: 0 9px;
  font-size: 12px;
  font-weight: 650;
}

.danger-button {
  color: var(--status-error);
}

.small {
  height: 26px;
}

.icon-button {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
}

.mode-toggle {
  height: 32px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;

  button {
    border: 0;
    border-radius: 0;
    padding: 0;
    font-size: 12px;

    &.active {
      background: color-mix(in srgb, var(--accent-primary) 18%, var(--bg-secondary));
      color: var(--text-primary);
      font-weight: 750;
    }
  }
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);

  &.on {
    background: var(--status-success);
  }
}

.warning-band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--status-error) 45%, var(--border-color));
  border-radius: 6px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--status-error) 10%, transparent);
  font-size: 12px;
}

.collab-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px minmax(560px, 1fr) minmax(420px, 34vw);
  gap: 8px;
}

.agent-rail,
.task-board,
.detail-pane {
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg-secondary) 74%, transparent);
}

.agent-rail,
.detail-pane {
  padding: 8px;
}

.task-board {
  min-width: 0;
  padding: 8px 8px 6px;
}

.rail-head,
.board-head,
.detail-head {
  min-height: 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
}

.section-label {
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
}

.count,
.board-filter {
  color: var(--text-muted);
  font-size: 11px;
}

.detail-tools {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.agent-list,
.detail-content,
.session-preview,
.recent-messages {
  min-height: 0;
  overflow-y: auto;
}

.detail-pane {
  overflow: hidden;
  gap: 8px;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: 6px;
}

.agent-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  padding: 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: var(--bg-primary);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;

  &:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 48%, var(--border-color));
  }

  &.selected {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 8%, var(--bg-primary));
  }
}

.agent-main {
  min-width: 0;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.agent-name {
  min-width: 0;

  strong,
  small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.2;
  }

  small {
    display: flex;
    align-items: center;
    gap: 3px;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }
}

.agent-avatar {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-primary) 14%, var(--bg-tertiary));
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 800;
  line-height: 1;

  // Keep avatar tints aligned with the semantic .type-badge palette in
  // global.scss so they stay theme-aware instead of fixed brand hex.
  &.type-claude {
    background: color-mix(in srgb, var(--accent-primary) 18%, var(--bg-tertiary));
  }
  &.type-codex {
    background: color-mix(in srgb, var(--badge-codex) 18%, var(--bg-tertiary));
  }
  &.type-opencode {
    background: color-mix(in srgb, var(--status-info) 18%, var(--bg-tertiary));
  }
  &.type-terminal {
    background: color-mix(in srgb, var(--status-success) 18%, var(--bg-tertiary));
  }
}

.session-emoji {
  font-size: 16px;
}

.type-letter {
  font-size: 11px;
  letter-spacing: 0;
}

.mode-chip,
.badge {
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 1;
  padding: 3px 6px;

  &.muted {
    color: var(--text-muted);
  }
}

.agent-badges {
  display: flex;
  align-items: center;
  gap: 4px;
}

.terminal-mode {
  grid-column: 1 / -1;

  select {
    height: 28px;
    font-size: 11px;
  }
}

.board-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(6, minmax(146px, 1fr));
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.board-col {
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
}

.col-head {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 750;
}

.col-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding: 8px;
}

.task-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-height: 96px;
  padding: 9px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
  cursor: pointer;
  transition: border-color 120ms ease, background 120ms ease;

  &:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 52%, var(--border-color));
  }

  &.selected {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-secondary));
  }

  h3 {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    margin: 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.45;
    word-break: break-word;
  }
}

.task-top,
.task-meta,
.detail-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.task-card .task-top,
.task-card .task-meta {
  min-width: 0;
}

.task-card .task-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card .task-status {
  max-width: 74px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-card .task-meta {
  margin-top: auto;
  padding-top: 2px;
  border-top: 1px solid color-mix(in srgb, var(--border-color) 62%, transparent);
}

.task-id {
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
}

.task-status {
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--bg-tertiary);
  font-size: var(--font-size-xs);
  line-height: 1;
  padding: 3px 6px;
}

.task-meta,
.detail-flow {
  color: var(--text-muted);
  font-size: 10.5px;
}

.task-meta span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-content {
  flex: 1 1 320px;
  min-height: 220px;
  margin-top: 6px;
  padding: 0 2px 8px 0;
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 7px 0 3px;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 1.35;
    word-break: break-word;
  }
}

.task-note,
.result-box {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);

  span {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-weight: 800;
  }

  p {
    max-height: 180px;
    margin: 5px 0 0;
    overflow-y: auto;
    color: var(--text-secondary);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.45;
  }
}

.task-actions,
.inline-form {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.manual-status {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-primary) 72%, transparent);
}

.manual-status-row {
  display: grid;
  grid-template-columns: auto minmax(120px, 1fr) auto;
  align-items: center;
  gap: 6px;

  label {
    color: var(--text-muted);
    font-size: var(--font-size-xs);
    font-weight: 800;
    white-space: nowrap;
  }

  select {
    height: 28px;
    font-size: 12px;
  }
}

.manual-status textarea {
  height: 44px;
  min-height: 44px;
  margin-top: 6px;
  resize: vertical;
}

.inline-form textarea {
  flex-basis: 100%;
  height: 62px;
}

.history {
  margin-top: 10px;

  ol {
    display: flex;
    flex-direction: column;
    gap: 5px;
    list-style: none;
    padding: 0;
    margin: 6px 0 0;
  }

  li {
    display: grid;
    grid-template-columns: 38px 64px minmax(0, 1fr);
    gap: 6px;
    color: var(--text-secondary);
    font-size: var(--font-size-xs);
    line-height: 1.35;

    span {
      min-width: 0;
      white-space: pre-wrap;
      word-break: break-word;
    }
  }

  time {
    color: var(--text-muted);
  }
}

.session-preview,
.recent-messages {
  margin-top: 8px;
}

.session-preview {
  flex: 1.4 1 280px;
  display: flex;
  flex-direction: column;
  min-height: 220px;
  overflow: hidden;
}

.recent-messages {
  flex: 0 0 132px;
  overflow-y: auto;
}

.collab-terminal {
  flex: 1 1 auto;
  min-height: 0;
  margin: 6px 0 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
}

.msg-row {
  margin-top: 6px;
  padding: 7px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);

  div {
    display: flex;
    align-items: center;
    gap: 5px;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  strong {
    color: var(--text-primary);
  }

  time {
    margin-left: auto;
  }

  p {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    margin: 4px 0 0;
    overflow: hidden;
    color: var(--text-secondary);
    word-break: break-word;
    font-size: 11px;
    line-height: 1.35;
  }
}

.empty {
  color: var(--text-muted);
  font-size: 12px;
  margin: 10px 0;

  &.compact {
    min-height: 10px;
    margin: 0;
    text-align: center;
    opacity: 0.55;
  }
}

.st-done,
.st-review {
  color: var(--status-success);
}

.st-failed,
.st-rejected,
.st-cancelled,
.st-expired {
  color: var(--status-error);
}

.st-blocked {
  color: var(--status-warning);
}

.st-in_progress,
.st-accepted,
.st-created,
.st-delivered {
  color: var(--accent-primary);
}

@media (max-width: 1240px) {
  .collab-topbar {
    grid-template-columns: 1fr auto;
  }

  .composer {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .collab-main {
    grid-template-columns: 210px minmax(500px, 1fr);
  }

  .detail-pane {
    grid-column: 1 / -1;
    min-height: 460px;
  }
}

@container (max-width: 700px) {
  .collab-view {
    overflow: auto;
  }

  .collab-topbar,
  .composer,
  .collab-main {
    grid-template-columns: 1fr;
  }

  .icon-button {
    justify-self: start;
  }

  .board-grid {
    min-height: 360px;
  }
}
</style>
