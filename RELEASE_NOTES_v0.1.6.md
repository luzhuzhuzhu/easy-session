# EasySession v0.1.6

## English

### Highlights
- Added in-app split workspace (multi-pane) with focused-pane open, close pane, even split, and layout reset.
- Added drag-and-sort for sessions, plus better session tree interactions.
- Added smart priority ranking for projects/sessions with settings for toggle, scope, and mode.
- Added OpenCode CLI support across session type, lifecycle, settings path, dashboard status, and IPC/preload flow.

### Improvements
- Improved session lifecycle reliability (status sync, persistence/recovery, exit handling).
- Improved project/config workflows and related UI interactions.
- Added OpenCode test coverage (adapter, lifecycle, and exit-race scenarios).

### Fixes
- Fixed copy/paste issues, including Ctrl+V behavior, Ctrl+C conflict scenarios, and copy feedback UX.
- Fixed multiple IPC validation and edge-case handling issues.
- Fixed several data/config stability issues.

---

## 中文

### 重点更新
- 新增应用内分窗工作区（多 Pane）：支持在焦点分窗打开、关闭分窗、均分、重置布局。
- 新增会话拖拽排序，优化会话树交互体验。
- 新增项目/会话智能优先级排序，支持开关、作用范围、排序模式配置。
- 新增 OpenCode CLI 全链路接入：会话类型、生命周期、设置路径、仪表盘状态、IPC/preload 联动。

### 体验改进
- 提升会话生命周期稳定性（状态同步、持久化/恢复、退出处理）。
- 优化项目与配置管理流程及相关交互。
- 补充 OpenCode 自动化测试覆盖（adapter、lifecycle、退出竞态）。

### 问题修复
- 修复复制/粘贴相关问题（含 Ctrl+V、Ctrl+C 冲突、复制反馈体验）。
- 修复多处 IPC 参数校验与边界场景问题。
- 修复部分数据与配置稳定性问题。

