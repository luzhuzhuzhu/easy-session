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
        <div class="target-multiselect">
          <button
            type="button"
            class="ms-trigger"
            :class="{ filled: draftTargets.length > 0 }"
            :aria-label="$t('collab.target')"
            :aria-expanded="targetMenuOpen"
            @click="targetMenuOpen = !targetMenuOpen"
          >
            <span class="ms-trigger-text">
              {{ draftTargets.length ? $t('collab.targetsSelected', { count: draftTargets.length }) : $t('collab.targetPlaceholder') }}
            </span>
            <span class="ms-caret" aria-hidden="true">▾</span>
          </button>
          <div v-if="targetMenuOpen" class="ms-backdrop" @click="targetMenuOpen = false"></div>
          <div v-if="targetMenuOpen" class="ms-panel" role="listbox">
            <button type="button" class="ms-all" @click="toggleAllTargets">
              {{ allTargetsSelected ? $t('collab.clearAll') : $t('collab.selectAllOnline') }}
            </button>
            <label v-for="agent in snapshot.agents" :key="agent.sessionId" class="ms-option">
              <input
                type="checkbox"
                :checked="isTarget(agent.sessionId)"
                @change="toggleTarget(agent.sessionId)"
              />
              <span class="ms-option-name">{{ agent.name }}</span>
              <span class="ms-option-type">{{ agent.type }}</span>
            </label>
            <p v-if="!snapshot.agents.length" class="ms-empty">{{ $t('collab.noAgents') }}</p>
          </div>
        </div>
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
        <div class="layout-menu-wrap">
          <button
            class="icon-button"
            type="button"
            :title="$t('collab.layoutMenu')"
            :aria-label="$t('collab.layoutMenu')"
            :aria-expanded="layoutMenuOpen"
            @click="layoutMenuOpen = !layoutMenuOpen"
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
              <rect x="6.4" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
              <rect x="10.8" y="3" width="3.2" height="10" rx="1" fill="currentColor" />
            </svg>
          </button>
          <div v-if="layoutMenuOpen" class="ms-backdrop" @click="layoutMenuOpen = false"></div>
          <div v-if="layoutMenuOpen" class="layout-panel">
            <div class="layout-section">
              <span class="section-label">{{ $t('collab.layoutPresets') }}</span>
              <button
                v-for="preset in LAYOUT_PRESETS"
                :key="preset.id"
                type="button"
                class="ms-preset"
                @click="dock.applyPreset(preset.id); layoutMenuOpen = false"
              >
                {{ $t(`collab.layoutPreset_${preset.id}`) }}
              </button>
            </div>
            <div class="layout-section">
              <span class="section-label">{{ $t('collab.layoutPanels') }}</span>
              <label v-for="pid in ALL_PANELS" :key="pid" class="ms-option">
                <input
                  type="checkbox"
                  :checked="isPanelVisible(pid)"
                  :disabled="isPanelVisible(pid) && dockLeafCount <= 1"
                  @change="togglePanelVisible(pid)"
                />
                <span class="ms-option-name">{{ panelLabel(pid) }}</span>
              </label>
            </div>
            <button type="button" class="ms-all" @click="dock.resetLayout()">{{ $t('collab.resetLayout') }}</button>
          </div>
        </div>
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
      <CollabDock :node="dockRoot" path="root">
        <template #panel="{ panelId }">
          <!-- 成员栏 -->
          <CollabMembersPanel
            v-if="panelId === 'members'"
            :agents="snapshot.agents"
            :active-agent-id="activeAgentId"
            :selected-targets="draftTargets"
            :all-selected="allTargetsSelected"
            :session-of="agentSession"
            :agent-icon="agentIcon"
            :status-label-for-session="statusLabelForSession"
            :short-mode-label="shortModeLabel"
            :mode-label="modeLabel"
            @toggle-all="toggleAllTargets"
            @focus-agent="focusAgent"
            @toggle-target="toggleTarget"
            @change-mode="handleModeSelect"
          />

          <!-- 任务看板 -->
          <CollabBoardPanel
            v-else-if="panelId === 'board'"
            :columns="taskColumns"
            :archived-tasks="archivedTasks"
            :archived-count="archivedCount"
            :selected-task-id="selectedTaskId"
            :show-archived="showArchived"
            :active-agent-name="activeAgentName"
            :status-label="statusLabel"
            :rel-time="relTime"
            :is-archivable="isArchivable"
            @toggle-archived="showArchived = !showArchived"
            @select-task="selectTask"
            @archive-task="archiveTask"
            @unarchive-task="unarchiveTask"
          />

          <!-- 任务详情 -->
          <CollabTaskDetailPanel
            v-else-if="panelId === 'taskDetail'"
            :task="selectedTask"
            :has-target-session="!!targetSessionRef"
            :show-unblock="showUnblock"
            :show-cancel="showCancel"
            :unblock-text="unblockText"
            :cancel-text="cancelText"
            :manual-status="manualStatus"
            :manual-status-note="manualStatusNote"
            :manual-status-busy="manualStatusBusy"
            :manual-status-options="manualStatusOptions"
            :status-label="statusLabel"
            :clock="clock"
            :can-cancel="canCancel"
            :is-archivable="isArchivable"
            @open-session="openTargetSession"
            @copy-result="copyResult"
            @transition="transitionTask"
            @toggle-unblock="showUnblock = !showUnblock"
            @toggle-cancel="showCancel = !showCancel"
            @archive-task="archiveTask"
            @unarchive-task="unarchiveTask"
            @update:manual-status="manualStatus = $event as AgentTaskStatus"
            @update:manual-status-note="manualStatusNote = $event"
            @update:unblock-text="unblockText = $event"
            @update:cancel-text="cancelText = $event"
            @status-touched="manualStatusTouched = true"
            @apply-status="applyManualStatus"
          />

          <!-- 会话预览 -->
          <CollabPreviewPanel
            v-else-if="panelId === 'preview'"
            :active-terminal-name="activeTerminalName"
            :has-target-session="!!targetSessionRef"
          >
            <TerminalOutput
              v-if="targetSessionRef"
              class="collab-terminal"
              :session-ref="targetSessionRef"
              :process-key="targetProcessKey"
              pane-id="collaboration"
            />
          </CollabPreviewPanel>

          <!-- 聊天 -->
          <CollabChatPanel
            v-else-if="panelId === 'chat'"
            ref="chatPanelRef"
            :active-agent-id="activeAgentId"
            :active-agent-name="activeAgentName"
            :conversation="conversation"
            :chat-input="chatInput"
            :chat-sending="chatSending"
            :command-menu-open="commandMenuOpen"
            :filtered-commands="filteredCommands"
            :active-menu-index="activeMenuIndex"
            :clock="clock"
            @update:chat-input="chatInput = $event"
            @complete-command="completeCommand"
            @chat-keydown="handleChatKeydown"
            @submit-chat="submitChat"
          />
        </template>
      </CollabDock>
    </main>
  </div>
