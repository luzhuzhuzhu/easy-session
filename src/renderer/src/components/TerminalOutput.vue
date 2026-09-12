<template>
  <div class="terminal-output">
    <div class="terminal-toolbar">
      <span v-if="showHistoryWindowHint" class="history-window-hint">
        {{ historyWindowText }}
      </span>
      <ToolbarButton
        :disabled="loadingMoreHistory || loadingHistory || !hasMoreHistory"
        :title="$t('terminal.loadMoreHistory')"
        :label="$t('terminal.loadMoreHistory')"
        @click="loadMoreHistory"
      >
        <UiIcon name="arrow-up-to-line" />
      </ToolbarButton>
      <ToolbarButton
        :active="autoScroll"
        :title="$t(autoScroll ? 'terminal.pauseScroll' : 'terminal.resumeScroll')"
        :label="$t(autoScroll ? 'terminal.pauseScroll' : 'terminal.resumeScroll')"
        @click="toggleAutoScroll"
      >
        <UiIcon :name="autoScroll ? 'arrow-down-to-line' : 'play'" />
      </ToolbarButton>
      <ToolbarButton :label="$t('terminal.copyAll')" @click="copyAll">
        <UiIcon name="copy" />
      </ToolbarButton>
      <ToolbarButton
        v-if="currentSessionStatus && currentSessionStatus !== 'running'"
        :title="$t('terminal.viewJournal')"
        :label="$t('terminal.viewJournal')"
        @click="viewJournalTail"
      >
        <UiIcon name="file-text" />
      </ToolbarButton>
      <ToolbarButton v-if="sessionRef?.instanceId === 'local'" :disabled="clearingOutput" :label="$t('terminal.clearOutput')" tone="danger" @click="handleClear">
        <UiIcon name="eraser" />
      </ToolbarButton>
    </div>
    <div
      class="terminal-container"
      ref="containerRef"
      @mousedown="handleFocus"
      @contextmenu="handleContextMenu"
      @wheel.capture="handleWheel"
    ></div>
    <div v-if="searchVisible" class="terminal-search-bar">
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        :placeholder="$t('terminal.searchPlaceholder')"
        @input="onSearchInput"
        @keydown.enter.prevent="runSearch($event.shiftKey ? -1 : 1)"
        @keydown.esc.prevent="closeSearch"
      />
      <button type="button" :title="$t('terminal.searchPrev')" @click="runSearch(-1)">↑</button>
      <button type="button" :title="$t('terminal.searchNext')" @click="runSearch(1)">↓</button>
      <label class="terminal-search-case">
        <input v-model="searchMatchCase" type="checkbox" @change="onSearchInput" />
        <span>{{ $t('terminal.searchCaseSensitive') }}</span>
      </label>
      <span v-if="searchResultText" class="terminal-search-result">{{ searchResultText }}</span>
      <button type="button" :title="$t('terminal.searchClose')" @click="closeSearch">×</button>
    </div>
    <div v-if="!autoScroll" class="terminal-scroll-state">
      {{ $t('terminal.autoScrollPaused') }}
    </div>
    <div v-if="foregroundSyncing" class="terminal-sync-state">
      {{ $t('terminal.syncingOutput') }}
    </div>
    <div v-if="terminalInputBlockedReason" class="terminal-input-state">
      {{ terminalInputBlockedReason }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal, type FontWeight } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import '@xterm/xterm/css/xterm.css'
import ToolbarButton from '@/components/ui/ToolbarButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import type { OutputLine } from '@/api/session'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useToast } from '@/composables/useToast'
import { useInstancesStore } from '@/stores/instances'
import { LOCAL_INSTANCE_ID } from '@/models/unified-resource'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { getSharedGatewayResolver, type GatewayOutputEvent } from '@/gateways'
import type { SessionRef } from '@/models/unified-resource'
import { shouldPauseAutoScrollForWheel } from '@/utils/terminal-scroll'
import { getOutputHistoryLastSeq, shouldReplaceCachedHistory } from '@/utils/terminal-history'
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  clampTerminalLetterSpacing,
  clampTerminalLineHeight,
  ensureMonospaceFallback,
  isTerminalFontWeight,
  parseSessionAppearance
} from '@/models/terminal-appearance'

const props = defineProps<{ sessionRef?: SessionRef | null; processKey?: string | null; paneId?: string | null }>()
const { t } = useI18n()
const confirmDialog = useConfirmDialog()
const toast = useToast()
const instancesStore = useInstancesStore()
const settingsStore = useSettingsStore()
const sessionsStore = useSessionsStore()
const workspaceStore = useWorkspaceStore()
const gatewayResolver = getSharedGatewayResolver()

const containerRef = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let searchAddon: SearchAddon | null = null

// UX-8：终端内搜索状态（Ctrl+F 唤起，Esc 关闭）
const searchVisible = ref(false)
const searchQuery = ref('')
const searchMatchCase = ref(false)
const searchResultText = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)
let searchDecorationsCleanup: (() => void) | null = null

function closeSearch(): void {
  searchVisible.value = false
  searchQuery.value = ''
  searchResultText.value = ''
  searchDecorationsCleanup?.()
  searchDecorationsCleanup = null
  searchAddon?.clearDecorations()
  term?.focus()
}

function runSearch(direction: 1 | -1 = 1): void {
  if (!searchAddon || !term) return
  const query = searchQuery.value
  if (!query) {
    searchResultText.value = ''
    searchAddon.clearDecorations()
    return
  }
  const options = { caseSensitive: searchMatchCase.value, decorations: { matchOverviewRuler: '#f0ad4e', activeMatchColorOverviewRuler: '#ff8c00' } }
  const fn = direction === 1 ? searchAddon.findNext : searchAddon.findPrevious
  try {
    fn.call(searchAddon, query, options)
    searchDecorationsCleanup?.()
    searchDecorationsCleanup = null
  } catch {
    searchResultText.value = t('terminal.searchNoResult')
  }
}

function onSearchInput(): void {
  if (!searchAddon || !term) return
  if (!searchQuery.value) {
    searchAddon.clearDecorations()
    searchResultText.value = ''
    return
  }
  try {
    searchAddon.findNext(searchQuery.value, {
      caseSensitive: searchMatchCase.value,
      decorations: { matchOverviewRuler: '#f0ad4e', activeMatchColorOverviewRuler: '#ff8c00' }
    })
  } catch {
    searchResultText.value = t('terminal.searchNoResult')
  }
}

