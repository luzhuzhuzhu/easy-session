export const reset = `
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html,
  body {
    height: 100%;
  }

  [hidden] {
    display: none !important;
  }

  body {
    min-height: 100%;
    font-family: var(--font-body);
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--page-background);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
    color: inherit;
  }

  button {
    appearance: none;
    background: none;
    border: 0;
    cursor: pointer;
  }

  input,
  textarea {
    min-width: 0;
  }

  a {
    color: inherit;
  }

  ::selection {
    background: var(--terminal-selection);
  }
`
