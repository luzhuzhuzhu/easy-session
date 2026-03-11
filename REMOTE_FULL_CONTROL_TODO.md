# EasySession 远程完整控制与远程项目管理正式开发 TODO

更新时间：2026-03-09
适用仓库：`D:\EasySession`
基线文档：

- [REMOTE_FULL_CONTROL_ENABLEMENT.md](/D:/EasySession/REMOTE_FULL_CONTROL_ENABLEMENT.md)
- [DESKTOP_REMOTE_MOUNT_ARCHITECTURE.md](/D:/EasySession/DESKTOP_REMOTE_MOUNT_ARCHITECTURE.md)
- [todo.md](/D:/EasySession/todo.md)

说明：

- 本 TODO 专门用于“从远程透传升级到远程完整控制，并把远程项目管理正式纳入桌面端主业务”。
- 本 TODO 不替代总 TODO，而是作为专项开发清单。
- 所有改动必须保持 UTF-8，并优先保证旧数据、旧配置、旧工作区兼容。

---

## 1. 目标

- [x] 在本机显式开启后，允许远程实例执行完整会话生命周期操作。
- [x] 让远程项目不再只是会话归属容器，而是成为桌面端正式的项目管理对象。
- [x] 桌面端支持在 `ProjectsView / ProjectDetailView / SessionsView / WorkspacePaneTree` 中一致地管理远程项目和远程会话。
- [ ] Web 端保持移动端 / 浏览器应急入口定位，并按阶段开放远程生命周期能力。

---

## 2. 不可破坏的硬约束

- [x] 不破坏现有 `sessions.json` 语义。
- [x] 不破坏现有 `projects.json` 语义。
- [x] 不破坏现有 `workspace-layout.json` 兼容读取。
- [x] 不把远程项目或远程会话回写进本地 `ProjectManager / SessionManager` 主存储。
- [x] 不重命名现有 `passthroughOnly` 存储字段。
- [x] 默认仍然保持“仅透传”，必须由被控端本机显式开启“允许远程控制”。
- [x] Web 远程入口继续保留，不因桌面端增强而删除。
- [x] 不退化当前已经可用的远程只读浏览与透传链路：
  - [x] 远程项目列表
  - [x] 远程会话列表
  - [x] 已有会话透传
  - [x] 输出历史与实时输出
- [x] 在实例感知项目页完全打通前，不得先破坏现有本地 `ProjectsView / ProjectDetailView / Dashboard / MainLayout`。
- [x] 任意远程项目请求失败时，不得清空或污染本地项目列表、最近项目和首页统计。

---

## 3. 当前代码断点确认

### 3.1 会话管理断点

- [x] 服务端生命周期 REST 路由已存在，且默认仍受 `PASSTHROUGH_ONLY` 保护。
- [x] `Gateway` 已补齐远程生命周期接口。
- [x] `RemoteGateway` 已实现 `create/start/pause/restart/destroy`。
- [x] `sessionsStore` 已支持按实例分发远程会话生命周期操作。
- [x] `CreateSessionDialog` 已升级为实例感知创建模型。

### 3.2 项目管理断点

- [x] 服务端远程项目 REST 已补齐到可支撑后续桌面端改造的程度。
- [x] `Gateway` 已具备远程项目管理接口。
- [x] `ProjectsView` 已接入 `unifiedProjects`。
- [x] Router 已增加实例感知项目路由，同时保留旧本地 `/projects/:id`。
- [x] `projectsStore` 已升级到 `activeGlobalProjectKey / ProjectRef` 为主。
- [x] `ProjectDetailView` 已改为通过 `projectsStore / Gateway` 读取项目与会话。
- [x] `Dashboard` 与 `MainLayout` 最近项目入口已支持远程项目。

---

## 4. 目标能力矩阵

### 4.1 会话能力

- [x] `sessionCreate`
- [x] `sessionStart`
- [x] `sessionPause`
- [x] `sessionRestart`
- [x] `sessionDestroy`

