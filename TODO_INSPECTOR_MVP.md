# EasySession 检查面板 MVP TODO

更新时间：2026-03-28  
适用仓库：`D:\EasySession`
状态：**Phase 1-5 已完成（首版），Git Graph 2.0 已规划，Phase 6 已规划**

说明：
- 这是一个**最小但最好用**的方案，不是做一个小型 VS Code。
- 目标是减少"为了看改了什么 / 看文档，又开一个 VS Code"的上下文切换。
- 本方案优先服务 `Electron 桌面端`，暂不扩展到远程 Web。
- Phase 1-4 为**只读能力**，Phase 5-6 扩展为**安全写操作**（暂存、提交、推送）。
- 危险操作（force push、删除分支、reset 等）走终端，由 AI 执行。
- 本文档与后续代码实现必须统一使用 **UTF-8** 编码。

---

## 1. 结论先行

### 1.1 现在最该做什么

- [x] 明确方向：先做"检查面板"，不做"内置 IDE"。
- [x] 先做 `Git 变更树 + Diff 预览`。
- [x] 再做 `Markdown 预览`。
- [x] 最后补 `项目级简单文件树 + 只读文件浏览`。
- [x] 侧边栏增强：显示/隐藏切换、自动折叠(hover展开)、大小调整、紧凑模式。
- [x] Phase 4：Git 历史查看（提交历史、分支状态）。
- [ ] Git Graph 2.0：按 VS Code SCM Graph 模型重构 Git 历史与同步视图。
- [ ] Phase 5：快速提交闭环（暂存、提交、创建分支）。
- [ ] Phase 6：远程同步 + Worktree 管理。

### 1.2 现在明确不做什么

- [x] 不做通用文件编辑器。
- [x] 不做 Monaco / VS Code 级编辑体验。
- [ ] ~~不做 Git 提交、暂存、rebase、cherry-pick、冲突解决~~（Phase 5-6 已规划部分功能）。
- [x] 不做全局文件搜索。
- [x] 不做远程实例文件系统浏览。
- [x] 不改远程 Web 当前定位。

---

## 2. 产品定位

### 2.1 核心定位

- [x] 在 `SessionsView` 里新增一个**右侧检查面板**，作为会话工作流的辅助视图。
- [x] 面板用于回答三个高频问题：
  - [x] 我这个项目现在改了哪些文件？
  - [x] 某个文件具体改了什么？
  - [x] 某个 `README.md / prompt / skill` 文件现在长什么样？

### 2.2 为什么不是 Workspace 新 Pane

- [x] 当前 `workspace v2` 的 `WorkspaceTabState.resourceType` 只有 `session`，直接扩成多资源标签会牵涉：
  - [x] 持久化结构升级
  - [x] 迁移兼容
  - [x] `WorkspacePaneTree` 渲染分支改造
  - [x] 现有 tab / pane 行为回归风险
- [x] 当前阶段目标只是“减少开 VS Code 看变更”，不值得先把 workspace 模型升级到 `v3`。
- [x] 所以 MVP 采用**右侧固定检查面板**，不改 workspace 数据模型。

---

## 3. MVP 范围

### 3.1 第一阶段必须交付

- [x] `Changes`：项目级 Git 变更树
- [x] `Diff`：单文件 diff 预览
- [x] `Preview`：Markdown 渲染预览
- [x] `Files`：项目级简单文件树
- [x] `Viewer`：文本文件只读浏览

### 3.2 第一阶段展示范围

- [x] 仅支持**当前选中分窗里的会话所属项目**。
- [x] 自动项目选择的唯一标准：以当前 `active pane` 的 `activeSessionRef` 所属项目为准。
- [x] 如果当前激活会话属于某个项目，则自动切到该项目，保证多分窗场景下目录与内容不会串。
- [x] 支持关闭"自动跟随当前分窗项目"。
- [x] 关闭自动跟随后，允许用户手动切换到"当前正在运行的会话所关联项目"。
- [x] 手动切换列表只展示当前可识别的本地项目，不瞎猜路径，不开放任意路径输入。
- [x] 如果当前没有可识别项目，则面板显示空态，不瞎猜路径。

### 3.3 第一阶段文件类型策略

- [x] Markdown：走富文本预览
- [x] 文本文件：走只读文本查看
- [x] 二进制文件：仅显示"暂不支持预览"
- [x] 大文件：超阈值只显示摘要，禁止整文件直接加载

---

## 4. 硬约束

### 4.1 业务边界