async function openSearch(): Promise<void> {
  if (!term || !searchAddon) return
  searchVisible.value = true
  await nextTick()
  searchInputRef.value?.focus()
  searchInputRef.value?.select()
}
const clearingOutput = ref(false)
let clearedThroughSeq = 0
let firstRenderedSeq = 0
let lastRenderedSeq = 0
let historyReplayToken: number | null = null
let liveOutputWriteCompletion: Promise<void> | null = null
const terminalWriteCompletions = new Set<() => void>()
let loadToken = 0
let subscribeToken = 0
let unlistenOutput: (() => void) | null = null
let subscribedGlobalSessionKey: string | null = null
const loadingHistory = ref(false)
const pendingEvents: GatewayOutputEvent[] = []
const liveOutputQueue: GatewayOutputEvent[] = []
let liveOutputFlushRaf: number | null = null
let liveOutputWritePending = false
let liveOutputWriteToken = 0
let lastSyncedCols = -1
let lastSyncedRows = -1
let resizeTimer: ReturnType<typeof setTimeout> | null = null
const autoScroll = ref(true)
const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows')
const HISTORY_LOAD_LINES = 12000
const HISTORY_LOAD_STEP = 8000
const HISTORY_MAX_LOAD_LINES = 60000
const HISTORY_WRITE_BATCH_SIZE = 240
const HISTORY_CACHE_TTL_MS = 30000
const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 28
const FONT_SIZE_PERSIST_DEBOUNCE_MS = 320
let fontSizePersistTimer: ReturnType<typeof setTimeout> | null = null
let hasPendingFontSizePersist = false
let lastObservedWidth = -1
let lastObservedHeight = -1
const currentHistoryLoadLines = ref(HISTORY_LOAD_LINES)
const hasMoreHistory = ref(true)
const loadingMoreHistory = ref(false)
const foregroundSyncing = ref(false)

const showHistoryWindowHint = computed(() => loadingMoreHistory.value || currentHistoryLoadLines.value > HISTORY_LOAD_LINES)
const historyWindowText = computed(() => {
  const count = formatHistoryLineCount(currentHistoryLoadLines.value)
  if (loadingMoreHistory.value) {
    return t('terminal.historyWindowLoading', { count })
  }
  return t(hasMoreHistory.value ? 'terminal.historyWindowMore' : 'terminal.historyWindowAll', { count })
})

const historySnapshotCache = new Map<string, {
  lines: OutputLine[]
  lastSeq: number
  capturedAt: number
  maxLines: number
}>()

const isForegroundPane = computed(() => {
  if (!props.paneId) return true
  return workspaceStore.layout.activePaneId === props.paneId
})

const currentSession = computed(() => {
  const globalSessionKey = props.sessionRef?.globalSessionKey
  if (!globalSessionKey) return null
  return sessionsStore.getUnifiedSession(globalSessionKey) ?? null
})

const currentSessionStatus = computed(() => currentSession.value?.status ?? null)
const currentInstance = computed(() => {
  const session = currentSession.value
  if (!session) return null
  return instancesStore.getInstance(session.instanceId) ?? null
})

const terminalInputBlockedReason = computed(() => {
  if (!props.sessionRef) return ''

  const session = currentSession.value
  if (!session) return t('terminal.inputUnavailableMissing')

  const instance = currentInstance.value
  if (instance?.type === 'remote' && instance.status !== 'online') {
    return t('terminal.inputUnavailableRemote', { status: t(`settings.remoteStatus.${instance.status}`) })
  }

  if (instance && !instance.capabilities.sessionInput) {
    return t('terminal.inputUnavailablePermission')
  }

  if (session.status !== 'running') {
    return t('terminal.inputUnavailableNotRunning')
  }

  if (!props.processKey) {
    return t('terminal.inputUnavailableProcess')
  }

  return ''
})

