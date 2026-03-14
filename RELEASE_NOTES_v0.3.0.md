# v0.3.0 Latest

## EasySession v0.3.0

## Highlights

- Expanded EasySession from a primarily local desktop workflow into a local + remote workspace experience.
- Added full remote service support, including built-in remote server, authentication, routing, and real-time session bridge.
- Added remote web access with login, session list, project tree, live terminal, mobile adaptation, and light/dark theme support.
- Added unified local/remote gateway architecture and remote instance management for broader access and management scenarios.

## Improvements

- Improved desktop and remote workflow consistency across projects, sessions, routing, and workspace organization.
- Improved remote terminal experience beyond the v0.1.6 local-only interaction model, including dynamic refresh, reconnect/resubscribe flow, layout stability, mobile usability, and session interaction behavior.
- Improved settings and management flows with new remote service, remote instance, and tunnel-related configuration capabilities.
- Expanded automated test coverage from local desktop scenarios to remote auth, routes, sockets, gateway, instances, workspace, and regression flows.

## Fixes

- Fixed remote web asset loading issues introduced by the new browser-based access flow, including xterm fit resource fallback and related startup failures.
- Fixed multiple remote terminal behavior issues, including first-load layout glitches, restart reflow problems, mobile jumping, auto-follow behavior, and input edge cases.
- Fixed reverse proxy and subpath compatibility issues to better support proxy, tunnel, and Cloudflare-based deployments.
- Fixed several session, workspace, and data synchronization edge cases across both local and remote flows.

## 重点更新

- EasySession 已从以本地桌面会话管理为主，扩展为同时覆盖本地与远程工作流的完整工作区体验。
- 新增完整远程服务能力：内置远程服务端、鉴权、路由和实时会话桥接。
- 新增远程 Web 访问：支持登录、会话列表、项目树、实时终端、移动端适配以及浅色 / 深色主题切换。
- 新增统一的本地 / 远程网关架构，以及远程实例管理能力：项目与会话可在同一套模型下统一管理。

## 体验改进

- 提升桌面端与远程端在项目、会话、路由和工作区组织上的一致性体验。
- 优化远程终端体验，在 v0.1.6 原有本地交互基础上补齐动态刷新、重连 / 重订阅、布局稳定性、移动端可用性和会话交互逻辑。
- 优化远程服务、远程实例及相关配置的设置与管理流程。
- 补充自动化测试覆盖范围，从本地桌面场景扩展到远程鉴权、路由、Socket、网关、实例、工作区以及本地桌面回归。

## 问题修复

- 修复远程 Web 资源加载问题，包括 xterm fit 资源兼容与相关启动失败问题。
- 修复多处远程终端行为问题，包括首次进入排版错乱、重启后重排异常、手机端乱跳、自动跟随失效和输入边界问题。
- 修复反向代理与子路径兼容问题，更好支持代理、隧道和 Cloudflare 部署场景。
- 修复随着本地 + 远程统一工作流引入的多处会话、工作区与数据同步边界问题。