- [x] 不影响现有会话、项目、工作区、多 Pane、远程挂载主流程。
- [x] 不修改现有远程 Web 行为。
- [x] 不把 Git / 文件浏览耦合到终端输入输出链路。
- [x] 不因为检查面板异常影响主会话区域可用性。

### 4.2 技术边界

- [x] 不直接暴露任意系统路径浏览。
- [x] 文件树根路径必须来自当前项目路径。
- [x] 不扫描 `.git`、`node_modules`、`release`、`out`、`dist`、`.tmp*` 等大目录。
- [x] 不做文件系统全量 watch。
- [x] 不依赖 renderer 直接访问 Node 文件系统，统一走 IPC。
- [x] 即使当前项目不是 Git 仓库，也必须允许文件树与只读预览继续工作。

### 4.3 体验边界

- [x] 默认只读。
- [x] 面板可以关闭、展开、切换标签，但不能抢主工作区焦点。
- [x] 默认记住“是否打开”和“上次所选标签”，但不做复杂持久化。

---

## 5. 推荐交互方案

### 5.1 布局方案

- [x] 在 [SessionsView.vue](/D:/EasySession/src/renderer/src/views/SessionsView.vue) 的主工作区右侧增加 `InspectorPanel`。
- [x] 采用三段结构：
  - [x] 顶部：项目标题 + 自动跟随开关 + 手动项目切换 + 刷新按钮 + 标签切换
  - [x] 左列：`Changes / Files / History`
  - [x] 右列：`Diff / Preview / Viewer`
- [x] 面板默认宽度固定，可折叠，不参与当前 workspace split 久化。
- [x] 侧边栏增强功能已实现：
  - [x] 显示/隐藏切换按钮
  - [x] 自动折叠模式(hover展开)
  - [x] 侧边栏大小可调整(横向/纵向)
  - [x] 紧凑模式自动切换(宽度<600px时)

### 5.2 标签建议

- [x] `Changes`
- [x] `Files`
- [x] `History`
- [x] `Preview`

### 5.3 交互优先级

- [x] 进入某个项目后，默认打开 `Changes`
- [x] 点击变更文件时，右侧优先显示 `Diff`
- [x] 点击 `.md` 文件时，右侧优先显示 `Preview`
- [x] 点击普通文本文件时，右侧显示只读内容
- [x] 当前项目处于非 Git 场景时，默认高亮 `Files`，而不是给用户一个空的 `Changes`

---

## 6. 数据与能力设计

### 6.1 主进程新增能力

- [x] 新增项目文件树读取接口：
  - [x] `project:fileTree`
- [x] 新增文件读取接口：
  - [x] `project:fileRead`
- [x] 新增 Git 状态读取接口：
  - [x] `project:gitStatus`
- [x] 新增 Git diff 读取接口：
  - [x] `project:gitDiff`

### 6.2 实现建议

- [x] 文件树：
  - [x] 使用 `fs/promises.readdir`
  - [x] 默认只加载首层目录
  - [x] 展开节点时再按需加载子目录，不做全量递归预扫描
  - [x] 只返回必要字段：`name / path / type / children?`
- [x] 文件读取：
  - [x] 使用 `readFile`
  - [x] 增加大小阈值和文本类型判断
- [x] Git 状态：
  - [x] 直接调用系统 `git status --porcelain --ignored=no`
  - [x] 先检测当前项目路径是否位于 Git 仓库内
  - [x] 如果项目路径是子目录仓库的一部分，要同时返回：
    - [x] 仓库根目录
    - [x] 当前项目相对仓库根的子路径
  - [ ] Git 变更树默认以“当前项目目录范围”过滤展示，而不是把整个仓库全倒出来
  - [x] 如果不是 Git 仓库，返回明确的 `non-git` 状态，而不是报错
  - [x] 如果系统没有 Git，返回明确的 `git-unavailable` 状态，而不是报错
- [x] Git diff：
  - [x] 先支持 `git diff -- file`
  - [ ] 如需包含未跟踪文件，额外返回“未跟踪，暂无 diff”

### 6.3 为什么不先引入第三方 Git 库

- [x] 当前需求只是“看变更”，命令行 Git 足够。
- [x] 项目现在没有 `simple-git` / `isomorphic-git` 依赖。
- [x] 先引库会扩大维护面、平台差异和打包风险。
- [x] 只有当后续要做更复杂的 Git 操作时，再评估引库。

---

## 7. 渲染层设计

### 7.1 新组件建议