</template>

<script setup lang="ts">
// STAB-2：显式组件名供 MainLayout keep-alive include 匹配
defineOptions({ name: 'CollaborationView' })
import { computed, nextTick, onMounted, onUnmounted, onDeactivated, provide, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TerminalOutput from '@/components/TerminalOutput.vue'
import CollabDock from '@/components/CollabDock.vue'
import CollabMembersPanel from '@/components/collab/CollabMembersPanel.vue'
import CollabBoardPanel from '@/components/collab/CollabBoardPanel.vue'
import CollabTaskDetailPanel from '@/components/collab/CollabTaskDetailPanel.vue'
import CollabPreviewPanel from '@/components/collab/CollabPreviewPanel.vue'
import CollabChatPanel from '@/components/collab/CollabChatPanel.vue'
import { useCollabDock, COLLAB_DOCK_KEY, ALL_PANELS, LAYOUT_PRESETS } from '@/composables/useCollabDock'
import {
  archiveBusTask,
  createBusTask,
  getCollabSkillMarkdown,
  sendBusMessage,
  setBusTaskStatus,
  setSessionCollabMode,
  transitionBusTask,
  unarchiveBusTask,
  type AgentCollabMode,
  type AgentTask,
  type AgentTaskStatus,
  type BusActionResult
} from '@/api/agent-bus'
import { useToast } from '@/composables/useToast'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useSessionsStore } from '@/stores/sessions'
import { useCollabStore } from '@/stores/collab'
import {
  buildGlobalSessionKey,
  LOCAL_INSTANCE_ID,
  type SessionRef,
  type UnifiedSession
} from '@/models/unified-resource'

const { t } = useI18n()
const router = useRouter()
const toast = useToast()
const confirmDialog = useConfirmDialog()
const sessionsStore = useSessionsStore()
const collabStore = useCollabStore()

// 复用全局 collab store 的快照与连接态（不再各自订阅 onBusChanged）。
const snapshot = computed(() => collabStore.snapshot)
const connected = computed(() => collabStore.connected)

