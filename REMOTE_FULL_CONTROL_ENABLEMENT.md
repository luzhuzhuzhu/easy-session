# EasySession 远程完整控制能力梳理

更新时间：2026-03-08
适用仓库：`D:\EasySession`

## 1. 结论

当前项目已经具备“远程完整控制”的一部分底座，但还没有形成真正可用的完整链路。

现在的真实状态是：

- 远程默认工作在“全透传”模式。
- 桌面端和 Web 端都可以连接已有远程会话，并完成输出订阅、输入透传、终端 resize。
- 服务端已经预留了远程创建、启动、暂停、重启、删除会话的 REST 路由。
- 但这些生命周期路由默认被 `passthroughOnly=true` 禁用。
- 即使把服务端开关关掉，桌面端和 Web 端当前也还没有完整接上远程生命周期调用。

一句话概括：

当前是“远程终端透传已完成，远程会话管理与远程项目管理尚未完成”。

如果后续要支持“本地显式开启后，允许远程完整控制”，这是可以做的，但需要同时改服务端、Renderer 网关、Store、桌面 UI、Web UI 和安全边界，不能只改一个 `passthroughOnly=false`。

这里还要补一句很关键的话：

- 后续升级“远程完整控制”时，不能牺牲当前已经可用的远程只读浏览与透传链路。
- 也不能为了接入远程项目，把现有本地 `ProjectsView / ProjectDetailView / Dashboard / MainLayout` 先改坏。

---

## 2. 当前已具备的基础

### 2.1 服务端基础已经存在

当前远程服务端已经有这些能力：

- `GET /api/projects`
- `GET /api/sessions`
- `GET /api/sessions/:id/output`
- `GET /api/capabilities`
- `GET /api/server-info`
- `POST /api/sessions`
- `POST /api/sessions/:id/start`
- `POST /api/sessions/:id/pause`
- `POST /api/sessions/:id/restart`
- `DELETE /api/sessions/:id`

关键代码：

- [routes.ts](/D:/EasySession/src/main/remote/routes.ts)
- [capabilities.ts](/D:/EasySession/src/main/remote/capabilities.ts)
- [types.ts](/D:/EasySession/src/main/remote/types.ts)

当前这些生命周期路由不是没有，而是被这段逻辑统一拦住：

- [routes.ts:181](/D:/EasySession/src/main/remote/routes.ts:181)

也就是说，后端“物理能力”已经有，当前只是“策略禁用”。

### 2.2 能力矩阵已经有雏形

当前项目已经有远程能力矩阵：

- `sessionCreate`
- `sessionStart`
- `sessionPause`
- `sessionRestart`
- `sessionDestroy`
- `projectsList`
- `projectPromptRead`
- `projectPromptWrite`
- `localPathOpen`

关键代码：

- [capabilities.ts:3](/D:/EasySession/src/main/remote/capabilities.ts:3)
- [unified-resource.ts:4](/D:/EasySession/src/renderer/src/models/unified-resource.ts:4)

这意味着后续不是从零设计权限模型，而是沿着现有能力矩阵扩展。

### 2.3 桌面 UI 已经按能力矩阵隐藏部分按钮

当前桌面端在 `SessionsView` 和 `WorkspacePaneTree` 中，已经会根据实例能力决定是否显示：

- 启动
- 暂停
- 重启
- 删除

关键代码：

- [SessionsView.vue:307](/D:/EasySession/src/renderer/src/views/SessionsView.vue:307)
- [WorkspacePaneTree.vue:292](/D:/EasySession/src/renderer/src/components/WorkspacePaneTree.vue:292)

这说明桌面端已经不是“完全写死本地能力”，而是已经部分 instance-aware。

### 2.4 本机远程服务设置页已经能切换 `passthroughOnly`

设置页现在已经能配置：

- 本机远程服务是否启用
- 端口、Host
- `passthroughOnly`

关键代码：

- [SettingsView.vue:114](/D:/EasySession/src/renderer/src/views/SettingsView.vue:114)
- [remote-service-manager.ts](/D:/EasySession/src/main/services/remote-service-manager.ts)
- [config.ts](/D:/EasySession/src/main/remote/config.ts)

这意味着未来做“远程完整控制开关”时，底层配置入口不是空白。

---

## 3. 当前真正卡住的点

### 3.1 `passthroughOnly=false` 不等于“完整控制立即可用”