### 4.2 项目能力

- [x] `projectRead`
- [x] `projectCreate`
- [x] `projectUpdate`
- [x] `projectRemove`
- [x] `projectOpen`（仅表示“进入详情 / 标记最近打开 / 同步最近项目”，不等于打开宿主机文件夹）
- [x] `projectSessionsList`
- [x] `projectDetect`
- [x] `projectPromptRead`
- [x] `projectPromptWrite`

### 4.3 继续保留的限制

- [x] `localPathOpen` 默认仍不对远程实例开放。
- [x] 远程项目不应触发本地 `selectFolder`。
- [x] 远程项目不应默认暴露本地文件系统路径操作。
- [x] `projectOpen` 不得复用为“打开宿主机文件夹”。

---

## 5. Phase A：模式与文案冻结

- [x] 统一术语：
  - [x] `仅透传`
  - [x] `允许远程控制`
- [x] 保持底层配置字段仍为 `passthroughOnly`，不做持久化字段重命名。
- [x] 设置页文案明确风险：
  - [x] 开启后允许远程创建和控制本机会话
  - [x] 默认关闭
- [x] 将“全透传”旧说法从完整控制语义里剥离，避免混淆。

完成标准：

- [x] 新旧配置兼容。
- [x] 产品文案中不再混用“仅透传”和“完整控制”。

---

## 6. Phase B：服务端补齐远程项目管理 REST

### 6.1 项目基础接口

- [x] 新增 `GET /api/projects/:id`
- [x] 新增 `GET /api/projects/:id/sessions`
- [x] 新增 `GET /api/projects/:id/detect`
- [x] 新增 `GET /api/projects/:id/prompt?cliType=claude|codex`

### 6.2 项目写操作接口

- [x] 新增 `POST /api/projects`
- [x] 新增 `PATCH /api/projects/:id`
- [x] 新增 `DELETE /api/projects/:id`
- [x] 新增 `POST /api/projects/:id/open`
  - [x] 明确该接口只用于更新远程侧“最近打开 / 最近访问”元数据。
  - [x] 不得把它实现成“打开宿主机文件夹”。
- [x] 新增 `PUT /api/projects/:id/prompt`

### 6.3 服务端控制边界

- [x] `passthroughOnly=true` 时：
  - [x] 禁止项目创建 / 更新 / 删除
  - [x] 禁止会话创建 / 生命周期控制
  - [x] 保持当前远程列表与透传链路不退化。
  - [x] 允许只读型项目接口：
    - [x] 项目详情
    - [x] 项目会话列表
    - [x] 检测
    - [x] Prompt 读取
  - [x] 只读接口是否开放由能力矩阵显式控制，不允许靠前端自行猜测。
- [x] `passthroughOnly=false` 时：
  - [x] 正式开放项目管理接口
  - [x] 正式开放会话生命周期接口

### 6.4 错误码统一

- [x] 统一项目错误码：
  - [x] `PROJECT_NOT_FOUND`
  - [x] `PROJECT_ALREADY_EXISTS`
  - [x] `BAD_REQUEST`
  - [x] `PASSTHROUGH_ONLY`
- [x] 统一会话错误码：
  - [x] `SESSION_NOT_FOUND`
  - [x] `PASSTHROUGH_ONLY`

完成标准：

- [x] 服务端项目与会话完整控制接口齐备。
- [x] 透传模式与完整控制模式行为边界清晰。

---

## 7. Phase C：能力矩阵扩展

- [x] 为远程能力矩阵新增项目能力字段：
  - [x] `projectRead`
  - [x] `projectCreate`
  - [x] `projectUpdate`
  - [x] `projectRemove`
  - [x] `projectOpen`
  - [x] `projectSessionsList`
  - [x] `projectDetect`
  - [x] `projectPromptRead`
  - [x] `projectPromptWrite`
- [x] 更新：
  - [x] `src/main/remote/types.ts`
  - [x] `src/main/remote/capabilities.ts`
  - [x] `src/renderer/src/models/unified-resource.ts`
