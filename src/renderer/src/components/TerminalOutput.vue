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
      <ToolbarButton :label="$t('terminal.clearOutput')" tone="danger" @click="handleClear">
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
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal, type FontWeight } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import ToolbarButton from '@/components/ui/ToolbarButton.vue'
import UiIcon from '@/components/ui/UiIcon.vue'
import type { OutputLine } from '@/api/session'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useToast } from '@/composables/useToast'
import { useInstancesStore } from '@/stores/instances'
import { useSettingsStore } from '@/stores/settings'
import { useSessionsStore } from '@/stores/sessions'
import { useWorkspaceStore } from '@/stores/workspace'
import { getSharedGatewayResolver, type GatewayOutputEvent } from '@/gateways'
import type { SessionRef } from '@/models/unified-resource'
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  clampTerminalLetterSpacing,
  clampTerminalLineHeight,
  ensureMonospaceFallback,
  isTerminalFontWeight,
  parseSessionAppearance
} from '@/models/terminal-appearance'

const props = defineProps<{ sessionRef?: SessionRef | null; processKey?: string | null; paneId?: string | null }>()
const emit = defineEmits<{ clear: [] }>()
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
let lastRenderedSeq = 0
let loadToken = 0
let subscribeToken = 0
let unlistenOutput: (() => void) | null = null
let subscribedGlobalSessionKey: string | null = null
let loadingHistory = false
const pendingEvents: GatewayOutputEvent[] = []
const liveOutputQueue: GatewayOutputEvent[] = []
let liveOutputFlushRaf: number | null = null
let lastSyncedCols = -1
let lastSyncedRows = -1
let resizeTimer: ReturnType<typeof setTimeout> | null = null
const autoScroll = ref(true)
let suppressAutoScrollTracking = false
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
  let maxSeq = 0
  for (const line of history) {
    const seq = resolveSeq(line, maxSeq)
    if (seq > maxSeq) {
      maxSeq = seq
    }
  }
  return maxSeq
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

function writeWarmHistorySnapshot(sessionKey: string, history: OutputLine[]): void {
  historySnapshotCache.set(sessionKey, {
    lines: history.slice(-HISTORY_LOAD_LINES).map((line) => ({ ...line })),
    lastSeq: getLastSeq(history),
    capturedAt: Date.now()
  })
}

function appendWarmHistorySnapshot(sessionKey: string, line: OutputLine): void {
  const cached = historySnapshotCache.get(sessionKey)
  if (!cached) {
    historySnapshotCache.set(sessionKey, {
      lines: [{ ...line }],
      lastSeq: resolveSeq(line, 0),
      capturedAt: Date.now()
    })
    return
  }

  const nextSeq = resolveSeq(line, cached.lastSeq)
  if (nextSeq <= cached.lastSeq) {
    cached.capturedAt = Date.now()
    return
  }

  cached.lines.push({ ...line, seq: nextSeq })
  if (cached.lines.length > HISTORY_LOAD_LINES) {
    cached.lines.splice(0, cached.lines.length - HISTORY_LOAD_LINES)
  }
  cached.lastSeq = nextSeq
  cached.capturedAt = Date.now()
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

function clearLiveOutputQueue(): void {
  liveOutputQueue.length = 0
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
    await context.gateway.resize(context.sessionRef.instanceId, context.sessionRef.sessionId, term.cols, term.rows)
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
  const sessionRef = props.sessionRef ?? null
  const nextGlobalSessionKey = sessionRef?.globalSessionKey ?? null
  if (nextGlobalSessionKey === subscribedGlobalSessionKey && unlistenOutput) return

  if (unlistenOutput) {
    unlistenOutput()
    unlistenOutput = null
  }
  subscribedGlobalSessionKey = null

  if (!sessionRef) return

  const token = ++subscribeToken
  const context = await resolveGatewayContext()
  if (!context || token !== subscribeToken) return

  unlistenOutput = context.gateway.subscribeOutput(
    context.sessionRef.instanceId,
    context.sessionRef.sessionId,
    (event) => {
      applyLiveOutput(event)
    }
  )
  subscribedGlobalSessionKey = context.sessionRef.globalSessionKey
}

function reloadSessionView(): void {
  initTerminal()
  loadingHistory = true
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

  if (term) {
    term.dispose()
    term = null
    fitAddon = null
  }

  if (containerRef.value) containerRef.value.innerHTML = ''
  clearLiveOutputQueue()
  lastRenderedSeq = 0
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
  term.loadAddon(fitAddon)
  term.open(containerRef.value)
  requestAnimationFrame(() => {
    fitAndSync(true)
  })

  term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
    if (ev.type !== 'keydown') return true

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
    if (!term || suppressAutoScrollTracking) return
    autoScroll.value = isViewportAtBottom()
  })
}

