# EasySession Cloudflare 远程方案（MVP）

更新时间：2026-03-04  
适用项目：`D:\EasySession`

实施状态（代码）：2026-03-05
- 已完成：Remote Gateway（REST + Socket.IO）、token 鉴权、基础限流、空闲断连、主进程接入、最小远程页面（`/login` + `/sessions`）。
- 已完成：单测/集成测试新增（`remote-auth` / `remote-routes` / `remote-socket` / `remote-session-bridge`）并通过。
- 已完成：`npm run build` 通过。
- 待人工联调：Quick Tunnel 外网实测（手机/外网浏览器）与长期稳定性观察。

---

## 1. 结论（先看这个）

你们当前目标是“自己用、快速、无域名”，对于 `Web / 移动端入口` 的推荐主路径：

1. 使用 Cloudflare **Quick Tunnel**（`trycloudflare.com` 临时域名）。
2. 本地运行 EasySession Remote Gateway（`127.0.0.1:18765`）。
3. 所有实时通信走 **WebSocket/Socket.IO**（不要用 SSE）。
4. 应用层强制 token 鉴权（REST + WS 握手）。

补充定位：

- 该方案继续保留，不废弃
- 主要服务 `手机端` 和 `浏览器应急访问`
- `电脑端` 不再以该 Web 页面为主客户端，而是走桌面端挂载方案

启动命令：
```powershell
cloudflared tunnel --url http://127.0.0.1:18765
```

---

## 2. 为什么选这个

- 不需要自有域名。
- 不需要 DNS/Access 配置，几分钟可跑通。
- 对你们现有代码改动最小：复用 `SessionManager + CliManager + SessionOutputManager`。

它的产品定位应明确为：

- 移动端远程入口
- 浏览器临时接入入口
- 桌面客户端不可用时的备份通道

---

## 3. 必须知道的限制（Quick Tunnel）

官方限制：
- 仅建议测试/开发用途（无 SLA）。
- 200 in-flight 并发上限，超限可能 429。
- 不支持 SSE。

对应策略：
- 只做个人使用。
- 全部实时流量走 WebSocket/Socket.IO。
- 长期稳定再升级到“有域名 Named Tunnel + Access”（见第 10 节）。

---

## 4. 与 EasySession 现有架构的对接

### 4.0 与桌面端方案的关系

- 本方案继续保留，不废弃。
- 它负责 `Web / 移动端` 的远程入口。
- 桌面端重度场景由 `DESKTOP_REMOTE_MOUNT_ARCHITECTURE.md` 对应的方案承接。
- 两条线共享同一套 Remote Gateway 与安全基线，但面向不同终端形态。

### 4.1 复用模块
- 会话核心：`src/main/services/session-manager.ts`
- 进程与 PTY：`src/main/services/cli-manager.ts`
- 输出历史：`src/main/services/session-output.ts`
- 项目管理：`src/main/services/project-manager.ts`

### 4.2 新增模块（建议）
- `src/main/remote/server.ts`：Express + Socket.IO 启动器
- `src/main/remote/auth.ts`：token 鉴权中间件
- `src/main/remote/routes.ts`：REST 控制面
- `src/main/remote/socket.ts`：会话订阅、输入、resize、输出推送

### 4.3 启动方式
- 在 `app.whenReady()` 后按开关启动 Remote Gateway。
- 默认监听 `127.0.0.1:18765`。

---

## 5. MVP 接口约定

### 5.1 REST
- `GET /api/health`
- `GET /api/projects`
- `GET /api/sessions`
- `POST /api/sessions`
- `POST /api/sessions/:id/start`
- `POST /api/sessions/:id/pause`
- `POST /api/sessions/:id/restart`
- `DELETE /api/sessions/:id`

### 5.2 Socket.IO
- `session:subscribe`
- `session:unsubscribe`
- `session:input`
- `session:resize`
- `session:output`（server -> client）
- `session:status`（server -> client）

当前默认业务口径修正：

- Web 远程默认走 `全透传`
- 主用能力是 `查看已有会话 + 订阅输出 + 输入透传 + resize`
- 生命周期控制接口虽然仍存在定义，但默认不作为移动端主路径能力

---

## 6. 个人场景最小安全基线（必须做）

1. REST 必须 `Authorization: Bearer <token>`。
2. Socket.IO 握手必须带 token（`auth.token` 或 header）。
3. token 至少 32 字节随机串，每次启动可轮换。
4. 增加基础限流（按 IP + 路径）。
5. 空闲超时断开（建议 30 分钟无操作）。
6. tunnel 用完即关（`Ctrl + C`）。

建议：
- 不要在公开渠道同时暴露 `trycloudflare URL + token`。
- 不要把本地服务端口直接开放到公网防火墙。

---

## 7. Windows 一步步操作

### 7.1 安装 cloudflared
```powershell
winget install --id Cloudflare.cloudflared
cloudflared --version
```

### 7.2 启动 EasySession 本地网关
```powershell
# 以你们最终启动命令为准
npm run dev
```

### 7.3 启动 Quick Tunnel
```powershell
cloudflared tunnel --url http://127.0.0.1:18765
```

看到类似：
- `https://xxxx-xxxx.trycloudflare.com`

远端浏览器访问该地址即可。

### 7.4 停止
- tunnel 窗口 `Ctrl + C`，公网入口立即失效。

---

## 8. 5 天落地节奏

### Day 1
- 起 `remote/server.ts` 骨架 + `/api/health` + token 中间件。

### Day 2
- 打通项目/会话读取 REST（list）并明确移动端默认走透传模式。

### Day 3
- 打通 Socket.IO（subscribe/output/input/resize/status）。

### Day 4
- 接 Quick Tunnel 远程实测（手机/外网）。

### Day 5
- 限流、日志、异常恢复、回归测试。
- 明确与桌面端挂载方案的职责边界。

---

## 9. 验收标准

- 远程可查看项目列表。
- 可查看并连接已有运行会话。
- 可实时查看输出并输入命令。
- 刷新页面可恢复输出历史。
- 无 token 无法访问 REST/WS。
- Web 入口继续可作为手机端正式能力保留。

---

## 10. 未来升级路径（可选）

当你们从“个人使用”升级到“长期稳定”时，再切换：

1. Named Tunnel（固定域名）
2. Cloudflare Access（邮箱/身份策略）
3. 应用侧增加角色和审计

这部分不是当前 MVP 必需。

---

## 11. 官方参考（截至 2026-03-04）

- Quick Tunnels（TryCloudflare）
  - https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/do-more-with-tunnels/trycloudflare/
- Tunnel FAQ（含 WebSocket 支持）
  - https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/
- Cloudflare WebSockets
  - https://developers.cloudflare.com/network/websockets/
- Self-hosted + Access（升级方案）
  - https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/