// 群发目标（多选，广播用）。
const draftTargets = ref<string[]>([])
const targetMenuOpen = ref(false)
// 当前聚焦的成员（聊天/终端预览/斜杠命令上下文，单选）。
const activeAgentId = ref('')
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
const showArchived = ref(false)

// 聊天输入与斜杠命令菜单状态。
const chatInput = ref('')
const chatSending = ref(false)
const activeMenuIndex = ref(0)
const menuDismissed = ref(false)
const chatScrollEl = ref<HTMLElement | null>(null)
const chatInputEl = ref<HTMLTextAreaElement | null>(null)

// ===== 自由 dock 布局（二叉树，逻辑见 composables/useCollabDock.ts）=====
const layoutMenuOpen = ref(false)
const dock = useCollabDock()
provide(COLLAB_DOCK_KEY, dock)
const dockRoot = dock.root
const visiblePanelIds = dock.visiblePanelIds
const dockLeafCount = dock.leafCount

function isPanelVisible(id: string): boolean {
  return visiblePanelIds.value.includes(id)
}
function togglePanelVisible(id: string): void {
  if (isPanelVisible(id)) dock.hidePanel(id)
  else dock.showPanel(id)
}
function panelLabel(id: string): string {
  return t(`collab.panel.${id}`)
}

// ===== 任务/归档 =====
const OPEN_STATUSES: AgentTaskStatus[] = ['created', 'delivered', 'accepted', 'in_progress', 'blocked', 'review']
const TERMINAL_STATUSES = new Set<AgentTaskStatus>(['done', 'failed', 'rejected', 'cancelled', 'expired'])
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

interface SlashCommand {
  name: string
  argHint: string
  descKey: string
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'task', argHint: '<desc>', descKey: 'collab.cmd.task' },
  { name: 'confirm', argHint: '', descKey: 'collab.cmd.confirm' },
  { name: 'cancel', argHint: '[reason]', descKey: 'collab.cmd.cancel' },
  { name: 'block', argHint: '<question>', descKey: 'collab.cmd.block' },
  { name: 'unblock', argHint: '<answer>', descKey: 'collab.cmd.unblock' },
  { name: 'mode', argHint: 'readonly|nudge|inject', descKey: 'collab.cmd.mode' }
]

const canSubmit = computed(() => draftTargets.value.length > 0 && !!draftText.value.trim())
const selectedTask = computed(() => snapshot.value.tasks.find((task) => task.id === selectedTaskId.value) || null)
const chatMessages = computed(() => snapshot.value.messages.filter((m) => m.kind !== 'event'))
const openTaskCount = computed(() => snapshot.value.tasks.filter((task) => OPEN_STATUSES.includes(task.status)).length)
const unreadTotal = computed(() => snapshot.value.agents.reduce((sum, agent) => sum + (agent.unread || 0), 0))
const skillInstallFailed = computed(() => {
  const install = snapshot.value.skillInstall
  return !!install && !install.ok && install.failed.length > 0
})

const allTargetsSelected = computed(
  () => snapshot.value.agents.length > 0 && snapshot.value.agents.every((agent) => draftTargets.value.includes(agent.sessionId))
)
const activeAgent = computed(() => snapshot.value.agents.find((agent) => agent.sessionId === activeAgentId.value) || null)
const activeAgentName = computed(() => activeAgent.value?.name || '')

const archivedTasks = computed(() =>
  snapshot.value.tasks
    .filter((task) => task.archivedAt)
    .slice()
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
)
const archivedCount = computed(() => archivedTasks.value.length)

function isArchivable(task: AgentTask): boolean {
  return !task.archivedAt && TERMINAL_STATUSES.has(task.status)
}

// 当前聚焦成员与用户之间的会话流（按时间正序，便于聊天阅读）。
const conversation = computed(() => {
  const id = activeAgentId.value
  if (!id) return []
  return chatMessages.value
    .filter((m) => (m.from === id && m.to === 'user') || (m.from === 'user' && m.to === id))
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt)
})

// 斜杠命令：仅在“正在键入命令名”阶段（以 / 开头且尚未输入空格）弹菜单。
const commandQuery = computed(() => {
  const text = chatInput.value
  if (!text.startsWith('/')) return null
  if (/\s/.test(text)) return null
  return text.slice(1).toLowerCase()
})
const filteredCommands = computed(() => {
  const query = commandQuery.value
  if (query === null) return []
  return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(query))
})
const commandMenuOpen = computed(() => !menuDismissed.value && filteredCommands.value.length > 0)

