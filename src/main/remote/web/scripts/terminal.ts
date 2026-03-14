export const terminalScript = `
  const MAX_PLAIN_BUFFER_CHARS = 120000;
  const TERMINAL_MOBILE_WIDTH_CHANGE_THRESHOLD_PX = 4;

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

  function isTerminalViewMounted() {
    return !isMobileLayout() || state.currentView === 'terminal';
  }

  function resetHost(host) {
    if (!host) return;
    host.textContent = '';
  }

  function disconnectTerminalHostObserver() {
    if (!state.terminalHostObserver) return;
    try {
      state.terminalHostObserver.disconnect();
    } catch (_error) {
      // Ignore observer cleanup errors.
    }
    state.terminalHostObserver = null;
  }

  function clearTerminalReadyTimer() {
    if (!state.terminalReadyTimer) return;
    clearTimeout(state.terminalReadyTimer);
    state.terminalReadyTimer = null;
  }

  function isTerminalPinnedToBottom() {
    if (state.terminalMode !== 'xterm' || !state.term || !state.term.buffer || !state.term.buffer.active) {
      return true;
    }

    const buffer = state.term.buffer.active;
    return buffer.baseY - buffer.viewportY <= 1;
  }

  function syncTerminalAutoFollow() {
    state.terminalAutoFollow = isTerminalPinnedToBottom();
  }

  function scrollTerminalToBottom() {
    if (state.terminalMode !== 'xterm' || !state.term || typeof state.term.scrollToBottom !== 'function') return;
    state.term.scrollToBottom();
    state.terminalAutoFollow = true;
  }

  function enableXtermTouchScroll(term) {
    if (!term || !term.element) return;
    var viewport = term.element.querySelector('.xterm-viewport');
    if (!viewport) return;

    viewport.style.overflowY = 'auto';
    viewport.style.webkitOverflowScrolling = 'touch';
    viewport.style.touchAction = 'pan-y';
  }

  function setupMobileKeyboardHandler() {
    if (!isMobileLayout()) return;
    if (state.keyboardHandlerSetup) return;
    state.keyboardHandlerSetup = true;

    var mobileTerminalPage = document.querySelector('.mobile-terminal-page');
    if (!mobileTerminalPage) return;

    function handleViewportChange() {
      if (!isMobileLayout()) return;
      requestAnimationFrame(function() {
        scheduleFit();
      });
    }

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    var lastInnerHeight = window.innerHeight;
    window.addEventListener('resize', function() {
      var newInnerHeight = window.innerHeight;
      var heightDiff = lastInnerHeight - newInnerHeight;
      if (Math.abs(heightDiff) > 50) {
        handleViewportChange();
        setTimeout(handleViewportChange, 100);
        setTimeout(handleViewportChange, 300);
      }
      lastInnerHeight = newInnerHeight;
    });
  }

  function destroyTerminal() {
    if (state.term) {
      state.term.dispose();
      state.term = null;
    }

    disconnectTerminalHostObserver();
    clearTerminalReadyTimer();
    state.fitAddon = null;
    state.plainTerminalEl = null;
    state.terminalMode = 'uninitialized';
    state.termLayoutMode = '';
    state.lastTerminalHostWidth = 0;
    state.terminalAutoFollow = true;
    state.keyboardHandlerSetup = false;

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

  function isTerminalHostStable(host) {
    if (!host || !host.isConnected) return false;
    const rect = host.getBoundingClientRect();
    return rect.width >= 180 && rect.height >= 140;
  }

  function waitForTerminalHostStable(host, token, callback) {
    let previousWidth = 0;
    let previousHeight = 0;
    let stableFrames = 0;
    let attemptsRemaining = 18;

    function check() {
      if (state.terminalInitToken !== token) return;
      if (!host || !host.isConnected) return;

      const rect = host.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      const visible = width >= 180 && height >= 140;

      if (visible) {
        stableFrames = width === previousWidth && height === previousHeight ? stableFrames + 1 : 1;
        if (stableFrames >= 2) {
          callback();
          return;
        }
      } else {
        stableFrames = 0;
      }

      previousWidth = width;
      previousHeight = height;
      attemptsRemaining -= 1;

      if (attemptsRemaining <= 0) {
        callback();
        return;
      }

      requestAnimationFrame(check);
    }

    requestAnimationFrame(check);
  }

  function observeTerminalHost(host) {
    disconnectTerminalHostObserver();
    if (!host || typeof ResizeObserver === 'undefined') return;
    state.lastTerminalHostWidth = Math.round(host.getBoundingClientRect().width || 0);

    state.terminalHostObserver = new ResizeObserver(function (entries) {
      if (!entries || !entries.length) return;
      const rect = entries[0].contentRect;
      if (!rect || rect.width < 1 || rect.height < 1) return;
      const nextWidth = Math.round(rect.width);
      const widthChanged = Math.abs(nextWidth - (state.lastTerminalHostWidth || 0)) >= TERMINAL_MOBILE_WIDTH_CHANGE_THRESHOLD_PX;
      state.lastTerminalHostWidth = nextWidth;

      if (isMobileLayout() && !widthChanged) {
        return;
      }

      scheduleFit();
    });
    state.terminalHostObserver.observe(host);
  }

  function finalizeTerminalMount(onReady) {
    clearTerminalReadyTimer();

    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      doFit();
      if (typeof onReady === 'function') {
        onReady();
      }
    }

    doFit();
    requestAnimationFrame(doFit);
    setTimeout(doFit, 50);
    setTimeout(doFit, 150);
    setTimeout(doFit, 300);

    if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
      document.fonts.ready
        .then(function () {
          requestAnimationFrame(finish);
        })
        .catch(function () {
          finish();
        });
      state.terminalReadyTimer = setTimeout(finish, 220);
      return;
    }

    state.terminalReadyTimer = setTimeout(finish, 120);
  }

  function appendPlainOutput(raw) {
    const session = getActiveSession();
    if (!session) return;

    const previous = state.plainBufferBySession[session.id] || '';
    const nextValue = trimPlainBuffer(previous + normalizePlainOutput(raw));
    state.plainBufferBySession[session.id] = nextValue;
    setPlainTerminalContent(nextValue);
  }

  function doFit() {
    if (state.terminalMode !== 'xterm' || !state.term || !state.fitAddon) return;
    if (!isTerminalViewMounted()) return;
    const host = getTerminalHost();
    if (!isTerminalHostStable(host)) return;
    const shouldFollow = state.terminalAutoFollow || isTerminalPinnedToBottom();
    try {
      state.fitAddon.fit();
    } catch (_error) {
      return;
    }
    if (shouldFollow) {
      scrollTerminalToBottom();
    } else {
      syncTerminalAutoFollow();
    }
    const activeSession = getActiveSession();
    if (activeSession && state.socket && state.connected) {
      state.socket.emit('session:resize', {
        sessionId: activeSession.id,
        cols: state.term.cols,
        rows: state.term.rows
      });
    }
  }

  function initTerminal(forceRecreate, onReady) {
    const layoutMode = isMobileLayout() ? 'mobile' : 'desktop';
    const host = getTerminalHost();

    if (!host) {
      setInlineNotice('终端容器不可用。', 'error');
      return;
    }

    if (!forceRecreate && state.termLayoutMode === layoutMode) {
      if (state.terminalMode === 'xterm' && state.term) {
        finalizeTerminalMount(onReady);
        return;
      }
      if (state.terminalMode === 'plain') {
        finalizeTerminalMount(onReady);
        return;
      }
    }

    const initToken = (state.terminalInitToken || 0) + 1;
    state.terminalInitToken = initToken;

    function continueInit() {
      if (state.terminalInitToken !== initToken) return;

      destroyTerminal();

      if (!window.Terminal || !window.FitAddon || !window.FitAddon.FitAddon) {
        createPlainTerminal(host, 'xterm 资源加载失败，已切换到纯文本兼容模式。');
        const activeSession = getActiveSession();
        if (activeSession) {
          setPlainTerminalContent(state.plainBufferBySession[activeSession.id] || '');
        }
        finalizeTerminalMount(onReady);
        return;
      }

      const isMobile = isMobileLayout();
      const fontSize = isMobile ? 11 : 13;

      state.term = new window.Terminal({
        cursorBlink: true,
        disableStdin: true,
        convertEol: true,
        scrollback: 4000,
        fontSize: fontSize,
        fontFamily: getThemeVariable('--font-mono', 'Consolas, "Cascadia Code", "Courier New", monospace'),
        theme: getTerminalTheme(),
        allowProposedApi: true
      });

      state.fitAddon = new window.FitAddon.FitAddon();
      state.term.loadAddon(state.fitAddon);
      state.termLayoutMode = layoutMode;
      state.terminalMode = 'xterm';
      state.terminalAutoFollow = true;
      outputCount = 0;
      state.term.open(host);
      if (typeof state.term.onScroll === 'function') {
        state.term.onScroll(function () {
          syncTerminalAutoFollow();
        });
      }
      observeTerminalHost(host);
      applyTerminalTheme();
      enableXtermTouchScroll(state.term);
      setupMobileKeyboardHandler();

      finalizeTerminalMount(onReady);
    }

    if (!isTerminalHostStable(host)) {
      waitForTerminalHostStable(host, initToken, continueInit);
      return;
    }

    continueInit();
  }

  function ensureTerminal(forceRecreate, onReady) {
    const shouldMount = !isMobileLayout() || state.currentView === 'terminal';
    if (!shouldMount) {
      state.terminalInitToken = (state.terminalInitToken || 0) + 1;
      destroyTerminal();
      return false;
    }

    initTerminal(forceRecreate, onReady);
    return true;
  }

  function fitTerminalAndResizeRemote() {
    if (state.terminalMode !== 'xterm' || !state.term || !state.fitAddon) return;
    if (!isTerminalViewMounted()) return;

    const host = getTerminalHost();
    if (!isTerminalHostStable(host)) return;

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
    state.terminalAutoFollow = true;
    outputCount = 0;

    if (state.terminalMode === 'xterm' && state.term) {
      state.term.reset();
      scrollTerminalToBottom();
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

    state.terminalAutoFollow = true;

    if (state.terminalMode === 'xterm' && state.term) {
      state.term.reset();
      scrollTerminalToBottom();
      return;
    }

    if (state.terminalMode === 'plain') {
      setPlainTerminalContent('');
    }
  }

  let fitPending = false;
  let outputCount = 0;

  function scheduleFit() {
    if (fitPending) return;
    fitPending = true;
    requestAnimationFrame(function () {
      fitPending = false;
      doFit();
    });
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
      const shouldFollow = state.terminalAutoFollow || isTerminalPinnedToBottom();
      state.term.write(raw, function () {
        if (shouldFollow) {
          scrollTerminalToBottom();
        } else {
          syncTerminalAutoFollow();
        }
      });
      return;
    }

    appendPlainOutput(raw);
  }

  function refreshTerminal() {
    doFit();
    setTimeout(doFit, 100);
  }
`
