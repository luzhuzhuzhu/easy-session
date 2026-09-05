# v0.7.0 → v0.8.0 Release Notes

## v0.8.0

### Highlights

- 协作页自由 dock：五面板（成员/看板/任务详情/预览/聊天）二叉树布局，拖放/嵌套分屏，布局持久化与三档预设（单人/多 agent/监控）一键切换。
- 会话搜索全布局覆盖 + 双击重命名 + 分隔条双击复位 + 中键关标签等桌面交互打磨。
- agent-bus 生命周期命令（es start/stop/restart/output）与停止会话 journal 取证。
- 会话退出系统通知（三档偏好/聚焦静默/点击跨页定位）与渲染进程崩溃自恢复。

### Improvements

- 输出 journal：会话退出/应用关停时落最近输出，重启后回灌；桌面 UI 与跨会话全文搜索（UX-1/UX-9）。
- 主进程输出 16ms 合帧，备份五代轮转。
- 任务事件系统通知三档偏好（仅失败/全部/关闭），随设置页实时生效。
- 安全加固：bracketed-paste 注入净洗、WebSocket/REST 双层限流、execFile 防 shell 注入、原子写（tmp+fsync+rename+重试+备份）、renderer sandbox、CSP nonce、命名管道随机化与权限收紧。

### Fixes

- Codex/Claude/OpenCode resume 失效自动重启防循环；Windows taskkill /T /F 进程树收口。
- Web 端断线自动刷新、非活跃会话状态提醒、新建会话入口。

## v0.7.0

### Highlights

- 协作总线（agent-bus）1.0：会话间消息/任务派发、三档协作模式（readonly/nudge/inject）、斜杠命令、成员栏/看板/详情/预览/聊天五区工作台。
- 统一资源模型：本地 + 多远程实例项目/会话聚合，远程网关能力协商（passthrough 透传模式）。
- 内置远程服务：Express + Socket.IO + 令牌认证 + helmet/CSP + xterm.js Web 终端；Quick Tunnel 公网入口与网络策略（自动/继承/TUN/自定义代理）。

### Improvements

- 协作技能（es CLI skill）自动安装与版本化注入。
- 设置页远程实例增删/连通性测试/延迟展示。
- 工作区布局（split/leaf 二叉树）持久化与恢复。
