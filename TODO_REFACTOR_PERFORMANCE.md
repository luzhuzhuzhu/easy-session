# EasySession 重构与性能优化总 TODO

更新时间：2026-03-29  
适用仓库：`D:\EasySession`  
编码要求：**全文档与后续实现统一使用 UTF-8**

说明：
- `[x]` 表示已经明确完成并具备构建、测试或验收依据。
- `[ ]` 表示尚未完成，或已有实现但未达到稳定交付标准。
- 本文档聚焦两件事：
  - **重构收敛**：解决职责混乱、巨型组件、边界失控、兼容残留。
  - **桌面端性能优化**：优先解决 `SessionsView / Inspector / TerminalOutput / Git` 这几条主链。
- 本文档不等于“继续无限加功能”，而是为现有能力止血、收口、提效。
- 本文档后续默认采用**隔离式验证 / 非破坏性验证**：
  - **不**以手工回归作为默认发布阶段。
  - **不**直接运行会污染本地真实 `session` 配置、会话记录、用户目录的测试链。
  - 任何自动化验证若需要访问会话数据，必须切到**临时数据目录 / 临时 profile / 临时 userData**。

### 当前进展

- [x] `Inspector` 已完成第一轮轻量刷新收敛：`stage / unstage / discard / commit` 不再默认整棵文件树全量重载。
- [x] `Inspector` 已移除两条重复的全量 watch，当前项目切换回到单一主刷新链。
- [x] `TerminalOutput` 已完成第一轮历史回放优化：默认历史加载量从 `20000` 下调到 `12000`，并改为批量写入 `xterm`。
- [x] `TerminalOutput` 已开始区分首次进入与再次切回：同会话短时热缓存回放已接入，重进会话时优先显示最近历史快照，再后台对齐最新输出。
- [x] `TerminalOutput` 已开始收紧 `fitAndSync()` 与 ResizeObserver：仅在容器可渲染且尺寸真正变化时再触发 `fit/resize`。
- [x] `TerminalOutput` 已开始为后台 Pane 降载：后台 Pane 默认只写热缓存、不实时刷 xterm，切回前台时再从缓存补齐。
- [x] `TerminalOutput` 已接入按需补历史第一轮：默认仍使用轻量历史窗口，用户可显式加载更多历史窗口，避免一上来把长输出全部灌回终端。
- [x] `TerminalOutput` 已开始收敛前台高频输出写入：可见终端的实时输出改为按帧批量写入 `xterm`，减少持续输出时的逐条 `term.write()` 开销。
- [x] `SessionsView` 已完成左侧树第一轮扁平化收敛：实例 / 项目 / 会话树改为统一可展开节点模型，为后续虚拟化铺底。
- [x] `SessionsView` 已接入桌面左侧树第一轮动态虚拟化：仅覆盖 `left` 布局主树，不影响顶部布局和紧凑模式。
- [x] `SessionsView` 已完成左侧主树组件化抽离：主树渲染从页面内联模板迁出到独立组件，开始进入可持续拆分状态。
- [x] `SessionsView` 已继续优化左侧虚拟树热路径：`VirtualTree` 不再每轮克隆整批节点对象，改为稳定 wrapper 缓存，减少大量会话场景下的重复重绘。
- [x] `SessionsView` 已继续优化左侧树对象稳定性：`filteredSessions / projectSessionTree / instanceTree / sidebarTreeNodes` 已开始按 key 复用稳定对象，减少会话树、顶部条和左侧树的整批新对象开销。
- [x] `projects` 主链已开始做稳定投影与集合版本信号：`unifiedProjects` 改为按 key 复用稳定项目对象，减少 Inspector、顶部条与快捷项目的整批项目对象失活。
- [x] `workspace` 布局变更链已开始做低风险热路径收敛：`mutate / hardReset` 已去掉一层重复 layout 深拷贝，减少多分窗操作时的整树 clone 开销。
- [x] `SessionsView` 已完成顶部会话条第一轮组件化抽离：顶部布局切换与渲染迁出页面主体。
- [x] `SessionsView` 已完成交互层第一轮组件化抽离：右键菜单、重命名、唤醒提醒、图标选择弹层迁出页面主体。
- [x] `SessionsView` 已完成左侧工具条第一轮组件化抽离：筛选、刷新、折叠态操作与底部切换按钮已拆分为独立控件层，并修正左侧滚动高度链。
- [x] `SessionsView` 已开始抽离交互逻辑层：创建、远程刷新、唤醒、重命名、图标选择已迁入独立 composable，页面继续从“巨型逻辑页”收口。
- [x] `SessionsView` 已开始抽离树交互逻辑层：会话拖拽、项目拖拽、顶部项目拖拽与右键上下文动作已迁入独立 composable。
- [x] `SessionsView` 已开始抽离工作区操作逻辑层：pane focus/tab/split/layout/zoom 已迁入独立 composable。
- [x] `SessionsView` 已开始抽离页面协调层：初始化加载、路由选中同步、workspace/session 对齐与展开状态同步已迁入独立 composable。
- [x] `InspectorPanel` 已完成顶部工具栏第一轮组件化抽离：tabs、侧边栏控制、缩放、刷新与项目选择已迁出主组件。
- [x] `InspectorPanel` 已完成历史工作区第一轮组件化抽离：分支查看、同步操作、历史图与提交详情已迁出主组件。
- [x] `InspectorPanel` 已完成左侧检查栏第一轮组件化抽离：`changes/files` 侧栏、目录树与拖拽手柄已迁出主组件。
- [x] `InspectorPanel` 已完成预览区第一轮组件化抽离：diff / markdown / text 预览与提交输入框已迁出主组件。
- [x] `inspector.ts` 已开始抽离纯状态辅助模块：UI 偏好持久化、项目目标解析与类型定义已迁出 store 主体。
- [x] `inspector.ts` 已开始抽离文件浏览域：文件树、文件预览、变更预览与轻量刷新已迁入独立领域模块。
- [x] `inspector.ts` 已开始抽离 Git 历史/同步域：历史、分支、提交详情与 fetch/pull/push 已迁入独立领域模块。
- [x] `project-inspector.ts` 已开始抽离主进程共享工具层：路径、文件、Git 命令执行与通用排序辅助已迁出共享模块。
- [x] `project-inspector.ts` 已开始抽离主进程 Git 纯领域逻辑：Git 状态解析、历史解析、分支解析与 graph 泳道算法已迁出独立模块。
- [x] `project-inspector.ts` 已开始抽离主进程 Git 动作链：stage / unstage / discard / commit / checkout / fetch / pull / push / commit show 已迁出独立模块。
- [x] `project-inspector.ts` 已开始抽离主进程文件域：文件树与文件预览读取已迁出独立模块。
- [x] `project-inspector.ts` 已开始抽离主进程上下文装配层：目标解析、Git 上下文解析与 diff/branch 读取已迁出独立模块。
- [x] `local-project` API 已接入同一 target 的短时缓存与 in-flight 去重：文件树 / 文件预览 / Git 状态 / diff / 历史 / 分支 / 提交详情读链路已统一受控。
- [x] `local-project` API 已接入写后缓存失效：stage / unstage / discard / commit / checkout / fetch / pull / push 后不再继续读到上一轮缓存。
- [x] `GitHistoryTree` 已开始第一轮单行减重：graph 元素、row style、refs 展示与 hover 文案改为预计算，减少渲染期临时计算。
- [x] `GitHistoryTree` 已开始第一轮 hover 热路径收敛：hover 浮窗位置更新已接入 `requestAnimationFrame` 节流，减少 pointer move 期间的频繁样式写入。
- [x] `InspectorViewer` 已开始按内容类型优化加载：Markdown / Diff 预览改为按需异步加载，避免常驻主包与无关内容一起初始化。
- [x] `InspectorHistoryWorkspace` 已开始按内容类型优化加载：提交详情中的 Diff 预览改为按需异步加载，减少历史工作区默认负担。
- [x] `MarkdownPreview` 已开始第一轮解析缓存：renderer 实例与渲染结果已加入短时缓存，减少同文件重复切换时的重复解析。
- [x] `Markdown / Text / Diff` 预览容器已开始做布局隔离：`contain: content` 已接入，减少切换预览时的无关回流影响。
- [x] `Inspector` 偏好持久化已开始第一轮去抖：`watch -> localStorage` 链路改为按 key 轻量去抖并跳过相同值写入。
- [x] `SettingsView` 已开始第一轮延迟加载远程区：远程服务、Cloudflare、远程实例状态改为进入视区或交互后首次加载，设置页首开不再默认全量拉取。
- [x] `SettingsView` 已开始第一轮区块组件化：本机远程服务区已迁出独立 section 组件，页面主体开始从长模板回收到装配层。
- [x] `SettingsView` 已完成远程重区块第一轮组件化：Cloudflare Tunnel 区与远程实例区已迁出独立 section 组件，远程配置页主体继续收回到装配层。
- [x] `SettingsView` 已完成 CLI 路径区第一轮组件化：Claude / Codex / OpenCode 路径设置已迁出独立 section 组件。
- [x] `SettingsView` 已完成通用设置区第一轮组件化：外观 / 语言 / Sessions 行为设置已迁出独立 section 组件。
- [x] `SettingsView` 已完成终端区与 About 区第一轮组件化：终端设置与系统信息展示已迁出独立 section 组件。
- [x] `SettingsView` 已完成页面运行时第一轮抽离：系统信息刷新、区块延迟加载观察器与轻设置项合并保存/去抖已迁出页面主体。
- [x] `SettingsView` 已完成轻设置项保存链第一轮收敛：常规设置改为短时合并写入，避免连续修改时重复写盘与整页状态抖动。
- [x] `Phase 6` 已完成首轮远程遗留清理：`src/main/remote/web.ts.old` 与 `src/main/remote/web.ts.backup` 已从主分支移除。
- [x] `Phase 7` 已完成首轮发布门禁实测：`typecheck / test / build` 已全部打通，`release:verify` 与 `release:win` 所需基础链路已具备。
- [x] 本轮 TODO 已切换默认验证策略：后续优先采用隔离式、非破坏性验证，不再把手工回归和会污染真实会话数据的测试链作为默认门禁。

