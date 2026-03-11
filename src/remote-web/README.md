# Remote Web MVP

该目录用于记录 EasySession 远程 MVP 的最小 Web 界面实现。

当前运行时页面由主进程 `src/main/remote/web.ts` 直接输出：
- `/login`
- `/sessions`

这样做的目的：
- 不引入额外前端构建流程
- 快速打通 Cloudflare Quick Tunnel 的远程访问闭环

后续如果升级为独立前端工程，可将页面迁移到该目录并引入构建产物托管流程。
