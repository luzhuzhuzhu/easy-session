# v0.4.8 Latest

## EasySession v0.4.8

## Highlights

- Expanded EasySession with a desktop inspector workspace for Git changes, file browsing, diff review, and Markdown preview.
- Added staged / unstaged Git change inspection, branch-aware history browsing, and an in-app Git graph workflow so common review tasks no longer require a second editor window.
- Added in-app Markdown, text, and diff preview to make README, notes, prompts, and change review part of the native desktop workflow.
- Refined the desktop workspace with a rebuilt session sidebar / top-list system, deeper componentized architecture, and the first round of focused desktop performance optimization.

## Improvements

- Improved desktop session workflow with a more structured session tree, top-mode session list, better project / instance grouping, and cleaner workspace coordination.
- Improved terminal performance and responsiveness with lighter history loading, warm-history replay, batched writes, and reduced background pane churn for desktop multi-pane use.
- Improved inspector loading behavior with request dedupe, short-lived caching, lazy preview loading, and lighter Git history rendering.
- Improved settings and maintainability by splitting large desktop surfaces into clearer sections and composables, including Settings, Sessions, Inspector, and project inspection services.

## Fixes

- Fixed packaged desktop issues around remote web assets, remote token/settings behavior, and xterm-related startup failures in installed builds.
- Fixed Git inspector behavior issues, including staged / unstaged split preview, discard-action IPC blocking, branch/history display edge cases, and change review flow regressions.
- Fixed multiple workspace and pane synchronization issues that could move sessions unexpectedly, desync active session state, or break pane-focused behavior.
- Fixed several session list, container, scrolling, and layout issues across the desktop sidebar / top-list modes, including instance rows, filter controls, and overflow handling.

## 重点更新

- EasySession 进一步补齐了桌面端检查工作区：现在可以直接在应用内查看 Git 变更、浏览文件、预览 diff，以及阅读 Markdown / 文本文档。
- 新增桌面端 Git 检查能力：支持已暂存 / 未暂存变更树、分支历史查看、Git 图浏览，以及常见的变更检查工作流，减少频繁切换到 VS Code 的需求。
- 新增应用内 Markdown、文本与 diff 预览，让 README、笔记、提示词和变更审阅都能在 EasySession 内完成。
- 重构桌面端会话工作区、检查面板与设置页，并完成第一轮针对桌面场景的性能优化，让日常多会话、多分窗使用更稳。

## 体验改进

- 优化桌面端会话工作流：重做会话树 / 顶部会话列表结构，改善项目、实例、会话分组与工作区协调逻辑。
- 优化桌面端终端体验：降低默认历史负担、加入热历史回放、批量写入和后台 Pane 降载，提升多分窗场景下的响应表现。
- 优化检查面板加载链：加入短时缓存、请求去重、按需预览加载与更轻的 Git 历史渲染，减少无意义重刷。
- 优化整体桌面端代码结构：将 Sessions、Inspector、Settings 以及主进程 project inspector 服务按域拆分，为后续维护和继续优化打下更稳的基础。

## 问题修复

- 修复打包版桌面应用中的远程 Web 资源、远程设置 / token 处理以及 xterm 相关启动问题。
- 修复 Git 检查流程中的多处问题，包括已暂存 / 未暂存预览不一致、取消更改 IPC 被拦截、分支 / 历史展示边界问题，以及部分变更审阅回归。
- 修复多处工作区与分窗同步问题，避免会话异常跑 pane、活动会话状态不同步或 pane 焦点行为异常。
- 修复会话列表与容器布局相关问题，包括左侧滚动链、实例行排版、筛选控件尺寸以及顶部 / 侧边模式下的若干样式与溢出问题。
