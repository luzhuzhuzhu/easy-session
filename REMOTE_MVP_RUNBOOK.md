# EasySession Remote MVP Runbook

更新时间：2026-03-05

## 1. 配置环境变量（推荐 .env）

在项目根目录创建 `.env`（可复制 `.env.example`）：

```powershell
Copy-Item .env.example .env
```

然后编辑 `.env`，至少配置：
- `EASYSESSION_REMOTE_ENABLED=true`
- `EASYSESSION_REMOTE_TOKEN=<64位以上随机字符串>`

如果使用 Codex CLI 且不走网页登录，请同时配置：
- `OPENAI_API_KEY=<你的API Key>`
- `OPENAI_BASE_URL=<可选，自定义网关时填写>`

说明：
- 主进程会自动读取 `.env.local`、`.env`（优先 `.env.local`）。
- `.env` 已被 `.gitignore` 忽略，不会提交到仓库。

## 2. 本地启动

```powershell
npm run dev
```

说明：
- 默认监听：`127.0.0.1:18765`
- 若未提供 token，程序会自动生成并写入用户数据目录 `remote-token.txt`

## 3. 本地访问

- 登录页：`http://127.0.0.1:18765/login`
- 控制台：`http://127.0.0.1:18765/sessions`
- 健康检查（需 token）：`GET /api/health`

## 4. Quick Tunnel

```powershell
cloudflared tunnel --url http://127.0.0.1:18765
```

拿到 `https://xxxx.trycloudflare.com` 后，用浏览器打开并登录。

## 5. 关键接口

REST：
- `GET /api/health`
- `GET /api/projects`
- `GET /api/sessions`
- `POST /api/sessions`
- `POST /api/sessions/:id/start`
- `POST /api/sessions/:id/pause`
- `POST /api/sessions/:id/restart`
- `DELETE /api/sessions/:id`

Socket.IO：
- `session:subscribe`
- `session:unsubscribe`
- `session:input`
- `session:resize`
- `session:output`（server -> client）
- `session:status`（server -> client）

## 6. 测试与构建

```powershell
npm run test
npm run build
```

## 7. 安全基线

- 所有 `/api/*` 强制 Bearer token。
- Socket.IO 握手强制 token（`auth.token` 或 `Authorization`）。
- 启用基础限流（IP + path + 窗口）。
- 启用空闲连接超时断开（默认 30 分钟）。
- 关闭 cloudflared 后公网入口立即失效。

## 8. 常见问题

- 终端提示 `Not logged in  Run /login`：
  - 说明当前 CLI 进程未拿到有效认证；
  - 优先在 `.env` 配置 `OPENAI_API_KEY`；
  - 或在本机先完成一次 CLI 登录后再启动 EasySession。

- 发送命令没反应：
  - 确认会话状态是 `running`；
  - 远程输入已按 PTY 方式追加 Enter（CR），若仍失败请检查 CLI 本身是否卡在登录/授权提示。
