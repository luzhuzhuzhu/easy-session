export const components = `
  .card {
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    box-shadow: var(--shadow-sm);
    transition:
      border-color 0.12s ease,
      background-color 0.12s ease,
      color 0.12s ease;
  }

  .eyebrow {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: clamp(26px, 3vw, 32px);
    font-weight: 600;
    line-height: 1.2;
  }

  .page-copy {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.5;
    max-width: 68ch;
  }

  .helper-text {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.5;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .field-label {
    font-size: 12px;
    color: var(--text-secondary);
    font-weight: 600;
  }

  .input {
    width: 100%;
    min-height: var(--touch-target);
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-primary);
    transition:
      border-color 0.12s ease,
      background-color 0.12s ease,
      color 0.12s ease;
  }

  .input::placeholder {
    color: var(--text-muted);
  }

  .input:focus {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
    border-color: var(--accent-primary);
    background: var(--surface-1);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--touch-target);
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    font-weight: 400;
    transition:
      border-color 0.12s ease,
      background-color 0.12s ease,
      color 0.12s ease,
      opacity 0.12s ease;
  }

  .btn:hover {
    border-color: var(--line-strong);
    background: var(--surface-3);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--accent-primary);
    border-color: var(--accent-primary);
    color: var(--text-inverse);
  }

  .btn-primary:hover {
    background: var(--accent-primary-strong);
    border-color: var(--accent-primary-strong);
  }

  .btn-secondary {
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .btn-danger {
    background: rgb(var(--accent-danger-rgb) / 0.12);
    border-color: rgb(var(--accent-danger-rgb) / 0.28);
    color: var(--accent-danger);
  }

  .btn-danger:hover {
    background: rgb(var(--accent-danger-rgb) / 0.18);
  }

  .ghost-btn {
    min-width: 96px;
  }

  .icon-btn {
    min-width: var(--touch-target);
    padding: 0 12px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-warning);
  }

  .status-dot.ok {
    background: var(--accent-success);
  }

  .status-dot.err {
    background: var(--accent-danger);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius-pill);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .badge-success {
    background: rgb(var(--accent-success-rgb) / 0.12);
    border-color: rgb(var(--accent-success-rgb) / 0.22);
    color: var(--accent-success);
  }

  .badge-warning {
    background: rgb(var(--accent-warning-rgb) / 0.12);
    border-color: rgb(var(--accent-warning-rgb) / 0.22);
    color: var(--accent-warning);
  }

  .badge-danger {
    background: rgb(var(--accent-danger-rgb) / 0.12);
    border-color: rgb(var(--accent-danger-rgb) / 0.22);
    color: var(--accent-danger);
  }

  .notice-banner,
  .panel-notice,
  .login-message {
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    font-size: 13px;
    line-height: 1.5;
    background: var(--surface-2);
    color: var(--text-secondary);
  }

  .notice-banner[data-tone='error'],
  .panel-notice[data-tone='error'],
  .login-message[data-tone='error'] {
    border-color: rgb(var(--accent-danger-rgb) / 0.32);
    color: var(--accent-danger);
    background: rgb(var(--accent-danger-rgb) / 0.08);
  }

  .notice-banner[data-tone='ok'],
  .panel-notice[data-tone='ok'],
  .login-message[data-tone='ok'] {
    border-color: rgb(var(--accent-success-rgb) / 0.3);
    color: var(--accent-success);
    background: rgb(var(--accent-success-rgb) / 0.08);
  }

  .notice-banner[data-tone='warning'],
  .panel-notice[data-tone='warning'],
  .login-message[data-tone='warning'] {
    border-color: rgb(var(--accent-warning-rgb) / 0.3);
    color: var(--accent-warning);
    background: rgb(var(--accent-warning-rgb) / 0.08);
  }

  .session-action-group {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    flex-wrap: wrap;
  }

  .session-action-group:empty {
    display: none;
  }

  .session-action-btn {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .session-action-btn:hover {
    border-color: var(--line-strong);
    background: var(--surface-3);
  }

  .session-action-btn.warn {
    border-color: rgb(var(--accent-warning-rgb) / 0.28);
    color: var(--accent-warning);
    background: rgb(var(--accent-warning-rgb) / 0.1);
  }

  .session-action-btn.danger {
    border-color: rgb(var(--accent-danger-rgb) / 0.28);
    color: var(--accent-danger);
    background: rgb(var(--accent-danger-rgb) / 0.1);
  }

  .terminal-keypad {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 0 12px 12px;
  }

  .terminal-key-btn {
    min-height: 34px;
    min-width: 44px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-primary);
    white-space: nowrap;
  }

  .terminal-key-btn:hover {
    border-color: var(--line-strong);
    background: var(--surface-3);
  }

  .terminal-key-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--touch-target);
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-primary);
  }

  .theme-toggle:hover {
    border-color: var(--line-strong);
    background: var(--surface-3);
  }

  .theme-toggle:focus-visible,
  .btn:focus-visible,
  .session-action-btn:focus-visible,
  .terminal-key-btn:focus-visible,
  .session-item:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
  }

  .theme-toggle-indicator,
  .theme-toggle-caption,
  .theme-toggle-value {
    display: none;
  }

  .theme-toggle-action {
    font-size: 13px;
    color: inherit;
    white-space: nowrap;
  }

  .theme-toggle.compact {
    min-width: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .input,
    .btn,
    .session-action-btn,
    .terminal-key-btn,
    .theme-toggle {
      transition: none;
    }
  }
`