- [x] `src/renderer/src/components/InspectorPanel.vue`
- [x] `src/renderer/src/components/GitChangesTree.vue`
- [x] `src/renderer/src/components/ProjectFilesTree.vue`
- [x] `src/renderer/src/components/DiffViewer.vue`
- [x] `src/renderer/src/components/MarkdownPreview.vue`
- [x] `src/renderer/src/components/TextFileViewer.vue`

### 7.2 新 store / composable 建议

- [x] `src/renderer/src/stores/inspector.ts`
- [x] 维护：
  - [x] 当前项目引用
  - [x] 自动跟随当前分窗项目开关
  - [x] 手动项目来源列表（基于当前可识别会话项目）
  - [x] 面板开关
  - [x] 当前标签
  - [x] 当前选中文件
  - [x] 当前 Git 场景状态：`ready / non-git / git-unavailable / error`
  - [x] 当前仓库根路径与当前项目相对子路径
  - [x] Git 状态缓存
  - [x] 文件树缓存
  - [x] 预览内容缓存
  - [x] 侧边栏显示/隐藏状态
  - [x] 侧边栏自动折叠状态

### 7.3 与现有页面的关系

- [x] `SessionsView` 是主入口。
- [x] `ProjectDetailView` 可复用 `MarkdownPreview / TextFileViewer`，但第一阶段不强耦合。
- [ ] `ConfigView / ConfigEditorPanel` 的现有编辑器逻辑不复用到本方案，避免把“只读预览”拉成“可编辑”。

---

## 8. Phase 1：Git 变更树 + Diff

### 8.1 目标

- [ ] 在不离开当前会话页的情况下，看清“项目里改了什么”。

### 8.2 任务

- [x] 主进程实现 `project:gitStatus`
- [x] 主进程实现 `project:gitDiff`
- [x] preload 暴露安全 IPC
- [x] renderer 新增 `Changes` 树
- [x] 支持 Git 场景判定：
  - [x] 标准 Git 仓库
- [x] 子目录仓库
  - [x] 非 Git 目录
  - [x] 系统无 Git
- [x] 按状态分组展示：
  - [x] `Modified`
  - [x] `Added`
  - [x] `Deleted`
  - [x] `Renamed`
  - [x] `Untracked`
- [x] 点击文件后显示 diff
- [x] diff 区支持：
  - [x] 行号
  - [x] 新增/删除基础高亮
  - [x] 空态 / 出错态

### 8.3 完成标准

- [ ] 用户能在 EasySession 内完成“看有哪些改动 + 看具体 diff”。
- [x] 不必为了看变更单独再开 VS Code。
- [x] 子目录项目不会错误展示整个仓库的无关改动。
- [x] 非 Git 项目不会把整个检查面板搞成错误态。

---

## 9. Phase 2：Markdown 预览

### 9.1 目标

- [x] 让 `README.md / RELEASE_NOTES / skill 文档 / prompt 文档` 可直接阅读。

### 9.2 任务

- [x] 新增 `MarkdownPreview` 组件
- [x] 支持基础 Markdown：
  - [x] 标题
  - [x] 列表
  - [x] 引用
  - [x] 代码块
  - [x] 表格
  - [x] 行内代码
- [x] 样式要与当前桌面端视觉体系一致
- [x] 链接默认外部打开或复制，不在应用内乱跳
- [x] 对超长文档做懒加载或滚动容器约束

### 9.3 完成标准

- [x] 项目内常见 `.md` 文件可以直接舒适阅读。
- [x] 不因为只看一个文档又切去 VS Code。

---

## 10. Phase 3：简单文件树 + 只读浏览

### 10.1 目标

- [x] 在项目范围内快速找到并查看文件。

### 10.2 任务

- [x] 主进程实现 `project:fileTree`
- [x] 主进程实现 `project:fileRead`
- [x] 非 Git / 无 Git / 子目录仓库场景下，文件树都必须可用
- [x] 文件树默认忽略：
  - [x] `.git`
  - [x] `node_modules`
  - [x] `out`
  - [x] `dist`
  - [x] `release`
  - [x] `.tmp*`
- [x] 支持树节点展开 / 折叠
- [x] 点击文件后：
  - [x] `.md` -> `MarkdownPreview`
  - [x] 文本文件 -> `TextFileViewer`
  - [x] 非文本 -> 不支持提示

### 10.3 完成标准

- [x] 用户能在项目范围内快速看文件，不需要完整资源管理器。

---

## 11. 明确延后项

- [ ] 文件编辑
- [ ] 保存文件
- [ ] 搜索全文
- [ ] 全局文件搜索
- [ ] 远程项目文件浏览
- [ ] Workspace 持久化级"Inspector 标签页"

