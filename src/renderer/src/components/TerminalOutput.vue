<template>
  <div class="terminal-output">
    <div class="terminal-toolbar">
      <button
        class="tool-btn"
        :class="{ active: autoScroll }"
        :title="$t(autoScroll ? 'terminal.pauseScroll' : 'terminal.resumeScroll')"
        @click="toggleAutoScroll"
      >
        {{ autoScroll ? 'AS' : 'PA' }}
      </button>
      <button class="tool-btn" :title="$t('terminal.copyAll')" @click="copyAll">CP</button>
      <button class="tool-btn" :title="$t('terminal.clearOutput')" @click="handleClear">CL</button>
    </div>
    <div
      class="terminal-container"
      ref="containerRef"
      @mousedown="handleFocus"
      @contextmenu="handleContextMenu"
      @wheel.capture="handleWheel"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { OutputLine } from '@/api/session'
import { useToast } from '@/composables/useToast'
import { useSettingsStore } from '@/stores/settings'
import { getSharedGatewayResolver, type GatewayOutputEvent } from '@/gateways'
import type { SessionRef } from '@/models/unified-resource'

const props = defineProps<{ sessionRef?: SessionRef | null; processKey?: string | null; paneId?: string | null }>()
const emit = defineEmits<{ clear: [] }>()
const { t } = useI18n()
const toast = useToast()
const settingsStore = useSettingsStore()
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
let lastSyncedCols = -1
let lastSyncedRows = -1
let resizeTimer: ReturnType<typeof setTimeout> | null = null
const autoScroll = ref(true)
let suppressAutoScrollTracking = false
const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows')
const HISTORY_LOAD_LINES = 20000
const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 28
const FONT_SIZE_PERSIST_DEBOUNCE_MS = 320
let fontSizePersistTimer: ReturnType<typeof setTimeout> | null = null
let hasPendingFontSizePersist = false

function isSessionWritable(): boolean {
  return !!props.processKey
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
  if (copied && showToastTip) {
    toast.success(t('terminal.copySuccess'))
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

  if (!force && term.cols === lastSyncedCols && term.rows === lastSyncedRows) return
  lastSyncedCols = term.cols
  lastSyncedRows = term.rows

  void (async () => {
    const context = await resolveGatewayContext()
    if (!context) return
    await context.gateway.resize(context.sessionRef.instanceId, context.sessionRef.sessionId, term.cols, term.rows)
  })()
}

function fitAndSync(force = false): void {
  if (!term || !fitAddon) return
  fitAddon.fit()
  syncPtySize(force)
}

function scheduleResize(): void {
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
  lastRenderedSeq = 0
  lastSyncedCols = -1
  lastSyncedRows = -1
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
    fontFamily: 'Consolas, "Courier New", monospace',
    rightClickSelectsWord: true,
    theme: { background: '#0f1419', foreground: '#d1d5db', cursor: '#6c9eff', selectionBackground: 'rgba(108, 158, 255, 0.3)' },
    ...(isWindows ? { windowsPty: { backend: 'conpty' as const } } : {})
  })

  fitAddon = new FitAddon()
  term.loadAddon(fitAddon)
  term.open(containerRef.value)
  fitAndSync(true)

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

function writeLine(line: OutputLine): void {
  if (!term) return
  term.write(line.text)
  lastRenderedSeq = line.seq ?? lastRenderedSeq
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

  try {
    const context = await resolveGatewayContext()
    if (!context) {
      loadingHistory = false
      return
    }
    history = await context.gateway.getOutputHistory(
      context.sessionRef.instanceId,
      context.sessionRef.sessionId,
      HISTORY_LOAD_LINES
    )
  } catch {
    loadingHistory = false
    return
  }

  if (token !== loadToken || !term || props.sessionRef?.globalSessionKey !== sessionRef.globalSessionKey) {
    loadingHistory = false
    return
  }

  term.reset()
  lastSyncedCols = -1
  lastSyncedRows = -1
  fitAndSync(true)
  resetLocalBuffer()

  for (const raw of history) {
    const seq = resolveSeq(raw, lastRenderedSeq + 1)
    if (seq <= lastRenderedSeq) continue
    const line: OutputLine = { ...raw, seq }
    term.write(line.text)
    lastRenderedSeq = seq
  }

  scrollToBottom(true)
  loadingHistory = false

  if (pendingEvents.length === 0) {
    return
  }

  const queued = pendingEvents.splice(0, pendingEvents.length)
  for (const event of queued) {
    applyLiveOutputNow(event)
  }
}

function applyLiveOutputNow(event: GatewayOutputEvent): void {
  if (!term || !props.sessionRef || event.globalSessionKey !== props.sessionRef.globalSessionKey) return

  const seq = resolveSeq(
    { text: event.data, stream: event.stream, timestamp: event.timestamp, seq: event.seq },
    lastRenderedSeq + 1
  )
  if (seq <= lastRenderedSeq) return

  const line: OutputLine = {
    text: event.data,
    stream: event.stream,
    timestamp: event.timestamp,
    seq
  }
  writeLine(line)
  scrollToBottom(false)
}

function applyLiveOutput(event: GatewayOutputEvent): void {
  if (!props.sessionRef || event.globalSessionKey !== props.sessionRef.globalSessionKey) return
  if (loadingHistory) {
    pendingEvents.push(event)
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
    }
  } catch {
    // Ignore fallback copy failure.
  }
}

function handleClear(): void {
  term?.reset()
  emit('clear')
  resetLocalBuffer()
}

watch(
  () => props.sessionRef?.globalSessionKey,
  () => {
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
    syncPtySize(true)
  }
)

watch(
  activePaneFontSize,
  (size) => {
    applyTermFontSize(size, true)
  }
)

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  reloadSessionView()

  resizeObserver = new ResizeObserver(() => {
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
  unlistenOutput?.()
  unlistenOutput = null
  subscribedGlobalSessionKey = null
  loadingHistory = false
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
  gap: 4px;
}

.tool-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity var(--transition-fast);

  &:hover {
    opacity: 1;
  }

  &.active {
    opacity: 1;
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }
}

.terminal-container {
  flex: 1;
  overflow: hidden;
  box-sizing: border-box;
  padding: 4px 8px 8px;
  background: var(--bg-primary);
}
</style>
