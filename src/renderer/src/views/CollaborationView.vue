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
              <span class="section-label">{{ $t('collab.layoutTopPanels') }}</span>
              <label v-for="panel in topPanels" :key="panel.id" class="ms-option">
                <input
                  type="checkbox"
                  :checked="panel.visible"
                  :disabled="panel.visible && topVisibleCount <= 1"
                  @change="togglePanel('top', panel.id)"
                />
                <span class="ms-option-name">{{ panelLabel(panel.id) }}</span>
              </label>
            </div>
            <div class="layout-section">
              <span class="section-label">{{ $t('collab.layoutDetailPanels') }}</span>
              <label v-for="panel in detailPanels" :key="panel.id" class="ms-option">
                <input
                  type="checkbox"
                  :checked="panel.visible"
                  :disabled="panel.visible && detailVisibleCount <= 1"
                  @change="togglePanel('detail', panel.id)"
                />
                <span class="ms-option-name">{{ panelLabel(panel.id) }}</span>
              </label>
            </div>
            <button type="button" class="ms-all" @click="resetLayout">{{ $t('collab.resetLayout') }}</button>
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
      <PaneLayout direction="horizontal" :panes="visibleTopPanes" @resize="onTopResize">
        <!-- 成员栏 -->
        <template #members>
          <section class="panel" :class="panelDnDClass('top', 'members')">
            <header
              class="panel-head"
              draggable="true"
              @dragstart="topDragStart('members', $event)"
              @dragover="topDragOver('members', $event)"
              @dragleave="topDragLeave('members')"
              @drop="topDrop('members', $event)"
              @dragend="topDragEnd"
            >
              <span class="drag-grip" aria-hidden="true">⠿</span>
              <span class="section-label">{{ $t('collab.agents') }}</span>
              <button
                v-if="snapshot.agents.length"
                type="button"
                class="rail-all-button"
                @click="toggleAllTargets"
              >
                {{ allTargetsSelected ? $t('collab.clearAll') : $t('collab.selectAllOnline') }}
              </button>
            </header>
            <div class="panel-body">
              <div v-if="snapshot.agents.length" class="agent-list">
                <article
                  v-for="agent in snapshot.agents"
                  :key="agent.sessionId"
                  class="agent-row"
                  :class="{ selected: activeAgentId === agent.sessionId, targeted: isTarget(agent.sessionId) }"
                  @click="focusAgent(agent.sessionId)"
                >
                  <label class="agent-check" :title="$t('collab.includeInBroadcast')" @click.stop>
                    <input type="checkbox" :checked="isTarget(agent.sessionId)" @change="toggleTarget(agent.sessionId)" />
                  </label>
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
            </div>
          </section>
        </template>

        <!-- 任务看板 -->
        <template #board>
          <section class="panel" :class="panelDnDClass('top', 'board')">
            <header
              class="panel-head"
              draggable="true"
              @dragstart="topDragStart('board', $event)"
              @dragover="topDragOver('board', $event)"
              @dragleave="topDragLeave('board')"
              @drop="topDrop('board', $event)"
              @dragend="topDragEnd"
            >
              <span class="drag-grip" aria-hidden="true">⠿</span>
              <span class="section-label">{{ showArchived ? $t('collab.archivedTitle') : $t('collab.tasks') }}</span>
              <div class="board-head-tools">
                <span v-if="!showArchived" class="board-filter">{{ activeAgentName || $t('collab.target') }}</span>
                <button type="button" class="rail-all-button" @click="showArchived = !showArchived">
                  {{ showArchived ? $t('collab.backToBoard') : $t('collab.showArchived', { count: archivedCount }) }}
                </button>
              </div>
            </header>
            <div class="panel-body">
              <div v-if="!showArchived" class="board-grid">
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
                      @click="selectTask(task.id)"
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
                      <button
                        v-if="isArchivable(task)"
                        type="button"
                        class="card-archive"
                        :title="$t('collab.archive')"
                        @click.stop="archiveTask(task.id)"
                      >
                        {{ $t('collab.archive') }}
                      </button>
                    </article>
                    <p v-if="!col.tasks.length" class="empty compact"></p>
                  </div>
                </div>
              </div>
              <div v-else class="archived-list">
                <article
                  v-for="task in archivedTasks"
                  :key="task.id"
                  class="archived-row"
                  :class="{ selected: selectedTaskId === task.id }"
                  @click="selectTask(task.id)"
                >
                  <div class="task-top">
                    <span class="task-id">{{ task.id }}</span>
                    <span class="task-status" :class="`st-${task.status}`">{{ statusLabel(task.status) }}</span>
                  </div>
                  <h3>{{ task.title }}</h3>
                  <div class="archived-foot">
                    <span>{{ task.fromName }} -> {{ task.toName }} · {{ relTime(task.archivedAt || task.updatedAt) }}</span>
                    <button type="button" class="tiny-button" @click.stop="unarchiveTask(task.id)">
                      {{ $t('collab.unarchive') }}
                    </button>
                  </div>
                </article>
                <p v-if="!archivedTasks.length" class="empty compact">{{ $t('collab.noArchived') }}</p>
              </div>
            </div>
          </section>
        </template>

        <!-- 详情栏（内含纵向子区块） -->
        <template #detail>
          <section class="panel" :class="panelDnDClass('top', 'detail')">
            <header
              class="panel-head"
              draggable="true"
              @dragstart="topDragStart('detail', $event)"
              @dragover="topDragOver('detail', $event)"
              @dragleave="topDragLeave('detail')"
              @drop="topDrop('detail', $event)"
              @dragend="topDragEnd"
            >
              <span class="drag-grip" aria-hidden="true">⠿</span>
              <span class="section-label">{{ $t('collab.detail') }}</span>
            </header>
            <div class="panel-body detail-body">
              <PaneLayout direction="vertical" :panes="visibleDetailPanes" @resize="onDetailResize">
                <!-- 任务详情子区块 -->
                <template #taskDetail>
                  <section class="subpanel" :class="panelDnDClass('detail', 'taskDetail')">
                    <header
                      class="panel-head sub"
                      draggable="true"
                      @dragstart="detailDragStart('taskDetail', $event)"
                      @dragover="detailDragOver('taskDetail', $event)"
                      @dragleave="detailDragLeave('taskDetail')"
                      @drop="detailDrop('taskDetail', $event)"
                      @dragend="detailDragEnd"
                    >
                      <span class="drag-grip" aria-hidden="true">⠿</span>
                      <span class="section-label">{{ $t('collab.panel.taskDetail') }}</span>
                      <div class="detail-tools">
                        <button v-if="targetSessionRef" class="tiny-button" type="button" @click="openTargetSession">
                          {{ $t('collab.openSession') }}
                        </button>
                        <button v-if="selectedTask?.result" class="tiny-button" type="button" @click="copyResult(selectedTask.result)">
                          {{ $t('collab.copyResult') }}
                        </button>
                      </div>
                    </header>
                    <div class="panel-body">
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
                          <button
                            v-if="isArchivable(selectedTask)"
                            class="secondary-button small"
                            type="button"
                            @click="archiveTask(selectedTask.id)"
                          >
                            {{ $t('collab.archive') }}
                          </button>
                          <button
                            v-if="selectedTask.archivedAt"
                            class="secondary-button small"
                            type="button"
                            @click="unarchiveTask(selectedTask.id)"
                          >
                            {{ $t('collab.unarchive') }}
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
                    </div>
                  </section>
                </template>

                <!-- 会话预览子区块 -->
                <template #preview>
                  <section class="subpanel" :class="panelDnDClass('detail', 'preview')">
                    <header
                      class="panel-head sub"
                      draggable="true"
                      @dragstart="detailDragStart('preview', $event)"
                      @dragover="detailDragOver('preview', $event)"
                      @dragleave="detailDragLeave('preview')"
                      @drop="detailDrop('preview', $event)"
                      @dragend="detailDragEnd"
                    >
                      <span class="drag-grip" aria-hidden="true">⠿</span>
                      <span class="section-label">{{ $t('collab.sessionPreview') }}</span>
                      <span class="count">{{ activeTerminalName || '-' }}</span>
                    </header>
                    <div class="panel-body preview-body">
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
                  </section>
                </template>

                <!-- 聊天子区块 -->
                <template #chat>
                  <section class="subpanel" :class="panelDnDClass('detail', 'chat')">
                    <header
                      class="panel-head sub"
                      draggable="true"
                      @dragstart="detailDragStart('chat', $event)"
                      @dragover="detailDragOver('chat', $event)"
                      @dragleave="detailDragLeave('chat')"
                      @drop="detailDrop('chat', $event)"
                      @dragend="detailDragEnd"
                    >
                      <span class="drag-grip" aria-hidden="true">⠿</span>
                      <span class="section-label">{{ $t('collab.chat') }}</span>
                      <span class="count">{{ activeAgentName || $t('collab.chatNoMember') }}</span>
                    </header>
                    <div class="panel-body chat-body">
                      <div ref="chatScrollEl" class="chat-scroll">
                        <p v-if="!activeAgentId" class="empty compact">{{ $t('collab.chatPickMember') }}</p>
                        <template v-else>
                          <article
                            v-for="msg in conversation"
                            :key="msg.id"
                            class="chat-msg"
                            :class="{ mine: msg.from === 'user' }"
                          >
                            <div class="chat-msg-head">
                              <strong>{{ msg.fromName }}</strong>
                              <time>{{ clock(msg.createdAt) }}</time>
                            </div>
                            <p>{{ msg.body }}</p>
                          </article>
                          <p v-if="!conversation.length" class="empty compact">{{ $t('collab.noMessages') }}</p>
                        </template>
                      </div>
                      <div v-if="activeAgentId" class="chat-composer">
                        <div v-if="commandMenuOpen" class="cmd-menu" role="listbox">
                          <button
                            v-for="(cmd, i) in filteredCommands"
                            :key="cmd.name"
                            type="button"
                            class="cmd-item"
                            :class="{ active: i === activeMenuIndex }"
                            @mousedown.prevent="completeCommand(cmd)"
                          >
                            <b>/{{ cmd.name }}</b>
                            <span v-if="cmd.argHint" class="cmd-arg">{{ cmd.argHint }}</span>
                            <span class="cmd-desc">{{ $t(cmd.descKey) }}</span>
                          </button>
                        </div>
                        <textarea
                          ref="chatInputEl"
                          v-model="chatInput"
                          class="chat-input"
                          rows="1"
                          :placeholder="$t('collab.chatPlaceholder')"
                          @keydown="handleChatKeydown"
                        ></textarea>
                        <button
                          class="primary-button small"
                          type="button"
                          :disabled="chatSending || !chatInput.trim()"
                          @click="submitChat"
                        >
                          {{ $t('collab.send') }}
                        </button>
                      </div>
                    </div>
                  </section>
                </template>
              </PaneLayout>
            </div>
          </section>
        </template>
      </PaneLayout>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import TerminalOutput from '@/components/TerminalOutput.vue'
