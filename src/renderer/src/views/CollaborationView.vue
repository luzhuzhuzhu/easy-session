<template>
  <div class="collab-view">
    <header class="collab-header">
      <div class="collab-title">
        <h2>{{ $t('collab.title') }}</h2>
        <span class="collab-sub">{{ $t('collab.subtitle') }}</span>
      </div>
      <button class="collab-refresh" type="button" :title="$t('collab.refresh')" @click="refresh">
        <span class="dot" :class="{ live: connected }"></span>
        {{ $t('collab.refresh') }}
      </button>
    </header>

    <div v-if="snapshot.ready === false" class="collab-banner">
      {{ $t('collab.unavailable') }}<span v-if="snapshot.error"> — {{ snapshot.error }}</span>
    </div>

    <section class="collab-agents">
      <span class="section-label">{{ $t('collab.agents') }}</span>
      <template v-if="snapshot.agents.length">
        <span v-for="a in snapshot.agents" :key="a.sessionId" class="agent-chip">
          <span class="agent-dot" :class="`type-${a.type}`"></span>
          {{ a.name }}
        </span>
      </template>
      <span v-else class="muted">{{ $t('collab.noAgents') }}</span>
    </section>

    <div class="collab-body">
      <section class="collab-tasks">
        <div class="panel-head">
          <span class="section-label">{{ $t('collab.tasks') }}</span>
          <span class="count">{{ snapshot.tasks.length }}</span>
        </div>
        <div class="board">
          <div v-for="col in taskColumns" :key="col.key" class="board-col">
            <div class="col-head" :class="`col-${col.key}`">
              {{ col.label }} <span class="col-count">{{ col.tasks.length }}</span>
            </div>
            <div class="col-body">
              <article
                v-for="task in col.tasks"
                :key="task.id"
                class="task-card"
                :class="{ expanded: expandedTask === task.id }"
                @click="toggleTask(task.id)"
              >
                <div class="task-top">
                  <span class="task-id">{{ task.id }}</span>
                  <span class="task-status" :class="`st-${task.status}`">{{ statusLabel(task.status) }}</span>
                </div>
                <div class="task-title">{{ task.title }}</div>
                <div class="task-meta">
                  <span class="task-flow">{{ task.fromName }} → {{ task.toName }}</span>
                  <span class="task-time">{{ relTime(task.updatedAt) }}</span>
                </div>
                <div v-if="expandedTask === task.id" class="task-detail">
                  <div v-if="task.result" class="task-result">{{ task.result }}</div>
                  <ul class="task-history">
                    <li v-for="h in task.history" :key="`${h.at}-${h.status}-${h.by}`">
                      <span class="h-time">{{ clock(h.at) }}</span>
                      <span class="h-status" :class="`st-${h.status}`">{{ statusLabel(h.status) }}</span>
                      <span v-if="h.text" class="h-text">{{ h.text }}</span>
                    </li>
                  </ul>
                </div>
              </article>
              <p v-if="!col.tasks.length" class="col-empty">—</p>
            </div>
          </div>
        </div>
      </section>

      <section class="collab-messages">
        <div class="panel-head">
          <span class="section-label">{{ $t('collab.messages') }}</span>
          <span class="count">{{ chatMessages.length }}</span>
        </div>
        <div class="msg-stream">
          <div v-for="msg in reversedMessages" :key="msg.id" class="msg-row">
            <div class="msg-head">
              <span class="msg-from">{{ msg.fromName }}</span>
              <span class="msg-arrow">→</span>
              <span class="msg-to">{{ nameOf(msg.to) }}</span>
              <span class="msg-time">{{ clock(msg.createdAt) }}</span>
            </div>
            <div class="msg-body">{{ msg.body }}</div>
          </div>
          <p v-if="!chatMessages.length" class="muted center">{{ $t('collab.noMessages') }}</p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  getBusSnapshot,
  onBusChanged,
  type AgentTaskStatus,
  type BusSnapshot
} from '@/api/agent-bus'

const { t } = useI18n()

const snapshot = ref<BusSnapshot>({ agents: [], tasks: [], messages: [], ready: true, error: null })
const expandedTask = ref<string | null>(null)
const connected = ref(false)
let unsubscribe: (() => void) | null = null
let refetchTimer: ReturnType<typeof setTimeout> | null = null
let reqSeq = 0

const ACTIVE_STATUSES: AgentTaskStatus[] = ['created', 'accepted', 'in_progress', 'blocked']

const taskColumns = computed(() => {
  const tasks = snapshot.value.tasks
  return [
    {
      key: 'active',
      label: t('collab.colActive'),
      tasks: tasks.filter((x) => ACTIVE_STATUSES.includes(x.status))
    },
    { key: 'done', label: t('collab.colDone'), tasks: tasks.filter((x) => x.status === 'done') },
    {
      key: 'closed',
      label: t('collab.colClosed'),
      tasks: tasks.filter((x) => x.status === 'failed' || x.status === 'rejected')
    }
  ]
})

// 任务事件已在看板展示，消息流只保留真人/会话对话，避免两处重复。
const chatMessages = computed(() => snapshot.value.messages.filter((m) => m.kind !== 'event'))
const reversedMessages = computed(() => chatMessages.value.slice().reverse())