---

## 1. 结论先行

### 1.1 当前主要问题

- [x] 产品能力扩张速度已经超过当前代码边界的承载能力。
- [x] Renderer 层出现明显“巨型页面 + 巨型组件 + 巨型 store”问题。
- [x] Git Inspector 仍处于重构中，能力不断增强，但边界和稳定性还未完全收住。
- [x] 桌面端性能热点已经很明确：
  - [x] `SessionsView` 过重。
  - [x] 终端历史加载过大。
  - [x] Inspector 的刷新链路偏全量。
  - [x] Git 历史图单行渲染成本偏高。
- [x] 远程、桌面、Git、预览、设置等能力都在同一时期并行推进，导致回归风险很高。

### 1.2 当前最重要的方向

- [ ] 先冻结“大功能新增”，优先做一轮结构收敛。
- [ ] 先把桌面端主工作流稳定下来，再谈继续扩功能。
- [ ] 先让 `Sessions / Workspace / Inspector / Terminal / Git` 五条主链各自职责清楚。
- [ ] 先建立桌面端性能基线和发布门禁，再继续大迭代。

### 1.3 当前明确不做

- [ ] 不在本轮重构里继续扩张新的一级功能域。
- [ ] 不把 EasySession 做成一个“小型 VS Code”。
- [ ] 不在桌面端性能优化阶段引入大规模视觉重设计。
- [ ] 不为了“感觉更快”牺牲现有本地 / 远程核心业务正确性。

