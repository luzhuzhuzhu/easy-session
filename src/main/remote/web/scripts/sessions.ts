export const sessionsScript = `
  const HISTORY_LINES = 200;
  const LIST_AUTO_REFRESH_INTERVAL_MS = 15000;
  const RESIZE_DEBOUNCE_MS = 140;
  const MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)';

  const state = {
    sessions: [],
    activeSessionId: '',
    socket: null,
    connected: false,
    baseUrl: '',
    token: '',
    passthroughOnly: true,
    capabilities: {
      sessionStart: false,
      sessionPause: false,
      sessionRestart: false,
      sessionDestroy: false
    },
    controlBusyAction: '',
    lastSocketError: '',
    idleTimeoutPending: false,
    socketReconnectInFlight: false,
    currentView: 'sessions',
    refreshTimerId: null,
    term: null,
    fitAddon: null,
    terminalMode: 'uninitialized',
    termLayoutMode: '',
    resizeTimer: null,
    plainTerminalEl: null,
    plainBufferBySession: {},
    lastSeqBySession: {}
  };

  const dom = {};
  const TERMINAL_KEY_SEQUENCES = {
    enter: '\\r',
    tab: '\\t',
    escape: '\\u001b',
    backspace: '\\u007f',
    delete: '\\u001b[3~',
    'arrow-up': '\\u001b[A',
    'arrow-down': '\\u001b[B',
    'arrow-right': '\\u001b[C',
    'arrow-left': '\\u001b[D',
    home: '\\u001b[H',
    end: '\\u001b[F',
    'ctrl-c': '\\u0003',
    'ctrl-d': '\\u0004',
    'ctrl-l': '\\u000c',
    'ctrl-u': '\\u0015',
    'ctrl-z': '\\u001a'
  };

  function getCurrentPageBaseUrl() {
    try {
      return new URL('.', location.href).toString().replace(/\\/$/, '');
    } catch (_error) {
      return location.origin;
    }
  }

  function bootstrapRemoteWeb(config) {
    if (!config || !config.auth || !config.auth.token) {
      location.href = 'login';
      return;
    }

    state.baseUrl = normalizeBaseUrl(config.auth.baseUrl || config.defaultBaseUrl || getCurrentPageBaseUrl());
    state.token = config.auth.token;
    state.passthroughOnly = !!config.passthroughOnly;
    state.capabilities = {
      sessionStart: !state.passthroughOnly,
      sessionPause: !state.passthroughOnly,
      sessionRestart: !state.passthroughOnly,
      sessionDestroy: !state.passthroughOnly
    };

    cacheDom();
    applyBaseUrl(state.baseUrl);
    updateModeUi();
    bindUi();
    syncResponsiveLayout(true);

    if (state.refreshTimerId) clearInterval(state.refreshTimerId);
    state.refreshTimerId = setInterval(function () {
      if (document.hidden) return;
      void safeAction('刷新', refreshData);
    }, LIST_AUTO_REFRESH_INTERVAL_MS);

    void initializeRemoteWeb(config.defaultBaseUrl);
  }

  function cacheDom() {
    dom.baseUrlLabel = document.getElementById('baseUrlLabel');
    dom.modeLabel = document.getElementById('modeLabel');
    dom.modeHint = document.getElementById('modeHint');
    dom.socketDot = document.getElementById('socketDot');
    dom.socketText = document.getElementById('socketText');
    dom.globalNotice = document.getElementById('globalNotice');
    dom.inlineNotice = document.getElementById('inlineNotice');
    dom.refreshBtn = document.getElementById('refreshBtn');
    dom.mobileRefreshBtn = document.getElementById('mobileRefreshBtn');
    dom.logoutBtn = document.getElementById('logoutBtn');
    dom.mobileLogoutBtn = document.getElementById('mobileLogoutBtn');
    dom.desktopSearchInput = document.getElementById('desktopSearchInput');
    dom.mobileSearchInput = document.getElementById('mobileSearchInput');
    dom.desktopSessionList = document.getElementById('desktopSessionList');
    dom.mobileSessionList = document.getElementById('mobileSessionList');
    dom.activeSessionTitle = document.getElementById('activeSessionTitle');
    dom.activeSessionMeta = document.getElementById('activeSessionMeta');
    dom.mobileSessionTitle = document.getElementById('mobileSessionTitle');
    dom.mobileSessionMeta = document.getElementById('mobileSessionMeta');
    dom.terminalActions = document.getElementById('terminalActions');
    dom.mobileSessionActions = document.getElementById('mobileSessionActions');
    dom.desktopInputBox = document.getElementById('desktopInputBox');
    dom.mobileInputBox = document.getElementById('mobileInputBox');
    dom.desktopSendBtn = document.getElementById('desktopSendBtn');
    dom.mobileSendBtn = document.getElementById('mobileSendBtn');
    dom.backBtn = document.getElementById('backBtn');
  }

  async function initializeRemoteWeb(defaultBaseUrl) {
    try {
      await resolveWorkingBaseUrl(defaultBaseUrl);
      await loadRemoteCapabilities();
      connectSocket();
      await refreshData();
      scheduleTerminalResize();
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      state.lastSocketError = message;
      setSocketUi(false, '初始化失败');
      setGlobalNotice('初始化失败：' + message, 'error');
      setInlineNotice('页面初始化未完成，请先排查顶部错误提示。', 'error');
    }
  }

  function bindUi() {
    dom.refreshBtn.addEventListener('click', function () {
      void safeAction('刷新', async function () {
        await refreshData();
        setInlineNotice('会话列表已刷新。', 'ok');
      });
    });

    dom.mobileRefreshBtn.addEventListener('click', function () {
      void safeAction('刷新', async function () {
        await refreshData();
        setInlineNotice('会话列表已刷新。', 'ok');
      });
    });

    dom.desktopSearchInput.addEventListener('input', handleSearchInput);
    dom.mobileSearchInput.addEventListener('input', handleSearchInput);
    dom.logoutBtn.addEventListener('click', handleLogout);
    dom.mobileLogoutBtn.addEventListener('click', handleLogout);
    dom.backBtn.addEventListener('click', function () {
      switchToView('sessions');
    });

    bindInputEvents(dom.desktopInputBox, dom.desktopSendBtn);
    bindInputEvents(dom.mobileInputBox, dom.mobileSendBtn);
    bindTerminalKeyButtons();

    window.addEventListener('resize', function () {
      syncResponsiveLayout(true);
      scheduleTerminalResize();
    });

    if (window.matchMedia) {
      const media = window.matchMedia(MOBILE_BREAKPOINT_QUERY);
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', function () {
          syncResponsiveLayout(true);
        });
      } else if (typeof media.addListener === 'function') {
        media.addListener(function () {
          syncResponsiveLayout(true);
        });
      }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) return;
      void safeAction('刷新', refreshData);
    });

    document.addEventListener('easy:theme-change', function () {
      applyTerminalTheme();
      scheduleTerminalResize();
    });
  }

  function bindInputEvents(inputEl, buttonEl) {
    if (!inputEl || !buttonEl) return;

    buttonEl.addEventListener('click', function () {
      emitTerminalInput(TERMINAL_KEY_SEQUENCES.enter, { silent: true });
      inputEl.focus();
    });

    inputEl.addEventListener('beforeinput', function (event) {
      handleLiveInputBeforeInput(event, inputEl);
    });

    inputEl.addEventListener('keydown', function (event) {
      handleLiveInputKeydown(event, inputEl);
    });

    inputEl.addEventListener('paste', function (event) {
      handleLiveInputPaste(event, inputEl);
    });

    inputEl.addEventListener('input', function () {
      if (inputEl.value) {
        inputEl.value = '';
      }
    });
  }

  function bindTerminalKeyButtons() {
    document.querySelectorAll('[data-terminal-key]').forEach(function (button) {
      if (button.dataset.bound === '1') return;
      button.dataset.bound = '1';
      button.addEventListener('click', function () {
        const keyId = button.dataset.terminalKey || '';
        const payload = TERMINAL_KEY_SEQUENCES[keyId] || '';
        if (!payload) return;
        emitTerminalInput(payload, { silent: true });
        getPreferredInput().focus();
      });
    });
  }

  function getPreferredInput() {
    return isMobileLayout() ? dom.mobileInputBox : dom.desktopInputBox;
  }

  function handleLiveInputBeforeInput(event, inputEl) {
    if (!event || event.isComposing || event.defaultPrevented) return;

    const inputType = event.inputType || '';
    let payload = '';

    if (
      inputType === 'insertText' ||
      inputType === 'insertCompositionText' ||
      inputType === 'insertFromComposition' ||
      inputType === 'insertReplacementText'
    ) {
      payload = event.data || '';
    } else if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
      payload = TERMINAL_KEY_SEQUENCES.enter;
    } else if (inputType === 'deleteContentBackward') {
      payload = TERMINAL_KEY_SEQUENCES.backspace;
    } else if (inputType === 'deleteContentForward') {
      payload = TERMINAL_KEY_SEQUENCES.delete;
    } else {
      return;
    }

    if (!payload) return;
    event.preventDefault();
    inputEl.value = '';
    emitTerminalInput(payload, { silent: true });
  }

  function handleLiveInputKeydown(event, inputEl) {
    if (!event || event.isComposing) return;

    let keyId = '';

    if (event.ctrlKey && !event.altKey && !event.metaKey) {
      const normalizedKey = String(event.key || '').toLowerCase();
      if (normalizedKey === 'c') keyId = 'ctrl-c';
      else if (normalizedKey === 'd') keyId = 'ctrl-d';
      else if (normalizedKey === 'l') keyId = 'ctrl-l';
      else if (normalizedKey === 'u') keyId = 'ctrl-u';
      else if (normalizedKey === 'z') keyId = 'ctrl-z';
    } else if (!event.altKey && !event.metaKey) {
      if (event.key === 'Enter') keyId = 'enter';
      else if (event.key === 'Tab') keyId = 'tab';
      else if (event.key === 'Escape') keyId = 'escape';
      else if (event.key === 'Backspace') keyId = 'backspace';
      else if (event.key === 'Delete') keyId = 'delete';
      else if (event.key === 'ArrowUp') keyId = 'arrow-up';
      else if (event.key === 'ArrowDown') keyId = 'arrow-down';
      else if (event.key === 'ArrowLeft') keyId = 'arrow-left';
      else if (event.key === 'ArrowRight') keyId = 'arrow-right';
      else if (event.key === 'Home') keyId = 'home';
      else if (event.key === 'End') keyId = 'end';
    }

    if (!keyId) return;
    event.preventDefault();
    inputEl.value = '';
    emitTerminalInput(TERMINAL_KEY_SEQUENCES[keyId], { silent: true });
  }

  function handleLiveInputPaste(event, inputEl) {
    if (!event || !event.clipboardData) return;
    const text = event.clipboardData.getData('text');
    if (!text) return;
    event.preventDefault();
    inputEl.value = '';
    emitTerminalInput(text, { silent: true });
  }

  function handleLogout() {
    clearAuth();
    location.href = 'login';
  }

  function normalizeBaseUrl(baseUrl) {
    return normalizeRemoteBaseUrl(baseUrl);
  }

  function applyBaseUrl(baseUrl) {
    state.baseUrl = normalizeBaseUrl(baseUrl);
    if (dom.baseUrlLabel) {
      dom.baseUrlLabel.textContent = state.baseUrl ? '当前地址：' + state.baseUrl : '';
    }
  }

  function updateModeUi() {
    const label = state.passthroughOnly ? '仅透传模式' : '允许远程控制';
    const hint = state.passthroughOnly
      ? '浏览器页只保留必要的查看和输入能力。'
      : '浏览器页可执行启动、暂停、重启和删除。';

    if (dom.modeLabel) dom.modeLabel.textContent = label;
    if (dom.modeHint) dom.modeHint.textContent = hint;
  }

  function setSocketUi(connected, detail) {
    state.connected = connected;
    dom.socketText.textContent = connected
      ? '实时通道在线'
      : detail
        ? '实时通道离线：' + detail
        : '实时通道离线';

    dom.socketDot.classList.remove('ok', 'err');
    dom.socketDot.classList.add(connected ? 'ok' : 'err');
    updateInputAvailability();
  }

  function setGlobalNotice(message, tone) {
    dom.globalNotice.hidden = !message;
    dom.globalNotice.dataset.tone = tone || '';
    dom.globalNotice.textContent = message || '';
  }

  function clearGlobalNotice() {
    setGlobalNotice('', '');
  }

  function setInlineNotice(message, tone) {
    dom.inlineNotice.hidden = !message;
    dom.inlineNotice.dataset.tone = tone || '';
    dom.inlineNotice.textContent = message || '';
  }

  function isMobileLayout() {
    if (window.matchMedia) return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
    return window.innerWidth <= 900;
  }

  function switchToView(nextView) {
    state.currentView = nextView === 'terminal' ? 'terminal' : 'sessions';
    document.body.classList.remove('view-sessions', 'view-terminal');
    document.body.classList.add('view-' + state.currentView);

    if (state.currentView === 'terminal') {
      ensureTerminal(true);
      scheduleTerminalResize();
    }
  }

  function syncResponsiveLayout(forceRecreate) {
    if (isMobileLayout()) {
      if (state.currentView !== 'terminal' || !state.activeSessionId) {
        switchToView('sessions');
      } else {
        switchToView('terminal');
      }
      return;
    }

    document.body.classList.remove('view-sessions', 'view-terminal');
    ensureTerminal(forceRecreate);
    scheduleTerminalResize();
  }

  function getSearchKeyword() {
    return (dom.desktopSearchInput.value || dom.mobileSearchInput.value || '').trim().toLowerCase();
  }

  function syncSearchInputs(value) {
    dom.desktopSearchInput.value = value;
    dom.mobileSearchInput.value = value;
  }

  function handleSearchInput(event) {
    const value = event && event.target ? event.target.value : '';
    syncSearchInputs(value);
    renderSessions();
  }

  function getActiveSession() {
    return state.sessions.find(function (session) {
      return session.id === state.activeSessionId;
    }) || null;
  }

  function canWriteToSession(session) {
    return !!session && session.status === 'running' && !!session.processId;
  }

  function updateActiveSessionView() {
    const session = getActiveSession();
    if (!session) {
      dom.activeSessionTitle.textContent = '未选择会话';
      dom.activeSessionMeta.textContent = '';
      dom.mobileSessionTitle.textContent = '未选择会话';
      dom.mobileSessionMeta.textContent = '';
      clearSessionActionButtons();
      updateInputAvailability();
      return;
    }

    const metaText = [session.type, session.status, session.projectPath].filter(Boolean).join(' · ');
    dom.activeSessionTitle.textContent = session.name || session.id;
    dom.activeSessionMeta.textContent = metaText;
    dom.mobileSessionTitle.textContent = session.name || session.id;
    dom.mobileSessionMeta.textContent = metaText;
    renderSessionActionButtons();
    updateInputAvailability();
  }

  function updateInputAvailability() {
    const session = getActiveSession();
    const enabled = canWriteToSession(session) && state.connected;
    const placeholder = !session
      ? '请先选择会话'
      : !state.connected
        ? '实时通道未连接，暂时不能发送。'
        : !canWriteToSession(session)
          ? '当前会话未运行，暂时不能输入。'
          : '实时输入：键入即发送，回车执行';

    dom.desktopInputBox.disabled = !enabled;
    dom.mobileInputBox.disabled = !enabled;
    dom.desktopSendBtn.disabled = !enabled;
    dom.mobileSendBtn.disabled = !enabled;
    document.querySelectorAll('[data-terminal-key]').forEach(function (button) {
      button.disabled = !enabled;
    });
    dom.desktopInputBox.placeholder = placeholder;
    dom.mobileInputBox.placeholder = placeholder;
  }

  function clearSessionActionButtons() {
    dom.terminalActions.textContent = '';
    dom.mobileSessionActions.textContent = '';
  }

  function appendActionButton(target, label, action, tone) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'session-action-btn' + (tone ? ' ' + tone : '');
    button.textContent = label;
    button.disabled = state.controlBusyAction === action;
    button.addEventListener('click', function () {
      void handleSessionControl(action);
    });
    target.appendChild(button);
  }

  function renderSessionActionButtons() {
    const session = getActiveSession();
    clearSessionActionButtons();
    if (!session) return;

    [dom.terminalActions, dom.mobileSessionActions].forEach(function (target) {
      if (state.capabilities.sessionStart && session.status !== 'running') {
        appendActionButton(target, '启动', 'start', '');
      }
      if (state.capabilities.sessionPause && session.status === 'running') {
        appendActionButton(target, '暂停', 'pause', 'warn');
      }
      if (state.capabilities.sessionRestart) {
        appendActionButton(target, '重启', 'restart', '');
      }
      if (state.capabilities.sessionDestroy) {
        appendActionButton(target, '删除', 'destroy', 'danger');
      }
    });
  }

  function createSessionBadge(status) {
    const badge = document.createElement('span');
    badge.className =
      'badge ' +
      (status === 'running' ? 'badge-success' : status === 'error' ? 'badge-danger' : 'badge-warning');
    badge.textContent = status || 'unknown';
    return badge;
  }

  function renderSessionList(target, list) {
    target.textContent = '';

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'session-empty';
      empty.textContent = '当前没有可用会话。';
      target.appendChild(empty);
      return;
    }

    list.forEach(function (session) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'session-item' + (session.id === state.activeSessionId ? ' active' : '');

      const head = document.createElement('div');
      head.className = 'session-item-head';

      const textWrap = document.createElement('div');
      const nameEl = document.createElement('div');
      nameEl.className = 'session-item-name';
      nameEl.textContent = session.name || session.id;

      const metaEl = document.createElement('div');
      metaEl.className = 'session-item-meta';
      metaEl.textContent = [session.type, session.status].filter(Boolean).join(' · ');

      textWrap.appendChild(nameEl);
      textWrap.appendChild(metaEl);

      if (session.projectPath) {
        const pathEl = document.createElement('div');
        pathEl.className = 'session-item-path';
        pathEl.textContent = session.projectPath;
        textWrap.appendChild(pathEl);
      }

      head.appendChild(textWrap);
      head.appendChild(createSessionBadge(session.status));
      item.appendChild(head);
      item.addEventListener('click', function () {
        selectSession(session.id);
      });
      target.appendChild(item);
    });
  }

  function renderSessions() {
    const keyword = getSearchKeyword();
    const filtered = state.sessions.filter(function (session) {
      if (!keyword) return true;
      const haystack = [
        session.name,
        session.id,
        session.type,
        session.status,
        session.projectPath
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });

    renderSessionList(dom.desktopSessionList, filtered);
    renderSessionList(dom.mobileSessionList, filtered);
    updateActiveSessionView();
  }

  async function handleSessionControl(action) {
    const session = getActiveSession();
    if (!session) {
      setInlineNotice('请先选择会话。', 'error');
      return;
    }

    if (state.controlBusyAction) return;
    if (action === 'destroy' && !window.confirm('确定要删除当前会话吗？')) return;

    state.controlBusyAction = action;
    renderSessionActionButtons();

    try {
      if (action === 'destroy' && state.socket) {
        state.socket.emit('session:unsubscribe', { sessionId: session.id });
      }

      if (action === 'start') {
        await api('/api/sessions/' + session.id + '/start', { method: 'POST' });
      } else if (action === 'pause') {
        await api('/api/sessions/' + session.id + '/pause', { method: 'POST' });
      } else if (action === 'restart') {
        await api('/api/sessions/' + session.id + '/restart', { method: 'POST' });
      } else if (action === 'destroy') {
        await api('/api/sessions/' + session.id, { method: 'DELETE' });
        clearActiveTerminalOutput();
      }

      await refreshData();
      setInlineNotice(
        action === 'destroy'
          ? '会话已删除。'
          : action === 'pause'
            ? '会话已暂停。'
            : action === 'restart'
              ? '会话已重启。'
              : '会话已启动。',
        'ok'
      );
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setInlineNotice('操作失败：' + message, 'error');
    } finally {
      state.controlBusyAction = '';
      renderSessionActionButtons();
    }
  }

  function selectSession(sessionId) {
    const previousSessionId = state.activeSessionId;
    const isSameSession = previousSessionId === sessionId;

    if (!isSameSession) {
      state.activeSessionId = sessionId;
      resetTerminal(sessionId);
      renderSessions();
      setInlineNotice('', '');
    }

    if (previousSessionId && previousSessionId !== sessionId && state.socket) {
      state.socket.emit('session:unsubscribe', { sessionId: previousSessionId });
    }

    if (isMobileLayout()) {
      switchToView('terminal');
    } else {
      ensureTerminal(true);
    }

    if (state.socket && state.connected) {
      state.socket.emit('session:subscribe', { sessionId: sessionId, historyLines: HISTORY_LINES }, function (ack) {
        if (ack && ack.ok === false) {
          setInlineNotice('订阅会话失败：' + (ack.message || 'unknown'), 'error');
        }
      });
    }

    scheduleTerminalResize();
  }

  async function refreshData() {
    const sessions = await api('/api/sessions');
    let nextSessions = Array.isArray(sessions) ? sessions.slice() : [];

    if (state.passthroughOnly) {
      nextSessions = nextSessions.filter(function (session) {
        return session && session.status === 'running' && !!session.processId;
      });
    }

    nextSessions.sort(function (left, right) {
      return (right.lastActiveAt || right.createdAt || 0) - (left.lastActiveAt || left.createdAt || 0);
    });

    state.sessions = nextSessions;

    if (state.activeSessionId && !state.sessions.some(function (session) { return session.id === state.activeSessionId; })) {
      state.activeSessionId = '';
      clearActiveTerminalOutput();
    }

    renderSessions();

    if (!state.activeSessionId && state.sessions.length > 0) {
      selectSession(state.sessions[0].id);
    }
  }

  function buildBaseUrlCandidates(preferredBaseUrl) {
    const candidates = [preferredBaseUrl, state.baseUrl, getCurrentPageBaseUrl()]
      .map(normalizeBaseUrl)
      .filter(Boolean);

    return candidates.filter(function (value, index) {
      return candidates.indexOf(value) === index;
    });
  }

  async function probeBaseUrl(candidate) {
    const target = normalizeBaseUrl(candidate);
    if (!target) return { ok: false, baseUrl: target, reason: 'empty base url' };

    try {
      const response = await fetch(target + '/api/health', {
        headers: { Authorization: 'Bearer ' + state.token }
      });
      const body = await response.json().catch(function () { return {}; });

      if (!response.ok) {
        return {
          ok: false,
          baseUrl: target,
          reason: body && body.message ? body.message : 'HTTP ' + response.status
        };
      }

      return { ok: true, baseUrl: target };
    } catch (error) {
      return {
        ok: false,
        baseUrl: target,
        reason: error && error.message ? error.message : String(error)
      };
    }
  }

  async function resolveWorkingBaseUrl(preferredBaseUrl) {
    const candidates = buildBaseUrlCandidates(preferredBaseUrl);
    let lastError = '没有候选地址';

    for (const candidate of candidates) {
      const result = await probeBaseUrl(candidate);
      if (result.ok) {
        applyBaseUrl(result.baseUrl);
        return;
      }

      lastError = result.baseUrl + ': ' + result.reason;
    }

    throw new Error('无法连接远程服务，请检查地址和 token：' + lastError);
  }

  async function api(path, init) {
    const response = await fetch(state.baseUrl + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + state.token,
        ...(init && init.headers ? init.headers : {})
      }
    });

    const body = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(body && body.message ? body.message : 'Request failed: ' + response.status);
    }

    return body.data;
  }

  async function loadRemoteCapabilities() {
    try {
      const remoteCapabilities = await api('/api/capabilities');
      if (remoteCapabilities && remoteCapabilities.capabilities) {
        state.capabilities = {
          sessionStart: !!remoteCapabilities.capabilities.sessionStart,
          sessionPause: !!remoteCapabilities.capabilities.sessionPause,
          sessionRestart: !!remoteCapabilities.capabilities.sessionRestart,
          sessionDestroy: !!remoteCapabilities.capabilities.sessionDestroy
        };
      }
    } catch (_error) {
      // 保持初始化时的默认能力映射
    }

    updateModeUi();
  }

  function connectSocket() {
    if (state.socket) {
      state.socket.removeAllListeners();
      state.socket.disconnect();
    }

    const socket = io(state.baseUrl, {
      transports: ['polling', 'websocket'],
      tryAllTransports: true,
      auth: { token: state.token },
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 6000
    });

    state.socket = socket;

    socket.on('connect', function () {
      state.idleTimeoutPending = false;
      state.lastSocketError = '';
      state.socketReconnectInFlight = false;
      setSocketUi(true, 'connected');
      clearGlobalNotice();
      setInlineNotice('实时通道已连接。', 'ok');

      const activeSession = getActiveSession();
      if (activeSession) {
        ensureTerminal(true);
        resetTerminal(activeSession.id);
        socket.emit('session:subscribe', { sessionId: activeSession.id, historyLines: HISTORY_LINES });
        scheduleTerminalResize();
      }
    });

    socket.on('system:idle-timeout', function (event) {
      state.idleTimeoutPending = true;
      const message = event && event.message ? event.message : '连接因空闲被服务端断开';
      setSocketUi(false, 'idle-timeout');
      setGlobalNotice(message + '，正在尝试重连…', 'warning');
    });

    socket.on('disconnect', function (reason) {
      const isServerDisconnect = reason === 'io server disconnect';
      const detail = state.lastSocketError ? 'disconnected (' + state.lastSocketError + ')' : 'disconnected';

      if (state.idleTimeoutPending) {
        setSocketUi(false, 'idle-timeout');
        setGlobalNotice('连接因空闲被断开，正在重新连接…', 'warning');
      } else {
        setSocketUi(false, detail);
        setGlobalNotice('实时通道已断开，正在重连…', 'error');
      }

      if (isServerDisconnect) {
        setTimeout(function () {
          state.idleTimeoutPending = false;
          socket.connect();
        }, 600);
        return;
      }

      state.idleTimeoutPending = false;
    });

    socket.on('connect_error', function (error) {
      const message = error && error.message ? error.message : 'unknown';
      state.lastSocketError = message;
      setSocketUi(false, 'error: ' + message);
      setGlobalNotice('连接失败：' + message, 'error');

      const shouldRetryAlternateBase =
        !state.socketReconnectInFlight &&
        !/unauthorized|invalid|token|forbidden/i.test(String(message));

      if (shouldRetryAlternateBase) {
        state.socketReconnectInFlight = true;
        const currentBaseUrl = state.baseUrl;

        void resolveWorkingBaseUrl(getCurrentPageBaseUrl())
          .then(function () {
            if (state.baseUrl === currentBaseUrl) return;
            setGlobalNotice('正在切换到可用地址并重新连接…', 'warning');
            connectSocket();
          })
          .catch(function () {
            // 这里交给 socket.io 自己继续重试
          })
          .finally(function () {
            state.socketReconnectInFlight = false;
          });
      }
    });

    socket.on('session:output', writeOutput);

    socket.on('session:status', function (event) {
      const target = state.sessions.find(function (session) {
        return session.id === event.sessionId;
      });

      if (target) target.status = event.status;
      renderSessions();
    });
  }

  function emitTerminalInput(raw, options) {
    const session = getActiveSession();
    if (!session) {
      if (!options || !options.silent) {
        setInlineNotice('请先选择会话。', 'error');
      }
      updateInputAvailability();
      return false;
    }

    if (!canWriteToSession(session)) {
      if (!options || !options.silent) {
        setInlineNotice('当前会话未运行，暂时不能输入。', 'error');
      }
      updateInputAvailability();
      return false;
    }

    if (!state.socket || !state.connected) {
      if (!options || !options.silent) {
        setGlobalNotice('实时通道未连接，暂时无法发送输入。', 'error');
      }
      updateInputAvailability();
      return false;
    }

    if (!raw) return false;

    state.socket.emit('session:write', {
      sessionId: session.id,
      data: raw
    });

    if (!options || !options.silent) {
      clearGlobalNotice();
      setInlineNotice(options.notice || '输入已发送。', 'ok');
    }

    return true;
  }

  async function safeAction(label, task) {
    try {
      await task();
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      setInlineNotice(label + '失败：' + message, 'error');
    }
  }
`
