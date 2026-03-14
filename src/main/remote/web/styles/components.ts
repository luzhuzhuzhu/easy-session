export const components = `
  .card {
    border: 1px solid var(--line);
    border-radius: var(--radius-lg);
    background: var(--surface-1);
    box-shadow: var(--shadow-sm);
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-normal);
  }

  .eyebrow {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
  }

  .page-title {
    font-family: var(--font-display);
    font-size: clamp(24px, 5vw, 32px);
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .page-copy {
    color: var(--text-secondary);
    font-size: 14px;
    line-height: 1.6;
    max-width: 60ch;
  }

  .helper-text {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .field-label {
    font-size: 13px;
    color: var(--text-secondary);
    font-weight: 500;
  }

  .input {
    width: 100%;
    min-height: var(--touch-target);
    padding: 0 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-primary);
    font-size: 15px;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .input::placeholder {
    color: var(--text-muted);
  }

  .input:focus {
    outline: none;
    border-color: var(--accent-primary);
    background: var(--surface-1);
    box-shadow: 0 0 0 3px var(--accent-primary-soft);
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--touch-target);
    padding: 0 18px;
    border: none;
    border-radius: var(--radius-md);
    font-weight: 500;
    font-size: 15px;
    transition:
      background-color var(--transition-fast),
      transform var(--transition-fast),
      opacity var(--transition-fast);
    cursor: pointer;
  }

  .btn:active {
    transform: scale(0.97);
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
  }

  .btn-primary {
    background: var(--accent-primary);
    color: var(--text-inverse);
  }

  .btn-primary:hover {
    background: var(--accent-primary-hover);
  }

  .btn-primary:active {
    background: var(--accent-primary-active);
  }

  .btn-secondary {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background: var(--line);
  }

  .btn-danger {
    background: var(--accent-danger-soft);
    color: var(--accent-danger);
  }

  .btn-danger:hover {
    background: var(--accent-danger);
    color: var(--text-inverse);
  }

  .ghost-btn {
    min-width: auto;
    padding: 0 14px;
    background: transparent;
    border: 1px solid var(--line);
  }

  .ghost-btn:hover {
    background: var(--surface-3);
  }

.icon-btn {
    min-width: var(--touch-target);
    padding: 0;
    border-radius: var(--radius-md);
  }

  .btn-sm {
    min-height: 32px;
    min-width: 32px;
    padding: 0 8px;
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-secondary);
    font-size: 13px;
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-warning);
    flex-shrink: 0;
  }

  .status-dot.ok {
    background: var(--accent-success);
    box-shadow: 0 0 8px var(--accent-success);
  }

  .status-dot.err {
    background: var(--accent-danger);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 20px;
    min-height: 20px;
    padding: 0 4px;
    border-radius: var(--radius-xs);
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .badge-success {
    background: var(--accent-success-soft);
    color: var(--accent-success);
  }

  .badge-warning {
    background: var(--accent-warning-soft);
    color: var(--accent-warning);
  }

  .badge-danger {
    background: var(--accent-danger-soft);
    color: var(--accent-danger);
  }

  .notice-banner,
  .panel-notice,
  .login-message {
    border-radius: var(--radius-md);
    padding: 12px 14px;
    font-size: 14px;
    line-height: 1.5;
    background: var(--surface-2);
    color: var(--text-secondary);
  }

  .notice-banner[data-tone='error'],
  .panel-notice[data-tone='error'],
  .login-message[data-tone='error'] {
    color: var(--accent-danger);
    background: var(--accent-danger-soft);
  }

  .notice-banner[data-tone='ok'],
  .panel-notice[data-tone='ok'],
  .login-message[data-tone='ok'] {
    color: var(--accent-success);
    background: var(--accent-success-soft);
  }

  .notice-banner[data-tone='warning'],
  .panel-notice[data-tone='warning'],
  .login-message[data-tone='warning'] {
    color: var(--accent-warning);
    background: var(--accent-warning-soft);
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
    min-height: 36px;
    padding: 0 14px;
    border: none;
    border-radius: var(--radius-md);
    background: var(--surface-3);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    transition: background-color var(--transition-fast);
  }

  .session-action-btn:hover {
    background: var(--line);
  }

  .session-action-btn.warn {
    background: var(--accent-warning-soft);
    color: var(--accent-warning);
  }

  .session-action-btn.warn:hover {
    background: var(--accent-warning);
    color: var(--text-inverse);
  }

  .session-action-btn.danger {
    background: var(--accent-danger-soft);
    color: var(--accent-danger);
  }

  .session-action-btn.danger:hover {
    background: var(--accent-danger);
    color: var(--text-inverse);
  }

  .terminal-keypad {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
    gap: 8px;
    padding: 0 12px 12px;
  }

  .terminal-key-btn {
    min-height: 44px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 500;
    transition:
      background-color var(--transition-fast),
      transform var(--transition-fast);
  }

  .terminal-key-btn:hover {
    background: var(--line);
  }

  .terminal-key-btn:active {
    transform: scale(0.95);
  }

  .terminal-key-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--touch-target);
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-primary);
    font-size: 14px;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  .theme-toggle:hover {
    background: var(--surface-3);
    border-color: var(--line-strong);
  }

  .theme-toggle:focus-visible,
  .btn:focus-visible,
  .session-action-btn:focus-visible,
  .terminal-key-btn:focus-visible,
  .session-item:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-primary-soft);
  }

  .theme-toggle-indicator,
  .theme-toggle-caption,
  .theme-toggle-value {
    display: none;
  }

  .theme-toggle-action {
    font-size: 14px;
    color: inherit;
    white-space: nowrap;
  }

  .theme-toggle.compact {
    min-width: 0;
    padding: 0 12px;
  }

  .toast-container {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 12px 16px;
    border-radius: var(--radius-md);
    background: var(--surface-1);
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    pointer-events: auto;
    animation: toast-in 0.2s ease, toast-out 0.2s ease 2.8s forwards;
    max-width: 320px;
  }

  .toast.success {
    background: var(--accent-success);
    color: #fff;
  }

  .toast.error {
    background: var(--accent-danger);
    color: #fff;
  }

  .toast.warning {
    background: var(--accent-warning);
    color: #fff;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes toast-out {
    from {
      opacity: 1;
      transform: translateX(0);
    }
    to {
      opacity: 0;
      transform: translateX(100%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .input,
    .btn,
    .session-action-btn,
    .terminal-key-btn,
    .theme-toggle,
    .session-item {
      transition: none;
    }
  }
`