- [x] 保证旧远程实例记录自动补默认字段，不因新能力字段缺失而崩。

完成标准：

- [x] 本地实例默认全能力。
- [x] 远程实例能力由服务端真实返回。
- [x] 旧元数据读入后自动补齐新增能力字段。

---

## 8. Phase D：Gateway 生命周期与项目管理接口

### 8.1 扩展 Gateway 类型

- [x] 为 `SessionGateway` 增加：
  - [x] `createSession`
  - [x] `startSession`
  - [x] `pauseSession`
  - [x] `restartSession`
  - [x] `destroySession`
- [x] 为 `ProjectGateway` 增加：
  - [x] `getProject`
  - [x] `createProject`
  - [x] `updateProject`
  - [x] `removeProject`
  - [x] `openProject`（仅同步最近打开，不等于打开宿主机路径）
  - [x] `listProjectSessions`
  - [x] `detectProject`
  - [x] `readProjectPrompt`
  - [x] `writeProjectPrompt`

### 8.2 LocalGateway

- [x] 用现有本地 API 封装新接口。
- [x] 不改变本地业务语义。

### 8.3 RemoteGateway

- [x] 对接远程项目 REST：
  - [x] `projects`
  - [x] `project sessions`
  - [x] `project detect`
  - [x] `project prompt`
- [x] 对接远程会话生命周期 REST。
- [x] 保持现有 `writeRaw / resize / output history / subscribe` 不退化。

完成标准：

- [x] 上层 Store 不再直接区分本地 API 与远程 API。
- [x] 所有生命周期与项目管理操作都能通过 `GatewayResolver` 分发。

---

## 9. Phase E：sessionsStore 升级为实例感知生命周期 Store

- [x] 去掉“远程生命周期一定抛错”的硬编码限制。
- [x] 将以下方法升级为实例感知：
  - [x] `createSession`
  - [x] `startSessionRef`
  - [x] `pauseSessionRef`
  - [x] `restartSessionRef`
  - [x] `destroySessionRef`
- [x] 明确哪些方法仍然只允许本地：
  - [x] `renameSessionRef` 暂仍只支持本地
  - [x] `updateSessionIconRef` 暂仍只支持本地
  - [x] `clearSessionOutputRef` 目前仍只允许本地
- [x] 保证远程操作成功后正确刷新：
  - [x] `sessions`
  - [x] `workspace`
  - [x] `activeSessionRef`

完成标准：

- [x] 本地会话行为不退化。
- [x] 远程实例在能力允许时可做完整会话生命周期操作。

---

## 10. Phase F：projectsStore 升级为实例感知项目管理 Store

- [x] 将活跃项目标识从 `activeProjectId` 升级为：
  - [x] `activeGlobalProjectKey`
  - [x] 或 `ProjectRef`
- [x] `activeUnifiedProject` 不再默认只按 `local` 解析。
- [x] 在所有项目页迁移完成前，保留当前 `projects` / `recentProjects` 的本地兼容语义，不让现有页面先崩。
- [x] 统一项目读取链路：
  - [x] `fetchProjects`
  - [x] `fetchProjectsForInstance`
  - [x] `fetchAllProjects`
- [x] 增加实例感知项目操作：
  - [x] `createProjectRef`
  - [x] `updateProjectRef`
  - [x] `removeProjectRef`
  - [x] `openProjectRef`
  - [x] `getProjectSessionsRef`
  - [x] `detectProjectRef`
  - [x] `readProjectPromptRef`
  - [x] `writeProjectPromptRef`
- [x] 任意远程实例拉取失败时：
  - [x] 不清空本地 `projects`
  - [x] 不清空本地 `recentProjects`
  - [x] 不让当前激活的本地项目详情页进入错误态

完成标准：

- [x] `projectsStore` 可完整管理本地 + 远程项目。
- [x] 不再需要在视图层里直接区分“本地项目页”和“远程项目页”。

