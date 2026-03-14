export function sessionsTemplate(passthroughOnly: boolean): string {
  const modeText = passthroughOnly ? '仅透传模式' : '允许远程控制'
  const mobileKeypad = `
    <div class="terminal-keypad" aria-label="终端功能键">
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-up">↑</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-down">↓</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-left">←</button>
      <button type="button" class="terminal-key-btn" data-terminal-key="arrow-right">→</button>
    </div>
  `

  return `
    <div class="page-shell remote-shell">
      <div id="toastContainer" class="toast-container"></div>
      <header class="card topbar">
        <div class="topbar-copy">
          <div class="app-logo">
            <span class="app-logo-icon">E</span>
            <span class="app-logo-text">EasySession</span>
          </div>
          <div id="baseUrlLabel" class="server-address"></div>
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

      <div id="globalNotice" class="notice-banner" style="margin: 12px 16px 0;" hidden></div>

      <div class="workspace">
        <aside class="card workspace-sidebar">
          <div class="panel-head">
            <strong>会话列表</strong>
            <button id="refreshBtn" class="btn btn-secondary icon-btn btn-sm" aria-label="刷新会话">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 21h5v-5"/>
              </svg>
            </button>
          </div>

          <div class="sidebar-search">
            <input id="desktopSearchInput" class="input" placeholder="搜索会话..." />
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
                placeholder="实时输入（透传模式）"
                autocomplete="off"
                autocapitalize="off"
                spellcheck="false"
              />
              <button type="button" class="terminal-key-btn" data-terminal-key="arrow-up">↑</button>
              <button type="button" class="terminal-key-btn" data-terminal-key="arrow-down">↓</button>
              <button type="button" class="terminal-key-btn" data-terminal-key="arrow-left">←</button>
              <button type="button" class="terminal-key-btn" data-terminal-key="arrow-right">→</button>
              <button type="button" class="terminal-key-btn" data-terminal-key="escape">Esc</button>
              <button type="button" class="terminal-key-btn" data-terminal-key="backspace">⌫</button>
              <button id="desktopSendBtn" class="btn btn-primary" type="button">发送</button>
            </div>
          </div>
        </section>
      </div>

      <section class="mobile-sessions-page">
        <header class="mobile-page-header">
          <h2 class="mobile-page-title">会话</h2>
          <div class="mobile-header-actions">
            <button id="mobileRefreshBtn" class="btn btn-secondary icon-btn" aria-label="刷新">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 21h5v-5"/>
              </svg>
            </button>
          </div>
        </header>
        <div class="mobile-page-content">
          <div class="sidebar-search">
            <input id="mobileSearchInput" class="input" placeholder="搜索会话..." />
          </div>
          <div id="mobileSessionList" class="session-list"></div>
        </div>
      </section>

      <section class="mobile-terminal-page">
        <div class="mobile-page-content">
          <div class="panel-head">
            <div class="panel-head-copy">
              <div class="mobile-session-title-row">
                <div id="mobileSessionTitle" class="session-title">未选择会话</div>
                <div class="status-pill mobile-session-status">
                  <span id="mobileSocketDot" class="status-dot"></span>
                  <span id="mobileSocketText">离线</span>
                </div>
              </div>
              <div id="mobileSessionMeta" class="session-meta"></div>
            </div>
            <div id="mobileSessionActions" class="session-action-group"></div>
          </div>
          <div class="terminal-stage mobile-terminal-stage">
            <div class="terminal-shell">
              <div id="mobileTerminalHost" class="terminal-host"></div>
            </div>
          </div>
          <div class="mobile-input-row">
            <input
              id="mobileInputBox"
              class="input"
              placeholder="实时输入（透传模式）"
              autocomplete="off"
              autocapitalize="off"
              spellcheck="false"
            />
            <button id="mobileSendBtn" class="btn btn-primary" type="button">发送</button>
          </div>
          <div class="mobile-keypad-row">
            <button type="button" class="terminal-key-btn" data-terminal-key="arrow-up">↑</button>
            <button type="button" class="terminal-key-btn" data-terminal-key="arrow-down">↓</button>
            <button type="button" class="terminal-key-btn" data-terminal-key="arrow-left">←</button>
            <button type="button" class="terminal-key-btn" data-terminal-key="arrow-right">→</button>
            <button type="button" class="terminal-key-btn" data-terminal-key="escape">Esc</button>
            <button type="button" class="terminal-key-btn" data-terminal-key="backspace">⌫</button>
          </div>
        </div>
      </section>

      <section class="mobile-settings-page">
        <header class="mobile-page-header">
          <h2 class="mobile-page-title">设置</h2>
        </header>
        <div class="mobile-page-content">
          <div class="settings-section">
            <div class="settings-group">
              <div class="settings-item">
                <div>
                  <div class="settings-item-label">外观主题</div>
                  <div class="settings-item-hint">切换浅色或深色模式</div>
                </div>
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
                  <span class="theme-toggle-action" data-theme-action>切换</span>
                </button>
              </div>
              <div class="settings-item">
                <div>
                  <div class="settings-item-label">运行模式</div>
                  <div class="settings-item-hint" id="mobileModeHint"></div>
                </div>
                <span class="settings-status-value" id="mobileModeLabel">${modeText}</span>
              </div>
              <div class="settings-item">
                <div>
                  <div class="settings-item-label">连接状态</div>
                  <div class="settings-item-hint">与远程服务的实时通道</div>
                </div>
                <span class="settings-status-value" id="settingsSocketText">离线</span>
              </div>
            </div>

            <div class="settings-divider"></div>

            <div class="settings-group">
              <div class="settings-item">
                <div>
                  <div class="settings-item-label">服务地址</div>
                </div>
                <span class="settings-status-value" id="settingsBaseUrl" style="font-size: 12px; font-family: var(--font-mono); max-width: 180px; text-align: right; word-break: break-all;"></span>
              </div>
            </div>

            <div class="settings-divider"></div>

            <div class="settings-group">
              <button id="mobileLogoutBtn" class="settings-item" style="width: 100%; border: none; background: none; cursor: pointer; text-align: left;">
                <span class="settings-item-label" style="color: var(--accent-danger);">退出登录</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <nav class="mobile-nav" role="navigation" aria-label="主导航">
        <button type="button" class="mobile-nav-item active" data-nav="sessions" aria-label="会话列表">
          <span class="mobile-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
            </svg>
          </span>
          <span>会话</span>
        </button>
        <button type="button" class="mobile-nav-item" data-nav="terminal" aria-label="终端">
          <span class="mobile-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="4 17 10 11 4 5"/>
              <line x1="12" y1="19" x2="20" y2="19"/>
            </svg>
          </span>
          <span>终端</span>
        </button>
        <button type="button" class="mobile-nav-item" data-nav="settings" aria-label="设置">
          <span class="mobile-nav-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </span>
          <span>设置</span>
        </button>
      </nav>
    </div>
  `
}
