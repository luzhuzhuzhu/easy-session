import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { renderLoginPage, renderSessionsPage } from '../src/main/remote/web'

describe('remote web templates', () => {
  it('renders the modular login and sessions shells', () => {
    const loginHtml = renderLoginPage('http://127.0.0.1:18765')
    const sessionsHtml = renderSessionsPage('http://127.0.0.1:18765', true)

    expect(loginHtml).toContain('<h1 class="page-title">浏览器远程入口</h1>')
    expect(loginHtml).toContain('data-theme-toggle')
    expect(loginHtml).toContain('id="loginForm"')
    expect(sessionsHtml).toContain('<h1 class="page-title">远程会话</h1>')
    expect(sessionsHtml).toContain('id="desktopSessionList"')
    expect(sessionsHtml).toContain('id="mobileSessionList"')
    expect(sessionsHtml).toContain('id="terminalHost"')
    expect(sessionsHtml).toContain('id="mobileTerminalHost"')
    expect(sessionsHtml).toContain('data-theme-toggle')
    expect(sessionsHtml).toContain('src="./socket.io/socket.io.js"')
    expect(sessionsHtml).toContain('href="./remote-assets/xterm.css"')
  })

  it('stores web auth in sessionStorage by default and only persists when remembering the device', () => {
    const loginHtml = renderLoginPage('http://127.0.0.1:18765')

    expect(loginHtml).toContain('id="rememberDevice"')
    expect(loginHtml).toContain('默认只保存在当前标签页')
    expect(loginHtml).toContain("sessionStorage.setItem(keyToken, token);")
    expect(loginHtml).toContain("sessionStorage.setItem(keyBase, base);")
    expect(loginHtml).toContain("localStorage.setItem(keyRemember, '1');")
    expect(loginHtml).toContain("localStorage.removeItem(keyToken);")
    expect(loginHtml).toContain("const keyTheme = 'easy_remote_theme';")
    expect(loginHtml).toContain('function normalizeRemoteBaseUrl(baseUrl)')
    expect(loginHtml).toContain('function toAbsoluteRemoteUrl(rawBaseUrl)')
    expect(loginHtml).toContain("url.hostname = location.hostname || '127.0.0.1';")
    expect(loginHtml).toContain('function bindThemeToggles()')
  })

  it('normalizes login and sessions page urls back to the remote base url', () => {
    const loginHtml = renderLoginPage('http://127.0.0.1:18765')

    expect(loginHtml).toContain("return new URL('.', location.href).toString().replace(/\\/$/, '');")
    expect(loginHtml).toContain("if (/^\\/(?:login|sessions)\\/?$/i.test(url.pathname)) {")
    expect(loginHtml).toContain("return url.origin + (url.pathname && url.pathname !== '/' ? url.pathname.replace(/\\/$/, '') : '');")
    expect(loginHtml).toContain("location.href = 'sessions';")
  })

  it('includes responsive remount, auto refresh and socket fallback handling', () => {
    const html = renderSessionsPage('http://127.0.0.1:18765', true)

    expect(html).toContain("MOBILE_BREAKPOINT_QUERY = '(max-width: 900px)'")
    expect(html).toContain('LIST_AUTO_REFRESH_INTERVAL_MS = 15000')
    expect(html).toContain("socket.on('system:idle-timeout'")
    expect(html).toContain("transports: ['polling', 'websocket']")
    expect(html).toContain('tryAllTransports: true')
    expect(html).toContain('function getCurrentPageBaseUrl()')
    expect(html).toContain('function buildBaseUrlCandidates(preferredBaseUrl)')
    expect(html).toContain('function switchToView(nextView)')
    expect(html).toContain('function updateInputAvailability()')
    expect(html).toContain('id="globalNotice"')
    expect(html).toContain("document.documentElement.dataset.theme = theme;")
    expect(html).toContain('applyStoredTheme();')
    expect(html).toContain('bindThemeToggles();')
    expect(html).toContain("location.href = 'login';")
  })

  it('streams terminal input as raw writes and exposes function-key controls in the new web UI', () => {
    const html = renderSessionsPage('http://127.0.0.1:18765', true)

    expect(html).toContain('placeholder="实时输入：键入即发送，回车执行"')
    expect(html).toContain('data-terminal-key="arrow-up"')
    expect(html).toContain('data-terminal-key="arrow-down"')
    expect(html).toContain('data-terminal-key="escape"')
    expect(html).toContain('data-terminal-key="ctrl-c"')
    expect(html).toContain('data-terminal-key="ctrl-d"')
    expect(html).toContain('function bindTerminalKeyButtons()')
    expect(html).toContain('function handleLiveInputBeforeInput(event, inputEl)')
    expect(html).toContain('function handleLiveInputKeydown(event, inputEl)')
    expect(html).toContain('function handleLiveInputPaste(event, inputEl)')
    expect(html).toContain('function canWriteToSession(session)')
    expect(html).toContain("state.socket.emit('session:write', {")
    expect(html).toContain('data: raw')
    expect(html).not.toContain("state.socket.emit('session:input', {")
  })

  it('keeps lifecycle controls available when remote control is enabled', () => {
    const html = renderSessionsPage('http://127.0.0.1:18765', false)

    expect(html).toContain('id="terminalActions"')
    expect(html).toContain('id="mobileSessionActions"')
    expect(html).toContain("await api('/api/capabilities')")
    expect(html).toContain("await api('/api/sessions/' + session.id + '/start', { method: 'POST' });")
    expect(html).toContain("await api('/api/sessions/' + session.id + '/pause', { method: 'POST' });")
    expect(html).toContain("await api('/api/sessions/' + session.id + '/restart', { method: 'POST' });")
    expect(html).toContain("await api('/api/sessions/' + session.id, { method: 'DELETE' });")
  })

  it('falls back to a plain-text terminal when xterm assets are unavailable', () => {
    const html = renderSessionsPage('http://127.0.0.1:18765', true)

    expect(html).toContain("const token = sessionStorage.getItem(keyToken) || localStorage.getItem(keyToken) || '';")
    expect(html).toContain('function createPlainTerminal(host, reason)')
    expect(html).toContain('function getTerminalTheme()')
    expect(html).toContain("document.addEventListener('easy:theme-change'")
    expect(html).toContain('state.term.options = {')
    expect(html).not.toContain('...(state.term.options || {}),')
    expect(html).toContain('纯文本兼容终端')
    expect(html).toContain('xterm 资源加载失败，已切换到纯文本兼容模式。')
    expect(html).toContain('MAX_PLAIN_BUFFER_CHARS = 120000')
  })

  it('renders an inline sessions script that parses without syntax errors', () => {
    const html = renderSessionsPage('http://127.0.0.1:18765', true)
    const matches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    const inlineScript = matches.at(-1)?.[1]

    expect(inlineScript).toBeTruthy()
    expect(() => new vm.Script(inlineScript || '')).not.toThrow()
  })

  it('avoids rendering session names through unsafe innerHTML string concatenation', () => {
    const html = renderSessionsPage('http://127.0.0.1:18765', true)

    expect(html).toContain('nameEl.textContent = session.name || session.id;')
    expect(html).not.toContain('list.innerHTML = filtered.map')
    expect(html).not.toContain('onclick="selectSession')
  })
})
