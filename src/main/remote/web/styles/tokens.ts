export const tokens = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');

  :root {
    color-scheme: light;

    --font-body: 'DM Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
    --font-display: 'DM Sans', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace;

    --page-background: #f5f5f7;

    --surface-0: #ffffff;
    --surface-1: #ffffff;
    --surface-2: #fafafa;
    --surface-3: #f0f0f2;
    --surface-strong: #1d1d1f;
    --surface-muted: #f5f5f7;

    --line: rgba(0, 0, 0, 0.08);
    --line-strong: rgba(0, 0, 0, 0.15);

    --text-primary: #1d1d1f;
    --text-secondary: #424245;
    --text-muted: #86868b;
    --text-inverse: #ffffff;

    --accent-primary: #0071e3;
    --accent-primary-hover: #0077ed;
    --accent-primary-active: #006edb;
    --accent-primary-soft: rgba(0, 113, 227, 0.1);
    --accent-success: #34c759;
    --accent-success-soft: rgba(52, 199, 89, 0.12);
    --accent-warning: #ff9500;
    --accent-warning-soft: rgba(255, 149, 0, 0.12);
    --accent-danger: #ff3b30;
    --accent-danger-soft: rgba(255, 59, 48, 0.12);

    --terminal-bg: #1e1e1e;
    --terminal-fg: #d4d4d4;
    --terminal-cursor: #0071e3;
    --terminal-selection: rgba(0, 113, 227, 0.3);

    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.06);
    --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.08);
    --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.12);

    --radius-xs: 6px;
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 20px;
    --radius-pill: 9999px;

    --space-2xs: 4px;
    --space-xs: 8px;
    --space-sm: 12px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;
    --space-2xl: 48px;

    --touch-target: 44px;

    --transition-fast: 150ms ease;
    --transition-normal: 200ms ease;
    --transition-slow: 300ms ease;
  }

  :root[data-theme='dark'] {
    color-scheme: dark;

    --page-background: #000000;

    --surface-0: #1c1c1e;
    --surface-1: #1c1c1e;
    --surface-2: #2c2c2e;
    --surface-3: #3a3a3c;
    --surface-strong: #f5f5f7;
    --surface-muted: #000000;

    --line: rgba(255, 255, 255, 0.1);
    --line-strong: rgba(255, 255, 255, 0.18);

    --text-primary: #f5f5f7;
    --text-secondary: #a1a1a6;
    --text-muted: #6e6e73;
    --text-inverse: #1d1d1f;

    --accent-primary: #0a84ff;
    --accent-primary-hover: #409cff;
    --accent-primary-active: #0071e3;
    --accent-primary-soft: rgba(10, 132, 255, 0.15);
    --accent-success: #30d158;
    --accent-success-soft: rgba(48, 209, 88, 0.15);
    --accent-warning: #ff9f0a;
    --accent-warning-soft: rgba(255, 159, 10, 0.15);
    --accent-danger: #ff453a;
    --accent-danger-soft: rgba(255, 69, 58, 0.15);

    --terminal-bg: #0d0d0d;
    --terminal-fg: #f5f5f7;
    --terminal-cursor: #0a84ff;
    --terminal-selection: rgba(10, 132, 255, 0.35);

    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.2);
    --shadow-sm: 0 2px 8px rgba(0, 0, 0, 0.25);
    --shadow-md: 0 4px 16px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
`