---

## 2. 当前客观基线

### 2.1 代码结构现状

- [x] 主体结构已分为：
  - [x] `src/main`
  - [x] `src/preload`
  - [x] `src/renderer/src`
- [x] 远程链路已具备：
  - [x] `src/main/remote`
  - [x] `src/main/services/remote-*`
- [x] Git / 文件 / Markdown 检查面板已进入桌面端主界面：
  - [x] `src/renderer/src/components/InspectorPanel.vue`
  - [x] `src/main/services/project-inspector.ts`

### 2.2 当前高风险“大文件”

- [x] `src/renderer/src/views/SessionsView.vue` 约 `2024` 行
- [x] `src/renderer/src/components/InspectorPanel.vue` 约 `1749` 行
- [x] `src/renderer/src/views/SettingsView.vue` 约 `1297` 行
- [x] `src/main/services/project-inspector.ts` 约 `1272` 行
- [x] `src/main/remote/web/scripts/sessions.ts` 约 `1367` 行
- [x] `src/main/remote/web/styles/layouts.ts` 约 `814` 行
- [x] `src/renderer/src/stores/inspector.ts` 约 `702` 行
- [x] `src/renderer/src/components/GitHistoryTree.vue` 约 `646` 行

### 2.3 当前桌面端已存在的正向基础

