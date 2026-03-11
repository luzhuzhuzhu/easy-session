import { tokens } from './styles/tokens'
import { reset } from './styles/reset'
import { components } from './styles/components'
import { layouts } from './styles/layouts'
import { loginTemplate } from './templates/login'
import { sessionsTemplate } from './templates/sessions'
import { authScript } from './scripts/auth'
import { sessionsScript } from './scripts/sessions'
import { terminalScript } from './scripts/terminal'

const allStyles = [tokens, reset, components, layouts].join('\n')
const themeInitScript = `
  (function () {
    try {
      const storedTheme = localStorage.getItem('easy_remote_theme');
      const theme =
        storedTheme === 'light' || storedTheme === 'dark'
          ? storedTheme
          : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
      document.documentElement.dataset.theme = theme;
    } catch (_error) {
      document.documentElement.dataset.theme = 'light';
    }
  })();
`

export function renderLoginPage(defaultBaseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>EasySession Remote - 登录</title>
  <script>${themeInitScript}</script>
  <style>${allStyles}</style>
</head>
<body>
  ${loginTemplate(defaultBaseUrl)}
  <script>
    ${authScript}

    applyStoredTheme();
    bindThemeToggles();

    const defaultBaseUrl = ${JSON.stringify(defaultBaseUrl)};
    const guessedBaseUrl = (function () {
      try {
        return new URL('.', location.href).toString().replace(/\\/$/, '');
      } catch (_error) {
        return defaultBaseUrl;
      }
    })();
    const auth = loadAuth();
    const baseUrlInput = document.getElementById('baseUrl');
    const tokenInput = document.getElementById('token');
    const rememberInput = document.getElementById('rememberDevice');
    const messageEl = document.getElementById('loginMsg');

    baseUrlInput.value = auth.baseUrl || guessedBaseUrl;
    tokenInput.value = auth.token;
    rememberInput.checked = auth.remember;

    document.getElementById('loginForm').addEventListener('submit', function (event) {
      event.preventDefault();

      const baseUrl = baseUrlInput.value.trim().replace(/\\/$/, '');
      const token = tokenInput.value.trim();
      const remember = rememberInput.checked;

      if (!baseUrl || !token) {
        messageEl.hidden = false;
        messageEl.dataset.tone = 'error';
        messageEl.textContent = '请填写完整的远程地址和访问令牌。';
        return;
      }

      saveAuth(baseUrl, token, remember);
      location.href = 'sessions';
    });
  </script>
</body>
</html>`
}

export function renderSessionsPage(defaultBaseUrl: string, passthroughOnly: boolean): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <title>EasySession Remote - 会话</title>
  <link rel="stylesheet" href="./remote-assets/xterm.css" />
  <script>${themeInitScript}</script>
  <style>${allStyles}</style>
</head>
<body>
  ${sessionsTemplate(passthroughOnly)}
  <script src="./socket.io/socket.io.js"></script>
  <script src="./remote-assets/xterm.js"></script>
  <script src="./remote-assets/xterm-addon-fit.js"></script>
  <script>
    ${authScript}
    ${sessionsScript}
    ${terminalScript}

    applyStoredTheme();
    bindThemeToggles();

    const auth = loadAuth();
    if (!auth.token) {
      location.href = 'login';
    } else {
      bootstrapRemoteWeb({
        defaultBaseUrl: ${JSON.stringify(defaultBaseUrl)},
        passthroughOnly: ${passthroughOnly ? 'true' : 'false'},
        auth
      });
    }
  </script>
</body>
</html>`
}