这是最重要的判断。

当前如果只把被控端改成：

- `passthroughOnly=false`

服务端会放开生命周期 REST 路由，但桌面端和 Web 端仍然不完整，因为它们还缺少真正的远程生命周期调用链。

### 3.2 Renderer Gateway 只覆盖了透传能力

当前 Gateway 接口只有：

- 列项目
- 列会话
- 获取会话
- 拉历史输出
- 订阅输出
- 订阅状态
- 写入原始输入
- resize

关键代码：

- [types.ts](/D:/EasySession/src/renderer/src/gateways/types.ts:4)

也就是说，当前 Gateway 层根本没有：

- `createSession`
- `startSession`
- `pauseSession`
- `restartSession`
- `destroySession`

所以就算服务端放开了，Renderer 也没有统一抽象去调。

### 3.3 `RemoteGateway` 没有生命周期方法

当前 `RemoteGateway` 只支持：

- 列项目
- 列会话
- 输出历史
- 订阅输出
- 状态订阅
- `writeRaw`
- `resize`

关键代码：

- [remote-gateway.ts](/D:/EasySession/src/renderer/src/gateways/remote-gateway.ts)

缺少：

- `POST /api/sessions`
- `POST /api/sessions/:id/start`
- `POST /api/sessions/:id/pause`
- `POST /api/sessions/:id/restart`
- `DELETE /api/sessions/:id`

### 3.4 `sessionsStore` 明确把生命周期限制成“仅本地”

这是桌面端当前的硬限制。

关键代码：

- [sessions.ts:245](/D:/EasySession/src/renderer/src/stores/sessions.ts:245)

当前 `sessionsStore` 的这几条方法都会先做：

- `assertLocalSessionRef(...)`

涉及：

- `startSessionRef`
- `pauseSessionRef`
- `restartSessionRef`
- `destroySessionRef`
- `renameSessionRef`
- `updateSessionIconRef`
- `clearSessionOutputRef`

也就是说，当前桌面端的“会话生命周期 Store”仍然是本地模型，只是列表和终端透传支持了远程。

### 3.5 会话创建入口仍然是本地优先

当前 `CreateSessionDialog` 是直接调用本地 `sessionsStore.createSession(...)`：

- [CreateSessionDialog.vue:250](/D:/EasySession/src/renderer/src/components/CreateSessionDialog.vue:250)

而 `sessionsStore.createSession(...)` 又直接走本地 API：

- [sessions.ts:177](/D:/EasySession/src/renderer/src/stores/sessions.ts:177)

这意味着：

- 当前“创建会话”不是基于实例的
- 仍然是“在本机创建”

另外，项目树里是否显示“+”也只对本地开放：

- [session-tree.ts:89](/D:/EasySession/src/renderer/src/features/sessions/session-tree.ts:89)

### 3.6 `ProjectDetailView` 仍然是本地业务

当前项目详情页里的：

- 启动会话
- 暂停会话
- 重启会话
- 删除会话

仍然直接走本地 API：

- [ProjectDetailView.vue:205](/D:/EasySession/src/renderer/src/views/ProjectDetailView.vue:205)

所以即使 `SessionsView` 支持远程生命周期，`ProjectDetailView` 也会和它不一致。

### 3.7 项目管理链仍然是本地模型

当前远程项目虽然已经能进入统一模型和会话树，但真正的项目管理业务仍然是本地链路：

- `ProjectsView` 只消费本地 `projectsStore.projects`，没有使用 `unifiedProjects`。
- 路由仍然是 `/projects/:id`，只能表达本地 `projectId`，不能唯一标识远程项目。
- `projectsStore.activeProjectId` 和 `activeUnifiedProject` 仍然默认按 `local` 解析。
- `ProjectDetailView` 直接调用本地 `project:*` IPC 和本地 `session:*` API。
- `Dashboard` 和 `MainLayout` 的最近项目入口也仍然是本地项目路径。

关键代码：

- [ProjectsView.vue](/D:/EasySession/src/renderer/src/views/ProjectsView.vue)
- [ProjectDetailView.vue](/D:/EasySession/src/renderer/src/views/ProjectDetailView.vue)
- [projects.ts](/D:/EasySession/src/renderer/src/stores/projects.ts)
- [router/index.ts](/D:/EasySession/src/renderer/src/router/index.ts)
- [DashboardView.vue](/D:/EasySession/src/renderer/src/views/DashboardView.vue)
- [MainLayout.vue](/D:/EasySession/src/renderer/src/layouts/MainLayout.vue)