function formatHistoryLineCount(lines: number): string {
  if (lines >= 1000) {
    const value = lines / 1000
    return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}k`
  }
  return String(lines)
}

function getLastSeq(history: OutputLine[]): number {
  return getOutputHistoryLastSeq(history)
}

function readWarmHistorySnapshot(sessionKey: string): OutputLine[] | null {
  const cached = historySnapshotCache.get(sessionKey)
  if (!cached) return null
  if (Date.now() - cached.capturedAt > HISTORY_CACHE_TTL_MS) {
    historySnapshotCache.delete(sessionKey)
    return null
  }
  return cached.lines.map((line) => ({ ...line }))
}

// STAB-3：快照缓存上限（LRU）。缓存条目每条最多 HISTORY_LOAD_LINES 行深拷贝，
// 长跑多会话 + 会话销毁无钩子会无限滞留内存——按写入顺序淘汰最旧条目并周期清理过期项。
const HISTORY_CACHE_MAX_ENTRIES = 12
let lastCacheSweepAt = 0

function sweepHistorySnapshotCache(): void {
  const now = Date.now()
  if (now - lastCacheSweepAt < 30_000) return
  lastCacheSweepAt = now
  for (const [key, cached] of historySnapshotCache) {
    if (now - cached.capturedAt > HISTORY_CACHE_TTL_MS) historySnapshotCache.delete(key)
  }
}

function evictHistorySnapshotCacheLru(): void {
  while (historySnapshotCache.size > HISTORY_CACHE_MAX_ENTRIES) {
    const oldestKey = historySnapshotCache.keys().next().value
    if (oldestKey === undefined) break
    historySnapshotCache.delete(oldestKey)
  }
}

function writeWarmHistorySnapshot(sessionKey: string, history: OutputLine[], maxLines = HISTORY_LOAD_LINES): void {
  const windowSize = Math.max(HISTORY_LOAD_LINES, Math.min(HISTORY_MAX_LOAD_LINES, maxLines))
  // Map 迭代按插入序：先删后写让刚写入的条目位于最新位置（访问即续命）
  historySnapshotCache.delete(sessionKey)
  historySnapshotCache.set(sessionKey, {
    lines: history.slice(-windowSize).map((line) => ({ ...line })),
    lastSeq: getLastSeq(history),
    capturedAt: Date.now(),
    maxLines: windowSize
  })
  sweepHistorySnapshotCache()
  evictHistorySnapshotCacheLru()
}

function appendWarmHistorySnapshot(sessionKey: string, line: OutputLine): void {
  const cached = historySnapshotCache.get(sessionKey)
  if (!cached) {
    historySnapshotCache.set(sessionKey, {
      lines: [{ ...line }],
      lastSeq: resolveSeq(line, 1),
      capturedAt: Date.now(),
      maxLines: HISTORY_LOAD_LINES
    })
    return
  }

  const nextSeq = resolveSeq(line, cached.lastSeq)
  if (nextSeq <= cached.lastSeq) {
    cached.capturedAt = Date.now()
    return
  }

  cached.lines.push({ ...line, seq: nextSeq })
  if (cached.lines.length > cached.maxLines) {
    cached.lines.splice(0, cached.lines.length - cached.maxLines)
  }
  cached.lastSeq = nextSeq
  cached.capturedAt = Date.now()
  sweepHistorySnapshotCache()
  evictHistorySnapshotCacheLru()
}

function appendWarmHistorySnapshotBatch(sessionKey: string, lines: OutputLine[]): void {
  for (const line of lines) {
    appendWarmHistorySnapshot(sessionKey, line)
  }
}

function clearWarmHistorySnapshot(sessionKey: string | null | undefined): void {
  if (!sessionKey) return
  historySnapshotCache.delete(sessionKey)
}

// STAB-3：供 sessions store 在会话销毁后广播清理（跨模块唯一入口，避免循环 import——
// store 不直接 import 本组件，组件挂载时把清理函数注册到全局句柄上）。
declare global {
  interface Window {
    __esClearHistorySnapshot?: (globalSessionKey: string) => void
  }
}
if (typeof window !== 'undefined') {
  window.__esClearHistorySnapshot = (key: string) => historySnapshotCache.delete(key)
}

function clearLiveOutputQueue(): void {
  liveOutputQueue.length = 0
  liveOutputWritePending = false
  liveOutputWriteCompletion = null
  liveOutputWriteToken += 1
  if (liveOutputFlushRaf !== null) {
    cancelAnimationFrame(liveOutputFlushRaf)
    liveOutputFlushRaf = null
  }
}

function getWarmHistorySnapshotLastSeq(sessionKey: string | null | undefined): number {
  if (!sessionKey) return 0
  return historySnapshotCache.get(sessionKey)?.lastSeq ?? 0
}

function isContainerRenderable(): boolean {
  const host = containerRef.value
  if (!host || !term || !fitAddon) return false
  return host.clientWidth > 0 && host.clientHeight > 0
}

function isPaneVisible(): boolean {
  const host = containerRef.value
  if (!host) return false
  return host.clientWidth > 0 && host.clientHeight > 0
}

function isSessionWritable(): boolean {
  return !!props.processKey
}

function isSessionRunning(): boolean {
  return currentSessionStatus.value === 'running' && !!props.processKey
}

function shouldRenderLiveOutput(): boolean {
  return isPaneVisible()
}

function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_FONT_SIZE
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(size)))
}

function resolveFontSizeByPane(paneId?: string | null): number {
  const byPane = settingsStore.settings.terminalFontSizeByPane || {}
  const paneSpecific = paneId ? byPane[paneId] : undefined
  if (typeof paneSpecific === 'number' && Number.isFinite(paneSpecific)) {
    return clampFontSize(paneSpecific)
  }
  return clampFontSize(settingsStore.settings.terminalFontSize ?? DEFAULT_FONT_SIZE)
}

const activePaneFontSize = computed(() => resolveFontSizeByPane(props.paneId))

// 字体/字重：会话级覆盖（options.appearance）优先，其次全局设置
const sessionAppearance = computed(() => parseSessionAppearance(currentSession.value?.options))

const effectiveFontFamily = computed(() => {
  const perSession = sessionAppearance.value.fontFamily
  if (perSession) return ensureMonospaceFallback(perSession)
  const global = settingsStore.settings.terminalFont?.trim()
  return global ? ensureMonospaceFallback(global) : DEFAULT_TERMINAL_FONT_FAMILY
})

const effectiveFontWeight = computed<FontWeight>(() => {
  const perSession = sessionAppearance.value.fontWeight
  if (isTerminalFontWeight(perSession)) return perSession
  const global = settingsStore.settings.terminalFontWeight
  return isTerminalFontWeight(global) ? global : 'normal'
})

const effectiveFontWeightBold = computed<FontWeight>(() => {
  const perSession = sessionAppearance.value.fontWeightBold
  if (isTerminalFontWeight(perSession)) return perSession
  const global = settingsStore.settings.terminalFontWeightBold
  return isTerminalFontWeight(global) ? global : 'bold'
})

const effectiveLineHeight = computed(() => {
  const perSession = sessionAppearance.value.lineHeight
  if (typeof perSession === 'number') return clampTerminalLineHeight(perSession)
  return clampTerminalLineHeight(settingsStore.settings.terminalLineHeight)
})

const effectiveLetterSpacing = computed(() => {
  const perSession = sessionAppearance.value.letterSpacing
  if (typeof perSession === 'number') return clampTerminalLetterSpacing(perSession)
  return clampTerminalLetterSpacing(settingsStore.settings.terminalLetterSpacing)
})

function applyTerminalFontAppearance(): void {
  if (!term) return
  let changed = false
  if (term.options.fontFamily !== effectiveFontFamily.value) {
    term.options.fontFamily = effectiveFontFamily.value
    changed = true
  }
  if (term.options.fontWeight !== effectiveFontWeight.value) {
    term.options.fontWeight = effectiveFontWeight.value
    changed = true
  }
  if (term.options.fontWeightBold !== effectiveFontWeightBold.value) {
    term.options.fontWeightBold = effectiveFontWeightBold.value
    changed = true
  }
  if (term.options.lineHeight !== effectiveLineHeight.value) {
    term.options.lineHeight = effectiveLineHeight.value
    changed = true
  }
  if (term.options.letterSpacing !== effectiveLetterSpacing.value) {
    term.options.letterSpacing = effectiveLetterSpacing.value
    changed = true
  }
  if (changed) {
    fitAndSync(true)
  }
}

watch(
  [effectiveFontFamily, effectiveFontWeight, effectiveFontWeightBold, effectiveLineHeight, effectiveLetterSpacing],
  () => {
    applyTerminalFontAppearance()
  }
)

function applyTermFontSize(size: number, forceSync = true): void {
  if (!term) return
  const next = clampFontSize(size)
  if (term.options.fontSize === next) return
  term.options.fontSize = next
  if (forceSync) {
    fitAndSync(true)
  }
}

function schedulePersistFontSize(): void {
  hasPendingFontSizePersist = true
  if (fontSizePersistTimer) {
    clearTimeout(fontSizePersistTimer)
  }
  fontSizePersistTimer = setTimeout(() => {
    fontSizePersistTimer = null
    hasPendingFontSizePersist = false
    void settingsStore.save()
  }, FONT_SIZE_PERSIST_DEBOUNCE_MS)
}

function updatePaneFontSize(size: number): void {
  const paneId = props.paneId
  if (!paneId) return
  const next = clampFontSize(size)
  const prev = settingsStore.settings.terminalFontSizeByPane?.[paneId]
  if (prev === next) return

  settingsStore.settings.terminalFontSizeByPane = {
    ...(settingsStore.settings.terminalFontSizeByPane || {}),
    [paneId]: next
  }
  schedulePersistFontSize()
}

// 安全剪贴板写入，窗口失焦时不抛异常
async function safeWriteClipboard(text: string): Promise<boolean> {
  if (!text) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

async function copySelectedText(showToastTip = false): Promise<boolean> {
  if (!term || !term.hasSelection()) return false
  const copied = await safeWriteClipboard(term.getSelection())
  if (showToastTip) {
    if (copied) {
      toast.success(t('terminal.copySuccess'))
    } else {
      toast.error(t('terminal.copyFail'))
    }
  }
  return copied
}

function resolveSeq(line: OutputLine, fallback: number): number {
  if (typeof line.seq === 'number' && Number.isFinite(line.seq)) {
    return line.seq
  }
  return fallback
}

async function resolveGatewayContext(): Promise<{
  gateway: Awaited<ReturnType<typeof gatewayResolver.resolve>>
  sessionRef: SessionRef
} | null> {
  const sessionRef = props.sessionRef ?? null
  if (!sessionRef) return null
  const gateway = await gatewayResolver.resolve(sessionRef.instanceId)
  return { gateway, sessionRef }
}

function syncPtySize(force = false): void {
  if (!term || !props.sessionRef || !isSessionWritable()) return
  if (!isSessionRunning()) return

  if (!force && term.cols === lastSyncedCols && term.rows === lastSyncedRows) return
  if (term.cols <= 0 || term.rows <= 0) return
  lastSyncedCols = term.cols
  lastSyncedRows = term.rows

  void (async () => {
    const context = await resolveGatewayContext()
    if (!context) return
    await context.gateway.resize(context.sessionRef.instanceId, context.sessionRef.sessionId, term.cols, term.rows).catch(() => {
      // Resize races are expected while a PTY is exiting or being restarted.
    })
  })()
}

function fitAndSync(force = false): void {
  if (!isContainerRenderable()) return
  const currentFitAddon = fitAddon
  const currentTerm = term
  if (!currentFitAddon || !currentTerm) return
  currentFitAddon.fit()
  if (currentTerm.cols <= 0 || currentTerm.rows <= 0) return
  syncPtySize(force)
}

function scheduleResize(): void {
  if (!isContainerRenderable()) return
  if (resizeTimer) {
    clearTimeout(resizeTimer)
  }

  resizeTimer = setTimeout(() => {
    resizeTimer = null
    fitAndSync(false)
  }, 160)
}

async function bindOutput(): Promise<void> {
  const token = ++subscribeToken
  const sessionRef = props.sessionRef ?? null
  const nextGlobalSessionKey = sessionRef?.globalSessionKey ?? null
  if (nextGlobalSessionKey === subscribedGlobalSessionKey && unlistenOutput) return

  if (unlistenOutput) {
    unlistenOutput()
    unlistenOutput = null
  }
  subscribedGlobalSessionKey = null

  if (!sessionRef) return

  let context: Awaited<ReturnType<typeof resolveGatewayContext>>
  try {
    context = await resolveGatewayContext()
  } catch (error) {
    console.warn('[TerminalOutput] resolve output gateway failed', error)
    return
  }
  if (!context || token !== subscribeToken) return

  try {
    unlistenOutput = context.gateway.subscribeOutput(
    context.sessionRef.instanceId,
    context.sessionRef.sessionId,
      (event) => {
        applyLiveOutput(event)
      }
    )
    subscribedGlobalSessionKey = context.sessionRef.globalSessionKey
  } catch (error) {
    unlistenOutput = null
    subscribedGlobalSessionKey = null
    console.warn('[TerminalOutput] subscribe output failed', error)
  }
}

function reloadSessionView(): void {
  initTerminal()
  loadingHistory.value = true
  void bindOutput()
  void loadHistory().then(focusTerminalForIME)
}

function isEditableElement(target: Element | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

function focusTerminalForIME(): void {
  if (!term || !isSessionWritable()) return
  if (!document.hasFocus()) return
  const host = containerRef.value
  if (!host) return

  const active = document.activeElement
  if (active && isEditableElement(active) && !host.contains(active)) {
    return
  }

  const focusTextarea = () => {
    term?.focus()
    const textarea = host.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    textarea?.focus({ preventScroll: true })
  }

  // Keep IME behavior while avoiding global blur/focus thrash after session destroy.
  requestAnimationFrame(() => {
    const current = document.activeElement
    if (current && isEditableElement(current) && !host.contains(current)) {
      return
    }
    focusTextarea()
  })
}

function destroyTerminal(): void {
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }

  ++loadToken
  clearingOutput.value = false
  clearedThroughSeq = 0
  historyReplayToken = null
  loadingHistory.value = false
  foregroundSyncing.value = false
  pendingEvents.length = 0
  for (const finish of terminalWriteCompletions) finish()
  if (term) {
    term.dispose()
    term = null
    fitAddon = null
  }

  if (containerRef.value) containerRef.value.innerHTML = ''
  clearLiveOutputQueue()
  resetLocalBuffer()
  lastSyncedCols = -1
  lastSyncedRows = -1
}

function readCssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(143, 183, 173, ${alpha})`
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16)
  const g = Number.parseInt(normalized.slice(2, 4), 16)
  const b = Number.parseInt(normalized.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildTerminalTheme() {
  const accent = readCssVar('--accent-primary', '#8fb7ad')
  return {
    background: readCssVar('--bg-primary', '#111418'),
    foreground: readCssVar('--text-primary', '#e7e9e6'),
    cursor: accent,
    selectionBackground: hexToRgba(accent, 0.28)
  }
}

function applyTerminalTheme(): void {
  if (!term) return
  term.options.theme = buildTerminalTheme()
}

function initTerminal(): void {
  destroyTerminal()
  if (!containerRef.value) return
  autoScroll.value = true

  term = new Terminal({
    // Search decorations require xterm marker/decoration APIs.
    allowProposedApi: true,
    cursorBlink: true,
    disableStdin: !isSessionWritable(),
    convertEol: false,
    scrollback: 20000,
    fontSize: activePaneFontSize.value,
    fontFamily: effectiveFontFamily.value,
    fontWeight: effectiveFontWeight.value,
    fontWeightBold: effectiveFontWeightBold.value,
    lineHeight: effectiveLineHeight.value,
    letterSpacing: effectiveLetterSpacing.value,
    rightClickSelectsWord: true,
    theme: buildTerminalTheme(),
    ...(isWindows ? { windowsPty: { backend: 'conpty' as const } } : {})
  })

  fitAddon = new FitAddon()
  searchAddon = new SearchAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  searchAddon.onDidChangeResults((results) => {
    if (!searchVisible.value) return
    const { resultIndex, resultCount } = results as { resultIndex: number; resultCount: number }
    if (resultCount === 0) {
      searchResultText.value = searchQuery.value ? t('terminal.searchNoResult') : ''
    } else {
      searchResultText.value = t('terminal.searchMatches', { index: resultIndex, total: resultCount })
    }
  })
  term.open(containerRef.value)
  requestAnimationFrame(() => {
    fitAndSync(true)
  })

  term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
    if (ev.type !== 'keydown') return true
    if (ev.shiftKey && ev.code === 'PageUp') autoScroll.value = false

    const isCtrlShiftC = ev.ctrlKey && ev.shiftKey && !ev.altKey && ev.code === 'KeyC'
    const isCtrlC = ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.code === 'KeyC'
    if (isCtrlShiftC) {
      if (!ev.repeat) {
        void copySelectedText(true)
      }
      return false
    }
    if (isCtrlC) {
      if (term?.hasSelection()) {
        if (!ev.repeat) {
          void copySelectedText(true)
        }
        return false
      }
      return true
    }

    const isCtrlV = ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.code === 'KeyV'
    const isCtrlShiftV = ev.ctrlKey && ev.shiftKey && !ev.altKey && ev.code === 'KeyV'
    if (isCtrlV || isCtrlShiftV) {
      ev.preventDefault()
      ev.stopPropagation()
      if (!ev.repeat) {
        void pasteFromClipboard()
      }
      return false
    }

    // UX-8：Ctrl+F / Esc 唤起与关闭终端内搜索
    const isCtrlF = ev.ctrlKey && !ev.shiftKey && !ev.altKey && ev.code === 'KeyF'
    if (isCtrlF) {
      ev.preventDefault()
      ev.stopPropagation()
      if (!ev.repeat) {
        void openSearch()
      }
      return false
    }
    if (searchVisible.value && ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      closeSearch()
      return false
    }

    return true
  })

  term.onData((data: string) => {
    const sessionRef = props.sessionRef
    if (!sessionRef || !isSessionWritable()) return
    void (async () => {
      const context = await resolveGatewayContext()
      if (!context) return
      try {
        await context.gateway.writeRaw(context.sessionRef.instanceId, context.sessionRef.sessionId, data)
      } catch (error) {
        console.warn('[TerminalOutput] writeRaw failed', error)
      }
    })()
  })

  term.onScroll(() => {
    if (!term || historyReplayToken !== null) return
    autoScroll.value = isViewportAtBottom()
  })
}

