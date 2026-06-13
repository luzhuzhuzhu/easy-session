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
          @keydown.enter.exact.prevent="submitDraft"
        ></textarea>
        <button class="primary-button" type="button" :disabled="submitting || !canSubmit" @click="submitDraft">
          {{ draftMode === 'task' ? $t('collab.createTask') : $t('collab.send') }}
        </button>
      </div>
      <button class="icon-button" type="button" :title="$t('collab.refresh')" @click="refresh">
        <span class="live-dot" :class="{ on: connected }"></span>
      </button>
    </header>

    <div v-if="snapshot.ready === false" class="warning-band">
      {{ $t('collab.unavailable') }}<span v-if="snapshot.error"> - {{ snapshot.error }}</span>
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
              <span class="agent-dot" :class="`type-${agent.type}`"></span>
              <div class="agent-name">
                <strong>{{ agent.name }}</strong>
                <small>{{ agent.type }}</small>
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
              v-if="draftTarget"
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
            <span class="count">{{ selectedAgentName || '-' }}</span>
          </div>
          <pre v-if="targetOutputText" class="output-box">{{ targetOutputText }}</pre>
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
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import {
  createBusTask,
  getBusSnapshot,
  onBusChanged,
  sendBusMessage,
  setSessionCollabMode,
  transitionBusTask,
  type AgentCollabMode,
  type AgentTask,
  type AgentTaskStatus,
  type BusSnapshot
} from '@/api/agent-bus'
import { getOutputHistory, onSessionOutput, type OutputLine } from '@/api/local-session'
import { useToast } from '@/composables/useToast'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()

const snapshot = ref<BusSnapshot>({ agents: [], tasks: [], messages: [], ready: true, error: null })
const connected = ref(false)
const targetOutputLines = ref<OutputLine[]>([])
const draftTarget = ref('')
const draftMode = ref<'message' | 'task'>('task')
const draftText = ref('')
const submitting = ref(false)
const selectedTaskId = ref<string | null>(null)
const showUnblock = ref(false)
const showCancel = ref(false)
const unblockText = ref('')
const cancelText = ref('')
let unsubscribe: (() => void) | null = null
let unsubscribeOutput: (() => void) | null = null
let refetchTimer: ReturnType<typeof setTimeout> | null = null
let reqSeq = 0
let outputReqSeq = 0

const OPEN_STATUSES: AgentTaskStatus[] = ['created', 'delivered', 'accepted', 'in_progress', 'blocked', 'review']

const canSubmit = computed(() => !!draftTarget.value && !!draftText.value.trim())
const selectedTask = computed(() => snapshot.value.tasks.find((task) => task.id === selectedTaskId.value) || null)
const chatMessages = computed(() => snapshot.value.messages.filter((m) => m.kind !== 'event'))
const reversedMessages = computed(() => chatMessages.value.slice().reverse())
const openTaskCount = computed(() => snapshot.value.tasks.filter((task) => OPEN_STATUSES.includes(task.status)).length)
const unreadTotal = computed(() => snapshot.value.agents.reduce((sum, agent) => sum + (agent.unread || 0), 0))
const selectedAgentName = computed(() => snapshot.value.agents.find((agent) => agent.sessionId === draftTarget.value)?.name || '')
const targetOutputText = computed(() => targetOutputLines.value.map((line) => line.text).join('\n').trim())

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

watch(draftTarget, () => {
  void refreshTargetOutput()
})

watch(selectedTaskId, () => {
  showUnblock.value = false
  showCancel.value = false
  unblockText.value = ''
  cancelText.value = ''
})

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
    await refreshTargetOutput()
  } finally {
    submitting.value = false
  }
}

async function transitionTask(action: 'confirm' | 'cancel' | 'unblock', text?: string): Promise<void> {
  if (!selectedTask.value) return
  const result = await transitionBusTask(selectedTask.value.id, action, text)
  if (!result.ok) {
    toast.error(t('collab.actionFailed', { error: result.error || '-' }))
    return
  }
  await refresh()
}