所以当前“远程项目”更多只是会话归属容器，不是桌面端完整的项目管理对象。

### 3.8 Web 端仍然是纯透传页面

当前 Web 远程页面明确按 `PASSTHROUGH_ONLY` 控制：

- [web.ts:644](/D:/EasySession/src/main/remote/web.ts:644)
- [web.ts:1206](/D:/EasySession/src/main/remote/web.ts:1206)

也就是说 Web 现在定位仍然是：

- 手机端应急
- 浏览器应急
- 连接已有会话

它并没有真正做远程生命周期控制 UI。

---

## 4. 目标能力定义

如果后续要支持“本地开启后，允许远程完整控制”，建议把目标能力定义为：

### 4.1 桌面端

- 支持在 `ProjectsView` 中统一管理本地项目与远程项目。
- 支持远程项目进入独立项目详情页，而不是只在会话树里出现。
- 支持远程项目的能力矩阵控制：
  - 远程项目详情查看
  - 远程项目会话列表
  - 远程项目创建 / 重命名 / 删除
  - 远程项目检测
  - 远程项目 Prompt 读写
- 支持在远程实例下创建会话
- 支持在远程实例下启动已有会话
- 支持暂停远程会话
- 支持重启远程会话
- 支持删除远程会话
- 支持在 `SessionsView`、`WorkspacePaneTree`、`ProjectDetailView` 三处行为一致

### 4.2 Web 端

建议分阶段：

第一阶段：

- 保持 Web 仍以透传为主
- 只在能力允许时补充：
  - 启动
  - 暂停
  - 重启
  - 删除

第二阶段：

- 再考虑支持远程创建会话

原因：

- Web 是移动端 / 应急入口
- 远程创建会话的参数表单复杂
- 在手机上做完整创建体验成本更高

### 4.3 被控端开关语义

强烈建议把“是否允许远程完整控制”定义为**显式本地授权**，而不是默认行为。

即：

- 默认：`passthroughOnly=true`
- 用户在本机设置中主动关闭透传-only，才开放完整控制

这点非常重要，因为一旦开放远程完整控制，远程就不仅能“接管终端”，还可以：

- 新起本机 CLI 进程
- 改变会话生命周期
- 影响本机资源占用和运行状态

---

## 5. 推荐实现方案

## 5.1 不建议继续沿用“全透传”这个词来表示“允许完整控制”

这里需要先澄清命名。

当前项目里：

- `passthroughOnly=true` 的语义非常清晰，就是“只连接已有会话，不开放生命周期”

所以如果要支持完整控制，不建议把文案写成：

- “开启远程全透传后支持完整控制”

这会和已有语义冲突。

建议统一成：

- `Remote Access Mode`
  - `Passthrough Only`
  - `Managed Control`

或者：

- 保留底层字段 `passthroughOnly`
- UI 上展示为：
  - `仅透传`
  - `允许远程控制`

这样可以兼容已有元数据，不必重命名存储字段。

### 5.2 元数据兼容策略

为了不破坏现在已经稳定的持久化，建议：

- **不改底层持久化字段名**
- 继续保留：
  - `passthroughOnly: boolean`

解释规则：

- `true` = 仅透传
- `false` = 允许远程完整控制

这样能保证：

- 旧配置文件仍可读
- 不需要迁移 `remote-service-config.json`
- `remote-instance-manager`、`capabilities` 逻辑仍然兼容

如果未来想做更清晰的模式字段，也建议：

- UI 层新增派生概念 `remoteAccessMode`
- 存储层仍保持 `passthroughOnly`

### 5.3 服务端目标

服务端层面要做的事情不多，主要是“从预留状态变成正式支持”：

1. 保持现有生命周期 REST 路由。
2. 保持 `passthroughOnly` 拦截逻辑。
3. 当 `passthroughOnly=false` 时，正式支持：
   - `POST /api/sessions`
   - `POST /api/sessions/:id/start`
   - `POST /api/sessions/:id/pause`
   - `POST /api/sessions/:id/restart`
   - `DELETE /api/sessions/:id`