- [x] 路由已经是懒加载模式。
- [x] Git 变更树和 Git 历史树已经接入虚拟列表能力。
- [x] 主进程 / preload / renderer 总体边界仍然存在，不是彻底混写。
- [x] 测试覆盖面较广，已有多类本地、远程、兼容、会话生命周期回归测试。

### 2.4 当前遗留与风险信号

- [x] 仓库仍存在明显历史残留文件：
  - [x] `src/main/remote/web.ts.old`
  - [x] `src/main/remote/web.ts.backup`
- [x] 仓库中存在大量“兼容导出 / fallback / legacy / synthetic”语义，说明迁移未完全收口。
- [x] 发布脚本未强制串联 `typecheck + test + build`。

---

## 3. 总目标与硬约束

### 3.1 总目标

- [ ] 让桌面端恢复成“主工作流稳定、结构清楚、性能可控”的状态。
- [ ] 把 `SessionsView` 重新收回到“工作区入口”，而不是继续堆业务。
- [ ] 把 Inspector 收回到“检查器”，而不是继续膨胀成第二个应用。
- [ ] 把 Git 能力从“反复变形的混合实现”推进到稳定的产品能力。
- [ ] 让远程能力继续存在，但不再反向拖垮桌面端迭代效率。

### 3.2 重构硬约束

- [ ] 不破坏现有本地会话主链。
- [ ] 不破坏现有远程桌面挂载主链。
- [ ] 不破坏现有 Web 远程应急入口主链。
- [ ] 不在重构中随意改持久化结构，任何存储改动必须带兼容策略。
- [ ] 不允许“只为了好看”改掉业务语义。
- [ ] 不允许继续在主分支保留新的 `.old / .backup / 临时兜底文件`。
- [ ] 不允许任何验证流程直接读写真实用户会话目录、真实 `session` 配置、真实桌面运行态数据。

### 3.3 性能硬约束

- [ ] 优化不以关闭核心功能为代价。
- [ ] 优化不允许牺牲终端原生透传体验。
- [ ] 优化不允许让 Git 数据错误或变更预览失真。
- [ ] 优化不允许引入更重的全局 watch / 轮询 / DOM 常驻渲染。

---

## 4. 当前问题拆解

### 4.1 架构层问题

- [x] 页面层承担过多业务编排，导致 View 和 Domain 边界模糊。
- [x] 一些 store 已经兼具：
  - [x] 业务状态
  - [x] 加载协调
  - [x] UI 偏好
  - [x] IPC 调度
- [x] Git / 文件浏览 / Markdown / 历史图 / 同步操作过度集中在 Inspector 一条链里。
- [x] 远程与桌面逻辑虽已分层，但存在历史残留与兼容包袱。

### 4.2 Renderer 层问题

- [x] `SessionsView` 同屏承载：
  - [x] 会话树
  - [x] 多分窗工作区
  - [x] Inspector
  - [x] 会话创建/操作上下文
  - [x] 远程实例状态
- [x] `InspectorPanel` 同时承载：
  - [x] 顶部工具栏
  - [x] tab 切换
  - [x] Git 变更树
  - [x] 文件树
  - [x] 历史图
  - [x] 提交详情
  - [x] diff / markdown / text 预览
  - [x] 自动收缩 / 调宽 / 调高 / hover 逻辑
- [x] 这些能力聚在一起，导致 UI 回归频繁且难以局部验证。

### 4.3 桌面端性能问题

- [x] 会话树 / 项目树没有真正走虚拟化。
- [x] 终端历史加载量过大，且每次 reload 都要重新灌回 xterm。
- [x] Inspector 刷新链路偏全量。
- [x] Git 主进程命令调用频繁，且存在多次 IPC 往返。
- [x] Git graph 虽已虚拟化，但每行单元仍较重。
- [x] 多 Pane + Inspector + Terminal 同屏时，组合渲染成本高。

### 4.4 发布与工程治理问题

- [x] 缺少强制性 release 门禁。
- [x] 缺少清晰的桌面性能验收指标。
- [x] 缺少“结构性变更必须补基线测试”的制度化要求。

---

## 5. 执行顺序