> 注：Git stage / commit / branch / history 等操作已纳入 Phase 4-6 规划，见第 17-22 节。

---

## 12. 风险点

### 12.1 技术风险

- [x] Windows 下 Git 不在 PATH 时，`git status / diff` 需要友好降级。
- [x] 子目录项目位于大仓库中时，Git 结果很容易过大，需要目录范围过滤。
- [x] 大仓库目录扫描容易卡，需要忽略策略和按需展开。
- [x] diff 文本可能很大，需要限制最大渲染长度。

### 12.2 产品风险

- [x] 一旦做成可编辑，范围会急剧膨胀。
- [ ] 一旦开始支持复杂 Git 操作，用户预期会迅速变成“为什么不直接做成 VS Code”。

### 12.3 规避策略

- [x] 第一阶段坚持只读。
- [x] 第一阶段只支持本地项目。
- [x] 第一阶段不进入 workspace 持久化模型。
- [x] Git 能力失败时自动降级到文件树和只读预览，不影响主流程。

---

## 13. 验收总闸

- [x] `SessionsView` 中可打开 / 关闭检查面板。
- [x] 自动跟随当前分窗项目时，多分窗切换不会串目录。
- [x] 关闭自动跟随后，可以从当前运行中的会话项目中手动切换目录。
- [x] 当前项目 Git 变更可见。
- [x] 子目录仓库可正确识别并只展示当前项目目录范围内的改动。
- [x] 非 Git / 无 Git 场景下，`Files + Viewer + MarkdownPreview` 仍可正常使用。
- [x] 单文件 diff 可读。
- [x] Markdown 可预览。
- [x] 简单文件树可浏览。
- [x] 非文本文件能友好降级。
- [x] 不影响现有会话打开、终端渲染、工作区布局、远程挂载、远程 Web。
- [x] `npm run build` 通过。
- [x] 关键 IPC / store / 组件测试通过。

---

## 14. 推荐执行顺序

1. [x] `Phase 1`：先打通 Git 变更树和 diff
2. [x] `Phase 2`：补 Markdown 预览
3. [x] `Phase 3`：补简单文件树和只读文件查看
4. [x] `Phase 4`：补 Git 历史查看和分支状态（首版）
5. [ ] `Git Graph 2.0`：重构为 VS Code 风格 SCM 工作流图
6. [ ] 补齐 `Phase 5` 剩余项：提交摘要、创建分支、从提交创建分支
7. [ ] `Phase 6`：远程同步 + Worktree 管理
8. [ ] 最后再评估是否值得把 Inspector 升级为 workspace 资源类型

---

## 15. 一句话方向

- [x] EasySession 应该补一个**检查面板**，不是再造一个 **VS Code**。

---

## 16. 侧边栏增强功能实现记录

### 16.1 已实现的增强功能（2026-03-28）

- [x] 侧边栏显示/隐藏切换按钮（header右侧）
- [x] 侧边栏自动折叠模式（hover展开）
  - [x] 进入hover区域自动展开
  - [x] 离开后自动折叠（带延迟）
  - [x] 调整大小时锁定展开状态
- [x] 侧边栏大小可调整
  - [x] 横向调整（普通模式）
  - [x] 纵向调整（紧凑模式）
  - [x] 尺寸持久化到localStorage
- [x] 紧凑模式自动切换（面板宽度<600px时）
  - [x] 侧边栏变为底部布局
  - [x] 标签切换保持正常工作
  - [x] 大小调整方向自动切换为纵向
- [x] 相关CSS状态类
  - [x] `has-sidebar` 控制侧边栏显示时的布局
  - [x] `sidebar-auto-collapse` 控制自动折叠行为
  - [x] `sidebar-expanded` 控制展开状态
  - [x] `compact` 控制紧凑模式布局

### 16.2 涉及的文件

- `src/renderer/src/stores/inspector.ts` - 新增 `sidebarVisible`、`sidebarAutoCollapse` 状态管理
- `src/renderer/src/components/InspectorPanel.vue` - 完整实现侧边栏增强UI和交互逻辑
- `src/renderer/src/i18n/locales/zh-CN.ts` - 新增侧边栏相关国际化文案

### 16.3 单文件刷新功能（2026-03-28）

- [x] 在 viewer-header 右侧添加刷新当前文件按钮
- [x] 仅在有选中文件时显示
- [x] 加载中时禁用按钮
- [x] 根据当前选中类型(diff/preview)刷新对应内容
- [x] 添加国际化文案 `inspector.refreshFile`

---

## 17. Git 操作能力规划

### 17.1 设计原则