function resetLocalBuffer(): void {
  firstRenderedSeq = 0
  lastRenderedSeq = clearedThroughSeq
}

function isViewportAtBottom(): boolean {
  if (!term) return true
  const active = term.buffer.active
  return active.viewportY >= active.baseY
}

function scrollToBottom(force = false): void {
  if (!term) return
  if (!force && !autoScroll.value) return
  term.scrollToBottom()
}

function toggleAutoScroll(): void {
  autoScroll.value = !autoScroll.value
  if (autoScroll.value) {
    scrollToBottom(true)
  }
}

function waitForNextHistoryBatch(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

function writeTerminalChunk(text: string, target = term): Promise<void> {
  return new Promise((resolve) => {
    if (!target) {
      resolve()
      return
    }
    const finish = () => {
      terminalWriteCompletions.delete(finish)
      resolve()
    }
    terminalWriteCompletions.add(finish)
    target.write(text, finish)
  })
}

async function replayHistoryInBatches(
  history: OutputLine[],
  token: number,
  sessionKey: string
): Promise<boolean> {
  for (let index = 0; index < history.length; index += HISTORY_WRITE_BATCH_SIZE) {
    if (token !== loadToken || !term || props.sessionRef?.globalSessionKey !== sessionKey) {
      return false
    }

    let chunk = ''
    const batch = history.slice(index, index + HISTORY_WRITE_BATCH_SIZE)
    for (const raw of batch) {
      const seq = resolveSeq(raw, lastRenderedSeq + 1)
      if (seq <= lastRenderedSeq) continue
      chunk += raw.text
      if (firstRenderedSeq === 0) firstRenderedSeq = seq
      lastRenderedSeq = seq
    }

    if (chunk) {
      await writeTerminalChunk(chunk)
    }

    if (index + HISTORY_WRITE_BATCH_SIZE < history.length) {
      await waitForNextHistoryBatch()
    }
  }

  return token === loadToken && !!term && props.sessionRef?.globalSessionKey === sessionKey
}

async function renderHistorySnapshot(
  history: OutputLine[],
  token: number,
  sessionKey: string
): Promise<boolean> {
  // Do not reset xterm while the preceding live frame is still being parsed.
  if (liveOutputWriteCompletion) await liveOutputWriteCompletion
  if (!term || token !== loadToken || props.sessionRef?.globalSessionKey !== sessionKey) return false

  // A delayed refresh usually only extends an already rendered prefix. Append
  // that suffix instead of resetting the terminal and losing the reading anchor.
  const renderedTailIndex = history.findIndex((line) => line.seq === lastRenderedSeq)
  const canAppend = firstRenderedSeq > 0 &&
    typeof history[0]?.seq === 'number' && history[0].seq >= firstRenderedSeq && renderedTailIndex !== -1
  if (canAppend) {
    const replayed = await replayHistoryInBatches(history.slice(renderedTailIndex + 1), token, sessionKey)
    if (replayed) scrollToBottom()
    return replayed
  }

  const offsetFromBottom = !autoScroll.value
    ? Math.max(0, term.buffer.active.baseY - term.buffer.active.viewportY)
    : 0
  historyReplayToken = token
  try {
    term.reset()
    lastSyncedCols = -1
    lastSyncedRows = -1
    fitAndSync(true)
    resetLocalBuffer()
    // Restore the reading anchor at the OLD tail first. Restoring an offset
    // from the NEW tail would shift the viewport by every newly received row.
    const prefix = renderedTailIndex >= 0 ? history.slice(0, renderedTailIndex + 1) : history
    if (!await replayHistoryInBatches(prefix, token, sessionKey)) return false
    if (!autoScroll.value) {
      term.scrollToLine(Math.max(0, term.buffer.active.baseY - offsetFromBottom))
    }
    if (renderedTailIndex >= 0 &&
      !await replayHistoryInBatches(history.slice(renderedTailIndex + 1), token, sessionKey)) return false
    scrollToBottom()
    return true
  } finally {
    if (historyReplayToken === token) historyReplayToken = null
  }
}

async function syncForegroundFromWarmHistory(): Promise<void> {
  const sessionKey = props.sessionRef?.globalSessionKey
  if (!term || !sessionKey || loadingHistory.value || !isPaneVisible()) return
  const cachedHistory = readWarmHistorySnapshot(sessionKey)
  if (!cachedHistory?.length || getWarmHistorySnapshotLastSeq(sessionKey) <= lastRenderedSeq) return

  const token = ++loadToken
  loadingHistory.value = true
  foregroundSyncing.value = true
  try {
    if (await renderHistorySnapshot(cachedHistory, token, sessionKey)) scheduleResize()
  } finally {
    finishHistoryLoad(token, sessionKey)
  }
}

function finishHistoryLoad(token: number, sessionKey: string): void {
  if (token !== loadToken || props.sessionRef?.globalSessionKey !== sessionKey) return
  loadingHistory.value = false
  foregroundSyncing.value = false
  // Success, failure and foreground catch-up must all release buffered events.
  // Re-enter the normal path so invisible panes update their cache, not xterm.
  for (const event of pendingEvents.splice(0)) applyLiveOutput(event)
}

async function loadHistory(): Promise<void> {
  if (clearingOutput.value) return
  const sessionRef = props.sessionRef ?? null
  if (!term || !sessionRef) {
    loadingHistory.value = false
    return
  }
  const token = ++loadToken
  loadingHistory.value = true
  // Avoid an argument-count limit during a large burst of queued output.
  for (const event of liveOutputQueue.splice(0)) pendingEvents.push(event)
  const sessionKey = sessionRef.globalSessionKey
  const cachedHistory = readWarmHistorySnapshot(sessionKey)

  try {
    if (cachedHistory?.length && lastRenderedSeq === 0) {
      if (!await renderHistorySnapshot(cachedHistory, token, sessionKey)) return
    }
    const context = await resolveGatewayContext()
    if (!context || token !== loadToken || context.sessionRef.globalSessionKey !== sessionKey) return
    const history = await context.gateway.getOutputHistory(
      context.sessionRef.instanceId,
      context.sessionRef.sessionId,
      currentHistoryLoadLines.value
    )
    if (token !== loadToken || !term || props.sessionRef?.globalSessionKey !== sessionKey) return

    const latestSeq = getLastSeq(history)
    const cachedSeq = cachedHistory ? getLastSeq(cachedHistory) : 0
    if (!cachedHistory || shouldReplaceCachedHistory({
      cachedLength: cachedHistory.length,
      cachedLastSeq: cachedSeq,
      fetchedLength: history.length,
      fetchedLastSeq: latestSeq
    })) {
      if (!await renderHistorySnapshot(history, token, sessionKey)) return
    }

    hasMoreHistory.value = history.length >= currentHistoryLoadLines.value
    if (!cachedHistory || latestSeq > cachedSeq || (latestSeq === cachedSeq && history.length >= cachedHistory.length)) {
      writeWarmHistorySnapshot(sessionKey, history, currentHistoryLoadLines.value)
    }
  } catch {
    // A history read failure must not interrupt the still-healthy live stream.
  } finally {
    finishHistoryLoad(token, sessionKey)
  }
}

async function loadMoreHistory(): Promise<void> {
  if (loadingHistory.value || loadingMoreHistory.value || !hasMoreHistory.value) return
  const nextLimit = Math.min(HISTORY_MAX_LOAD_LINES, currentHistoryLoadLines.value + HISTORY_LOAD_STEP)
  if (nextLimit === currentHistoryLoadLines.value) {
    hasMoreHistory.value = false
    return
  }

  loadingMoreHistory.value = true
  currentHistoryLoadLines.value = nextLimit
  const request = loadHistory()
  const token = loadToken
  try {
    await request
  } finally {
    if (token === loadToken) loadingMoreHistory.value = false
  }
}

function applyLiveOutputNow(event: GatewayOutputEvent): void {
  if (!props.sessionRef || event.globalSessionKey !== props.sessionRef.globalSessionKey) return
  liveOutputQueue.push(event)
  scheduleLiveOutputFlush()
}

function scheduleLiveOutputFlush(): void {
  if (liveOutputFlushRaf !== null || liveOutputWritePending) return
  liveOutputFlushRaf = requestAnimationFrame(() => {
    liveOutputFlushRaf = null
    flushLiveOutputQueue()
  })
}

function flushLiveOutputQueue(): void {
  if (!term || !props.sessionRef || loadingHistory.value || liveOutputQueue.length === 0 || liveOutputWritePending) return

  const currentTerm = term
  const sessionKey = props.sessionRef.globalSessionKey
  const shouldStickToBottom = autoScroll.value
  const queued = liveOutputQueue.splice(0, liveOutputQueue.length)
  let chunk = ''
  const nextLines: OutputLine[] = []

  for (const event of queued) {
    if (event.globalSessionKey !== sessionKey) continue

    const seq = resolveSeq(
      { text: event.data, stream: event.stream, timestamp: event.timestamp, seq: event.seq },
      lastRenderedSeq + 1
    )
    if (seq <= lastRenderedSeq) continue

    const line: OutputLine = {
      text: event.data,
      stream: event.stream,
      timestamp: event.timestamp,
      seq
    }
    nextLines.push(line)
    if (firstRenderedSeq === 0) firstRenderedSeq = seq
    chunk += line.text
    lastRenderedSeq = seq
  }

  if (nextLines.length === 0 || !chunk) return

  appendWarmHistorySnapshotBatch(sessionKey, nextLines)
  liveOutputWritePending = true
  const writeToken = ++liveOutputWriteToken
  liveOutputWriteCompletion = writeTerminalChunk(chunk, currentTerm).then(() => {
    if (writeToken !== liveOutputWriteToken) return
    liveOutputWritePending = false
    liveOutputWriteCompletion = null
    if (
      shouldStickToBottom &&
      autoScroll.value &&
      term === currentTerm &&
      props.sessionRef?.globalSessionKey === sessionKey
    ) {
      scrollToBottom(true)
    }
    if (liveOutputQueue.length > 0) {
      scheduleLiveOutputFlush()
    }
  })
}

function applyLiveOutput(event: GatewayOutputEvent): void {
  if (!props.sessionRef || event.globalSessionKey !== props.sessionRef.globalSessionKey) return
  if (typeof event.seq === 'number' && event.seq <= clearedThroughSeq) return
  if (loadingHistory.value) {
    pendingEvents.push(event)
    return
  }
  if (!shouldRenderLiveOutput()) {
    const seq = resolveSeq(
      { text: event.data, stream: event.stream, timestamp: event.timestamp, seq: event.seq },
      getWarmHistorySnapshotLastSeq(event.globalSessionKey) + 1
    )
    appendWarmHistorySnapshot(event.globalSessionKey, {
      text: event.data,
      stream: event.stream,
      timestamp: event.timestamp,
      seq
    })
    return
  }
  applyLiveOutputNow(event)
}

async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (text && props.sessionRef && isSessionWritable()) {
      const context = await resolveGatewayContext()
      if (!context) return
      try {
        await context.gateway.writeRaw(context.sessionRef.instanceId, context.sessionRef.sessionId, text)
      } catch (error) {
        console.warn('[TerminalOutput] paste writeRaw failed', error)
      }
    }
  } catch {
    // Ignore clipboard read failure.
  }
}