1. `Phase 0`：冻结范围、建立性能基线、清理重构边界。
2. `Phase 1`：拆 `SessionsView` 与会话树渲染链。
3. `Phase 2`：拆 `InspectorPanel` 与 Git / 预览域。
4. `Phase 3`：收 `project-inspector` 主进程服务与 IPC。
5. `Phase 4`：桌面终端链专项优化。
6. `Phase 5`：设置页与远程配置入口收口。
7. `Phase 6`：清遗留、清兼容残留、收发布门禁。
8. `Phase 7`：性能复测、回归、灰度发布准备。

强制规则：
- [ ] 未建立性能基线前，不继续大幅扩桌面端新功能。
- [ ] 未拆分 `SessionsView / InspectorPanel` 前，不继续把新一级能力挂进这两个文件。
- [ ] 未完成桌面端主链性能验收前，不把“感觉流畅”当成结论。

---

## 6. Phase 0：冻结范围与建立基线

### 6.1 目标

- [ ] 把“这轮到底优化什么、不优化什么”写清楚。
- [ ] 给桌面端建立首轮性能测量基线。
- [ ] 给重构设边界，防止边改边继续加料。
- [ ] 把验证方式统一改成隔离式、非破坏性，不依赖真实用户数据。

### 6.2 任务

- [ ] 冻结本轮范围：
  - [ ] `SessionsView`
  - [ ] `InspectorPanel`
  - [ ] `TerminalOutput`
  - [ ] `project-inspector`
  - [ ] `SettingsView`
- [ ] 记录当前桌面端基线：
  - [ ] 启动到主界面可交互耗时
  - [ ] 切到 `Sessions` 页耗时
  - [ ] 打开 Inspector 耗时
  - [ ] 切换会话耗时
  - [ ] 打开 Git 变更树耗时
  - [ ] 打开 Git 历史图耗时
  - [ ] 多 Pane 场景 CPU 占用
  - [ ] 大输出会话场景内存占用
- [ ] 统一记录测试基线环境：
  - [ ] Windows 版本
  - [ ] Electron 版本
  - [ ] 典型项目规模
  - [ ] 会话数量
  - [ ] 多 Pane 数量
- [ ] 设计隔离式验证方案：
  - [ ] 临时 `userData` / 临时 profile 启动入口
  - [ ] 临时 `session` / config / workspace state 目录
  - [ ] 只读构建检查、类型检查、打包检查
  - [ ] 后续自动化冒烟全部切到隔离目录，不触碰真实数据

### 6.3 交付物

- [ ] 一份桌面端性能基线记录文档
- [ ] 一份“本轮不继续扩张的新功能名单”
- [ ] 一份“隔离式验证与非破坏性发布检查”方案

---

## 7. Phase 1：Sessions 工作区收敛

### 7.1 目标

- [ ] 让 `SessionsView` 回到“工作区入口 + 状态编排”的职责。
- [ ] 把会话树、项目树、顶部布局、上下文操作从页面里继续拆出去。
- [ ] 解决桌面端会话区渲染随数据量上升而明显变重的问题。

### 7.2 任务

- [ ] 拆分 `SessionsView`：
  - [x] `SessionsSidebar`（第一轮：桌面左侧主树已拆为独立组件）
  - [x] `SessionsTopList`（第一轮：顶部会话条已拆为独立组件）
  - [ ] `InstanceProjectSessionTree`
  - [x] `SessionContextMenu`（第一轮：右键菜单与相关会话弹层已抽出页面主体）
  - [x] `SessionToolbar`（第一轮：左侧筛选、刷新、折叠控制已抽为独立组件）
- [ ] 对会话树 / 项目树做统一扁平化数据层。
- [x] 对会话树 / 项目树做统一扁平化数据层（第一轮：桌面左侧实例/项目/会话树已切到统一节点模型）。
- [x] 为桌面端会话树引入真正虚拟化（第一轮：桌面左侧实例/项目/会话树已接入动态虚拟列表）。
- [ ] 把拖拽排序逻辑和渲染逻辑拆开。
- [ ] 将“列表布局偏好”与“业务状态”继续隔离。

### 7.3 性能目标

- [ ] 大量项目 / 会话场景下，滚动和切换不卡顿。
- [ ] `SessionsView` 响应一个会话状态变化时，不再导致整棵树大面积重渲染。

### 7.4 验收

- [ ] 200+ 会话场景下滚动稳定。
- [ ] 频繁切换会话时不会明显掉帧。
- [ ] 页面逻辑拆分后，不再出现单文件继续膨胀。

---

## 8. Phase 2：Inspector 收敛