function resetLocalBuffer(): void {
  lastRenderedSeq = 0
}

function isViewportAtBottom(): boolean {
  if (!term) return true
  const active = term.buffer.active
  return active.viewportY >= active.baseY
}

function scrollToBottom(force = false): void {
  if (!term) return
  if (!force && !autoScroll.value) return
  suppressAutoScrollTracking = true
  term.scrollToBottom()
  queueMicrotask(() => {
    suppressAutoScrollTracking = false
  })
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

function writeTerminalChunk(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!term || !text) {
      resolve()
      return
    }
    term.write(text, resolve)
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
      lastRenderedSeq = seq
    }

    if (chunk) {
      await writeTerminalChunk(chunk)
    }

    if (index + HISTORY_WRITE_BATCH_SIZE < history.length) {
      await waitForNextHistoryBatch()
    }
  }

  return true
}

async function renderHistorySnapshot(
  history: OutputLine[],
  token: number,
  sessionKey: string,
  forceScroll = false
): Promise<boolean> {
  if (!term || token !== loadToken || props.sessionRef?.globalSessionKey !== sessionKey) {
    return false
  }

  const previousViewportOffsetFromBottom = !autoScroll.value
    ? Math.max(0, term.buffer.active.baseY - term.buffer.active.viewportY)
    : 0

  term.reset()
  lastSyncedCols = -1
  lastSyncedRows = -1
  fitAndSync(true)
  resetLocalBuffer()

  const replayed = await replayHistoryInBatches(history, token, sessionKey)
  if (!replayed) {
    return false
  }

  if (!forceScroll && !autoScroll.value) {
    const nextViewportY = Math.max(0, term.buffer.active.baseY - previousViewportOffsetFromBottom)
    suppressAutoScrollTracking = true
    term.scrollToLine(nextViewportY)
    queueMicrotask(() => {
      suppressAutoScrollTracking = false
    })
    return true
  }

  scrollToBottom(forceScroll)
  return true
}

async function syncForegroundFromWarmHistory(): Promise<void> {
  const sessionKey = props.sessionRef?.globalSessionKey
  if (!term || !sessionKey || loadingHistory || !isPaneVisible()) return

  const cachedHistory = readWarmHistorySnapshot(sessionKey)
  if (!cachedHistory?.length) return

  const cachedSeq = getWarmHistorySnapshotLastSeq(sessionKey)
  if (cachedSeq <= lastRenderedSeq) return

  const token = ++loadToken
  loadingHistory = true
  foregroundSyncing.value = true
  try {
    const replayed = await renderHistorySnapshot(cachedHistory, token, sessionKey, false)
    if (replayed) {
      scheduleResize()
    }
  } finally {
    loadingHistory = false
    foregroundSyncing.value = false
  }
}

