export const tokens = `
  :root {
    color-scheme: light;

    --font-body: "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    --font-display: "Segoe UI Variable Display", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    --font-mono: "Cascadia Code", "Consolas", "Courier New", monospace;

    --accent-primary-rgb: 0 95 184;
    --accent-success-rgb: 16 124 16;
    --accent-warning-rgb: 157 116 0;
    --accent-danger-rgb: 196 43 28;

    --page-background: #f3f3f3;

    --surface-0: #ffffff;
    --surface-1: #ffffff;
    --surface-2: #f8f8f8;
    --surface-3: #ededed;
    --surface-strong: #1f1f1f;
    --surface-muted: #f3f3f3;

    --line: #d4d4d4;
    --line-strong: #b8b8b8;

    --text-primary: #1f1f1f;
    --text-secondary: #444444;
    --text-muted: #616161;
    --text-inverse: #ffffff;

    --accent-primary: #005fb8;
    --accent-primary-strong: #004c94;
    --accent-primary-soft: rgb(var(--accent-primary-rgb) / 0.14);
    --accent-success: #107c10;
    --accent-warning: #9d7400;
    --accent-danger: #c42b1c;

    --terminal-bg: #ffffff;
    --terminal-fg: #1f1f1f;
    --terminal-cursor: #005fb8;
    --terminal-selection: rgb(var(--accent-primary-rgb) / 0.18);

    --shadow-sm: none;
    --shadow-lg: none;

    --radius-sm: 0;
    --radius-md: 0;
    --radius-lg: 0;
    --radius-pill: 0;

    --space-2xs: 4px;
    --space-xs: 8px;
    --space-sm: 12px;
    --space-md: 16px;
    --space-lg: 24px;
    --space-xl: 32px;

    --touch-target: 44px;
  }

  :root[data-theme='dark'] {
    color-scheme: dark;

    --accent-primary-rgb: 96 205 255;
    --accent-success-rgb: 108 203 95;
    --accent-warning-rgb: 255 181 79;
    --accent-danger-rgb: 255 153 164;

    --page-background: #202020;

    --surface-0: #2b2b2b;
    --surface-1: #2b2b2b;
    --surface-2: #1f1f1f;
    --surface-3: #343434;
    --surface-strong: #f3f3f3;
    --surface-muted: #202020;

    --line: #3f3f46;
    --line-strong: #5c5c5c;

    --text-primary: #f3f3f3;
    --text-secondary: #d0d0d0;
    --text-muted: #a0a0a0;
    --text-inverse: #1f1f1f;

    --accent-primary: #60cdff;
    --accent-primary-strong: #86d8ff;
    --accent-primary-soft: rgb(var(--accent-primary-rgb) / 0.18);
    --accent-success: #6ccb5f;
    --accent-warning: #ffb54f;
    --accent-danger: #ff99a4;

    --terminal-bg: #0c0c0c;
    --terminal-fg: #f3f3f3;
    --terminal-cursor: #60cdff;
    --terminal-selection: rgb(var(--accent-primary-rgb) / 0.24);

    --shadow-sm: none;
    --shadow-lg: none;
  }
`