import PaneLayout from '@/components/PaneLayout.vue'
import { useCollabLayout } from '@/composables/useCollabLayout'
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
import { cliTypeBadgeLetter } from '@shared/cli-types'

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

// ===== 可定制布局（逻辑见 composables/useCollabLayout.ts）=====
const {
  topPanels,
  detailPanels,
  layoutMenuOpen,
  visibleTopPanes,
  visibleDetailPanes,
  topVisibleCount,
  detailVisibleCount,
  panelDnDClass,
  onTopResize,
  onDetailResize,
  togglePanel,
  resetLayout,
  panelLabel,
  topDragStart,
  topDragOver,
  topDragLeave,
  topDrop,
  topDragEnd,
  detailDragStart,
  detailDragOver,
  detailDragLeave,
  detailDrop,
  detailDragEnd
} = useCollabLayout()

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
  () => collabStore.markSeen()
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

  & + .layout-section {
    border-top: 1px solid color-mix(in srgb, var(--border-color) 62%, transparent);
    margin-top: 2px;
  }

  .section-label {
    margin: 2px 4px 4px;
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
}

// ===== panel 通用外壳 =====
.panel,
.subpanel {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: color-mix(in srgb, var(--bg-secondary) 74%, transparent);

  &.dragging {
    opacity: 0.5;
  }

  &.dropping {
    border-color: var(--accent-primary);
    box-shadow: inset 0 0 0 1px var(--accent-primary);
  }
}