- **分级确认** — 读操作无确认，安全写操作（暂存、本地提交）少确认，危险操作强制确认
- **危险操作走终端** — Force push、删除分支、Reset、删除 Worktree 等高风险操作不在侧边栏实现，由 AI 在终端执行
- **减少上下文切换** — 目标是让用户不再频繁切换到 GitHub Desktop / VS Code / 终端

### 17.2 功能矩阵

| 功能 | 风险等级 | 确认级别 | 实现阶段 |
|------|----------|----------|----------|
| Git Log 历史树 | 无 | 无 | Phase 1 |
| 文件提交历史 | 无 | 无 | Phase 1 |
| 分支列表/切换 | 低 | 无 | Phase 1 |
| 暂存/取消暂存 | 低 | 无 | Phase 2 |
| 本地 Commit | 低 | 提交信息确认 | Phase 2 |
| 创建分支 | 低 | 名称确认 | Phase 2 |
| Push / Pull | 中 | 显示远程状态 | Phase 3 |
| Git Worktree 管理 | 低 | 创建确认 | Phase 3 |
| Force push | 高 | **不做** | — |
| 删除分支 | 高 | **不做** | — |
| Reset / Revert | 高 | **不做** | — |
| 删除 Worktree | 高 | **不做** | — |

---

## 18. Phase 4：补全"看"的能力（Git 历史）

### 18.1 目标

- [x] 用户可以在侧边栏查看 Git 提交历史，不再需要打开 GitHub Desktop 或终端。

### 18.2 任务

- [x] 新增 `History` tab（与 Changes / Files 并列）
- [x] Git Log 树状图
  - [x] 显示提交历史（commit hash、message、author、date）
  - [x] 图形化分支/合并线
  - [x] 支持滚动加载更多
- [ ] 单文件历史
  - [ ] 选中文件后可查看该文件的提交记录
  - [ ] 支持查看某个提交对该文件的改动
- [x] 分支状态
  - [x] header 区域显示当前分支名
  - [x] 点击分支名可查看所有本地分支列表
  - [x] 显示当前分支与远程的关系（ahead/behind）
- [x] 主进程新增 IPC
  - [x] `project:gitLog` — 获取提交历史
  - [x] `project:gitFileLog` — 获取单文件历史
  - [x] `project:gitBranches` — 获取分支列表

### 18.3 完成标准

- [x] 用户能查看当前项目的提交历史。
- [ ] 用户能查看单个文件的提交历史。
- [x] 用户能查看所有分支并了解当前分支状态。

### 18.3.1 当前实现的定位修正

- [x] 当前 `History` 仅属于 **首版可用历史视图**，不是最终形态的 Git Graph。
- [ ] 当前实现不应再被视为“已达到目标”的 Git 图能力，后续必须进入 Graph 2.0 重构。
- [x] 当前实现可继续承担：
  - [x] 基础提交列表浏览
  - [x] 基础分支切换
  - [x] 提交详情入口
- [ ] 当前实现暂不满足：
  - [ ] SCM 工作流图
  - [ ] incoming / outgoing / upstream 语义
  - [ ] fetch / pull / push 同步入口
  - [ ] VS Code 风格泳道图渲染

### 18.4 实现记录（2026-03-28）

- [x] 后端新增 IPC 接口
  - [x] `project:gitLog` — 获取提交历史
  - [x] `project:gitFileLog` — 获取单文件历史
  - [x] `project:gitBranches` — 获取分支列表
- [x] 前端 API 层
  - [x] `local-project.ts` 新增类型定义和函数
- [x] Store 扩展
  - [x] `inspector.ts` 新增 `gitLog`, `gitBranches`, `gitFileHistory` 状态
  - [x] 新增 `loadGitLog`, `loadMoreGitLog`, `loadGitBranches`, `loadGitFileHistory` 方法
- [x] 新增组件
  - [x] `GitHistoryTree.vue` — 提交历史列表，支持滚动加载更多
  - [x] `GitBranchSelect.vue` — 分支选择器，显示当前分支和 ahead/behind
- [x] InspectorPanel.vue 集成
  - [x] 新增 History tab
  - [x] Header 区域显示分支选择器
- [x] 国际化
  - [x] `inspector.history.*` 文案
  - [x] `inspector.branches.*` 文案

### 18.5 当前实现问题复盘（2026-03-28）