### 8.1 目标

- [ ] 把 Inspector 从“巨型组件”拆成多个稳定域。
- [ ] 让 `changes / files / history / viewer` 各自边界清楚。
- [ ] 降低 UI 改动牵连全部 Inspector 的概率。

### 8.2 任务

- [ ] 从 `InspectorPanel.vue` 中拆出：
  - [x] `InspectorHeader`（第一轮：顶部工具栏已拆为独立组件）
  - [x] `InspectorSidebar`（第一轮：changes/files 侧栏与目录树已拆为独立组件）
  - [x] `InspectorViewer`（第一轮：预览区与提交输入框已拆为独立组件）
  - [x] `HistoryWorkspace`（第一轮：历史图区、同步条与提交详情已拆为独立组件）
  - [ ] `CommitDetailPanel`
  - [ ] `InspectorResizer`
- [ ] 收紧 `inspector.ts`：
  - [x] UI 偏好状态单独收口（第一轮：持久化 key / 读取 / 写入已迁出 store 主体）
  - [x] Git 数据状态单独收口（第一轮：Git 状态刷新已与文件树全量刷新拆开）
  - [x] 文件浏览状态单独收口（第一轮：文件树、文件预览、变更预览已迁入独立领域模块）
  - [x] 历史查看状态单独收口（第一轮：历史工作区模板与交互已迁出主组件）
  - [x] Git 历史/同步状态单独收口（第一轮：历史、分支、提交详情与同步操作已迁入独立领域模块）
- [ ] 减少 tab 之间互相污染的布局逻辑。
- [ ] 清理 hover / 自动收缩 / 尺寸控制与业务数据的耦合。

### 8.3 性能目标

- [ ] 打开 Inspector 不再带来明显的整页抖动。
- [ ] 切 tab 时不再触发过多无关计算。
- [ ] 预览区刷新只影响 viewer，不回流整个 Inspector。

### 8.4 验收

- [ ] `changes / files / history` 切换更稳。
- [ ] 宽度/高度/自动收缩行为独立且可回归。
- [ ] Inspector 不再依赖一个 `1700+` 行组件维持。

---

## 9. Phase 3：Git / 文件服务链收口

### 9.1 目标

- [ ] 把 `project-inspector` 从“大杂烩服务”拆成更清楚的领域服务。
- [ ] 降低一次用户操作触发的 git 命令数量和 IPC 次数。
- [ ] 让 Git 刷新从“全量 reload”转成“局部刷新”。

### 9.2 任务

- [ ] 将 `project-inspector.ts` 拆分为：
  - [x] `project-file-service`（第一轮：文件树与文件读取链已迁出独立文件域模块）
  - [x] `project-git-status-service`（第一轮：状态解析与状态输出构建已迁出纯 Git 模块）
  - [x] `project-git-history-service`（第一轮：log 解析、分支解析、graph 泳道算法与 synthetic rows 已迁出纯 Git 模块）
  - [x] `project-git-sync-service`（第一轮：stage/unstage/discard/commit/checkout/fetch/pull/push/show 已迁出动作模块）
  - [x] `project-preview-service`（第一轮：文本/Markdown/二进制/过大文件判定已迁出文件域模块）
- [x] `project-context-service`（第一轮：目标解析、Git 上下文解析与 branch/diff 读取辅助已迁出上下文模块）
- [x] 对同一 target 增加短时缓存与请求去重（第一轮：Renderer `local-project` 读请求统一接入短时缓存与 in-flight 去重）。
- [ ] 将以下动作改为局部刷新：
  - [x] `stage`
  - [x] `unstage`
  - [x] `discard`
  - [x] `select file`（第一轮：通过 `local-project` 文件读取 / diff 读缓存减少重复 IPC）
  - [x] `view branch history`（第一轮：通过 `local-project` 历史 / 分支读缓存减少重复 IPC）
- [ ] 拆分 IPC 接口粒度，避免每次都重新装载 root state。
- [ ] 为大仓库场景增加结果裁剪与延迟加载策略。

### 9.3 性能目标

- [ ] 同一项目内连续操作变更树时，主进程 git 调用显著减少。
- [ ] Git 状态、diff、历史不再互相全量干扰。

### 9.4 验收

- [ ] Inspector 常见操作下，IPC 请求数量可观察下降。
- [ ] 大仓库下 Git 检查明显更顺。

---