4. 确保这些接口的返回 DTO 与本地 session DTO 完全一致。
5. 把错误码体系统一好，避免桌面端和 Web 端难以区分：
   - `PASSTHROUGH_ONLY`
   - `SESSION_NOT_FOUND`
   - `PROJECT_NOT_FOUND`
   - `BAD_REQUEST`
   - `INTERNAL_ERROR`

另外，如果要真正支持远程项目管理，还需要补齐项目维度 REST：

1. `GET /api/projects/:id`
2. `GET /api/projects/:id/sessions`
3. `GET /api/projects/:id/detect`
4. `GET /api/projects/:id/prompt?cliType=claude|codex`
5. `POST /api/projects`
6. `PATCH /api/projects/:id`
7. `DELETE /api/projects/:id`
8. `POST /api/projects/:id/open`
9. `PUT /api/projects/:id/prompt`

这些接口建议继续受能力矩阵和 `passthroughOnly` 的共同控制。

这里要特别定义清楚：

- `GET /api/projects/:id`、`GET /api/projects/:id/sessions`、`GET /api/projects/:id/detect`、`GET /api/projects/:id/prompt`
  更接近“只读项目能力”，不应和写操作绑在一起。
- `POST /api/projects/:id/open` 的语义应该是“同步远程侧最近打开 / 最近访问”，不应误实现成“打开宿主机文件夹”。
- `localPathOpen` 仍然应保持单独能力，不要与 `projectOpen` 混淆。

### 5.4 Gateway 层目标

需要扩展 `Gateway` 接口。

建议新增：

- `createSession(instanceId, params)`
- `startSession(instanceId, sessionId)`
- `pauseSession(instanceId, sessionId)`
- `restartSession(instanceId, sessionId)`
- `destroySession(instanceId, sessionId)`

必要时也可以继续扩：

- `renameSession(instanceId, sessionId, name)`
- `updateSessionIcon(instanceId, sessionId, icon)`

但如果这一阶段只做你提到的“新增/启动/重启/暂停/删除”，那先收敛到上面 5 个即可。

### 5.5 `LocalGateway` 和 `RemoteGateway` 都要补生命周期实现

原因：

- 一旦 Gateway 接口升级，本地和远程都要对齐
- 否则上层 Store 还是会分叉

本地：

- `LocalGateway` 包装现有本地 API

远程：

- `RemoteGateway` 对应调用远程 REST 生命周期接口

### 5.6 `sessionsStore` 要从“本地生命周期 Store”升级成“实例感知生命周期 Store”

这是完整控制最核心的改造点。

当前需要改掉这些“仅本地”限制：

- `assertLocalSessionRef(...)`
- `startSessionRef`
- `pauseSessionRef`
- `restartSessionRef`
- `destroySessionRef`

目标行为：

- 本地实例：继续走本地 Gateway
- 远程实例：
  - 如果能力允许，则走远程 Gateway
  - 如果能力不允许，则抛出 `PASSTHROUGH_ONLY` 或能力不足错误

### 5.7 创建会话要改成“实例感知”

当前 `CreateSessionDialog` 没有实例概念。

目标应该是：

- 打开创建会话弹窗时，明确知道当前要在哪个实例创建
- 如果是本地项目，就默认本地实例
- 如果是远程项目，就默认对应远程实例
- 如果是从全局按钮创建，需要先让用户选实例

建议给 `CreateSessionDialog` 增加：

- `targetInstanceId`
- `instanceCapabilities`
- `disableProjectPathBrowse` 等实例感知参数

同时要注意：

- 远程创建时，不能再弹本地 `selectFolder`
- 远程创建应该优先传：
  - `projectId`
  - 或远程侧已有 `projectPath`

### 5.8 `ProjectDetailView` 需要实例感知重构

当前 `ProjectDetailView` 还是本地项目页面模型。

如果要真正支持远程完整控制，必须改成：

- 项目详情页知道自己属于哪个实例
- 页内会话操作走实例感知的 `sessionsStore`

否则桌面端会出现：

- `SessionsView` 能控制远程
- `ProjectDetailView` 却只能控制本地

这种割裂体验。

### 5.9 项目管理主链也要升级成实例感知

除了会话管理，项目管理也必须补齐这些改造：

1. `ProjectsView` 改为基于 `unifiedProjects` 展示本地 + 远程项目。
2. `projectsStore` 的活跃项目标识从 `activeProjectId` 升级成 `globalProjectKey` 或 `ProjectRef`。
3. Router 从 `/projects/:id` 升级到实例感知形式，例如：
   - `/projects/:instanceId/:projectId`
   - 或兼容旧路由并对本地项目自动映射。