- [x] 现状确认：当前历史图实现是 **ASCII graph 二次描画**，不是基于提交 DAG 的泳道 view model。
- [x] 当前 [GitHistoryTree.vue](/D:/EasySession/src/renderer/src/components/GitHistoryTree.vue) 直接消费 `git log --graph` 输出的 `graphLine`，再按字符 `* | / \ _` 画线。
- [x] 当前 [project-inspector.ts](/D:/EasySession/src/main/services/project-inspector.ts) 的 `getGitLog()` 依赖 `git log --graph --all`，没有独立的 lane 状态数据，也没有 per-row input/output swimlanes。
- [x] 当前图形能力更接近“历史树列表”，不接近 VS Code 的 “SCM 工作流图”。

#### 18.5.1 产品层问题

- [x] 当前历史面板的中心是“看全部提交”，不是“围绕当前分支工作流做决策”。
- [x] 缺少 VS Code 那种围绕 `current branch / upstream / incoming / outgoing / base` 的工作流语义。
- [x] 远程同步状态只停留在分支下拉中的 ahead / behind 数字，没有进入图模型。
- [x] 不能从图上直接完成 fetch / pull / push，也没有把这些动作和历史图绑定。

#### 18.5.2 数据层问题

- [x] 当前 `ProjectGitCommitItem` 只有 `graphLine / graphWidth / refs / parents`，没有：
  - [x] `inputSwimlanes`
  - [x] `outputSwimlanes`
  - [x] `kind`
  - [x] `laneColorToken`
  - [x] `isHead / isMerge / isIncoming / isOutgoing`
- [x] 当前模型没有 synthetic node，因此 incoming / outgoing 不可能像 VS Code 那样插入图中。
- [x] 当前 `--all` 拉平了整个仓库，缺少“当前分支 + upstream + 可选 base + 其他 refs 补充”的分层策略。

#### 18.5.3 渲染层问题

- [x] 当前图是把 ASCII 线条粗略翻译成 SVG 线段，不是逐行 SVG 图元拼装。
- [x] 当前没有 node 语义编码：
  - [x] HEAD 双圈
  - [x] merge 双圈
  - [x] incoming / outgoing 虚线圈
  - [x] base ref 特殊色
- [x] 当前颜色是简单循环色板，不是“本地 ref / 远端 ref / base ref / 调色板继承”的语义色系统。
- [x] 当前 merge 场景没有“目标父泳道继承色”能力，后续如不重构，极易踩到 VS Code 已知的 secondary parent 颜色错配问题。

#### 18.5.4 工程层问题

- [x] 当前实现把“图布局”压给 `git log --graph`，前端没有自己的 graph layout 能力。
- [x] 这导致：
  - [x] 无法可靠插入 synthetic node
  - [x] 无法控制 geometry 常量
  - [x] 无法稳定扩展 incoming / outgoing / base branch
  - [x] 无法把图与交互状态做强绑定

#### 18.5.5 结论

- [x] 当前 Git 历史能力可保留作为首版回退方案。
- [ ] 当前 Git 图必须重构，不应继续在 ASCII graph 方案上做堆补丁式增强。

---

## 18A. Git Graph 2.0：对齐 VS Code SCM Graph 的重构计划

### 18A.1 重构目标

- [ ] Git Graph 2.0 的目标不是“更漂亮的提交树”，而是 **SCM 工作流图**。
- [ ] 图的中心必须围绕：
  - [ ] 当前分支
  - [ ] upstream 分支
  - [ ] incoming changes
  - [ ] outgoing changes
  - [ ] 可选 base branch
- [ ] 图上要直接服务这些动作：
  - [ ] 看历史
  - [ ] 看提交变更
  - [ ] 看同步方向
  - [ ] fetch / pull / push
  - [ ] checkout / create branch（安全范围内）

### 18A.2 数据模型重构

- [ ] 新增独立的 Graph ViewModel，不再直接把 `git log --graph` 结果丢给前端。
- [ ] 主进程新增或改造数据结构：
  - [ ] `ProjectGitGraphResult`
  - [ ] `ProjectGitGraphRow`
  - [ ] `ProjectGitSwimlane`
  - [ ] `ProjectGitGraphNodeKind`
- [ ] 每一行必须具备：
  - [ ] `inputSwimlanes`
  - [ ] `outputSwimlanes`
  - [ ] `kind`
  - [ ] `commit`
  - [ ] `rowRefs`
  - [ ] `circleIndex`
  - [ ] `geometryWidth`
- [ ] 节点语义至少包含：
  - [ ] `head`
  - [ ] `commit`
  - [ ] `merge`
  - [ ] `incoming-changes`
  - [ ] `outgoing-changes`
  - [ ] `base`

### 18A.3 查询策略重构