function nameOf(sessionId: string): string {
  const hit = snapshot.value.agents.find((a) => a.sessionId === sessionId)
  return hit ? hit.name : sessionId === 'user' ? t('collab.you') : sessionId.slice(0, 8)
}

function statusLabel(status: string): string {
  return t(`collab.status.${status}`)
}

function clock(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function relTime(at: number): string {
  const diff = Math.max(0, Date.now() - at) // 防时钟偏差导致未来时间戳出现负值
  if (diff < 60_000) return t('collab.justNow')
  if (diff < 3_600_000) return t('collab.minutesAgo', { n: Math.floor(diff / 60_000) })
  if (diff < 86_400_000) return t('collab.hoursAgo', { n: Math.floor(diff / 3_600_000) })
  return clock(at)
}

function toggleTask(id: string): void {
  expandedTask.value = expandedTask.value === id ? null : id
}

async function refresh(): Promise<void> {
  const seq = ++reqSeq
  try {
    const snap = await getBusSnapshot()
    if (seq !== reqSeq) return // 丢弃过期响应，避免乱序 resolve 用旧快照覆盖新快照
    snapshot.value = snap
    connected.value = true
  } catch {
    if (seq === reqSeq) connected.value = false
  }
}

function scheduleRefetch(): void {
  if (refetchTimer) return
  refetchTimer = setTimeout(() => {
    refetchTimer = null
    void refresh()
  }, 200)
}

onMounted(() => {
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
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  padding: 16px 20px;
  gap: 12px;
}

.collab-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-shrink: 0;
}

.collab-title h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 650;
  color: var(--text-primary);
}

.collab-sub {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.collab-refresh {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 5px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
  cursor: pointer;

  &:hover {
    color: var(--text-primary);
    border-color: var(--accent-primary);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--text-muted);

    &.live {
      background: var(--status-success, #3fb950);
      box-shadow: 0 0 5px color-mix(in srgb, var(--status-success, #3fb950) 50%, transparent);
    }
  }
}

.collab-banner {
  flex-shrink: 0;
  padding: 8px 12px;
  border: 1px solid color-mix(in srgb, var(--accent-danger, #e5484d) 45%, var(--border-color));
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--accent-danger, #e5484d) 12%, transparent);
  color: var(--text-secondary);
  font-size: var(--font-size-sm);
}

.collab-agents {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  flex-shrink: 0;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border-color);
}

.section-label {
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-right: 4px;
}

.agent-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--radius-lg);
  background: var(--bg-tertiary);
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.agent-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-primary);

  &.type-claude {
    background: #d97757;
  }
  &.type-codex {
    background: #10a37f;
  }
  &.type-opencode {
    background: #6e7bff;
  }
  &.type-terminal {
    background: var(--text-muted);
  }
}

.muted {
  color: var(--text-muted);
  font-size: var(--font-size-sm);

  &.center {
    text-align: center;
    width: 100%;
    padding: 24px 0;
  }
}

.collab-body {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
  gap: 14px;
  flex: 1;
  min-height: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.count {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: 10px;
  padding: 0 7px;
}

.collab-tasks,
.collab-messages {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  flex: 1;
  min-height: 0;
}

.board-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-tertiary);

  &.col-active {
    color: var(--accent-primary);
  }
  &.col-done {
    color: var(--status-success, #3fb950);
  }
  &.col-closed {
    color: var(--text-muted);
  }
}

.col-count {
  font-weight: 500;
  opacity: 0.7;
}

.col-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.col-empty {
  text-align: center;
  color: var(--text-muted);
  opacity: 0.5;
  margin: 12px 0;
}

.task-card {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  padding: 8px 9px;
  cursor: pointer;
  transition: border-color 120ms ease;

  &:hover {
    border-color: color-mix(in srgb, var(--accent-primary) 50%, var(--border-color));
  }
  &.expanded {
    border-color: var(--accent-primary);
  }
}

.task-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.task-id {
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  color: var(--text-muted);
}

.task-status {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

.task-title {
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  line-height: 1.4;
  margin-bottom: 5px;
  word-break: break-word;
}

.task-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
}

.task-flow {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-detail {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed var(--border-color);
}

.task-result {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  margin-bottom: 7px;
  white-space: pre-wrap;
  word-break: break-word;
}

.task-history {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;

  li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary);
  }
}

.h-time {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.h-text {
  color: var(--text-muted);
  word-break: break-word;
}

.st-done {
  color: var(--status-success, #3fb950);
}
.st-failed,
.st-rejected {
  color: var(--accent-danger, #e5484d);
}
.st-blocked {
  color: #e3a008;
}
.st-in_progress,
.st-accepted {
  color: var(--accent-primary);
}

.msg-stream {
  flex: 1;
  overflow-y: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.msg-row {
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-primary);
  padding: 7px 9px;
}

.msg-head {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin-bottom: 3px;
}

.msg-from {
  color: var(--text-primary);
  font-weight: 600;
}

.msg-arrow {
  color: var(--text-muted);
}

.msg-to {
  color: var(--text-secondary);
}

.msg-time {
  margin-left: auto;
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}

.msg-body {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1080px) {
  .collab-body {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .board {
    min-height: 240px;
  }
}
</style>
