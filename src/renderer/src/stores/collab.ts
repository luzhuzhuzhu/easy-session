import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  getBusSnapshot,
  notifyUser,
  onBusChanged,
  setAppBadgeCount,
  type BusSnapshot
} from '@/api/agent-bus'
import { useToast } from '@/composables/useToast'

// 全局协作提醒 store：从 App 启动起全程订阅 bus（不仅在协作页），维护
// 用户视角的未读/待办计数、任务栏角标与系统通知。CollaborationView 复用
// 同一份 snapshot，不再各自重复订阅。

const LAST_SEEN_STORAGE_KEY = 'easy-session:collab:lastSeenAt'

export interface CollabStartDeps {
  // 翻译函数（由 App.vue 注入，避免 store 直接耦合 i18n 实例）。
  t: (key: string, named?: Record<string, unknown>) => string
  // 当前是否停留在协作页：是则不弹 toast/系统通知（用户已经在看）。
  isOnCollabPage: () => boolean
}

function readLastSeen(): number {
  try {
    const raw = localStorage.getItem(LAST_SEEN_STORAGE_KEY)
    const value = raw ? Number(raw) : 0
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function writeLastSeen(value: number): void {
  try {
    localStorage.setItem(LAST_SEEN_STORAGE_KEY, String(value))
  } catch {
    // 隐私模式等场景下 localStorage 不可用时静默忽略。
  }
}

export const useCollabStore = defineStore('collab', () => {
  const snapshot = ref<BusSnapshot>({ agents: [], tasks: [], messages: [], ready: true, error: null })
  const connected = ref(false)
  const lastSeenAt = ref(readLastSeen())
  // 主进程通过 collab:focus 请求聚焦的任务，供 CollaborationView 消费选中。
  const pendingFocusTaskId = ref<string | null>(null)

  let deps: CollabStartDeps | null = null
  let toast: ReturnType<typeof useToast> | null = null
  let unsubscribe: (() => void) | null = null
  let refetchTimer: ReturnType<typeof setTimeout> | null = null
  let reqSeq = 0
  let started = false
  // 会话内去重：同一条消息/任务状态只提醒一次（水位负责跨重启持久去重）。
  const notified = new Set<string>()

  // 水位之后、收件方为 user 的未读消息数。
  const unreadForUser = computed(
    () =>
      snapshot.value.messages.filter(
        (msg) => msg.to === 'user' && msg.kind !== 'event' && msg.createdAt > lastSeenAt.value
      ).length
  )
  // 水位之后、用户派发且进入 review(待确认)/blocked(待答复) 的任务数。
  const pendingForUser = computed(
    () =>
      snapshot.value.tasks.filter(
        (task) =>
          task.from === 'user' &&
          (task.status === 'review' || task.status === 'blocked') &&
          task.statusSince > lastSeenAt.value
      ).length
  )
  const badgeCount = computed(() => unreadForUser.value + pendingForUser.value)

  function syncBadge(): void {
    void setAppBadgeCount(badgeCount.value)
  }

  // 对水位之后新出现的待办弹 toast + 系统通知；仅在不处于协作页时触发。
  function emitReminders(snap: BusSnapshot): void {
    if (!deps || deps.isOnCollabPage()) return
    const { t } = deps
    const watermark = lastSeenAt.value

    for (const msg of snap.messages) {
      if (msg.to !== 'user' || msg.kind === 'event') continue
      if (msg.createdAt <= watermark) continue
      const key = `msg:${msg.id}`
      if (notified.has(key)) continue
      notified.add(key)
      toast?.info(t('collab.notifyNewMessage', { from: msg.fromName }))
      void notifyUser({
        title: t('collab.notifyNewMessageTitle', { from: msg.fromName }),
        body: msg.body.slice(0, 160)
      })
    }

    for (const task of snap.tasks) {
      if (task.from !== 'user') continue
      if (task.status !== 'review' && task.status !== 'blocked') continue
      if (task.statusSince <= watermark) continue
      const key = `task:${task.id}:${task.status}`
      if (notified.has(key)) continue
      notified.add(key)
      const isReview = task.status === 'review'
      toast?.info(t(isReview ? 'collab.notifyReview' : 'collab.notifyBlocked', { title: task.title }))
      void notifyUser({
        title: t(isReview ? 'collab.notifyReviewTitle' : 'collab.notifyBlockedTitle'),
        body: task.title,
        taskId: task.id
      })
    }
  }

  async function refresh(): Promise<void> {
    const seq = ++reqSeq
    try {
      const snap = await getBusSnapshot()
      if (seq !== reqSeq) return
      snapshot.value = snap
      connected.value = snap.ready !== false
      emitReminders(snap)
      syncBadge()
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

  // 由 App.vue 在启动时调用一次；重复调用只刷新依赖、不重复订阅。
  function start(injected: CollabStartDeps): void {
    deps = injected
    if (!toast) toast = useToast()
    if (started) return
    started = true
    void refresh()
    unsubscribe = onBusChanged(scheduleRefetch)
  }

  function stop(): void {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = null
    }
    if (refetchTimer) {
      clearTimeout(refetchTimer)
      refetchTimer = null
    }
    started = false
  }

  // 用户打开协作页：刷新水位并清角标；现有项落到水位下不再重复提醒。
  function markSeen(): void {
    lastSeenAt.value = Date.now()
    writeLastSeen(lastSeenAt.value)
    notified.clear()
    syncBadge()
  }

  function setFocusTask(taskId?: string): void {
    pendingFocusTaskId.value = taskId ?? null
  }

  function consumeFocusTask(): string | null {
    const id = pendingFocusTaskId.value
    pendingFocusTaskId.value = null
    return id
  }

  return {
    snapshot,
    connected,
    lastSeenAt,
    pendingFocusTaskId,
    unreadForUser,
    pendingForUser,
    badgeCount,
    start,
    stop,
    refresh,
    markSeen,
    setFocusTask,
    consumeFocusTask
  }
})