async function loadHistory(): Promise<void> {
  const sessionRef = props.sessionRef ?? null
  if (!term || !sessionRef) {
    resetLocalBuffer()
    return
  }

  const token = ++loadToken
  loadingHistory = true
  pendingEvents.length = 0
  let history: OutputLine[] = []
  const cachedHistory = readWarmHistorySnapshot(sessionRef.globalSessionKey)

  if (cachedHistory?.length) {
    const renderedFromCache = await renderHistorySnapshot(cachedHistory, token, sessionRef.globalSessionKey, true)
    if (!renderedFromCache) {
      loadingHistory = false
      return
    }
  }

  try {
    const context = await resolveGatewayContext()
    if (!context) {
      loadingHistory = false
      return
    }
    history = await context.gateway.getOutputHistory(
      context.sessionRef.instanceId,
      context.sessionRef.sessionId,
      currentHistoryLoadLines.value
    )
  } catch {
    loadingHistory = false
    return
  }

  if (token !== loadToken || !term || props.sessionRef?.globalSessionKey !== sessionRef.globalSessionKey) {
    loadingHistory = false
    return
  }

  const latestSeq = getLastSeq(history)
  const cachedSeq = cachedHistory ? getLastSeq(cachedHistory) : 0
  if (!cachedHistory || latestSeq !== cachedSeq) {
    const replayed = await renderHistorySnapshot(history, token, sessionRef.globalSessionKey, true)
    if (!replayed) {
      loadingHistory = false
      return
    }
  }

  hasMoreHistory.value = history.length >= currentHistoryLoadLines.value
  writeWarmHistorySnapshot(sessionRef.globalSessionKey, history)
  loadingHistory = false

  if (pendingEvents.length === 0) {
    return
  }

  const queued = pendingEvents.splice(0, pendingEvents.length)
  for (const event of queued) {
    applyLiveOutputNow(event)
  }
}

async function loadMoreHistory(): Promise<void> {
  if (loadingHistory || loadingMoreHistory.value || !hasMoreHistory.value) return
  const nextLimit = Math.min(HISTORY_MAX_LOAD_LINES, currentHistoryLoadLines.value + HISTORY_LOAD_STEP)
  if (nextLimit === currentHistoryLoadLines.value) {
    hasMoreHistory.value = false
    return
  }

  loadingMoreHistory.value = true
  currentHistoryLoadLines.value = nextLimit
  try {
    await loadHistory()
  } finally {
    loadingMoreHistory.value = false
  }
}

function applyLiveOutputNow(event: GatewayOutputEvent): void {
  if (!props.sessionRef || event.globalSessionKey !== props.sessionRef.globalSessionKey) return
  liveOutputQueue.push(event)
  scheduleLiveOutputFlush()
}

function scheduleLiveOutputFlush(): void {
  if (liveOutputFlushRaf !== null) return
  liveOutputFlushRaf = requestAnimationFrame(() => {
    liveOutputFlushRaf = null
    flushLiveOutputQueue()
  })
}

function flushLiveOutputQueue(): void {
  if (!term || !props.sessionRef || liveOutputQueue.length === 0) return

  const sessionKey = props.sessionRef.globalSessionKey
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
    chunk += line.text
    lastRenderedSeq = seq
  }

  if (nextLines.length === 0 || !chunk) return

  term.write(chunk)
  appendWarmHistorySnapshotBatch(sessionKey, nextLines)
  scrollToBottom(false)
}

function applyLiveOutput(event: GatewayOutputEvent): void {
  if (!props.sessionRef || event.globalSessionKey !== props.sessionRef.globalSessionKey) return
  if (loadingHistory) {
    pendingEvents.push(event)
    return
  }
  if (!shouldRenderLiveOutput()) {
    const seq = resolveSeq(
      { text: event.data, stream: event.stream, timestamp: event.timestamp, seq: event.seq },
      getWarmHistorySnapshotLastSeq(event.globalSessionKey)
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

async function handleClear(): Promise<void> {
  const confirmed = await confirmDialog.confirm({
    title: t('terminal.confirmClearTitle'),
    message: t('terminal.confirmClearMessage'),
    details: t('terminal.confirmClearDetails'),
    confirmText: t('confirm.clear'),
    cancelText: t('confirm.cancel'),
    tone: 'danger'
  })
  if (!confirmed) return

  term?.reset()
  emit('clear')
  resetLocalBuffer()
  clearLiveOutputQueue()
  clearWarmHistorySnapshot(props.sessionRef?.globalSessionKey)
  hasMoreHistory.value = false
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
  loadingHistory = false
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
  position: absolute;
  top: 4px;
  right: 12px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 4px;
  // 平时完全隐藏，悬停到终端区域或键盘聚焦到按钮时才浮现，
  // 避免四个常驻按钮压在终端右上角内容上
  opacity: 0;
  pointer-events: none;
  transition: opacity 140ms ease;
}

.terminal-output:hover .terminal-toolbar,
.terminal-toolbar:focus-within {
  opacity: 1;
  pointer-events: auto;
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
