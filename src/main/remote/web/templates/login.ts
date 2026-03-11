export function loginTemplate(_defaultBaseUrl: string): string {
  return `
    <div class="page-shell auth-shell">
      <section class="card auth-card">
        <div class="auth-utility-row">
          <div class="eyebrow">EasySession Remote</div>
          <button
            type="button"
            class="theme-toggle compact"
            data-theme-toggle
            aria-pressed="false"
            aria-label="切换界面主题"
          >
            <span class="theme-toggle-indicator" aria-hidden="true"></span>
            <span class="theme-toggle-copy">
              <span class="theme-toggle-caption">界面主题</span>
              <span class="theme-toggle-value" data-theme-label>浅色模式</span>
            </span>
            <span class="theme-toggle-action" data-theme-action>切换到深色模式</span>
          </button>
        </div>

        <div class="auth-head">
          <h1 class="page-title">浏览器远程入口</h1>
          <p class="page-copy">适合移动端或临时排障使用，长期远程操作仍建议桌面端挂载。支持浅色与深色主题切换，浏览器里也能保持清晰、克制的控制台排版。</p>
        </div>

        <form id="loginForm" class="auth-form">
          <label class="field">
            <span class="field-label">Base URL</span>
            <input id="baseUrl" class="input" type="url" placeholder="http://127.0.0.1:18765" required />
          </label>

          <label class="field">
            <span class="field-label">访问令牌</span>
            <input id="token" class="input" type="password" placeholder="输入 Bearer Token" required />
          </label>

          <label class="remember-row" for="rememberDevice">
            <input id="rememberDevice" type="checkbox" />
            <span>记住此设备</span>
          </label>

          <p class="helper-text">默认只保存在当前标签页，关闭后需要重新登录；勾选后会持久保存。</p>

          <button type="submit" class="btn btn-primary">进入会话页</button>
          <div id="loginMsg" class="login-message" role="alert" hidden></div>
        </form>
      </section>
    </div>
  `
}