.subpanel {
  border-radius: 6px;
  background: var(--bg-primary);
}

.panel-head {
  min-height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-bottom: 1px solid var(--border-color);
  cursor: grab;
  user-select: none;

  &:active {
    cursor: grabbing;
  }

  &.sub {
    min-height: 26px;
    padding: 3px 7px;
  }
}

.drag-grip {
  flex-shrink: 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  letter-spacing: -1px;
}

.panel-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.detail-body,
.preview-body,
.chat-body {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-body,
.chat-body {
  padding: 6px;
}

.rail-all-button {
  margin-left: auto;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  font-weight: 650;
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    border-color: var(--accent-primary);
  }
}

.board-head-tools {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.agent-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.agent-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
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

  &.targeted {
    background: color-mix(in srgb, var(--accent-primary) 6%, var(--bg-primary));
  }

  &.selected {
    border-color: var(--accent-primary);
    background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-primary));
  }
}

.agent-check {
  display: grid;
  place-items: center;

  input {
    width: 14px;
    height: 14px;
    accent-color: var(--accent-primary);
    cursor: pointer;
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
  height: 100%;
  display: grid;
  grid-template-columns: repeat(6, minmax(146px, 1fr));
  grid-template-rows: minmax(0, 1fr);
  gap: 8px;
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
  position: relative;
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

.card-archive {
  position: absolute;
  top: 6px;
  right: 6px;
  height: 20px;
  padding: 0 7px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-muted);
  font-size: var(--font-size-xs);
  font-weight: 650;
  opacity: 0;
  cursor: pointer;
  transition: opacity 120ms ease, color 120ms ease, border-color 120ms ease;
}

.task-card:hover .card-archive {
  opacity: 1;

  &:hover {
    color: var(--text-primary);
    border-color: var(--accent-primary);
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

.archived-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(208px, 1fr));
  align-content: start;
  gap: 8px;
  overflow-y: auto;
}

.archived-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
  cursor: pointer;
  transition: border-color 120ms ease;

  &:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 48%, var(--border-color));
  }

  &.selected {
    border-color: var(--accent-primary);
  }

  h3 {
    margin: 0;
    color: var(--text-primary);
    font-size: 12px;
    line-height: 1.4;
    word-break: break-word;
  }
}

