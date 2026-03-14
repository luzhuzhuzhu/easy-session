export const layouts = `
  html {
    height: 100%;
  }

  body {
    height: 100%;
    overflow: hidden;
    background: var(--page-background);
  }

  .page-shell {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .auth-shell {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: var(--page-background);
  }

  .auth-card {
    width: min(400px, 100%);
    padding: 28px;
  }

  .auth-utility-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 20px;
  }

  .auth-head {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 24px;
  }

  .auth-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .remember-row {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-secondary);
    font-size: 14px;
    cursor: pointer;
    user-select: none;
  }

  .remember-row input {
    width: 18px;
    height: 18px;
    accent-color: var(--accent-primary);
    border-radius: 4px;
  }

  .topbar {
    display: none;
  }

  .workspace {
    display: none;
    min-height: 0;
    overflow: hidden;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-2);
  }

  .panel-head .session-action-group {
    gap: 6px;
  }

  .panel-head .session-action-btn {
    min-height: 32px;
    padding: 0 10px;
    font-size: 13px;
  }

  .panel-head-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .panel-head-copy strong {
    font-size: 15px;
    font-weight: 600;
  }

  .sidebar-search {
    padding: 8px 10px;
    flex-shrink: 0;
  }

  .sidebar-search .input {
    min-height: 36px;
    font-size: 13px;
  }

  .session-list {
    padding: 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-height: 0;
    max-height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  .session-empty {
    padding: 40px 20px;
    color: var(--text-muted);
    text-align: center;
    font-size: 14px;
  }

  .session-project-group {
    flex: 0 0 auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    overflow: hidden;
  }

  .session-project-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: none;
    border-bottom: 1px solid transparent;
    background: var(--surface-2);
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .session-project-toggle:hover {
    background: var(--surface-3);
  }

  .session-project-toggle.active {
    background: var(--accent-primary-soft);
    border-bottom-color: var(--line);
  }

  .session-project-group.expanded .session-project-toggle {
    border-bottom-color: var(--line);
  }

  .session-project-chevron {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: 11px;
    transition: transform var(--transition-fast);
  }

  .session-project-group.expanded .session-project-chevron {
    transform: rotate(90deg);
  }

  .session-project-copy {
    min-width: 0;
    flex: 1;
  }

  .session-project-name {
    font-size: 13px;
    font-weight: 600;
    line-height: 1.3;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-project-meta {
    margin-top: 2px;
    font-size: 10px;
    color: var(--text-muted);
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-project-count {
    flex: 0 0 auto;
    min-width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 6px;
    border-radius: var(--radius-pill);
    background: var(--surface-3);
    color: var(--text-secondary);
    font-size: 11px;
    font-weight: 600;
  }

  .session-project-body {
    display: none;
    flex-direction: column;
    padding: 6px;
    gap: 4px;
    min-height: 0;
  }

  .session-project-group.expanded .session-project-body {
    display: flex;
  }

  .session-item {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    padding: 8px 10px;
    background: var(--surface-1);
    cursor: pointer;
    text-align: left;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .session-item:hover {
    border-color: var(--line-strong);
    box-shadow: var(--shadow-xs);
  }

  .session-item.active {
    border-color: var(--accent-primary);
    background: var(--accent-primary-soft);
  }

  .session-item-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .session-item-copy {
    min-width: 0;
    flex: 1;
  }

  .session-item-name {
    font-size: 13px;
    font-weight: 500;
    line-height: 1.3;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-item-meta {
    margin-top: 2px;
    font-size: 11px;
    color: var(--text-muted);
  }

  .session-item-path {
    margin-top: 2px;
    font-size: 10px;
    color: var(--text-muted);
    word-break: break-all;
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .terminal-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .session-title {
    font-size: 16px;
    font-weight: 600;
  }

  .session-meta {
    margin-top: 2px;
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-mono);
  }

  .terminal-stage {
    flex: 1;
    min-height: 0;
    padding: 12px;
  }

  .terminal-shell {
    height: 100%;
    border-radius: var(--radius-sm);
    background: var(--terminal-bg);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  .terminal-host {
    width: 100%;
    height: 100%;
    min-height: 200px;
  }

  .terminal-host .xterm {
    height: 100%;
    padding: 4px;
  }

  .terminal-host .xterm-viewport {
    overflow-y: auto !important;
  }

.terminal-input-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px 12px;
    overflow: hidden;
  }

  .terminal-input-row .input {
    flex: 1 1 180px;
    min-width: 80px;
    font-family: var(--font-mono);
    font-size: 14px;
  }

  .terminal-input-row .terminal-key-btn {
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    min-height: 28px;
    padding: 0;
    font-size: 11px;
  }

  .terminal-input-row .btn {
    flex: 0 0 auto;
    height: 28px;
    min-height: 28px;
    padding: 0 12px;
    font-size: 12px;
  }

  .panel-notice {
    margin: 0 12px 12px;
  }

  .plain-terminal {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    height: 100%;
    padding: 12px;
    color: var(--terminal-fg);
  }

  .plain-terminal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .plain-terminal-badge {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 0 10px;
    border-radius: var(--radius-pill);
    background: var(--accent-warning-soft);
    color: var(--accent-warning);
    font-size: 12px;
    font-weight: 600;
  }

  .plain-terminal-output {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 14px;
    border-radius: var(--radius-md);
    background: var(--terminal-bg);
    color: var(--terminal-fg);
    white-space: pre-wrap;
    word-break: break-word;
    font: 13px/1.55 var(--font-mono);
  }

  .plain-terminal-empty {
    color: var(--text-muted);
  }

  .mobile-view {
    display: none;
  }

  .mobile-nav {
    display: flex;
    align-items: center;
    justify-content: space-around;
    height: 48px;
    padding: 0 6px;
    padding-bottom: env(safe-area-inset-bottom, 0);
    background: var(--surface-1);
    border-top: 1px solid var(--line);
    flex-shrink: 0;
  }

  .mobile-nav-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 56px;
    min-height: 32px;
    padding: 2px 10px;
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 500;
    transition:
      color var(--transition-fast),
      background-color var(--transition-fast);
    cursor: pointer;
  }

  .mobile-nav-item:hover {
    background: var(--surface-3);
  }

  .mobile-nav-item.active {
    color: var(--accent-primary);
    background: var(--accent-primary-soft);
  }

  .mobile-nav-icon {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mobile-nav-icon svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
    stroke-width: 1.8;
    fill: none;
  }

  .mobile-toolbar {
    display: none;
  }

  .mobile-session-list {
    display: grid;
    gap: 8px;
  }

  .terminal-mobile-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-2);
    min-height: 50px;
  }

  .terminal-mobile-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    flex: 1;
  }

  .mobile-session-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .mobile-session-title-row .session-title {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-session-status {
    min-height: 24px;
    padding: 0 6px;
    font-size: 11px;
    flex-shrink: 0;
  }

  .mobile-terminal-page .panel-head {
    padding: 8px 10px;
    gap: 10px;
  }

  .mobile-terminal-page .panel-head-copy {
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .mobile-terminal-page .session-title {
    font-size: 14px;
    line-height: 1.2;
  }

  .mobile-terminal-page .session-meta {
    margin-top: 0;
    font-size: 10px;
    line-height: 1.35;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-terminal-page .session-action-group {
    gap: 4px;
    flex-shrink: 0;
  }

  .mobile-terminal-page .session-action-btn {
    min-height: 26px;
    padding: 0 8px;
    font-size: 11px;
  }

  .mobile-terminal-stage {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 8px 8px 2px;
  }

  .mobile-terminal-stage .terminal-shell {
    flex: 1;
    min-height: 0;
  }

  .mobile-terminal-stage .terminal-host {
    min-height: 0;
    height: 100%;
  }

  .mobile-input-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 8px 12px;
    flex-shrink: 0;
  }

  .mobile-input-row .input {
    flex: 1;
    min-width: 0;
  }

  .mobile-input-row .btn {
    flex-shrink: 0;
    min-height: 36px;
  }

  .mobile-keypad-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px 8px;
    flex-shrink: 0;
  }

  .mobile-keypad-row .terminal-key-btn {
    flex: 1;
    min-width: 0;
    min-height: 36px;
    font-size: 13px;
  }

  .mobile-page-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--line);
    flex-shrink: 0;
  }

  .mobile-page-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .mobile-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-header-actions .theme-toggle {
    min-height: 36px;
    padding: 0 12px;
    font-size: 13px;
  }

  .mobile-page-content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .mobile-sessions-page .mobile-page-content {
    overflow: hidden;
  }

  .mobile-sessions-page .session-list {
    flex: 1 1 auto;
    min-height: 0;
  }

  .mobile-sessions-page,
  .mobile-terminal-page,
  .mobile-settings-page {
    display: none;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  body.view-sessions .mobile-sessions-page {
    display: flex;
  }

  body.view-terminal .mobile-terminal-page {
    display: flex;
  }

  body.view-terminal .mobile-terminal-page,
  body.view-terminal .mobile-terminal-page .mobile-page-content {
    overflow: hidden;
  }

  body.view-settings .mobile-settings-page {
    display: flex;
  }

  .settings-section {
    padding: 12px;
  }

  .settings-group {
    background: var(--surface-1);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }

  .settings-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }

  .settings-item:last-child {
    border-bottom: none;
  }

  .settings-item-label {
    font-size: 15px;
    color: var(--text-primary);
  }

  .settings-item-hint {
    font-size: 13px;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .settings-status-value {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .settings-divider {
    height: 8px;
    background: var(--page-background);
  }

  .xterm-viewport {
    overflow-y: auto !important;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-y;
  }

  #terminalHost,
  #mobileTerminalHost {
    overscroll-behavior: contain;
    touch-action: auto;
  }

  .mobile-terminal-page .terminal-shell {
    touch-action: auto;
  }

  .mobile-terminal-page .xterm {
    touch-action: auto;
  }

  .mobile-terminal-page .xterm-viewport {
    touch-action: pan-y;
    -webkit-overflow-scrolling: touch;
  }

  @media (min-width: 901px) {
    .mobile-nav {
      display: none;
    }

    .mobile-page-header {
      display: none;
    }

    .mobile-sessions-page,
    .mobile-terminal-page,
    .mobile-settings-page {
      display: none !important;
    }

    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      padding: 12px 16px;
      margin: 12px 16px 0;
      flex-shrink: 0;
    }

    .topbar-copy {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }

    .app-logo {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .app-logo-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, var(--accent-primary) 0%, #5856d6 100%);
      border-radius: var(--radius-sm);
      color: #fff;
      font-weight: 700;
      font-size: 14px;
    }

    .app-logo-text {
      font-weight: 600;
      font-size: 16px;
      color: var(--text-primary);
    }

    .server-address {
      padding: 4px 10px;
      background: var(--surface-3);
      border-radius: var(--radius-pill);
      font-size: 12px;
      font-family: var(--font-mono);
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 240px;
    }

    .topbar-status {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
    }

    .page-meta {
      color: var(--text-muted);
      font-size: 12px;
      font-family: var(--font-mono);
      display: none;
    }

    .workspace {
      display: grid;
      grid-template-columns: 220px minmax(0, 1fr);
      gap: 12px;
      padding: 0 16px 16px;
      flex: 1;
      min-height: 0;
    }

    .workspace-sidebar,
    .workspace-main {
      min-height: 0;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .workspace-sidebar {
      height: 100%;
    }

    .workspace-sidebar .session-list {
      flex: 1 1 auto;
      min-height: 0;
    }

    .terminal-panel {
      height: 100%;
    }

    .session-list {
      max-height: none;
      flex: 1;
    }

    .terminal-host {
      height: 100%;
      min-height: 400px;
    }

    .terminal-input-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .terminal-input-row .terminal-key-btn {
      width: 36px;
      height: 36px;
      min-height: 36px;
      font-size: 12px;
    }

    .terminal-input-row .btn {
      height: 36px;
      min-height: 36px;
    }
  }

  @media (max-width: 640px) {
    .auth-shell {
      padding: 12px;
    }

    .auth-card {
      padding: 24px 20px;
    }

    .auth-utility-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .terminal-input-row,
    .mobile-input-row {
      grid-template-columns: 1fr;
    }

    .terminal-keypad {
      grid-template-columns: repeat(4, 1fr);
    }

    .terminal-key-btn {
      min-width: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .session-item,
    .terminal-shell,
    .mobile-nav-item {
      transition: none;
    }
  }
`