function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  if (term && term.hasSelection()) {
    void copySelectedText(true)
  } else {
    void pasteFromClipboard()
  }
}

function handleWheel(e: WheelEvent): void {
  if (!term) return
  if (shouldPauseAutoScrollForWheel(e)) {
    autoScroll.value = false
  }
  if (!(e.ctrlKey || e.metaKey)) return
  e.preventDefault()
  e.stopPropagation()

  const current = clampFontSize(Number(term.options.fontSize ?? activePaneFontSize.value))
  const next = current + (e.deltaY < 0 ? 1 : -1)
  const clamped = clampFontSize(next)
  if (clamped === current) return

  applyTermFontSize(clamped, true)
  updatePaneFontSize(clamped)
}

function handleFocus(): void {
  if (!isSessionWritable()) return
  term?.focus()
}

async function copyAll(): Promise<void> {
  if (term) {
    term.selectAll()
    const text = term.getSelection()
    term.clearSelection()
    if (await safeWriteClipboard(text)) {
      toast.success(t('terminal.copySuccess'))
    } else {
      toast.error(t('terminal.copyFail'))
    }
    return
  }
  if (!props.sessionRef) return

  try {
    const context = await resolveGatewayContext()
    if (!context) return
    const history = await context.gateway.getOutputHistory(
      context.sessionRef.instanceId,
      context.sessionRef.sessionId,
      HISTORY_LOAD_LINES
    )
    if (await safeWriteClipboard(history.map((line) => line.text).join(''))) {
      toast.success(t('terminal.copySuccess'))
    } else {
      toast.error(t('terminal.copyFail'))
    }
  } catch {
    toast.error(t('terminal.copyFail'))
  }
}