## 10. Phase 4：桌面终端专项优化

### 10.1 目标

- [ ] 降低终端切换、重挂、重载历史时的卡顿。
- [ ] 控制多 Pane 场景下 xterm 的 CPU 与内存消耗。

### 10.2 任务

- [ ] 调整 [TerminalOutput.vue](/D:/EasySession/src/renderer/src/components/TerminalOutput.vue) 的历史加载策略：
  - [x] 降低默认 `HISTORY_LOAD_LINES`
  - [x] 引入按需补历史方案（第一轮：渐进扩大历史窗口并保留当前滚动状态）
  - [x] 区分“首次进入”和“再次切回”的加载策略（第一轮：同会话短时热缓存回放已接入）
- [x] 优化 `term.write()` 的批量灌入策略，避免大历史逐行回放太重。
- [x] 收紧 `fitAndSync()` 的触发条件（第一轮：仅容器可渲染且行列有效时才同步 PTY）。
- [x] 优化多 Pane 下的 ResizeObserver 和终端 resize 行为（第一轮：尺寸未变化时不再重复调度 fit）。
- [x] 对“停止的会话 / 不可写会话 / 后台 Pane”降低主动同步频率（第一轮：后台 Pane 不再实时刷终端，非 running 会话不再主动同步 PTY）。

### 10.3 性能目标

- [ ] 切换会话时终端重载更快。
- [ ] 多 Pane 同时存在时 CPU 不再明显飙高。
- [ ] 大输出会话不会轻易拖慢整个工作区。

### 10.4 验收

- [ ] 历史多的会话打开体感明显改善。
- [ ] 切 Pane 与切会话操作更加稳定。

---

## 11. Phase 5：设置页与远程配置收口

### 11.1 目标

- [ ] 把 `SettingsView` 从大而全的实现继续拆分。
- [ ] 降低设置页对桌面端整体复杂度的拖累。

### 11.2 任务

- [ ] 将 `SettingsView.vue` 拆分为：
  - [x] CLI 配置区（第一轮：CLI 路径设置已迁出独立 section 组件）
  - [x] 远程服务区（第一轮：本机远程服务区已迁出独立 section 组件）
  - [x] Cloudflare 区（第一轮：已迁出独立 section 组件）
  - [x] 远程实例区（第一轮：已迁出独立 section 组件）
  - [x] 外观 / 语言 / Sessions 通用区（第一轮：已迁出独立 section 组件）
  - [x] 终端区（第一轮：已迁出独立 section 组件）
  - [x] About 区（第一轮：已迁出独立 section 组件）
- [ ] 收敛用户真正需要的设置项。
- [ ] 将“复杂工程配置”与“日常用户设置”分层。
- [ ] 清理已经不必要的设置历史分支和兼容 UI。
- [x] 非关键远程区首开延迟加载（第一轮：进入视区或交互后再拉详细状态）

### 11.3 性能目标

- [x] 设置页打开不再加载过多与当前区域无关的数据（第一轮：远程三块默认不再全量首开拉取）
- [x] 设置项保存不再牵动整页重刷（第一轮：常规设置已接入短时合并保存/去抖，远程开关等强动作单独走显式刷新链）。

---

## 12. Phase 6：遗留清理与兼容收口

### 12.1 目标

- [ ] 清理仓库中的历史残留文件和迁移尾巴。
- [ ] 把“兼容层”从长期并存改成受控收口。

### 12.2 任务

- [ ] 清理以下残留文件：
  - [x] `src/main/remote/web.ts.old`
  - [x] `src/main/remote/web.ts.backup`
- [x] 盘点所有 `legacy / backup / fallback / old / 兼容导出` 入口（第一轮：已完成远程 `.old/.backup` 物理清理，并确认当前仍保留的 `fallback / synthetic / 兼容导出` 主要属于受控运行逻辑而非历史现场文件）。
- [ ] 区分：
  - [ ] 必须保留的兼容层
  - [ ] 可删除的历史残留
  - [ ] 应转为测试而非继续留在线上代码中的兜底逻辑
- [ ] 为每个“保留的兼容层”补清晰注释与退出条件。

### 12.3 验收

- [ ] 主分支不再保留明显历史现场文件。
- [ ] 兼容保留项有明确说明和退出计划。

---

## 13. Phase 7：工程治理与发布门禁

### 13.1 目标