---

## 11. Phase G：路由与项目引用模型升级

- [x] 设计远程项目可唯一定位的路由方案：
  - [x] 已实现：`/instances/:instanceId/projects/:projectId`
  - [x] 兼容旧本地路由 `/projects/:id`
- [x] 在所有调用点切换完成前：
  - [x] 保留旧 `projectDetail` route name 与旧本地链接可用。
  - [x] 远程项目只走新实例感知路由，不挤占旧本地路由。
- [x] breadcrumb 升级为实例感知。
- [x] `router.push('/projects/...')` 的所有调用点统一升级：
  - [x] `ProjectsView`
  - [x] `SessionsView`
  - [x] `DashboardView`
  - [x] `MainLayout`
- [x] 提供兼容跳转规则：
  - [x] 旧本地项目链接自动映射到 `local`

完成标准：

- [x] 本地和远程项目都能通过唯一路由打开详情页。
- [x] 旧本地项目链接不失效。

---

## 12. Phase H：ProjectsView 接入远程项目管理

- [x] `ProjectsView` 改为展示 `unifiedProjects`。
- [x] 明确项目卡片显示实例信息：
  - [x] 本机
  - [x] 远程实例名
  - [x] 远程在线状态
- [x] 新增项目筛选维度：
  - [x] 全部
  - [x] 本机
  - [x] 按远程实例
- [x] 项目卡片动作按能力矩阵显示：
  - [x] 进入详情
  - [x] 重命名
  - [x] 删除
  - [x] 打开路径仅本地可用
- [x] “添加项目”支持实例选择：
  - [x] 本地添加
  - [x] 远程实例添加
- [x] 在远程项目创建链路真正完成前：
  - [x] 当前本地“添加项目”按钮保持可用且默认不变。
  - [x] 不允许为了远程实例选择而先破坏本地 `selectFolder` 体验。

完成标准：

- [x] 远程项目不再只在会话树里可见。
- [x] `ProjectsView` 成为本地 + 远程统一项目管理页。

---

## 13. Phase I：ProjectDetailView 升级为实例感知项目详情页

- [x] 项目详情读取改走 `projectsStore / Gateway`，不再直接写死本地 API。
- [x] 项目会话列表支持远程项目。
- [x] 项目详情页会话操作按实例能力矩阵控制：
  - [x] 启动
  - [x] 暂停
  - [x] 重启
  - [x] 删除
- [x] 项目检测支持远程项目。
- [x] Prompt 读写支持远程项目。
- [x] 当实例能力不支持 `projectDetect / projectPromptRead / projectPromptWrite` 时：
  - [x] 详情页退化为只读展示，不报错、不白屏。
- [x] Skills 区块保持当前策略：
  - [x] 不纳入当前远程项目管理范围
  - [x] 明确为本地 / CLI 自身能力
- [x] 本地路径显示与本地打开路径行为仍只对本地项目开放。
- [x] 任意远程项目详情加载失败时：
  - [x] 不影响本地项目详情页使用
  - [x] 不影响项目列表页继续操作

完成标准：

- [x] 远程项目拥有真正可用的项目详情页。
- [x] 项目详情页行为与 `SessionsView` 的实例能力边界一致。

---

## 14. Phase J：CreateSessionDialog 与会话创建入口实例感知

- [x] `CreateSessionDialog` 增加实例语义：
  - [x] `targetInstanceId`
  - [x] `targetProjectId`
  - [x] `targetProjectPath`
- [x] 本地项目创建仍支持 `selectFolder`。
- [x] 远程项目创建不得依赖本地文件夹选择器。
- [x] 从 `SessionsView` 进入创建时：
  - [x] 本地项目默认本地实例
  - [x] 远程项目默认对应远程实例
- [x] 从 `ProjectsView / ProjectDetailView` 创建时：
  - [x] `ProjectDetailView` 自动继承当前实例与项目
  - [x] `ProjectsView` 会话创建入口已补齐

完成标准：