const sessionById = computed(() => {
  const index = new Map<string, UnifiedSession>()
  for (const session of sessionsStore.unifiedSessions) {
    index.set(session.sessionId, session)
  }
  return index
})
const activeTerminalSession = computed(() => agentSession(activeAgentId.value))
const activeTerminalName = computed(() => activeTerminalSession.value?.name || activeAgentName.value)
const targetSessionRef = computed<SessionRef | null>(() => {
  const sessionId = activeAgentId.value
  if (!sessionId || sessionId === 'user') return null
  return {
    instanceId: LOCAL_INSTANCE_ID,
    sessionId,
    globalSessionKey: buildGlobalSessionKey(LOCAL_INSTANCE_ID, sessionId)
  }
})
const targetProcessKey = computed(() => activeTerminalSession.value?.processId ?? null)

const taskColumns = computed(() => {
  const tasks = snapshot.value.tasks.filter((task) => !task.archivedAt)
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
    if (!activeAgentId.value && agents[0]) activeAgentId.value = agents[0].sessionId
    if (activeAgentId.value && !agents.some((agent) => agent.sessionId === activeAgentId.value)) {
      activeAgentId.value = agents[0]?.sessionId || ''
    }
    const live = new Set(agents.map((agent) => agent.sessionId))
    const pruned = draftTargets.value.filter((id) => live.has(id))
    if (pruned.length !== draftTargets.value.length) draftTargets.value = pruned
  },
  { immediate: true }
)

watch(
  () => snapshot.value.tasks,
  (tasks) => {
    if (selectedTaskId.value && !tasks.some((task) => task.id === selectedTaskId.value)) {
      selectedTaskId.value = null
    }
  }
)

watch(
  () => collabStore.snapshot,
  () => {
    // UX-4：停留在协作页时不再无条件 markSeen——任何 bus 推送（含发给别人的事件）
    // 都会刷新水位并清掉 notified 去重集，吞掉本应弹出的系统通知。
    // 水位统一在离开页面时（onUnmounted / onDeactivated）结算。
  }
)