- [ ] 给“可发布”建立硬标准。
- [ ] 让性能优化不是一次性行为，而是日常约束。
- [ ] 所有发布校验默认不触碰真实用户会话数据。

### 13.2 任务

- [x] 新增正式发布脚本：
  - [x] `typecheck`
  - [x] `test`
  - [x] `build`
  - [x] `build:win`
  - [x] `release:verify`
  - [x] `release:win`
- [ ] 将发布校验改造为隔离式验证：
  - [ ] `typecheck`
  - [ ] `build`
  - [ ] 打包检查
  - [ ] 临时数据目录下的启动级自检
- [ ] 建立桌面端隔离式性能检查清单：
  - [ ] 打开 `Sessions`
  - [ ] 打开 Inspector
  - [ ] 切换会话
  - [ ] 打开 Git 历史
  - [ ] 多 Pane
- [ ] 结构性重构必须带最小非破坏性校验：
  - [ ] 构建验证
  - [ ] 类型检查
  - [ ] 隔离 profile 下的关键路径自检

### 13.3 验收

- [x] 发布不再只依赖人工记忆（第一轮：已提供正式校验脚本与带门禁的 Windows 打包脚本）。
- [ ] 结构性改动不再“凭感觉上线”。
- [ ] 默认发布校验不再依赖会污染真实会话数据的测试链。

---

## 14. 桌面端性能专项清单

### 14.1 首要优化项

- [ ] `SessionsView` 树结构虚拟化
- [ ] `TerminalOutput` 历史加载减量
- [ ] Inspector 全量刷新改局部刷新
- [x] Git 调用去重与缓存（第一轮：Renderer API 读请求缓存与 in-flight 去重已接入）
- [ ] 多 Pane 终端 resize 收敛

### 14.2 第二优先级

- [x] Git 历史图单行渲染进一步减重（第一轮：graph/refs/hover 元数据预计算 + hover 跟随节流已接入）
- [x] Markdown / Text / Diff 预览按内容类型优化加载（第一轮：Markdown / Diff 按需异步加载 + Markdown 解析缓存 + 预览容器布局隔离）
- [x] 减少不必要的 `watch -> localStorage` 联动（第一轮：Inspector 偏好写入已改为按 key 去抖与相同值跳过）
- [x] 收紧过多的 pointer / resize / hover 监听器（第一轮：Git 历史 hover 浮窗已接入 rAF 节流）

### 14.3 第三优先级

- [ ] 优化设置页非关键区的延迟加载
- [ ] 优化远程实例状态刷新策略
- [ ] 优化技能浏览等非主路径页面

---

## 15. 量化验收指标

### 15.1 结构指标

- [ ] 不再新增 `1500+` 行的单个 Vue 组件
- [ ] 不再新增 `1000+` 行的单个主进程服务文件
- [ ] `SessionsView / InspectorPanel / SettingsView / project-inspector` 都应显著拆分

### 15.2 体验指标

- [ ] 打开 `Sessions` 页体感明显更快
- [ ] 打开 Inspector 不再带来明显卡顿
- [ ] 切换会话和 Pane 更稳
- [ ] 大仓库 Git 检查不再明显拖住界面

### 15.3 发布指标

- [x] 构建通过
- [ ] 隔离式验证通过
- [ ] 默认发布校验不触碰真实会话数据
- [ ] 新版打包后首轮真机体验无明显性能退化

---

## 16. 推荐推进节奏

### 16.1 第一轮（最值）

- [ ] Phase 0
- [ ] Phase 1
- [ ] Phase 4

说明：
- 先解决 `Sessions + Terminal`，这是桌面端主链。

### 16.2 第二轮（收稳）

- [ ] Phase 2
- [ ] Phase 3

说明：
- 再解决 Inspector 和 Git 链路，减少“越修越重”。

### 16.3 第三轮（治理）

- [ ] Phase 5
- [ ] Phase 6
- [ ] Phase 7

说明：
- 最后把设置页、遗留清理、发布治理收口。

---

## 17. 最终判断

- [x] 当前项目不是“要不要优化一点”的阶段，而是“必须做一轮结构收敛 + 桌面端性能治理”的阶段。
- [x] 这轮最关键的不是继续扩张，而是恢复边界、降低复杂度、建立性能基线。
- [x] 只要把 `Sessions / Inspector / Terminal / Git / Settings` 这五条主链收住，EasySession 才有资格继续往下长。