- [x] 会话创建真正支持“在远程项目下创建远程会话”。

---

## 15. Phase K：Dashboard 与 MainLayout 补齐远程项目入口

- [x] `Dashboard` 最近项目支持远程项目。
- [x] `Dashboard` 项目统计支持本地 + 远程维度。
- [x] `MainLayout` 项目侧栏支持远程项目快捷入口。
- [x] 项目 breadcrumb 与最近项目入口都遵循实例感知路由。
- [x] 远程聚合失败时：
  - [x] 本地最近项目仍正常显示
  - [x] 本地统计仍正常显示
  - [x] 首页与侧栏不因单个远程实例异常而整体失效

完成标准：

- [x] 首页与主导航不再把远程项目漏掉。

---

## 16. Phase L：Web 端分阶段开放完整控制

### 16.1 第一阶段

- [x] Web 继续以透传为主。
- [x] 当能力允许时开放：
  - [x] 启动
  - [x] 暂停
  - [x] 重启
  - [x] 删除

### 16.2 第二阶段

- [ ] 评估是否支持手机端创建会话。
- [ ] 如支持，必须单独设计轻量表单，不照搬桌面端。

完成标准：

- [x] 不牺牲 Web 端移动应急定位。
- [x] 不把手机端做成桌面复杂管理台。

---

## 17. 测试与验收

### 17.1 单测 / 集成测试

- [x] 服务端项目 REST 新增路由测试。
- [x] `passthroughOnly=true` 下只读项目接口回归测试。
- [x] `RemoteGateway` 生命周期与项目管理测试。
- [x] `LocalGateway` 生命周期与项目管理回归测试。
- [x] `projectsStore` 实例感知项目操作测试。
- [x] `sessionsStore` 远程生命周期测试。
- [x] 路由兼容测试：
  - [x] 旧 `/projects/:id`
  - [x] 新实例感知项目路由
- [ ] `ProjectsView / ProjectDetailView / Dashboard / MainLayout` 本地回归测试。
- [x] 远程项目请求失败不影响本地项目页 / 首页测试。

### 17.2 手工验收

- [ ] 本地实例完整项目管理不退化。
- [ ] 远程实例在 `passthroughOnly=true` 时仍只允许透传。
- [ ] 远程实例在 `passthroughOnly=false` 时可完整管理项目和会话。
- [ ] `ProjectsView / ProjectDetailView / SessionsView / WorkspacePaneTree` 行为一致。
- [ ] `Dashboard / MainLayout` 最近项目与入口一致。
- [ ] Web 端仍可作为移动端应急入口。

### 17.3 兼容性验收

- [x] 旧 `projects.json` 无需迁移也可正常工作。
- [x] 旧 `sessions.json` 无需迁移也可正常工作。
- [x] 旧 `workspace-layout.json` 不崩。
- [x] 旧 `remote-instance` 配置能自动补全新增能力字段。
- [x] 旧 `projects.json` 存在缺字段、错类型或脏记录时可安全规范化读取。

---

## 18. 发布策略

- [ ] 第一阶段只开放桌面端“远程完整会话控制”。
- [ ] 第二阶段开放桌面端“远程项目管理”。
- [ ] Web 端完整控制放在更后期灰度。
- [ ] 默认仍保持 `passthroughOnly=true`。
- [ ] 在设置页显式提醒风险后，再允许用户切换到“允许远程控制”。

---

## 19. 推荐实施顺序

1. Phase A：模式与文案冻结
2. Phase B：服务端项目 REST
3. Phase C：能力矩阵扩展
4. Phase D：Gateway 扩展
5. Phase E：sessionsStore 实例感知
6. Phase F：projectsStore 实例感知
7. Phase G：路由升级
8. Phase H：ProjectsView
9. Phase I：ProjectDetailView
10. Phase J：CreateSessionDialog
11. Phase K：Dashboard / MainLayout
12. Phase L：Web 分阶段开放
13. Phase M：测试、兼容、发布