.archived-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-muted);
  font-size: var(--font-size-xs);

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.detail-content {
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

.collab-terminal {
  flex: 1 1 auto;
  min-height: 0;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
}

.chat-scroll {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  margin-bottom: 6px;
  padding-right: 2px;
}

.chat-msg {
  align-self: flex-start;
  max-width: 86%;
  padding: 6px 9px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--bg-primary);

  &.mine {
    align-self: flex-end;
    background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-primary));
    border-color: color-mix(in srgb, var(--accent-primary) 35%, var(--border-color));
  }

  .chat-msg-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    color: var(--text-muted);
    font-size: var(--font-size-xs);
  }

  strong {
    color: var(--text-secondary);
  }

  time {
    margin-left: auto;
  }

  p {
    margin: 3px 0 0;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 12px;
    line-height: 1.4;
  }
}

.chat-composer {
  position: relative;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 6px;
}

.chat-input {
  height: 34px;
  min-height: 34px;
  max-height: 110px;
}

.cmd-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card, var(--bg-secondary));
  box-shadow: var(--shadow-lg);
}

.cmd-item {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 5px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;

  &.active,
  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  b {
    color: var(--accent-primary);
    font-family: var(--font-mono, monospace);
    font-size: 12px;
  }
}

.cmd-arg {
  color: var(--text-muted);
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-xs);
}

.cmd-desc {
  margin-left: auto;
  color: var(--text-muted);
  font-size: var(--font-size-xs);
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