watch(
  () => collabStore.pendingFocusTaskId,
  (taskId) => {
    if (taskId) consumePendingFocus()
  }
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

watch(chatInput, (text) => {
  if (!text.startsWith('/')) menuDismissed.value = false
  if (activeMenuIndex.value >= filteredCommands.value.length) activeMenuIndex.value = 0
})

watch(
  () => [activeAgentId.value, conversation.value.length],
  () => {
    void nextTick(() => {
      const el = chatScrollEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
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

function focusAgent(sessionId: string): void {
  activeAgentId.value = sessionId
}

function selectTask(taskId: string): void {
  selectedTaskId.value = taskId
  const task = snapshot.value.tasks.find((item) => item.id === taskId)
  if (task) {
    const counterpart = task.to === 'user' ? task.from : task.to
    if (counterpart && counterpart !== 'user') activeAgentId.value = counterpart
  }
}

function isTarget(sessionId: string): boolean {
  return draftTargets.value.includes(sessionId)
}

function toggleTarget(sessionId: string): void {
  const set = new Set(draftTargets.value)
  if (set.has(sessionId)) set.delete(sessionId)
  else set.add(sessionId)
  draftTargets.value = [...set]
}

function toggleAllTargets(): void {
  if (allTargetsSelected.value) draftTargets.value = []
  else draftTargets.value = snapshot.value.agents.map((agent) => agent.sessionId)
}

function consumePendingFocus(): void {
  const taskId = collabStore.consumeFocusTask()
  if (taskId && snapshot.value.tasks.some((task) => task.id === taskId)) {
    selectTask(taskId)
  }
}

function handleDraftKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    void submitDraft()
  }
}

function reportBroadcast(result: BusActionResult, isTask: boolean): void {
  const results = result.results
  if (results && results.length) {
    const okCount = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok)
    if (!failed.length) {
      toast.success(t(isTask ? 'collab.broadcastTaskOk' : 'collab.broadcastMsgOk', { count: okCount }))
    } else if (!okCount) {
      toast.error(t('collab.broadcastAllFailed', { names: failed.map((r) => nameOf(r.targetId)).join(', ') }))
    } else {
      toast.warning(
        t('collab.broadcastPartial', {
          ok: okCount,
          failed: failed.length,
          names: failed.map((r) => nameOf(r.targetId)).join(', ')
        })
      )
    }
    return
  }
  if (result.ok) toast.success(isTask ? t('collab.taskCreated', { id: result.taskId || '' }) : t('collab.messageSent'))
  else toast.error(t('collab.actionFailed', { error: result.error || '-' }))
}

async function submitDraft(): Promise<void> {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  try {
    const targets = [...draftTargets.value]
    const isTask = draftMode.value === 'task'
    const result = isTask ? await createBusTask(targets, draftText.value) : await sendBusMessage(targets, draftText.value)
    reportBroadcast(result, isTask)
    if (result.ok) {
      draftText.value = ''
      if (isTask && result.taskId) selectedTaskId.value = result.taskId
    }
    await collabStore.refresh()
  } finally {
    submitting.value = false
  }
}

function completeCommand(cmd: SlashCommand): void {
  chatInput.value = `/${cmd.name} `
  menuDismissed.value = false
  void nextTick(() => {
    const el = chatInputEl.value
    if (el) {
      el.focus()
      el.selectionStart = el.selectionEnd = el.value.length
    }
  })
}

function handleChatKeydown(e: KeyboardEvent): void {
  if (commandMenuOpen.value) {
    const count = filteredCommands.value.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      activeMenuIndex.value = (activeMenuIndex.value + 1) % count
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      activeMenuIndex.value = (activeMenuIndex.value - 1 + count) % count
      return
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const cmd = filteredCommands.value[activeMenuIndex.value]
      if (cmd) completeCommand(cmd)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      menuDismissed.value = true
      return
    }
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    void submitChat()
  }
}

async function submitChat(): Promise<void> {
  const text = chatInput.value.trim()
  if (!text || chatSending.value) return
  chatSending.value = true
  try {
    if (text.startsWith('/')) {
      await runSlashCommand(text)
      return
    }
    if (!activeAgentId.value) {
      toast.error(t('collab.cmdNeedMember'))
      return
    }
    const result = await sendBusMessage([activeAgentId.value], text)
    if (!result.ok) {
      toast.error(t('collab.actionFailed', { error: result.error || '-' }))
      return
    }
    chatInput.value = ''
    await collabStore.refresh()
  } finally {
    chatSending.value = false
  }
}

function requireTask(task: AgentTask | null): task is AgentTask {
  if (!task) {
    toast.error(t('collab.cmdNeedTask'))
    return false
  }
  return true
}

function finishCommand(result: BusActionResult, onOk?: () => void): void {
  if (!result.ok) {
    toast.error(t('collab.actionFailed', { error: result.error || '-' }))
    return
  }
  toast.success(t('collab.cmdDone'))
  chatInput.value = ''
  onOk?.()
  void collabStore.refresh()
}

async function runSlashCommand(raw: string): Promise<void> {
  const body = raw.slice(1)
  const spaceIdx = body.search(/\s/)
  const name = (spaceIdx >= 0 ? body.slice(0, spaceIdx) : body).toLowerCase()
  const arg = spaceIdx >= 0 ? body.slice(spaceIdx + 1).trim() : ''
  const task = selectedTask.value

  switch (name) {
    case 'task': {
      if (!activeAgentId.value) {
        toast.error(t('collab.cmdNeedMember'))
        return
      }
      if (!arg) {
        toast.error(t('collab.cmdNeedArg'))
        return
      }
      const result = await createBusTask([activeAgentId.value], arg)
      finishCommand(result, () => {
        if (result.taskId) selectedTaskId.value = result.taskId
      })
      return
    }
    case 'confirm': {
      if (!requireTask(task)) return
      finishCommand(await transitionBusTask(task.id, 'confirm'))
      return
    }
    case 'cancel': {
      if (!requireTask(task)) return
      const confirmed = await confirmDialog.confirm({
        title: t('collab.confirmCancelTitle'),
        message: t('collab.confirmCancelMessage', { id: task.id }),
        confirmText: t('collab.cancelTask'),
        cancelText: t('confirm.cancel'),
        tone: 'danger'
      })
      if (!confirmed) return
      finishCommand(await transitionBusTask(task.id, 'cancel', arg || undefined))
      return
    }
    case 'unblock': {
      if (!requireTask(task)) return
      if (!arg) {
        toast.error(t('collab.cmdNeedArg'))
        return
      }
      finishCommand(await transitionBusTask(task.id, 'unblock', arg))
      return
    }
    case 'block': {
      if (!requireTask(task)) return
      finishCommand(await setBusTaskStatus(task.id, 'blocked', arg || undefined))
      return
    }
    case 'mode': {
      if (!activeAgentId.value) {
        toast.error(t('collab.cmdNeedMember'))
        return
      }
      const map: Record<string, AgentCollabMode> = {
        readonly: 'terminal-readonly',
        nudge: 'terminal-nudge',
        inject: 'terminal-inject'
      }
      const mode = map[arg.toLowerCase()]
      if (!mode) {
        toast.error(t('collab.cmdBadMode'))
        return
      }
      finishCommand(await setSessionCollabMode(activeAgentId.value, mode))
      return
    }
    default:
      toast.error(t('collab.cmdUnknown', { name }))
  }
}

async function archiveTask(taskId: string): Promise<void> {
  const result = await archiveBusTask(taskId)
  if (!result.ok) {
    toast.error(t('collab.actionFailed', { error: result.error || '-' }))
    return
  }
  toast.success(t('collab.taskArchived'))
  await collabStore.refresh()
}

async function unarchiveTask(taskId: string): Promise<void> {
  const result = await unarchiveBusTask(taskId)
  if (!result.ok) {
    toast.error(t('collab.actionFailed', { error: result.error || '-' }))
    return
  }
  toast.success(t('collab.taskUnarchived'))
  await collabStore.refresh()
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
  await collabStore.refresh()
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
    await collabStore.refresh()
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


async function changeMode(sessionId: string, rawMode: string): Promise<void> {
  const mode = rawMode as AgentCollabMode
  const result = await setSessionCollabMode(sessionId, mode)
  if (!result.ok) {
    toast.error(t('collab.actionFailed', { error: result.error || '-' }))
    return
  }
  toast.success(t('collab.modeSaved'))
  await collabStore.refresh()
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
  await collabStore.refresh()
}

onMounted(async () => {
  void sessionsStore.fetchSessions()
  await collabStore.refresh()
  collabStore.markSeen()
  consumePendingFocus()
})

// STAB-2 keep-alive 后本组件不再 unmount，改用 onDeactivated 结算已读水位；
// onUnmounted 保留给真正关闭场景（keep-alive include 移除/应用关闭）。
onDeactivated(() => {
  collabStore.markSeen()
})

onUnmounted(() => {
  collabStore.markSeen()
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

.target-multiselect {
  position: relative;
  min-width: 0;
}

.ms-trigger {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;

  &.filled {
    color: var(--text-primary);
    border-color: color-mix(in srgb, var(--accent-primary) 55%, var(--border-color));
  }

  &:hover {
    border-color: var(--accent-primary);
  }
}

.ms-trigger-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ms-caret {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 10px;
}

.ms-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.ms-panel,
.layout-panel {
  position: absolute;
  z-index: 50;
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card, var(--bg-secondary));
  box-shadow: var(--shadow-lg);
}

.ms-panel {
  top: calc(100% + 4px);
  left: 0;
  width: max(220px, 100%);
}

.layout-panel {
  top: calc(100% + 6px);
  right: 0;
  width: 240px;
}

.layout-section {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 2px;

  .section-label {
    margin: 2px 4px 4px;
  }
}

// UX-14：布局预设按钮（与面板复选行区分的次级样式）
.ms-preset {
  height: 26px;
  margin: 0 2px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
  }
}

.ms-all {
  height: 28px;
  margin-bottom: 2px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-secondary));
  color: var(--text-primary);
  font-weight: 650;
  cursor: pointer;

  &:hover {
    border-color: var(--accent-primary);
  }
}

.layout-panel .ms-all {
  margin-top: 6px;
}

.ms-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;

  &:hover {
    background: var(--bg-hover);
  }

  input {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    accent-color: var(--accent-primary);

    &:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  }
}

.ms-option-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  font-size: 12px;
}

.ms-option-type {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
}

.ms-empty {
  margin: 6px;
  color: var(--text-muted);
  font-size: 12px;
}

.layout-menu-wrap {
  position: relative;
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

  svg {
    width: 15px;
    height: 15px;
    color: var(--text-secondary);
  }
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

.layout-section .section-label {
  margin: 2px 4px 4px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 800;
  letter-spacing: 0;
  text-transform: uppercase;
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
  min-width: 0;
}

@container (max-width: 700px) {
  .collab-view {
    overflow: auto;
  }

  .collab-topbar,
  .composer {
    grid-template-columns: 1fr;
  }

  .icon-button {
    justify-self: start;
  }
}
</style>