4. `Dashboard` 最近项目与 `MainLayout` 项目快捷入口改为支持远程项目。
5. 远程项目详情页只展示当前实例能力允许的操作，不得默认复用本地文件系统行为。

另外必须加两条安全约束：

6. 在所有项目页面完全切到实例感知前，必须保留当前 `projects` 与 `recentProjects` 的本地兼容语义，不能让现有页面先失效。
7. 任意远程项目请求失败时，不得清空本地项目列表、最近项目和首页统计。

### 5.10 Web 端建议分阶段开放

建议不要第一步就把 Web 做成完整桌面级管理器。

更稳妥的节奏是：

第一期：

- Web 保持“已有会话透传”为主
- 加上能力允许时的：
  - 启动
  - 暂停
  - 重启
  - 删除

第二期：

- 再补“创建会话”

原因很现实：

- 手机端表单复杂度更高
- 远程创建涉及 CLI 类型、项目选择、选项参数
- 先把“已有会话管理”做稳，收益更大

---

## 6. 推荐开发顺序

### Phase A：定义正式模式

1. 统一文案：
   - `仅透传`
   - `允许远程控制`
2. 保持底层字段仍是 `passthroughOnly`
3. 设置页风险提示补齐

### Phase B：补 Gateway 生命周期接口

1. 扩 `Gateway` 类型
2. 补 `LocalGateway`
3. 补 `RemoteGateway`
4. 补对应测试

### Phase C：重构 `sessionsStore`

1. 生命周期方法改为实例感知
2. 清理只允许本地的断言
3. 保证本地老行为不退化

### Phase D：桌面端 UI 打通

1. `SessionsView`
2. `WorkspacePaneTree`
3. `CreateSessionDialog`
4. `ProjectDetailView`

### Phase E：项目管理链打通

1. `ProjectsView`
2. `ProjectDetailView`
3. Router / breadcrumb / recent projects
4. Dashboard / MainLayout

### Phase F：Web 端按能力逐步放开

1. 先放开：
   - 启动
   - 暂停
   - 重启
   - 删除
2. 再评估是否支持创建

### Phase G：安全与发布

1. 默认仍为 `passthroughOnly=true`
2. 明确提示“允许远程控制”风险
3. 首发先灰度给桌面端
4. Web 完整控制延后

---

## 7. 风险与边界

### 7.1 安全风险

允许远程完整控制后，远程端可以：

- 启动本机 CLI 会话
- 重启、销毁本机会话
- 影响本机资源使用和工作流

所以必须：

- 默认关闭
- 由被控端本机明确开启
- 不建议通过远程端自行打开

### 7.2 兼容风险

如果改不好，最容易破坏的是：

- `sessionsStore` 当前本地逻辑
- `CreateSessionDialog` 本地目录选择逻辑
- `ProjectDetailView` 现有本地项目操作

所以实施时必须保证：

- 本地实例路径不退化
- 本地仍然继续走现有 API 语义
- 远程只是扩展，不是替换

### 7.3 Web 复杂度风险

如果一上来就在手机 Web 做完整创建体验，容易导致：

- 表单复杂
- 交互拥挤
- Bug 面增加

所以 Web 建议后置。

---

## 8. 当前最值得继续做的事

如果确定要推进“远程完整控制”，我建议下一步先做这 3 件：

1. 扩 `Gateway` 生命周期接口。
2. 重构 `sessionsStore`，让生命周期操作从“仅本地”变成“实例感知”。
3. 给设置页的本机远程服务增加更清晰的模式文案：
   - `仅透传`
   - `允许远程控制`

做完这三步后，桌面端主链基本就能开始接真正的远程创建/启动/暂停/重启/删除了。

---

## 9. 最终判断

当前项目不是“完全不支持远程完整控制”，而是：

- 服务端基础已经预留
- 桌面端能力矩阵也已经有了
- 但上层数据流和 UI 还停留在“远程透传阶段”

所以后续要支持“本地开启后允许远程完整控制”，是完全合理的方向。

但正确的做法不是直接把 `passthroughOnly` 关掉，而是：

- 用现有能力矩阵和实例模型继续往上补齐
- 保持本地兼容
- 保持默认安全
- 分阶段开放桌面端和 Web 端能力