async function refreshTargetOutput(): Promise<void> {
  const target = draftTarget.value
  const seq = ++outputReqSeq
  if (!target) {
    targetOutputLines.value = []
    return
  }
  try {
    const lines = await getOutputHistory(target, 80)
    if (seq !== outputReqSeq || target !== draftTarget.value) return
    targetOutputLines.value = lines.slice(-80)
    await nextTick()
  } catch {
    if (seq === outputReqSeq) targetOutputLines.value = []
  }
}

function openTargetSession(): void {
  if (!draftTarget.value) return
  void router.push({ path: '/sessions', query: { sessionId: draftTarget.value } })
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
    void refresh()
  }, 180)
}

onMounted(() => {
  void refresh()
  void refreshTargetOutput()
  unsubscribe = onBusChanged(scheduleRefetch)
  unsubscribeOutput = onSessionOutput((event) => {
    if (event.sessionId !== draftTarget.value) return
    targetOutputLines.value = [
      ...targetOutputLines.value,
      { text: event.data.replace(/\r/g, ''), stream: event.stream, timestamp: event.timestamp, seq: event.seq }
    ].slice(-80)
  })
})

onUnmounted(() => {
  if (unsubscribe) unsubscribe()
  if (unsubscribeOutput) unsubscribeOutput()
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
  grid-template-columns: minmax(170px, 220px) minmax(0, 1fr) 32px;
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
  color: var(--accent-danger, #e5484d);
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
    background: var(--status-success, #3fb950);
  }
}

.warning-band {
  padding: 7px 10px;
  border: 1px solid color-mix(in srgb, var(--accent-danger, #e5484d) 45%, var(--border-color));
  border-radius: 6px;
  color: var(--text-secondary);
  background: color-mix(in srgb, var(--accent-danger, #e5484d) 10%, transparent);
  font-size: 12px;
}

.collab-main {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 220px minmax(640px, 1fr) 300px;
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
  font-size: 10px;
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
  grid-template-columns: 8px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
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
    color: var(--text-muted);
    font-size: 10px;
  }
}

.agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary);

  &.type-claude {
    background: #c96d4d;
  }
  &.type-codex {
    background: #168f75;
  }
  &.type-opencode {
    background: #6272e8;
  }
  &.type-terminal {
    background: #c48913;
  }
}

.mode-chip,
.badge {
  border-radius: 999px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 10px;
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
  grid-template-columns: repeat(6, minmax(106px, 1fr));
  gap: 6px;
  overflow-x: auto;
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
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
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
  gap: 5px;
  overflow-y: auto;
  padding: 6px;
}

.task-card {
  padding: 6px;
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
    margin: 5px 0;
    overflow: hidden;
    color: var(--text-primary);
    font-size: 11px;
    line-height: 1.35;
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

.task-id {
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
}

.task-status {
  flex-shrink: 0;
  border-radius: 999px;
  background: var(--bg-tertiary);
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
}

.task-meta,
.detail-flow {
  color: var(--text-muted);
  font-size: 10px;
}

.task-meta span:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-content {
  margin-top: 6px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 7px 0 3px;
    color: var(--text-primary);
    font-size: 13px;
    line-height: 1.35;
    word-break: break-word;
  }
}

.result-box {
  margin-top: 8px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);

  span {
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 800;
  }

  p {
    max-height: 140px;
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
    grid-template-columns: 38px 58px minmax(0, 1fr);
    gap: 6px;
    color: var(--text-secondary);
    font-size: 10px;
    line-height: 1.35;

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  time {
    color: var(--text-muted);
  }
}

.session-preview,
.recent-messages {
  flex: 1;
  margin-top: 8px;
}

.session-preview {
  min-height: 130px;
}

.output-box {
  height: 132px;
  margin: 6px 0 0;
  padding: 7px;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
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
    font-size: 10px;
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
  color: var(--status-success, #3fb950);
}

.st-failed,
.st-rejected,
.st-cancelled,
.st-expired {
  color: var(--accent-danger, #e5484d);
}

.st-blocked {
  color: #c48913;
}

.st-in_progress,
.st-accepted,
.st-created,
.st-delivered {
  color: var(--accent-primary);
}

@media (max-width: 1240px) {
  .collab-topbar {
    grid-template-columns: 1fr 32px;
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
    max-height: 280px;
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
