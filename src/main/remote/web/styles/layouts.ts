export const layouts = `
  body {
    overflow-x: hidden;
    background: var(--page-background);
  }

  .page-shell {
    width: min(1440px, calc(100vw - 32px));
    margin: 0 auto;
    padding: 16px 0 24px;
  }

  .auth-shell {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }

  .auth-card {
    width: min(520px, 100%);
    padding: 24px;
    background: var(--surface-1);
  }

  .auth-utility-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
  }

  .auth-head {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
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
    cursor: pointer;
    user-select: none;
  }

  .remember-row input {
    width: 16px;
    height: 16px;
    accent-color: var(--accent-primary);
  }

  .topbar {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
    padding: 16px;
  }

  .topbar-copy {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
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
  }

  .workspace {
    margin-top: 12px;
    display: grid;
    grid-template-columns: 320px minmax(0, 1fr);
    gap: 12px;
    min-height: calc(100vh - 178px);
  }

  .workspace-sidebar,
  .workspace-main {
    min-height: 0;
    overflow: hidden;
  }

  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-2);
  }

  .panel-head-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar-search {
    padding: 12px;
  }

  .sidebar-search .input {
    min-height: 38px;
  }

  .session-list {
    padding: 8px;
    display: grid;
    gap: 8px;
    max-height: calc(100vh - 274px);
    overflow: auto;
  }

  .session-empty {
    padding: 24px 12px;
    color: var(--text-muted);
    text-align: center;
  }

  .session-item {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 12px;
    background: var(--surface-1);
    cursor: pointer;
    text-align: left;
    transition:
      border-color 0.12s ease,
      background-color 0.12s ease;
  }

  .session-item:hover {
    border-color: var(--line-strong);
    background: var(--surface-2);
  }

  .session-item.active {
    border-color: var(--accent-primary);
    background: var(--surface-3);
  }

  .session-item-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .session-item-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.3;
  }

  .session-item-meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .session-item-path {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-muted);
    word-break: break-all;
  }

  .terminal-panel {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .session-title {
    font-size: 18px;
    font-weight: 600;
  }

  .session-meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--text-secondary);
    font-family: var(--font-mono);
  }

  .terminal-stage {
    flex: 1;
    min-height: 0;
    padding: 12px;
  }

  .terminal-shell {
    height: 100%;
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--terminal-bg);
    overflow: hidden;
  }

  .terminal-host {
    width: 100%;
    height: clamp(360px, calc(100vh - 316px), 74vh);
    min-height: 320px;
    max-height: 74vh;
  }

  .terminal-input-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 12px;
    padding: 0 12px 12px;
  }

  .terminal-input-row .input {
    font-family: var(--font-mono);
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
    min-height: 24px;
    padding: 0 8px;
    border: 1px solid rgb(var(--accent-warning-rgb) / 0.28);
    border-radius: var(--radius-pill);
    background: rgb(var(--accent-warning-rgb) / 0.08);
    color: var(--accent-warning);
    font-size: 12px;
    font-weight: 600;
  }

  .plain-terminal-output {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
    border: 1px solid var(--line);
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

  .mobile-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .mobile-toolbar .theme-toggle {
    width: 100%;
  }

  .mobile-toolbar .btn {
    flex: 1 1 0;
  }

  .mobile-session-list {
    display: grid;
    gap: 8px;
  }

  .terminal-mobile-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-bottom: 1px solid var(--line);
    background: var(--surface-2);
  }

  .terminal-mobile-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
  }

  .mobile-action-group {
    padding: 0 12px 12px;
    background: var(--surface-1);
    border-bottom: 1px solid var(--line);
  }

  .mobile-terminal-stage {
    padding: 12px;
  }

  .mobile-input-row {
    padding-bottom: 12px;
  }

  .mobile-view .terminal-keypad {
    padding-top: 0;
  }

  .xterm,
  .xterm-screen,
  .xterm-viewport {
    height: 100% !important;
  }

  .xterm-viewport {
    overflow-y: auto !important;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }

  #terminalHost,
  #mobileTerminalHost {
    overscroll-behavior: contain;
  }

  @media (max-width: 900px) {
    .page-shell {
      width: 100%;
      padding: 0 0 16px;
    }

    .topbar {
      margin: 0 12px;
    }

    .workspace {
      display: none;
    }

    .mobile-view {
      padding: 12px;
      display: none;
    }

    body.view-sessions .mobile-view.sessions-view {
      display: block;
    }

    body.view-terminal .mobile-view.terminal-view {
      display: flex;
      flex-direction: column;
      min-height: calc(100vh - 144px);
    }

    .mobile-view.terminal-view {
      gap: 0;
    }

    .sessions-view .input {
      min-height: 40px;
    }

    .mobile-session-list .session-item {
      padding: 14px;
    }

    .terminal-host {
      height: calc(100vh - 320px);
      min-height: 300px;
      max-height: none;
    }
  }

  @media (max-width: 640px) {
    .auth-shell {
      padding: 12px;
    }

    .auth-card {
      padding: 20px 16px;
    }

    .auth-utility-row {
      align-items: flex-start;
      flex-direction: column;
    }

    .topbar {
      display: grid;
      gap: 12px;
      margin: 0 10px;
      padding: 14px;
    }

    .topbar-status {
      justify-content: flex-start;
    }

    .page-title {
      font-size: 24px;
    }

    .theme-toggle {
      width: 100%;
    }

    .terminal-input-row,
    .mobile-input-row {
      grid-template-columns: 1fr;
    }

    .terminal-key-btn {
      flex: 1 1 calc(25% - 8px);
      min-width: calc(25% - 8px);
      padding: 0 8px;
    }

    .terminal-host {
      height: calc(100vh - 352px);
      min-height: 260px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .session-item,
    .terminal-shell {
      transition: none;
    }
  }
`
