export const authScript = `
  const keyBase = 'easy_remote_base_url';
  const keyToken = 'easy_remote_token';
  const keyRemember = 'easy_remote_remember';
  const keyTheme = 'easy_remote_theme';
  const keyObfKey = 'easy_remote_obf_key';
  let themeMediaQuery = null;

  // SEC-9：记住设备时 token 不再明文落 localStorage——生成一枚设备随机密钥
  // （sessionStorage，不持久）对 token 做异或混淆后存储。攻击者仅拿到 localStorage
  // 得到的是混淆串，还需同机 sessionStorage 密钥才能还原；配合 nonce-CSP 构成纵深。
  function getOrCreateObfKey() {
    let k = sessionStorage.getItem(keyObfKey) || '';
    if (!k) {
      const bytes = new Uint8Array(32);
      (window.crypto || window.msCrypto).getRandomValues(bytes);
      k = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      sessionStorage.setItem(keyObfKey, k);
    }
    return k;
  }

  function obfuscateToken(token, key) {
    let out = '';
    for (let i = 0; i < token.length; i += 1) {
      const kc = parseInt(key.slice((i * 2) % key.length, (i * 2) % key.length + 2), 16) || 0;
      out += String.fromCharCode(token.charCodeAt(i) ^ kc);
    }
    return out;
  }

  function toAbsoluteRemoteUrl(rawBaseUrl) {
    if (/^[a-z][a-z\\d+.-]*:\\/\\//i.test(rawBaseUrl)) return rawBaseUrl;
    if (rawBaseUrl.startsWith('//')) return location.protocol + rawBaseUrl;
    if (/^(?:localhost|(?:\\d{1,3}\\.){3}\\d{1,3}|\\[[^\\]]+\\]|[a-z0-9.-]+):\\d+(?:\\/.*)?$/i.test(rawBaseUrl)) {
      return location.protocol + '//' + rawBaseUrl;
    }
    return new URL(rawBaseUrl, location.origin).toString();
  }

  function normalizeRemoteBaseUrl(baseUrl) {
    const raw = typeof baseUrl === 'string' ? baseUrl.trim().replace(/\\/$/, '') : '';
    if (!raw) return '';

    try {
      const url = new URL(toAbsoluteRemoteUrl(raw), location.origin);

      if (url.hostname === '0.0.0.0' || url.hostname === '::' || url.hostname === '[::]') {
        url.protocol = location.protocol;
        url.hostname = location.hostname || '127.0.0.1';
        if (!url.port && location.port) {
          url.port = location.port;
        }
      }

      url.hash = '';
      url.search = '';

      if (/^\\/(?:login|sessions)\\/?$/i.test(url.pathname)) {
        url.pathname = '/';
      }

      return url.origin + (url.pathname && url.pathname !== '/' ? url.pathname.replace(/\\/$/, '') : '');
    } catch {
      return raw.replace(/\\/(?:login|sessions)\\/?$/i, '').replace(/\\/$/, '');
    }
  }

  function loadAuth() {
    // 会话内明文优先；否则尝试还原「记住设备」的混淆 token
    let token = sessionStorage.getItem(keyToken) || '';
    const baseUrl = normalizeRemoteBaseUrl(sessionStorage.getItem(keyBase) || localStorage.getItem(keyBase) || '');
    const remember = localStorage.getItem(keyRemember) === '1';
    if (!token && remember) {
      const stored = localStorage.getItem(keyToken) || '';
      if (stored) {
        try {
          token = obfuscateToken(stored, getOrCreateObfKey());
        } catch (_error) {
          token = '';
        }
        sessionStorage.setItem(keyToken, token);
      }
    }
    return { baseUrl, token, remember };
  }

  function saveAuth(baseUrl, token, remember) {
    const base = normalizeRemoteBaseUrl(baseUrl);

    if (remember) {
      localStorage.setItem(keyRemember, '1');
      localStorage.setItem(keyBase, base);
      // SEC-9：混淆后再落盘（密钥留在 sessionStorage，不随存储外泄）
      localStorage.setItem(keyToken, obfuscateToken(token, getOrCreateObfKey()));
      sessionStorage.setItem(keyToken, token);
      sessionStorage.removeItem(keyBase);
      return;
    }

    sessionStorage.setItem(keyBase, base);
    sessionStorage.setItem(keyToken, token);
    localStorage.removeItem(keyRemember);
    localStorage.removeItem(keyBase);
    localStorage.removeItem(keyToken);
  }

  function clearAuth() {
    sessionStorage.removeItem(keyBase);
    sessionStorage.removeItem(keyToken);
    localStorage.removeItem(keyBase);
    localStorage.removeItem(keyToken);
    localStorage.removeItem(keyRemember);
  }

  function loadThemePreference() {
    const theme = localStorage.getItem(keyTheme) || '';
    return theme === 'light' || theme === 'dark' ? theme : '';
  }

  function resolveThemePreference(theme) {
    if (theme === 'light' || theme === 'dark') return theme;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }

  function getAppliedTheme() {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function formatThemeText(theme) {
    return theme === 'dark' ? '深色模式' : '浅色模式';
  }

  function formatThemeAction(theme) {
    return theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
  }

  function syncThemeToggleButtons(theme) {
    const appliedTheme = resolveThemePreference(theme || getAppliedTheme());
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      button.dataset.theme = appliedTheme;
      button.setAttribute('aria-pressed', String(appliedTheme === 'dark'));
      button.setAttribute('aria-label', formatThemeAction(appliedTheme));

      const label = button.querySelector('[data-theme-label]');
      if (label) label.textContent = formatThemeText(appliedTheme);

      const action = button.querySelector('[data-theme-action]');
      if (action) action.textContent = formatThemeAction(appliedTheme);
    });
  }

  function applyThemePreference(theme, options) {
    const resolvedTheme = resolveThemePreference(theme);
    document.documentElement.dataset.theme = resolvedTheme;
    syncThemeToggleButtons(resolvedTheme);

    if (!options || options.persist !== false) {
      localStorage.setItem(keyTheme, resolvedTheme);
    }

    if (!options || options.notify !== false) {
      document.dispatchEvent(
        new CustomEvent('easy:theme-change', {
          detail: { theme: resolvedTheme }
        })
      );
    }

    return resolvedTheme;
  }

  function applyStoredTheme() {
    const storedTheme = loadThemePreference();
    return applyThemePreference(storedTheme, {
      persist: !!storedTheme,
      notify: false
    });
  }

  function bindThemeToggles() {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) {
      if (button.dataset.themeBound === '1') return;
      button.dataset.themeBound = '1';
      button.addEventListener('click', function () {
        const nextTheme = getAppliedTheme() === 'dark' ? 'light' : 'dark';
        applyThemePreference(nextTheme);
      });
    });

    syncThemeToggleButtons(getAppliedTheme());

    if (!window.matchMedia || themeMediaQuery) return;

    themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleThemeMediaChange = function () {
      if (loadThemePreference()) return;
      applyThemePreference('', { persist: false });
    };

    if (typeof themeMediaQuery.addEventListener === 'function') {
      themeMediaQuery.addEventListener('change', handleThemeMediaChange);
    } else if (typeof themeMediaQuery.addListener === 'function') {
      themeMediaQuery.addListener(handleThemeMediaChange);
    }
  }
`