- [ ] 不再默认用 `git log --all --graph` 作为图数据来源。
- [ ] 主进程需要先收集：
  - [ ] 当前分支
  - [ ] upstream 分支
  - [ ] ahead / behind
  - [ ] merge base
  - [ ] 可选 base branch
  - [ ] 可见本地 / 远端 refs
- [ ] 再按“工作流图”策略构建提交窗口，而不是全仓库平铺。
- [ ] incoming / outgoing 要支持 synthetic node 注入，而不是仅用 badge 或数字提示。

### 18A.4 布局算法重构

- [ ] 采用 VS Code 风格的**逐行增量泳道算法**：
  - [ ] 当前行 `inputSwimlanes = 上一行 outputSwimlanes`
  - [ ] 当前节点优先占用主干泳道
  - [ ] 第一个 parent 复用当前泳道
  - [ ] 其余 parent 追加为新的 output 泳道
- [ ] 布局常量对齐固定几何，不做自由拉伸：
  - [ ] 行高
  - [ ] 泳道宽
  - [ ] 曲线半径
  - [ ] 节点半径
  - [ ] 描边宽度
- [ ] 每行独立输出 SVG 片段，与列表项天然对齐。

### 18A.5 渲染规则重构

- [ ] 前端新增真正的 Graph Renderer，不再做 ASCII 解析。
- [ ] 线段只允许由基础图元组合：
  - [ ] 竖线
  - [ ] 横线
  - [ ] 四分之一圆弧
  - [ ] 上半竖 / 下半竖
- [ ] 节点渲染规则：
  - [ ] HEAD：双层圆
  - [ ] merge：双圈
  - [ ] incoming / outgoing：外圈 + 内圈 + 虚线圈
  - [ ] 普通 commit：单圈
- [ ] 颜色规则：
  - [ ] local ref 色
  - [ ] remote ref 色
  - [ ] base ref 色
  - [ ] lane 调色板循环色
  - [ ] secondary parent 连接线必须继承目标父泳道颜色，避免复现 VS Code 已知坑

### 18A.6 交互重构

- [ ] 历史标签重命名或升级为 `Graph / History` 复合视图。
- [ ] 选中节点后，右侧预览区支持：
  - [ ] 提交摘要
  - [ ] 受影响文件列表
  - [ ] 单文件 diff
- [ ] 图顶部增加同步操作区：
  - [ ] fetch
  - [ ] pull
  - [ ] push
- [ ] 当前分支与 upstream 的 ahead / behind 状态进入顶部与图内双重呈现，不只存在于分支下拉。

### 18A.7 分阶段执行

- [ ] Phase G1：主进程补齐 graph data model 和 refs 上下文查询
- [ ] Phase G2：前端替换 `GitHistoryTree`，落地逐行 SVG graph renderer
- [ ] Phase G3：加入 incoming / outgoing / base synthetic node
- [ ] Phase G4：把 fetch / pull / push 接到 Graph 顶部工作流区
- [ ] Phase G5：保留旧历史树作为 fallback，一轮稳定后彻底替换

### 18A.8 不做事项

- [ ] 不在 Graph 2.0 第一阶段做：
  - [ ] rebase
  - [ ] cherry-pick
  - [ ] reset
  - [ ] merge 冲突解决
  - [ ] force push
- [ ] 不把 Graph 2.0 直接扩到远程 Web，先只做桌面端。

### 18A.9 涉及文件（重构范围）

- [ ] 主进程：
  - [ ] [project-inspector.ts](/D:/EasySession/src/main/services/project-inspector.ts)
- [ ] renderer API：
  - [ ] [local-project.ts](/D:/EasySession/src/renderer/src/api/local-project.ts)
- [ ] store：
  - [ ] [inspector.ts](/D:/EasySession/src/renderer/src/stores/inspector.ts)
- [ ] 组件：
  - [ ] [GitHistoryTree.vue](/D:/EasySession/src/renderer/src/components/GitHistoryTree.vue)
  - [ ] [GitBranchSelect.vue](/D:/EasySession/src/renderer/src/components/GitBranchSelect.vue)
  - [ ] Inspector 顶部 Graph 工具区（待新增）


---

## 19. Phase 5：快速提交闭环

### 19.1 目标

- 用户可以在侧边栏完成暂存→提交的完整流程，不再需要切换应用。

### 19.2 任务

- [x] 暂存区交互
  - [x] Changes 列表每项添加 checkbox
  - [x] 勾选即 `git add`，取消即 `git restore --staged`
  - [x] 支持全选/全不选
  - [x] 区分已暂存/未暂存文件
