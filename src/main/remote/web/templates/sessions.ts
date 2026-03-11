export function sessionsTemplate(passthroughOnly: boolean): string {
  const modeText = passthroughOnly ? '仅透传模式' : '允许远程控制'
  const keypad = `
    <div class="terminal-keypad" aria-label="终端功能键">
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-up">↑</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-down">↓</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-left">←</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-right">→</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="home">Home</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="end">End</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="escape">Esc</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="tab">Tab</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="backspace">Backspace</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="delete">Delete</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="ctrl-c">Ctrl+C</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="ctrl-d">Ctrl+D</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="ctrl-l">Ctrl+L</button>
    </div>
  `

  return `
    <div class="page-shell remote-shell">
      <header class="card topbar">
        <div class="topbar-copy">
          <div class="eyebrow">EasySession Remote</div>
          <h1 class="page-title">远程会话</h1>
          <p class="page-copy">新的模块化 Web 前端。终端受容器约束、会话列表动态刷新，并支持浅色与深色双主题切换，浏览器里也能稳定排障。</p>
          <div id="baseUrlLabel" class="page-meta"></div>
        </div>

        <div class="topbar-status">
          <button
            type="button"
            class="theme-toggle"
            data-theme-toggle
            aria-pressed="false"
            aria-label="切换界面主题"
          >
            <span class="theme-toggle-indicator" aria-hidden="true"></span>
            <span class="theme-toggle-copy">
              <span class="theme-toggle-caption">界面主题</span>
              <span class="theme-toggle-value" data-theme-label>浅色模式</span>
            </span>
            <span class="theme-toggle-action" data-theme-action>切换到深色模式</span>
          </button>
          <div class="status-pill">
            <span id="socketDot" class="status-dot"></span>
            <span id="socketText">实时通道未连接</span>
          </div>
          <div id="modeLabel" class="status-pill">${modeText}</div>
          <button id="logoutBtn" class="btn btn-secondary ghost-btn">退出登录</button>
        </div>
      </header>

      <div id="globalNotice" class="notice-banner" hidden></div>

      <div class="workspace">
        <aside class="card workspace-sidebar">
          <div class="panel-head">
            <div class="panel-head-copy">
              <strong>会话列表</strong>
              <span id="modeHint" class="helper-text"></span>
            </div>
            <button id="refreshBtn" class="btn btn-secondary icon-btn" aria-label="刷新会话">刷新</button>
          </div>

          <div class="sidebar-search">
            <input id="desktopSearchInput" class="input" placeholder="搜索名称、类型、路径" />
          </div>

          <div id="desktopSessionList" class="session-list"></div>
        </aside>

        <section class="card workspace-main">
          <div class="terminal-panel">
            <div class="panel-head">
              <div class="panel-head-copy">
                <div id="activeSessionTitle" class="session-title">未选择会话</div>
                <div id="activeSessionMeta" class="session-meta"></div>
              </div>
              <div id="terminalActions" class="session-action-group"></div>
            </div>

            <div class="terminal-stage">
              <div class="terminal-shell">
                <div id="terminalHost" class="terminal-host"></div>
              </div>
            </div>

            <div class="terminal-input-row">
              <input
                id="desktopInputBox"
                class="input"
                placeholder="实时输入：键入即发送，回车执行"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
              />
              <button id="desktopSendBtn" class="btn btn-primary" type="button">回车</button>
            </div>
            ${keypad}

            <div id="inlineNotice" class="panel-notice" hidden></div>
          </div>
        </section>
      </div>

      <section class="mobile-view sessions-view">
        <div class="mobile-toolbar">
          <button
            type="button"
            class="theme-toggle"
            data-theme-toggle
            aria-pressed="false"
            aria-label="切换界面主题"
          >
            <span class="theme-toggle-indicator" aria-hidden="true"></span>
            <span class="theme-toggle-copy">
              <span class="theme-toggle-caption">界面主题</span>
              <span class="theme-toggle-value" data-theme-label>浅色模式</span>
            </span>
            <span class="theme-toggle-action" data-theme-action>切换到深色模式</span>
          </button>
          <button id="mobileRefreshBtn" class="btn btn-secondary">刷新</button>
          <button id="mobileLogoutBtn" class="btn btn-secondary">退出</button>
        </div>

        <div class="sidebar-search" style="padding: 0 0 12px;">
          <input id="mobileSearchInput" class="input" placeholder="搜索名称、类型、路径" />
        </div>

        <div id="mobileSessionList" class="mobile-session-list"></div>
      </section>

      <section class="card mobile-view terminal-view">
        <div class="terminal-mobile-head">
          <button id="backBtn" class="btn btn-secondary">返回</button>
          <div class="terminal-mobile-copy">
            <div id="mobileSessionTitle" class="session-title">未选择会话</div>
            <div id="mobileSessionMeta" class="session-meta"></div>
          </div>
        </div>

        <div id="mobileSessionActions" class="session-action-group mobile-action-group"></div>

        <div class="terminal-stage mobile-terminal-stage">
          <div class="terminal-shell">
            <div id="mobileTerminalHost" class="terminal-host"></div>
          </div>
        </div>

        <div class="terminal-input-row mobile-input-row">
          <input
            id="mobileInputBox"
            class="input"
            placeholder="实时输入：键入即发送，回车执行"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
          <button id="mobileSendBtn" class="btn btn-primary" type="button">回车</button>
        </div>
        ${keypad}
      </section>
    </div>
  `
}
