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
    <div class="terminal-container" ref="containerRef" @mousedown="handleFocus" @contextmenu="handleContextMenu"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { getOutputHistory, resizeTerminal, writeToSession } from '@/api/session'
import type { OutputEvent, OutputLine } from '@/api/session'
import { subscribeSessionOutput } from '@/services/session-output-stream'

const props = defineProps<{ sessionId?: string | null; processKey?: string | null }>()
const emit = defineEmits<{ clear: [] }>()

const containerRef = ref<HTMLElement | null>(null)
let term: Terminal | null = null
let fitAddon: FitAddon | null = null
let lastRenderedSeq = 0
let loadToken = 0
let unlistenOutput: (() => void) | null = null
let subscribedSessionId: string | null = null
let loadingHistory = false
const pendingEvents: OutputEvent[] = []
let lastSyncedCols = -1
let lastSyncedRows = -1
let resizeTimer: ReturnType<typeof setTimeout> | null = null
const autoScroll = ref(true)
let suppressAutoScrollTracking = false
const isWindows = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('windows')
const HISTORY_LOAD_LINES = 20000

// 安全剪贴板写入，窗口失焦时不抛异常
function safeWriteClipboard(text: string): void {
  navigator.clipboard.writeText(text).catch(() => {})
}

function resolveSeq(line: OutputLine, fallback: number): number {
  if (typeof line.seq === 'number' && Number.isFinite(line.seq)) {
    return line.seq
  }
  return fallback
}

function syncPtySize(force = false): void {
  if (!term || !props.sessionId) return

  if (!force && term.cols === lastSyncedCols && term.rows === lastSyncedRows) return
  lastSyncedCols = term.cols
  lastSyncedRows = term.rows

  void resizeTerminal(props.sessionId, term.cols, term.rows)
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

function bindOutput(): void {
  const sessionId = props.sessionId ?? null
  if (sessionId === subscribedSessionId && unlistenOutput) return

  if (unlistenOutput) {
    unlistenOutput()
    unlistenOutput = null
  }
  subscribedSessionId = null

  if (!sessionId) return

  unlistenOutput = subscribeSessionOutput(sessionId, (event) => {
    applyLiveOutput(event)
  })
  subscribedSessionId = sessionId
}

function reloadSessionView(): void {
  initTerminal()
  loadingHistory = true
  bindOutput()
  void loadHistory().then(focusTerminalForIME)
}

function focusTerminalForIME(): void {
  if (!term) return
  const focusTextarea = () => {
    term?.focus()
    const textarea = containerRef.value?.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement | null
    textarea?.focus({ preventScroll: true })
  }

  // Windows IME 需要先释放旧焦点上下文，再延迟附着到终端 textarea
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
  requestAnimationFrame(() => {
    focusTextarea()
    setTimeout(focusTextarea, 120)
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
    disableStdin: false,
    convertEol: false,
    scrollback: 20000,
    fontSize: 13,
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

    if (ev.ctrlKey && ev.shiftKey && ev.code === 'KeyC') {
      const sel = term!.getSelection()
      if (sel) safeWriteClipboard(sel)
      return false
    }

    if ((ev.ctrlKey && ev.shiftKey && ev.code === 'KeyV') || (ev.ctrlKey && !ev.shiftKey && ev.code === 'KeyV')) {
      void pasteFromClipboard()
      return false
    }

    return true
  })

  term.onData((data: string) => {
    if (props.sessionId) {
      void writeToSession(props.sessionId, data)
    }
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
  const sessionId = props.sessionId
  if (!term || !sessionId) {
    resetLocalBuffer()
    return
  }

  const token = ++loadToken
  loadingHistory = true
  pendingEvents.length = 0
  let history: OutputLine[] = []

  try {
    history = await getOutputHistory(sessionId, HISTORY_LOAD_LINES)
  } catch {
    loadingHistory = false
    return
  }

  if (token !== loadToken || !term || props.sessionId !== sessionId) {
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

function applyLiveOutputNow(event: OutputEvent): void {
  if (!term || !props.sessionId || event.sessionId !== props.sessionId) return

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

function applyLiveOutput(event: OutputEvent): void {
  if (!props.sessionId || event.sessionId !== props.sessionId) return
  if (loadingHistory) {
    pendingEvents.push(event)
    return
  }
  applyLiveOutputNow(event)
}

async function pasteFromClipboard(): Promise<void> {
  try {
    const text = await navigator.clipboard.readText()
    if (text && props.sessionId) {
      await writeToSession(props.sessionId, text)
    }
  } catch {
    // Ignore clipboard read failure.
  }
}

function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  if (term && term.hasSelection()) {
    safeWriteClipboard(term.getSelection())
  } else {
    void pasteFromClipboard()
  }
}

function handleFocus(): void {
  term?.focus()
}

async function copyAll(): Promise<void> {
  if (term) {
    term.selectAll()
    const text = term.getSelection()
    term.clearSelection()
    safeWriteClipboard(text)
    return
  }

  if (!props.sessionId) return

  try {
    const history = await getOutputHistory(props.sessionId, HISTORY_LOAD_LINES)
    safeWriteClipboard(history.map((line) => line.text).join(''))
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
  () => props.sessionId,
  () => {
    reloadSessionView()
  },
  { flush: 'post' }
)

watch(
  () => props.processKey,
  () => {
    syncPtySize(true)
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
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
  unlistenOutput?.()
  unlistenOutput = null
  subscribedSessionId = null
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