- [x] 快捷提交
  - [x] 预览区底部添加 commit 输入框
  - [x] 支持 `Ctrl+Enter` 快捷提交
  - [ ] 提交前显示将要提交的内容摘要
- [ ] 分支创建
  - [ ] 分支列表中支持创建新分支
  - [ ] 支持从当前分支创建
  - [ ] 支持从某个提交创建
- [x] 主进程新增 IPC
  - [x] `project:gitStage` — 暂存文件
  - [x] `project:gitUnstage` — 取消暂存
  - [x] `project:gitCommit` — 提交
  - [ ] `project:gitBranchCreate` — 创建分支
  - [ ] `project:gitBranchCheckout` — 切换分支

### 19.3 完成标准

- [x] 用户能在侧边栏选择性暂存文件。
- [x] 用户能在侧边栏完成提交。
- [ ] 用户能创建和切换分支。

### 19.4 实现记录（2026-03-28）

- [x] 后端新增 IPC 接口
  - [x] `project:gitStage` — 暂存文件
  - [x] `project:gitUnstage` — 取消暂存
  - [x] `project:gitCommit` — 提交变更
- [x] 前端 API 层
  - [x] `local-project.ts` 新增 stageProjectFile, unstageProjectFile, commitProjectChanges
- [x] Store 扩展
  - [x] `inspector.ts` 新增 stageFile, unstageFile, commitChanges 方法
- [x] GitChangesTree.vue 改造
  - [x] 分组显示已暂存/未暂存文件
  - [x] 每项添加 checkbox 控制暂存状态
  - [x] 支持全选/全不选
- [x] InspectorPanel.vue 集成
  - [x] 添加提交输入框（有暂存文件时显示）
  - [x] 支持 Ctrl+Enter 快捷提交
- [x] Git status 解析改进
  - [x] ProjectGitStatusItem 新增 staged 字段
  - [x] 解析 git status porcelain 的 XY 码区分暂存状态
- [x] 国际化
  - [x] `inspector.staged` / `inspector.unstaged` 文案
  - [x] `inspector.commitPlaceholder` / `inspector.commitButton` 文案

---

## 20. Phase 6：远程同步 + Worktree

### 20.1 目标

- 用户可以同步远程仓库，并管理 Git Worktree。

### 20.2 任务

- [ ] Push / Pull
  - [ ] header 区域添加 Push / Pull 按钮
  - [ ] 显示远程状态指示（ahead/behind 数量）
  - [ ] Push 前显示将要推送的提交列表
  - [ ] Pull 后显示更新的内容摘要
  - [ ] 处理远程拒绝/冲突的友好提示
- [ ] Worktree 管理
  - [ ] 新增 Worktree 面板/入口
  - [ ] 显示当前仓库的 worktree 列表
  - [ ] 显示每个 worktree 的分支、路径、状态
  - [ ] 支持创建新 worktree（选择分支、输入路径）
  - [ ] 删除 worktree **不做**，走终端
- [ ] 主进程新增 IPC
  - [ ] `project:gitPush` — 推送
  - [ ] `project:gitPull` — 拉取
  - [ ] `project:gitRemoteStatus` — 获取远程状态
  - [ ] `project:gitWorktreeList` — 获取 worktree 列表
  - [ ] `project:gitWorktreeCreate` — 创建 worktree

### 20.3 完成标准

- [ ] 用户能 Push / Pull 同步远程。
- [ ] 用户能查看和管理 Worktree。

---

## 21. 明确不做的 Git 操作

以下操作风险较高，不在侧边栏实现。如需执行，由 AI 在终端操作：

- [ ] Force push (`git push --force`)
- [ ] 删除分支 (`git branch -D`)
- [ ] Reset (`git reset --hard/--soft`)
- [ ] Revert (`git revert`)
- [ ] Rebase (`git rebase`)
- [ ] Cherry-pick (`git cherry-pick`)
- [ ] Merge (`git merge`)
- [ ] 删除 Worktree (`git worktree remove`)
- [ ] Stash 管理 (`git stash`)

---

## 22. 技术约束

### 22.1 实现方式

- 继续使用命令行 Git（`git log`、`git branch` 等），不引入 `simple-git` 等第三方库
- 所有 Git 操作通过主进程 IPC 执行，renderer 不直接调用 Git

### 22.2 错误处理

- Git 操作失败时显示友好错误信息
- 不因 Git 操作失败影响检查面板其他功能
- 网络/远程操作超时时给出明确提示

### 22.3 性能约束

- 大仓库历史按需加载，不做全量预加载
- 长历史支持分页/虚拟滚动
- 远程操作显示进度指示