// UX-1：已退出/崩溃会话的日志出口——读 output journal 尾部贴到剪贴板。
// journal 由主进程在会话退出/应用关停时落盘，重启后仍可回看。
async function viewJournalTail(): Promise<void> {
  if (!props.sessionRef || props.sessionRef.instanceId !== LOCAL_INSTANCE_ID) return
  try {
    const { getSessionJournalTail } = await import('@/api/local-session')
    const text = await getSessionJournalTail(props.sessionRef.sessionId, 500)
    if (!text) {
      toast.info(t('terminal.journalEmpty'))
      return
    }
    if (await safeWriteClipboard(text)) {
      toast.success(t('terminal.journalCopied', { lines: text.split('\n').length }))
    } else {
      toast.error(t('terminal.copyFail'))
    }
  } catch {
    toast.error(t('terminal.journalReadFail'))
  }
}

async function handleClear(): Promise<void> {
  if (clearingOutput.value || !term || !props.sessionRef || props.sessionRef.instanceId !== 'local') return
  const sessionRef = { ...props.sessionRef }
  const target = term
  clearingOutput.value = true
  let token: number | null = null
  const ownsView = () => term === target && props.sessionRef?.globalSessionKey === sessionRef.globalSessionKey
  try {
    const confirmed = await confirmDialog.confirm({
      title: t('terminal.confirmClearTitle'),
      message: t('terminal.confirmClearMessage'),
      details: t('terminal.confirmClearDetails'),
      confirmText: t('confirm.clear'),
      cancelText: t('confirm.cancel'),
      tone: 'danger'
    })
    if (!confirmed || !ownsView()) return

    token = ++loadToken
    loadingHistory.value = true
    foregroundSyncing.value = false
    historyReplayToken = null
    for (const event of liveOutputQueue.splice(0)) pendingEvents.push(event)
    clearLiveOutputQueue()
    const cutoff = await sessionsStore.clearSessionOutputRef(sessionRef)
    // Invalidate the original session's cache even if the user switched tabs.
    clearWarmHistorySnapshot(sessionRef.globalSessionKey)
    if (!ownsView() || token !== loadToken) return

    // A zero-length write is a parser barrier: queued writes must finish BEFORE
    // reset, not repaint the view after it has been cleared.
    await writeTerminalChunk('', target)
    if (!ownsView() || token !== loadToken) return
    if (typeof cutoff === 'number' && Number.isSafeInteger(cutoff)) {
      clearedThroughSeq = Math.max(clearedThroughSeq, cutoff)
    } else {
      clearedThroughSeq = Math.max(clearedThroughSeq, lastRenderedSeq)
    }
    target.reset()
    resetLocalBuffer()
    currentHistoryLoadLines.value = HISTORY_LOAD_LINES
    hasMoreHistory.value = true
    loadingMoreHistory.value = false
  } catch (error) {
    toast.error(t('toast.operationFailed') + ': ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    if (ownsView()) clearingOutput.value = false
    if (token !== null) finishHistoryLoad(token, sessionRef.globalSessionKey)
  }
}

watch(
  () => props.sessionRef?.globalSessionKey,
  () => {
    clearLiveOutputQueue()
    currentHistoryLoadLines.value = HISTORY_LOAD_LINES
    hasMoreHistory.value = true
    loadingMoreHistory.value = false
    reloadSessionView()
  },
  { flush: 'post' }
)

watch(
  () => props.processKey,
  () => {
    if (term) {
      term.options.disableStdin = !isSessionWritable()
    }
    if (isPaneVisible()) {
      syncPtySize(true)
    }
  }
)

watch(
  activePaneFontSize,
  (size) => {
    applyTermFontSize(size, true)
  }
)

watch(
  () => settingsStore.settings.theme,
  () => {
    requestAnimationFrame(applyTerminalTheme)
  }
)

watch(
  isForegroundPane,
  (foreground) => {
    if (!foreground) return
    void syncForegroundFromWarmHistory().then(() => {
      focusTerminalForIME()
    })
  }
)

watch(
  currentSessionStatus,
  (status) => {
    if (status === 'running' && isPaneVisible()) {
      scheduleResize()
    }
  }
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  reloadSessionView()

  resizeObserver = new ResizeObserver(() => {
    const host = containerRef.value
    if (!host) return
    const nextWidth = host.clientWidth
    const nextHeight = host.clientHeight
    if (nextWidth === lastObservedWidth && nextHeight === lastObservedHeight) {
      return
    }
    lastObservedWidth = nextWidth
    lastObservedHeight = nextHeight
    scheduleResize()
  })

  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  if (fontSizePersistTimer) {
    clearTimeout(fontSizePersistTimer)
    fontSizePersistTimer = null
  }
  if (hasPendingFontSizePersist) {
    hasPendingFontSizePersist = false
    void settingsStore.save()
  }
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
  lastObservedWidth = -1
  lastObservedHeight = -1
  unlistenOutput?.()
  unlistenOutput = null
  subscribedGlobalSessionKey = null
  loadingHistory.value = false
  foregroundSyncing.value = false
  pendingEvents.length = 0
  resizeObserver?.disconnect()
  destroyTerminal()
})
</script>

