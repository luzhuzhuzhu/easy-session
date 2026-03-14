export const sessionsScript = `
  const HISTORY_LINES = 200;
  const LIST_AUTO_REFRESH_INTERVAL_MS = 15000;
  const RESIZE_DEBOUNCE_MS = 140;
  const MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)';
  const MOBILE_WIDTH_CHANGE_THRESHOLD_PX = 4;

  const state = {
    sessions: [],
    projects: [],
    activeSessionId: '',
    viewportMode: '',
    lastViewportWidth: 0,
    socket: null,
    connected: false,
    baseUrl: '',
    token: '',
    passthroughOnly: true,
    capabilities: {
      projectsList: true,
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
    terminalReadyTimer: null,
    terminalInitToken: 0,
    terminalHostObserver: null,
    lastTerminalHostWidth: 0,
    terminalAutoFollow: true,
    plainTerminalEl: null,
    plainBufferBySession: {},
    lastSeqBySession: {},
    inputDraftBySession: {},
    projectTreeExpanded: {},
    subscribedSessionId: '',
    subscribingSessionId: '',
    keyboardHandlerSetup: false
  };

  const dom = {};
  const TERMINAL_KEY_SEQUENCES = {
    enter: '\\r',
    escape: '\\u001b',
    backspace: '\\u007f',
    'arrow-up': '\\u001b[A',
    'arrow-down': '\\u001b[B',
    'arrow-right': '\\u001b[C',
    'arrow-left': '\\u001b[D',
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
    state.viewportMode = isMobileLayout() ? 'mobile' : 'desktop';
    state.lastViewportWidth = getViewportWidth();
    state.passthroughOnly = !!config.passthroughOnly;
    state.capabilities = {
      projectsList: true,
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
    dom.mobileSocketDot = document.getElementById('mobileSocketDot');
    dom.mobileSocketText = document.getElementById('mobileSocketText');
    dom.settingsSocketText = document.getElementById('settingsSocketText');
    dom.mobileModeLabel = document.getElementById('mobileModeLabel');
    dom.mobileModeHint = document.getElementById('mobileModeHint');
    dom.settingsBaseUrl = document.getElementById('settingsBaseUrl');
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

    document.querySelectorAll('[data-nav]').forEach(function (navBtn) {
      navBtn.addEventListener('click', function () {
        const view = navBtn.dataset.nav;
        if (view === 'sessions' || view === 'terminal' || view === 'settings') {
          switchToView(view);
          updateMobileNavActive(view);
        }
      });
    });

    bindInputEvents(dom.desktopInputBox, dom.desktopSendBtn);
    bindInputEvents(dom.mobileInputBox, dom.mobileSendBtn);
    bindTerminalKeyButtons();

    window.addEventListener('resize', function () {
      const nextViewportMode = getViewportMode();
      if (nextViewportMode !== state.viewportMode) {
        syncResponsiveLayout(true);
        return;
      }

      const nextViewportWidth = getViewportWidth();
      const widthChanged = Math.abs(nextViewportWidth - (state.lastViewportWidth || 0)) >= MOBILE_WIDTH_CHANGE_THRESHOLD_PX;
      state.lastViewportWidth = nextViewportWidth;

      if (nextViewportMode === 'mobile' && !widthChanged) {
        return;
      }

      if (state.currentView === 'terminal' || nextViewportMode === 'desktop') {
        scheduleTerminalResize();
      }
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

    var isMobileInput = inputEl === dom.mobileInputBox;
    var isComposing = false;

    buttonEl.addEventListener('click', function () {
      emitTerminalInput(TERMINAL_KEY_SEQUENCES.enter, { silent: true });
      inputEl.value = '';
      setActiveInputDraft('');
      if (!isMobileInput) {
        inputEl.focus();
      }
    });

    inputEl.addEventListener('compositionstart', function () {
      isComposing = true;
    });

    inputEl.addEventListener('compositionend', function (event) {
      isComposing = false;
      if (isMobileInput) {
        syncActiveInputDraft();
        return;
      }
      var text = event.data || '';
      if (text) {
        emitTerminalInput(text, { silent: true });
        appendActiveInputDraft(text);
      }
      inputEl.value = getActiveInputDraft();
    });

    if (isMobileInput) {
      inputEl.addEventListener('focus', function () {
        setTimeout(function () {
          if (typeof scrollTerminalToBottom === 'function') {
            scrollTerminalToBottom();
          }
          if (typeof scheduleFit === 'function') {
            scheduleFit();
          }
        }, 300);
      });

      inputEl.addEventListener('blur', function () {
        setTimeout(function () {
          if (typeof scheduleFit === 'function') {
            scheduleFit();
          }
        }, 100);
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
        if (isComposing) return;
        syncActiveInputDraft();
      });

      return;
    }

    inputEl.addEventListener('keydown', function (event) {
      if (isComposing || event.isComposing) return;

      var key = event.key;

      if (event.ctrlKey && !event.altKey && !event.metaKey) {
        var normalizedKey = String(key || '').toLowerCase();
        if (normalizedKey === 'c') {
          event.preventDefault();
          emitTerminalInput(TERMINAL_KEY_SEQUENCES['ctrl-c'], { silent: true });
          return;
        } else if (normalizedKey === 'd') {
          event.preventDefault();
          emitTerminalInput(TERMINAL_KEY_SEQUENCES['ctrl-d'], { silent: true });
          return;
        } else if (normalizedKey === 'l') {
          emitTerminalInput(TERMINAL_KEY_SEQUENCES['ctrl-l'], { silent: true });
          return;
        } else if (normalizedKey === 'u') {
          emitTerminalInput(TERMINAL_KEY_SEQUENCES['ctrl-u'], { silent: true });
          inputEl.value = '';
          setActiveInputDraft('');
          return;
        }
      }

      if (key === 'Enter') {
        event.preventDefault();
        emitTerminalInput(TERMINAL_KEY_SEQUENCES.enter, { silent: true });
        inputEl.value = '';
        setActiveInputDraft('');
        return;
      }

      if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
        emitTerminalInput(TERMINAL_KEY_SEQUENCES['arrow-' + key.slice(5).toLowerCase()], { silent: true });
        return;
      }

      if (key === 'Tab') {
        event.preventDefault();
        emitTerminalInput(TERMINAL_KEY_SEQUENCES.tab, { silent: true });
        return;
      }

      if (key === 'Escape') {
        emitTerminalInput(TERMINAL_KEY_SEQUENCES.escape, { silent: true });
        return;
      }

      if (key === 'Backspace') {
        event.preventDefault();
        emitTerminalInput(TERMINAL_KEY_SEQUENCES.backspace, { silent: true });
        var draft = getActiveInputDraft();
        if (draft.length > 0) {
          setActiveInputDraft(draft.slice(0, -1));
          inputEl.value = getActiveInputDraft();
        }
        return;
      }

      if (key === 'Delete') {
        emitTerminalInput(TERMINAL_KEY_SEQUENCES.delete, { silent: true });
        return;
      }

      if (key === 'Home') {
        emitTerminalInput(TERMINAL_KEY_SEQUENCES.home, { silent: true });
        return;
      }

      if (key === 'End') {
        emitTerminalInput(TERMINAL_KEY_SEQUENCES.end, { silent: true });
        return;
      }

      if (key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        emitTerminalInput(key, { silent: true });
        appendActiveInputDraft(key);
        inputEl.value = getActiveInputDraft();
      }
    });

    inputEl.addEventListener('paste', function (event) {
      if (!event.clipboardData) return;
      var text = event.clipboardData.getData('text');
      if (!text) return;
      event.preventDefault();
      emitTerminalInput(text, { silent: true });
      appendActiveInputDraft(text);
      inputEl.value = getActiveInputDraft();
    });

    inputEl.addEventListener('focus', function () {
      syncActiveInputDraft();
    });

    inputEl.addEventListener('input', function () {
      if (isComposing) return;
      var draft = getActiveInputDraft();
      if (inputEl.value !== draft) {
        inputEl.value = draft;
        try {
          inputEl.setSelectionRange(draft.length, draft.length);
        } catch (_error) {}
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
        if (!emitTerminalInput(payload, { silent: true })) {
          syncActiveInputDraft();
          return;
        }
        if (keyId === 'backspace') {
          trimActiveInputDraft(1);
        } else {
          syncActiveInputDraft();
        }
        if (!isMobileLayout()) {
          getPreferredInput().focus();
        }
      });
    });
  }

  function getPreferredInput() {
    return isMobileLayout() ? dom.mobileInputBox : dom.desktopInputBox;
  }

  function getActiveInputDraft() {
    return state.activeSessionId ? state.inputDraftBySession[state.activeSessionId] || '' : '';
  }

  function syncActiveInputDraft() {
    const draft = getActiveInputDraft();

    [dom.desktopInputBox, dom.mobileInputBox].forEach(function (inputEl) {
      if (!inputEl) return;
      if (inputEl.value !== draft) {
        inputEl.value = draft;
      }

      try {
        inputEl.setSelectionRange(draft.length, draft.length);
      } catch (_error) {
        // Ignore disabled inputs that cannot move the caret.
      }
    });
  }

  function setActiveInputDraft(nextDraft) {
    if (!state.activeSessionId) {
      syncActiveInputDraft();
      return;
    }

    if (nextDraft) {
      state.inputDraftBySession[state.activeSessionId] = nextDraft;
    } else {
      delete state.inputDraftBySession[state.activeSessionId];
    }

    syncActiveInputDraft();
  }

  function appendActiveInputDraft(text) {
    if (!text) return;
    setActiveInputDraft(getActiveInputDraft() + text);
  }

  function trimActiveInputDraft(count) {
    if (!count) return;
    const draftChars = Array.from(getActiveInputDraft());
    draftChars.splice(Math.max(draftChars.length - count, 0), count);
    setActiveInputDraft(draftChars.join(''));
  }

  function clearActiveInputDraft() {
    setActiveInputDraft('');
  }

  function handleLiveInputBeforeInput(event, inputEl) {
    if (!event || event.isComposing || event.defaultPrevented) return;

    const inputType = event.inputType || '';
    let payload = '';
    let draftAction = '';

    if (
      inputType === 'insertText' ||
      inputType === 'insertCompositionText' ||
      inputType === 'insertFromComposition' ||
      inputType === 'insertReplacementText'
    ) {
      payload = event.data || '';
      draftAction = 'append';
    } else if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
      payload = TERMINAL_KEY_SEQUENCES.enter;
      draftAction = 'clear';
    } else if (inputType === 'deleteContentBackward') {
      payload = TERMINAL_KEY_SEQUENCES.backspace;
      draftAction = 'backspace';
    } else if (inputType === 'deleteContentForward') {
      event.preventDefault();
      syncActiveInputDraft();
      return;
    } else {
      return;
    }

    if (!payload) return;
    event.preventDefault();
    if (!emitTerminalInput(payload, { silent: true })) {
      syncActiveInputDraft();
      return;
    }

    if (draftAction === 'append') {
      appendActiveInputDraft(payload);
    } else if (draftAction === 'backspace') {
      trimActiveInputDraft(1);
    } else if (draftAction === 'clear') {
      clearActiveInputDraft();
    } else {
      syncActiveInputDraft();
    }
  }

  function handleLiveInputKeydown(event, inputEl) {
    if (!event || event.isComposing) return;

    let keyId = '';

    if (event.ctrlKey && !event.altKey && !event.metaKey) {
      const normalizedKey = String(event.key || '').toLowerCase();
      if (normalizedKey === 'c' || normalizedKey === 'd') {
        event.preventDefault();
        syncActiveInputDraft();
        return;
      } else if (normalizedKey === 'l') keyId = 'ctrl-l';
      else if (normalizedKey === 'u') keyId = 'ctrl-u';
      else if (normalizedKey === 'z') keyId = 'ctrl-z';
    } else if (!event.altKey && !event.metaKey) {
      if (event.key === 'Enter') keyId = 'enter';
      else if (event.key === 'Escape') keyId = 'escape';
      else if (event.key === 'ArrowUp') keyId = 'arrow-up';
      else if (event.key === 'ArrowDown') keyId = 'arrow-down';
      else if (event.key === 'ArrowLeft') keyId = 'arrow-left';
      else if (event.key === 'ArrowRight') keyId = 'arrow-right';
      else if (event.key === 'Tab' || event.key === 'Delete' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        syncActiveInputDraft();
        return;
      }
    }

    if (!keyId) return;
    event.preventDefault();
    if (!emitTerminalInput(TERMINAL_KEY_SEQUENCES[keyId], { silent: true })) {
      syncActiveInputDraft();
      return;
    }

    if (keyId === 'enter' || keyId === 'ctrl-u') {
      clearActiveInputDraft();
    } else if (keyId === 'backspace') {
      trimActiveInputDraft(1);
    } else {
      syncActiveInputDraft();
    }
  }

  function handleLiveInputPaste(event, inputEl) {
    if (!event || !event.clipboardData) return;
    const text = event.clipboardData.getData('text');
    if (!text) return;
    event.preventDefault();
    if (!emitTerminalInput(text, { silent: true })) {
      syncActiveInputDraft();
      return;
    }

    appendActiveInputDraft(text);
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
      dom.baseUrlLabel.textContent = state.baseUrl || '';
    }
    if (dom.settingsBaseUrl) {
      dom.settingsBaseUrl.textContent = state.baseUrl || '';
    }
  }

  function updateModeUi() {
    const label = state.passthroughOnly ? '仅透传模式' : '允许远程控制';
    const hint = state.passthroughOnly
      ? '浏览器页只保留必要的查看和输入能力。'
      : '浏览器页可执行启动、暂停、重启和删除。';

    if (dom.modeLabel) dom.modeLabel.textContent = label;
    if (dom.modeHint) dom.modeHint.textContent = hint;
    if (dom.mobileModeLabel) dom.mobileModeLabel.textContent = label;
    if (dom.mobileModeHint) dom.mobileModeHint.textContent = hint;
  }

  function setSocketUi(connected, detail) {
    state.connected = connected;
    const statusText = connected
      ? '实时通道在线'
      : detail
        ? '实时通道离线：' + detail
        : '实时通道离线';
    const shortStatus = connected ? '在线' : '离线';

    dom.socketText.textContent = statusText;
    dom.socketDot.classList.remove('ok', 'err');
    dom.socketDot.classList.add(connected ? 'ok' : 'err');

    if (dom.mobileSocketDot) {
      dom.mobileSocketDot.classList.remove('ok', 'err');
      dom.mobileSocketDot.classList.add(connected ? 'ok' : 'err');
    }
    if (dom.mobileSocketText) dom.mobileSocketText.textContent = shortStatus;
    if (dom.settingsSocketText) dom.settingsSocketText.textContent = statusText;

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

  function showToast(message, tone) {
    var container = document.getElementById('toastContainer');
    if (!container || !message) return;

    var toast = document.createElement('div');
    toast.className = 'toast ' + (tone || '');
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(function () {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  function setInlineNotice(message, tone) {
    if (message) {
      showToast(message, tone);
    }
  }

  function isMobileLayout() {
    if (window.matchMedia) return window.matchMedia(MOBILE_BREAKPOINT_QUERY).matches;
    return window.innerWidth <= 900;
  }

  function getViewportMode() {
    return isMobileLayout() ? 'mobile' : 'desktop';
  }

  function getViewportWidth() {
    if (window.visualViewport && typeof window.visualViewport.width === 'number') {
      return Math.round(window.visualViewport.width);
    }
    return Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
  }

  function switchToView(nextView) {
    state.currentView = nextView;
    document.body.classList.remove('view-sessions', 'view-terminal', 'view-settings');
    document.body.classList.add('view-' + state.currentView);
    updateMobileNavActive(state.currentView);

    if (state.currentView === 'terminal') {
      setTimeout(function () {
        mountActiveTerminal(false, false);
      }, 50);
    }
  }

  function updateMobileNavActive(activeView) {
    document.querySelectorAll('[data-nav]').forEach(function (navBtn) {
      const view = navBtn.dataset.nav;
      if (view === activeView) {
        navBtn.classList.add('active');
      } else {
        navBtn.classList.remove('active');
      }
    });
  }

  function syncResponsiveLayout(forceRecreate) {
    const nextViewportMode = getViewportMode();
    const responsiveModeChanged = !!state.viewportMode && state.viewportMode !== nextViewportMode;
    const shouldRecreateTerminal = !!forceRecreate && responsiveModeChanged;
    state.viewportMode = nextViewportMode;
    state.lastViewportWidth = getViewportWidth();

    if (nextViewportMode === 'mobile') {
      if (!state.currentView || (state.currentView !== 'sessions' && state.currentView !== 'terminal' && state.currentView !== 'settings')) {
        state.currentView = 'sessions';
      }
      document.body.classList.remove('view-sessions', 'view-terminal', 'view-settings');
      document.body.classList.add('view-' + state.currentView);
      updateMobileNavActive(state.currentView);
      if (state.currentView === 'terminal') {
        setTimeout(function () {
          mountActiveTerminal(shouldRecreateTerminal, shouldRecreateTerminal);
        }, 50);
      }
      return;
    }

    document.body.classList.remove('view-sessions', 'view-terminal', 'view-settings');
    setTimeout(function () {
      mountActiveTerminal(shouldRecreateTerminal, shouldRecreateTerminal);
    }, 20);
  }

  function getSearchKeyword() {
    return (dom.desktopSearchInput.value || dom.mobileSearchInput.value || '').trim().toLowerCase();
  }

  function getProjectTreeKey(projectPath) {
    return projectPath && String(projectPath).trim() ? 'project:' + String(projectPath).trim() : 'project:__unassigned__';
  }

  function getProjectDisplayName(project) {
    if (project && project.name) {
      return project.name;
    }

    const projectPath = project && project.path ? String(project.path) : '';
    if (!projectPath) {
      return '未关联项目';
    }

    const normalized = projectPath.replace(/[\\\\/]+$/, '');
    const segments = normalized.split(/[\\\\/]+/).filter(Boolean);
    return segments.length ? segments[segments.length - 1] : projectPath;
  }

  function getProjectDescription(project) {
    if (project && project.path) {
      return project.path;
    }

    return '未绑定到项目路径';
  }

  function ensureProjectTreeState(groups) {
    const nextState = {};
    groups.forEach(function (group) {
      const hasStored = Object.prototype.hasOwnProperty.call(state.projectTreeExpanded, group.key);
      const shouldExpand = hasStored
        ? !!state.projectTreeExpanded[group.key]
        : !!group.matchingSearch || !!group.containsActiveSession || groups.length <= 4;
      nextState[group.key] = shouldExpand;
    });
    state.projectTreeExpanded = nextState;
  }

  function toggleProjectGroup(groupKey) {
    if (!groupKey) return;
    state.projectTreeExpanded[groupKey] = !state.projectTreeExpanded[groupKey];
    renderSessions();
  }

  function buildSessionGroups(list, keyword) {
    const filteredProjects = Array.isArray(state.projects) ? state.projects.slice() : [];
    const groupsByKey = new Map();

    filteredProjects.forEach(function (project) {
      const key = getProjectTreeKey(project && project.path);
      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, {
          key: key,
          project: project,
          projectPath: project && project.path ? project.path : '',
          sessions: [],
          latestActivity: 0,
          containsActiveSession: false,
          matchingSearch: false
        });
      }
    });

    list.forEach(function (session) {
      const projectPath = session && session.projectPath ? session.projectPath : '';
      const key = getProjectTreeKey(projectPath);
      if (!groupsByKey.has(key)) {
        groupsByKey.set(key, {
          key: key,
          project: projectPath
            ? {
                id: '',
                name: '',
                path: projectPath
              }
            : null,
          projectPath: projectPath,
          sessions: [],
          latestActivity: 0,
          containsActiveSession: false,
          matchingSearch: false
        });
      }

      const group = groupsByKey.get(key);
      group.sessions.push(session);
      group.latestActivity = Math.max(
        group.latestActivity || 0,
        session.lastActiveAt || session.createdAt || 0
      );
      if (session.id === state.activeSessionId) {
        group.containsActiveSession = true;
      }
      if (keyword) {
        group.matchingSearch = true;
      }
    });

    const groups = Array.from(groupsByKey.values())
      .filter(function (group) {
        return group.sessions.length > 0;
      })
      .sort(function (left, right) {
        if (left.containsActiveSession !== right.containsActiveSession) {
          return left.containsActiveSession ? -1 : 1;
        }
        if ((right.latestActivity || 0) !== (left.latestActivity || 0)) {
          return (right.latestActivity || 0) - (left.latestActivity || 0);
        }
        return getProjectDisplayName(left.project).localeCompare(getProjectDisplayName(right.project), 'zh-CN');
      });

    ensureProjectTreeState(groups);
    return groups;
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

  function clearSessionSubscriptionState(sessionId) {
    if (!sessionId) {
      state.subscribedSessionId = '';
      state.subscribingSessionId = '';
      return;
    }

    if (state.subscribedSessionId === sessionId) {
      state.subscribedSessionId = '';
    }
    if (state.subscribingSessionId === sessionId) {
      state.subscribingSessionId = '';
    }
  }

  function unsubscribeSession(sessionId) {
    if (!sessionId) return;
    clearSessionSubscriptionState(sessionId);
    if (!state.socket) return;
    state.socket.emit('session:unsubscribe', { sessionId: sessionId });
  }

  function subscribeToSession(sessionId, forceReplay) {
    if (!sessionId || !state.socket || !state.connected) return;

    if (!forceReplay && (state.subscribedSessionId === sessionId || state.subscribingSessionId === sessionId)) {
      scheduleTerminalResize();
      return;
    }

    if (forceReplay) {
      clearSessionSubscriptionState(sessionId);
      resetTerminal(sessionId);
    }

    state.subscribingSessionId = sessionId;
    state.socket.emit('session:subscribe', { sessionId: sessionId, historyLines: HISTORY_LINES }, function (ack) {
      if (state.subscribingSessionId === sessionId) {
        state.subscribingSessionId = '';
      }

      if (ack && ack.ok === false) {
        if (state.activeSessionId === sessionId) {
          setInlineNotice('订阅会话失败：' + (ack.message || 'unknown'), 'error');
        }
        return;
      }

      state.subscribedSessionId = sessionId;
      if (state.activeSessionId !== sessionId) return;

      setTimeout(function () {
        scheduleTerminalResize();
        if (typeof refreshTerminal === 'function') {
          refreshTerminal();
        }
      }, 50);
    });
  }

  function mountActiveTerminal(forceRecreate, forceReplay) {
    const activeSession = getActiveSession();
    const activeSessionId = activeSession ? activeSession.id : '';
    const mounted = ensureTerminal(forceRecreate, function () {
      if (typeof refreshTerminal === 'function') {
        refreshTerminal();
      }

      if (!activeSessionId || state.activeSessionId !== activeSessionId) {
        scheduleTerminalResize();
        return;
      }

      scheduleTerminalResize();
      subscribeToSession(activeSessionId, !!forceReplay || state.subscribedSessionId !== activeSessionId);
    });

    if (!mounted) {
      clearSessionSubscriptionState(activeSessionId);
    }
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
    syncActiveInputDraft();
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
    const symbols = { running: '▶', error: '✕', stopped: '■', paused: '❚❚', unknown: '?' };
    badge.textContent = symbols[status] || symbols.unknown;
    badge.title = status || 'unknown';
    return badge;
  }

  function renderSessionItem(target, session) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'session-item' + (session.id === state.activeSessionId ? ' active' : '');

    const head = document.createElement('div');
    head.className = 'session-item-head';

    const textWrap = document.createElement('div');
    textWrap.className = 'session-item-copy';

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
  }

  function renderProjectGroup(target, group) {
    const section = document.createElement('section');
    section.className = 'session-project-group' + (state.projectTreeExpanded[group.key] ? ' expanded' : '');

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'session-project-toggle' + (group.containsActiveSession ? ' active' : '');
    toggle.setAttribute('aria-expanded', state.projectTreeExpanded[group.key] ? 'true' : 'false');
    toggle.addEventListener('click', function () {
      toggleProjectGroup(group.key);
    });

    const chevron = document.createElement('span');
    chevron.className = 'session-project-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▸';

    const copy = document.createElement('div');
    copy.className = 'session-project-copy';

    const nameEl = document.createElement('div');
    nameEl.className = 'session-project-name';
    nameEl.textContent = getProjectDisplayName(group.project);

    const metaEl = document.createElement('div');
    metaEl.className = 'session-project-meta';
    metaEl.textContent = group.sessions.length + ' 个会话 · ' + getProjectDescription(group.project);

    copy.appendChild(nameEl);
    copy.appendChild(metaEl);

    const countEl = document.createElement('span');
    countEl.className = 'session-project-count';
    countEl.textContent = String(group.sessions.length);

    toggle.appendChild(chevron);
    toggle.appendChild(copy);
    toggle.appendChild(countEl);
    section.appendChild(toggle);

    const body = document.createElement('div');
    body.className = 'session-project-body';
    group.sessions.forEach(function (session) {
      renderSessionItem(body, session);
    });
    section.appendChild(body);
    target.appendChild(section);
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

    const groups = buildSessionGroups(list, getSearchKeyword());
    groups.forEach(function (group) {
      renderProjectGroup(target, group);
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
      if ((action === 'start' || action === 'restart') && state.activeSessionId === session.id) {
        clearSessionSubscriptionState(session.id);
        resetTerminal(session.id);
        scheduleActiveSessionTerminalRecovery(session.id, true);
      }
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

    if (previousSessionId && previousSessionId !== sessionId) {
      unsubscribeSession(previousSessionId);
    }

    if (isMobileLayout()) {
      switchToView('terminal');
      setTimeout(function () {
        mountActiveTerminal(false, true);
      }, 20);
    } else {
      setTimeout(function () {
        mountActiveTerminal(true, true);
      }, 20);
    }

    scheduleTerminalResize();
  }

  function scheduleActiveSessionTerminalRecovery(sessionId, forceReplay) {
    if (!sessionId) return;

    const recoverySteps = [
      { delay: 24, remount: true },
      { delay: 140, remount: false },
      { delay: 320, remount: false },
      { delay: 640, remount: false }
    ];

    recoverySteps.forEach(function (step) {
      setTimeout(function () {
        if (state.activeSessionId !== sessionId) return;
        if (isMobileLayout() && state.currentView !== 'terminal') return;

        if (step.remount) {
          mountActiveTerminal(!isMobileLayout(), !!forceReplay);
          return;
        }

        scheduleTerminalResize();
        if (typeof refreshTerminal === 'function') {
          refreshTerminal();
        }
      }, step.delay);
    });
  }

  async function refreshData() {
    const responses = await Promise.allSettled([
      api('/api/sessions'),
      state.capabilities.projectsList ? api('/api/projects') : Promise.resolve([])
    ]);

    const sessions = responses[0].status === 'fulfilled' ? responses[0].value : [];
    const projects = responses[1].status === 'fulfilled' ? responses[1].value : [];
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
    state.projects = Array.isArray(projects) ? projects.slice() : [];

    if (state.activeSessionId && !state.sessions.some(function (session) { return session.id === state.activeSessionId; })) {
      unsubscribeSession(state.activeSessionId);
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
          projectsList: !!remoteCapabilities.capabilities.projectsList,
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
        setTimeout(function () {
          clearSessionSubscriptionState(activeSession.id);
          mountActiveTerminal(true, true);
        }, 50);
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

      clearSessionSubscriptionState();

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
