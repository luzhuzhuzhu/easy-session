export function loginTemplate(_defaultBaseUrl: string): string {
  return `
    <div class="page-shell auth-shell">
      <section class="card auth-card">
        <div class="auth-utility-row">
          <div class="eyebrow">EasySession</div>
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
          <h1 class="page-title">远程登录</h1>
          <p class="page-copy">在浏览器中安全访问您的远程会话，支持实时终端交互与会话管理。</p>
        </div>

        <form id="loginForm" class="auth-form">
          <label class="field">
            <span class="field-label">服务地址</span>
            <input id="baseUrl" class="input" type="url" placeholder="http://127.0.0.1:18765" required />
          </label>

          <label class="field">
            <span class="field-label">访问令牌</span>
            <input id="token" class="input" type="password" placeholder="输入访问令牌" required />
          </label>

          <label class="remember-row" for="rememberDevice">
            <input id="rememberDevice" type="checkbox" />
            <span>记住此设备</span>
          </label>

          <p class="helper-text">勾选后凭据将持久保存，否则仅在当前会话有效。</p>

          <button type="submit" class="btn btn-primary">登录</button>
          <div id="loginMsg" class="login-message" role="alert" hidden></div>
        </form>
      </section>
    </div>
  `
}