<style scoped lang="scss">
.terminal-output {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.terminal-toolbar {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-height: 32px;
  padding: 4px 8px 0;
  background: var(--bg-primary);
}

// UX-8：终端内搜索条
.terminal-search-bar {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 12;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.78);
  backdrop-filter: blur(4px);

  input[type='text'] {
    width: 220px;
    padding: 2px 6px;
    border: 1px solid rgba(255, 255, 255, 0.22);
    border-radius: 4px;
    background: transparent;
    color: inherit;
    font-size: 12px;

    &:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.45);
    }
  }

  button {
    padding: 1px 7px;
    border: none;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.1);
    color: inherit;
    cursor: pointer;
    font-size: 12px;

    &:hover {
      background: rgba(255, 255, 255, 0.2);
    }
  }

  .terminal-search-case {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    white-space: nowrap;
  }

  .terminal-search-result {
    font-size: 11px;
    opacity: 0.85;
    white-space: nowrap;
  }
}

.history-window-hint {
  max-width: min(42vw, 280px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  line-height: 14px;
  opacity: 0.86;
}

.terminal-container {
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
  // 留白必须放在 .xterm 元素上而不是容器上：FitAddon 计算行列数时
  // 只会扣除 .xterm 自身的 padding（容器的 padding 它不感知），
  // 放容器上会导致网格超高、提示行被顶到底边没有呼吸空间
  padding: 0;
  background: var(--bg-primary);

  :deep(.xterm) {
    padding: 6px 8px 14px;
  }

  // xterm.css 把 .xterm-viewport（绝对定位铺满 .xterm，含 padding）写死为 #000，
  // 主题背景只被 JS 设到内部滚动层上，导致 padding 一圈露出黑边——按主题变量覆盖
  :deep(.xterm-viewport) {
    background-color: var(--bg-primary);
  }
}

.terminal-scroll-state {
  position: absolute;
  right: 12px;
  bottom: 10px;
  z-index: 8;
  max-width: min(36vw, 220px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  opacity: 0.86;
  pointer-events: none;
}

.terminal-sync-state {
  position: absolute;
  right: 12px;
  bottom: 38px;
  z-index: 8;
  max-width: min(36vw, 240px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--accent-primary) 32%, var(--border-color));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--accent-primary) 10%, var(--bg-tertiary));
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  opacity: 0.9;
  pointer-events: none;
}

.terminal-input-state {
  position: absolute;
  left: 12px;
  bottom: 10px;
  z-index: 8;
  max-width: min(52vw, 520px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 4px 8px;
  border: 1px solid color-mix(in srgb, var(--status-warning) 28%, var(--border-color));
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-tertiary) 88%, var(--status-warning));
  color: var(--text-secondary);
  font-size: var(--font-size-xs);
  opacity: 0.92;
  pointer-events: none;
}
</style>
