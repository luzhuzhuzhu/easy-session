export const terminalScript = `
  const MAX_PLAIN_BUFFER_CHARS = 120000;

  function getThemeVariable(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function getTerminalTheme() {
    return {
      background: getThemeVariable('--terminal-bg', '#0c0c0c'),
      foreground: getThemeVariable('--terminal-fg', '#f3f3f3'),
      cursor: getThemeVariable('--terminal-cursor', '#005fb8'),
      selectionBackground: getThemeVariable('--terminal-selection', 'rgba(0, 95, 184, 0.18)')
    };
  }

  function stripAnsi(input) {
    return String(input || '').replace(/\\x1B(?:[@-Z\\\\-_]|\\[[0-?]*[ -/]*[@-~])/g, '');
  }

  function normalizePlainOutput(raw) {
    return stripAnsi(raw).replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n');
  }

  function trimPlainBuffer(value) {
    if (value.length <= MAX_PLAIN_BUFFER_CHARS) return value;
    return value.slice(value.length - MAX_PLAIN_BUFFER_CHARS);
  }

  function getTerminalHost() {
    return isMobileLayout() ? document.getElementById('mobileTerminalHost') : document.getElementById('terminalHost');
  }

  function resetHost(host) {
    if (!host) return;
    host.textContent = '';
  }

  function destroyTerminal() {
    if (state.term) {
      state.term.dispose();
      state.term = null;
    }

    state.fitAddon = null;
    state.plainTerminalEl = null;
    state.terminalMode = 'uninitialized';
    state.termLayoutMode = '';

    resetHost(document.getElementById('terminalHost'));
    resetHost(document.getElementById('mobileTerminalHost'));
  }

  function createPlainTerminal(host, reason) {
    host.textContent = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'plain-terminal';

    const head = document.createElement('div');
    head.className = 'plain-terminal-head';

    const title = document.createElement('strong');
    title.textContent = '纯文本兼容终端';

    const badge = document.createElement('span');
    badge.className = 'plain-terminal-badge';
    badge.textContent = '兼容模式';

    const output = document.createElement('pre');
    output.className = 'plain-terminal-output plain-terminal-empty';
    output.textContent = '等待终端输出...';

    head.appendChild(title);
    head.appendChild(badge);
    wrapper.appendChild(head);
    wrapper.appendChild(output);
    host.appendChild(wrapper);

    state.plainTerminalEl = output;
    state.terminalMode = 'plain';

    if (reason) {
      setGlobalNotice(reason, 'warning');
    }
  }

  function applyTerminalTheme() {
    if (state.terminalMode !== 'xterm' || !state.term) return;
    const nextTheme = getTerminalTheme();
    const nextFontFamily = getThemeVariable('--font-mono', 'Consolas, "Cascadia Code", "Courier New", monospace');

    if (typeof state.term.setOption === 'function') {
      state.term.setOption('theme', nextTheme);
      state.term.setOption('fontFamily', nextFontFamily);
      return;
    }

    state.term.options = {
      theme: nextTheme,
      fontFamily: nextFontFamily
    };
  }

  function setPlainTerminalContent(value) {
    if (!state.plainTerminalEl) return;
    const nextValue = trimPlainBuffer(value || '');
    state.plainTerminalEl.textContent = nextValue || '等待终端输出...';
    state.plainTerminalEl.classList.toggle('plain-terminal-empty', !nextValue);
    state.plainTerminalEl.scrollTop = state.plainTerminalEl.scrollHeight;
  }

  function appendPlainOutput(raw) {
    const session = getActiveSession();
    if (!session) return;

    const previous = state.plainBufferBySession[session.id] || '';
    const nextValue = trimPlainBuffer(previous + normalizePlainOutput(raw));
    state.plainBufferBySession[session.id] = nextValue;
    setPlainTerminalContent(nextValue);
  }

  function initTerminal(forceRecreate) {
    const layoutMode = isMobileLayout() ? 'mobile' : 'desktop';
    const host = getTerminalHost();

    if (!host) {
      setInlineNotice('终端容器不可用。', 'error');
      return;
    }

    if (!forceRecreate && state.termLayoutMode === layoutMode) {
      if (state.terminalMode === 'xterm' && state.term) return;
      if (state.terminalMode === 'plain') return;
    }

    destroyTerminal();

    if (!window.Terminal || !window.FitAddon || !window.FitAddon.FitAddon) {
      createPlainTerminal(host, 'xterm 资源加载失败，已切换到纯文本兼容模式。');
      const activeSession = getActiveSession();
      if (activeSession) {
        setPlainTerminalContent(state.plainBufferBySession[activeSession.id] || '');
      }
      return;
    }

    state.term = new window.Terminal({
      cursorBlink: true,
      disableStdin: true,
      convertEol: true,
      scrollback: 4000,
      fontSize: 13,
      fontFamily: getThemeVariable('--font-mono', 'Consolas, "Cascadia Code", "Courier New", monospace'),
      theme: getTerminalTheme()
    });

    state.fitAddon = new window.FitAddon.FitAddon();
    state.term.loadAddon(state.fitAddon);
    state.termLayoutMode = layoutMode;
    state.terminalMode = 'xterm';
    state.term.open(host);
    applyTerminalTheme();
    state.fitAddon.fit();
  }

  function ensureTerminal(forceRecreate) {
    const shouldMount = !isMobileLayout() || state.currentView === 'terminal';
    if (!shouldMount) {
      destroyTerminal();
      return;
    }

    initTerminal(forceRecreate);
  }

  function fitTerminalAndResizeRemote() {
    if (state.terminalMode !== 'xterm' || !state.term || !state.fitAddon) return;

    try {
      state.fitAddon.fit();
    } catch (_error) {
      return;
    }

    const activeSession = getActiveSession();
    if (!activeSession || !state.socket || !state.connected) return;

    state.socket.emit('session:resize', {
      sessionId: activeSession.id,
      cols: state.term.cols,
      rows: state.term.rows
    });
  }

  function scheduleTerminalResize() {
    if (state.resizeTimer) clearTimeout(state.resizeTimer);
    state.resizeTimer = setTimeout(fitTerminalAndResizeRemote, RESIZE_DEBOUNCE_MS);
  }

  function resetTerminal(sessionId) {
    state.lastSeqBySession[sessionId] = 0;
    state.plainBufferBySession[sessionId] = '';

    if (state.terminalMode === 'xterm' && state.term) {
      state.term.reset();
      return;
    }

    if (state.terminalMode === 'plain') {
      setPlainTerminalContent('');
    }
  }

  function clearActiveTerminalOutput() {
    const activeSession = getActiveSession();
    if (activeSession) {
      state.plainBufferBySession[activeSession.id] = '';
    }

    if (state.terminalMode === 'xterm' && state.term) {
      state.term.reset();
      return;
    }

    if (state.terminalMode === 'plain') {
      setPlainTerminalContent('');
    }
  }

  function writeOutput(event) {
    if (!event || event.sessionId !== state.activeSessionId) return;

    if (typeof event.seq === 'number') {
      const previousSeq = state.lastSeqBySession[event.sessionId] || 0;
      if (event.seq <= previousSeq) return;
      state.lastSeqBySession[event.sessionId] = event.seq;
    }

    const raw = typeof event.data === 'string' ? event.data : String(event.data ?? '');
    if (!raw) return;

    if (state.terminalMode === 'xterm' && state.term) {
      state.term.write(raw);
      return;
    }

    appendPlainOutput(raw);
  }
`
