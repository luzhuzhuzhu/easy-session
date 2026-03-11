# EasySession 桌面端多远程挂载架构设计

更新时间：2026-03-08  
适用项目：`D:\EasySession`

---

## 1. 方案结论

这个方向非常值得做，而且比继续强化“电脑端 Web 远程页”更符合 EasySession 当前产品形态。

推荐的目标形态不是：

- 继续把电脑端主要使用场景放在浏览器里

而是：

- `手机端` 使用 Web 远程页，作为轻量入口
- `电脑端` 使用现有 Electron 客户端，挂载多个远程实例
- 每个远程实例下再挂载多个项目与多个会话
- 本地实例与远程实例统一纳入当前桌面工作区体系

这里不是“桌面端替代 Web”，而是明确形成双端分工：

- `Web 远程业务` 继续保留，服务移动端和浏览器应急访问
- `Electron 桌面端` 成为电脑重度使用场景的主路径

一句话概括这个方案：

- 把 EasySession 从“单机桌面工具”升级为“可挂载多实例的桌面工作台”

---

## 2. 为什么这是更优解

### 2.1 现有桌面端已经有成熟框架

当前桌面端已经具备完整的主框架：

- 项目列表
- 会话树
- 多 pane 工作区
- xterm 终端
- 输出历史与实时流
- 会话状态同步
- 标签页和布局持久化

这意味着：

- 电脑端远程能力并不需要重新做一套 UI
- 只需要把数据源从“本地 IPC”扩展为“本地 + 远程”

### 2.2 当前 Web 远程页应继续保留，但定位锁定为手机和应急

当前远程 Web 页的定位更适合：

- 手机临时查看
- 外出应急操作
- 快速连一下已有会话

这条线不是废弃，而是保留并持续维护，只是不再承担电脑端主战场角色。

它不适合承担：

- 长时间桌面使用
- 多项目与多会话切换
- 多 pane 工作区
- 高密度终端操作

### 2.3 桌面端复用能显著降低重复开发

如果电脑端继续走浏览器，你们会长期维护两套复杂前端：

- Electron 桌面主界面
- 浏览器端远程大界面

这会持续吞掉开发资源。

而如果电脑端直接复用现有桌面端框架，则：

- 交互层几乎零重做
- 复杂功能只维护一套
- 多项目、多会话、多 pane 能自然接入

---

## 3. 基于当前代码的事实判断

这份方案不是空想，它和当前代码是高度贴合的。

### 3.1 当前桌面端已经有完整的项目和会话视图骨架

当前桌面主视图已经支持：

- 项目分组
- 会话树
- 工作区 pane
- tab 打开与切分
- 会话上下文菜单

相关文件：

- `src/renderer/src/views/SessionsView.vue`
- `src/renderer/src/stores/sessions.ts`
- `src/renderer/src/stores/projects.ts`
- `src/renderer/src/stores/workspace.ts`

### 3.2 当前终端组件已经足够成熟，值得直接复用

当前桌面终端组件已经具备：

- 历史加载
- seq 去重
- 实时输出订阅
- 粘贴、复制、缩放、滚动策略
- resize 同步
- 原始输入透传

相关文件：

- `src/renderer/src/components/TerminalOutput.vue`
- `src/renderer/src/services/session-output-stream.ts`

### 3.3 当前最大的结构性限制是“Renderer API 全写死为 IPC”

当前渲染层 API 基本都直接绑定到本地 IPC：

- `src/renderer/src/api/session.ts`
- `src/renderer/src/api/project.ts`
- `src/renderer/src/api/workspace.ts`

这意味着：

- UI 目前默认只有“本地数据源”
- 还没有“数据网关抽象”

### 3.4 当前远程网关已经具备桌面挂载所需的核心基础

当前远程服务已经有：

- Token 鉴权
- 项目列表
- 会话列表
- Socket.IO 实时输出
- 输入透传
- resize
- 空闲超时

相关文件：

- `src/main/remote/server.ts`
- `src/main/remote/routes.ts`
- `src/main/remote/socket.ts`

这说明：

- 远程桌面挂载不需要推倒重做远程后端
- 主要工作是“让桌面客户端接入这套后端”

---

## 4. 总体设计原则

### 4.1 电脑端只认桌面客户端，不认浏览器

产品原则：

- 电脑使用场景以 Electron 客户端为主
- Web 远程页仅作为移动端和应急入口

补充原则：

- Web 远程业务不删除、不冻结，继续作为正式产品能力保留
- 桌面端远程挂载是新增主路径，不是对 Web 方案的替代性重构

### 4.2 引入“实例层”，而不是把远程项目硬塞进本地项目管理器

必须新增一个更高层的概念：

- `Instance`

实例分两类：

- `local`
- `remote`

后续所有项目和会话都属于某个实例，而不是直接属于本机。

### 4.3 不把远程项目和会话“克隆”为本地实体

不要这么做：

- 把远程项目塞进本地 `ProjectManager`
- 把远程会话写进本地 `SessionManager`
- 把远程会话伪装成本地 PTY 进程

因为这会让语义彻底混乱。

正确做法是：

- 本地项目和会话仍由本地主进程管理
- 远程项目和会话由远程实例管理
- 桌面端只是统一展示和操作它们

### 4.4 UI 复用，传输层抽象

核心策略：

- UI 尽量不重写
- Store 尽量少重写
- 重点抽象 `Gateway / Repository / Capability`

### 4.5 兼容性优先，不能破坏已有本地数据

这次方案升级必须把“兼容已有元数据和持久化数据”作为硬约束，而不是可选优化。

必须遵守：

- 不破坏已有 `sessions.json` 语义
- 不破坏已有 `projects.json` 语义
- 不破坏已有 `workspace-layout.json` 的旧版本可读性
- 不把远程实例元数据塞进现有本地项目/会话存储
- 不因为新字段缺失而导致旧版本数据加载失败

目标不是“升级后数据结构更漂亮”，而是：

- 老用户升级后原有本地项目、会话、工作区、设置都还能正常读出来
- 新功能的数据与旧数据边界清晰
- 任一新存储损坏时，不拖垮原有本地业务数据

---

## 5. 推荐目标架构

### 5.1 总体结构

建议引入四层结构：

1. `Instance Layer`
   - 管理本地实例和多个远程实例

2. `Gateway Layer`
   - 屏蔽本地 IPC 和远程 HTTP/WS 差异

3. `Unified Resource Layer`
   - 将项目、会话、输出流统一为“实例感知资源”

4. `UI / Workspace Layer`
   - 继续复用现有桌面界面

### 5.2 推荐逻辑图

```text
Electron Renderer
  ├─ Instances Store
  ├─ Projects Store
  ├─ Sessions Store
  ├─ Workspace Store
  └─ Terminal / SessionsView / ProjectsView
          │
          ▼
   Gateway Resolver
      ├─ LocalGateway  -> IPC -> Electron Main -> local managers
      └─ RemoteGateway -> HTTP + Socket.IO -> remote gateway
```

### 5.3 实例视角下的数据树

推荐把业务树从现在的：

```text
Project -> Session
```

升级为：

```text
Instance -> Project -> Session
```

示例：

```text
本机
  ├─ 项目 A
  │   ├─ Claude-001
  │   └─ Codex-002
  └─ 项目 B
      └─ OpenCode-001

远程-办公室主机
  ├─ 项目 X
  │   ├─ Claude-017
  │   └─ Codex-004
  └─ 项目 Y
      └─ Claude-019

远程-家里主机
  └─ 项目 Z
      └─ OpenCode-003
```

---

## 6. 数据模型设计

### 6.1 新增 RemoteInstance

建议新增：

```ts
interface RemoteInstance {
  id: string
  type: 'remote'
  name: string
  baseUrl: string
  enabled: boolean
  authRef: string
  status: 'unknown' | 'connecting' | 'online' | 'offline' | 'error'
  lastCheckedAt?: number
  passthroughOnly: boolean
  capabilities: InstanceCapabilities
}
```

本地实例可视为：

```ts
interface LocalInstance {
  id: 'local'
  type: 'local'
  name: '本机'
  status: 'online'
  capabilities: InstanceCapabilities
}
```

### 6.2 新增统一项目模型

```ts
interface UnifiedProject {
  instanceId: string
  projectId: string
  name: string
  path: string
  createdAt: number
  lastOpenedAt: number
  pathExists?: boolean
  source: 'local' | 'remote'
}
```

### 6.3 新增统一会话模型

```ts
interface UnifiedSession {
  instanceId: string
  sessionId: string
  globalSessionKey: string
  name: string
  icon: string | null
  type: 'claude' | 'codex' | 'opencode'
  projectId?: string | null
  projectPath: string
  status: 'idle' | 'running' | 'stopped' | 'error'
  createdAt: number
  lastStartAt?: number
  totalRunMs?: number
  lastRunMs?: number
  lastActiveAt: number
  processId: string | null
  parentId: string | null
  source: 'local' | 'remote'
}
```

其中：

- `globalSessionKey = instanceId + ':' + sessionId`

这个字段非常关键，因为：

- 远程 A 和远程 B 可能有相同 `sessionId`
- 工作区、订阅、缓存都必须依赖全局唯一键

### 6.4 WorkspaceTabState 必须升级

当前 `WorkspaceTabState` 只有：

- `sessionId`

这对多远程场景不够。

建议升级为：

```ts
interface WorkspaceTabState {
  id: string
  resourceType: 'session'
  instanceId: string
  sessionId: string
  globalSessionKey: string
  pinned: boolean
  createdAt: number
}
```

这是整个方案的关键改造点之一。

### 6.5 元数据兼容规则

必须明确以下兼容规则：

1. 本地 `projectId`、`sessionId` 不重写、不加前缀、不迁移入远程体系。
2. `globalSessionKey` 只作为统一工作区和前端聚合层的全局引用键，不反写到本地 `sessions.json` 中替代原 `sessionId`。
3. 远程项目和远程会话只存在于：
   - 远程服务端真实数据
   - Renderer 聚合态内存
   - 专门的远程实例配置存储
4. 本地 `ProjectManager` 和 `SessionManager` 继续只管理本地实体，不承担远程实体落库职责。
5. 所有“统一模型”都是视图层和仓库层抽象，不是对本地持久化模型的替换。

这条边界非常关键，因为一旦把远程实体写进本地会话/项目主存储，后续清理、恢复、升级都会变得非常危险。

### 6.6 持久化边界设计

当前真实持久化文件至少包括：

- `sessions.json`
- `projects.json`
- `workspace-layout.json`
- `app-settings.json`

方案升级后，必须保持以下边界：

- `sessions.json`
  - 继续只存本地会话
  - 不写入远程会话快照
- `projects.json`
  - 继续只存本地项目
  - 不写入远程项目快照
- `workspace-layout.json`
  - 允许升级结构，但必须提供向后兼容读取和迁移
- `app-settings.json`
  - 只保留通用 UI/应用设置
  - 不把远程实例密钥、token、复杂连接信息直接并入这里

新增文件建议：

- `remote-instances.json`
  - 存远程实例的非敏感配置
- `remote-instance-secrets.json`
  - 存远程实例 token / authRef 等敏感信息

这样做的目的：

- 降低对现有本地数据模型的污染
- 降低升级失败时的爆炸半径
- 让远程能力可以单独演进和回滚

---

## 7. 能力矩阵设计

### 7.1 为什么必须做 Capability

当前本地桌面端很多操作默认都成立，但挂载远程后并不一定成立。

例如：

- 本地可以创建会话
- 本地可以删除会话
- 本地可以读取项目 prompt
- 本地可以打开文件夹
- 远程透传实例则未必支持这些能力

所以必须引入能力矩阵。

### 7.2 推荐能力定义

```ts
interface InstanceCapabilities {
  projectsList: boolean
  sessionsList: boolean
  sessionSubscribe: boolean
  sessionInput: boolean
  sessionResize: boolean
  sessionCreate: boolean
  sessionStart: boolean
  sessionPause: boolean
  sessionRestart: boolean
  sessionDestroy: boolean
  projectPromptRead: boolean
  projectPromptWrite: boolean
  localPathOpen: boolean
}
```

### 7.3 当前建议能力映射

本地实例：

- 基本全部 `true`

远程透传实例：

- `projectsList=true`
- `sessionsList=true`
- `sessionSubscribe=true`
- `sessionInput=true`
- `sessionResize=true`
- `sessionCreate=false`
- `sessionStart=false`
- `sessionPause=false`
- `sessionRestart=false`
- `sessionDestroy=false`
- `projectPromptRead=false`
- `projectPromptWrite=false`
- `localPathOpen=false`

这套能力矩阵会直接驱动 UI 是否显示按钮和入口。

---

## 8. 传输层设计

### 8.1 核心建议：抽象 Gateway 接口

当前最大改造方向不是页面，而是把现有 API 层抽象成可替换网关。

建议定义：

```ts
interface SessionGateway {
  listSessions(filter?: SessionFilter): Promise<UnifiedSession[]>
  getSession(instanceId: string, sessionId: string): Promise<UnifiedSession | null>
  getOutputHistory(instanceId: string, sessionId: string, lines?: number): Promise<OutputLine[]>
  subscribeOutput(instanceId: string, sessionId: string, listener: (e: OutputEvent) => void): () => void
  subscribeStatus(instanceId: string, listener: (e: StatusEvent) => void): () => void
  writeRaw(instanceId: string, sessionId: string, data: string): Promise<boolean>
  resize(instanceId: string, sessionId: string, cols: number, rows: number): Promise<void>
}
```

项目侧同理定义：

```ts
interface ProjectGateway {
  listProjects(instanceId: string): Promise<UnifiedProject[]>
  getProject(instanceId: string, projectId: string): Promise<UnifiedProject | null>
}
```

### 8.2 两个实现

必须做两个实现：

- `LocalGateway`
- `RemoteGateway`

#### LocalGateway

继续复用现有：

- `ipc.invoke('session:*')`
- `ipc.invoke('project:*')`
- `session:output`
- `session:status`

#### RemoteGateway

通过：

- REST 拉项目和会话
- Socket.IO 订阅输出和状态
- Socket.IO 发送输入和 resize

### 8.3 Gateway Resolver

渲染层在运行时根据 `instanceId` 选择对应网关：

```ts
function resolveGateway(instanceId: string): SessionGateway | ProjectGateway
```

这样 UI 层就不必关心“这是本地还是远程”。

---

## 9. 对现有 Renderer 的具体改造建议

### 9.1 `api/session.ts` 不能再直接当唯一入口

当前问题：

- `src/renderer/src/api/session.ts` 完全绑定本地 IPC

建议改造：

- 让它只负责 `LocalGateway`
- 新增 `src/renderer/src/gateways/`
- 新增统一调用层，例如：
  - `session-repository.ts`
  - `project-repository.ts`

### 9.2 `session-output-stream.ts` 必须升级为“实例感知总线”

当前：

- 只按 `sessionId` 路由事件

未来必须至少按：

- `instanceId + sessionId`

否则多个远程实例时会串流。

### 9.3 `stores/sessions.ts` 需要从“单一本地列表”升级为“统一会话仓库”

当前：

- `sessions: Session[]`
- `activeSessionId: string | null`

建议升级为：

- `sessions: UnifiedSession[]`
- `activeGlobalSessionKey: string | null`
- `activeInstanceId`
- `sessionIndexByGlobalKey`

### 9.4 `stores/projects.ts` 需要感知实例维度

当前：

- 只管理本地项目

未来：

- 管理本地 + 多远程项目
- 支持实例分组
- 支持远程实例在线状态驱动项目可用性

### 9.5 `stores/workspace.ts` 是关键改造点

当前 `workspace` 逻辑默认 tab 只绑定 `sessionId`。

这在多远程场景下不成立。

必须改为：

- tab 绑定 `globalSessionKey`
- 或 `instanceId + sessionId`

同时要调整：

- `openSessionInPane`
- `reconcileSessions`
- `activeSessionId`
- `tabs` 的持久化结构

### 9.6 `SessionsView.vue` 可以复用，但要多一个实例分组层

推荐的视觉层级：

```text
实例
  -> 项目
    -> 会话
```

也可以做成：

- 一级是实例折叠组
- 二级是项目组
- 三级是会话

这样能和当前视图结构自然衔接。

---

## 10. 工作区持久化与离线恢复设计

### 10.1 当前行为不适合远程实例

当前 `workspaceStore.reconcileSessions()` 会直接删除不存在的 session tab。

这对本地可以，但对远程不行。

为什么：

- 远程实例暂时离线，不代表会话已不存在
- 网络瞬断不该导致工作区 tab 被清空

### 10.2 推荐行为

对于远程会话 tab：

- 如果实例离线，只标记为 `offline`
- 不立即从 workspace 中删除
- 用户重新连接实例后自动恢复

### 10.3 推荐设计

为 tab 增加运行态：

```ts
interface WorkspaceResolvedTabState {
  exists: boolean
  online: boolean
  canInput: boolean
}
```

规则：

- `instance offline` -> 保留 tab，显示离线状态
- `instance online but session missing` -> 标记失效，可手动清理
- `instance online and session exists` -> 正常使用

这一步非常重要，否则多远程体验会很差。

### 10.4 workspace 持久化迁移策略

当前 `workspace-layout.json` 是既有数据，不能粗暴覆盖。

推荐迁移策略：

1. 读取时同时兼容 `version: 1` 和 `version: 2`
2. `version: 1` 迁移到 `version: 2` 时：
   - 原有 `sessionId` 默认视为 `instanceId='local'`
   - 自动补齐 `globalSessionKey='local:' + sessionId`
   - 其他 pane / split / activePane 布局保持不变
3. 迁移必须在内存中完成并校验通过后，才允许落盘
4. 落盘前必须保留旧文件备份
5. 如果迁移失败：
   - 不覆盖原文件
   - 使用安全默认工作区在内存中启动
   - 保持原文件可供后续人工恢复

进一步约束：

- `version: 2` 写回时，必须保留可容忍缺字段的读取逻辑
- 未来即使继续升级到 `version: 3`，也要保留对 `version: 1/2` 的迁移链路

### 10.5 设置与新元数据的兼容策略

`app-settings.json` 当前不是 `DataStore` 管理，而是直接 JSON 读写，所以这里更要保守。

推荐策略：

- 不把远程实例主数据直接塞进 `app-settings.json`
- 只在 `app-settings.json` 中增加轻量 UI 偏好字段，并保持“缺失即回退默认值”
- 新的远程实例配置使用独立文件
- 现有设置键保持原义不变，不重命名、不挪层级

这样可以避免：

- 旧设置文件在新版本下被整体重写为不兼容结构
- 远程功能的问题反向污染原有桌面设置

### 10.6 新存储的容错与回滚要求

新增远程实例存储时，必须把容错写进方案：

- 新文件优先使用与现有 `DataStore` 一致的保存策略
- 写入前保留 `.bak`
- 读取失败时优先尝试备份恢复
- 远程实例存储损坏时，只影响远程功能，不影响本地项目/会话/workspace 启动

换句话说：

- 远程能力可以失效
- 本地能力不能被连带拖死

---

## 11. 远程后端需要补的接口

当前远程后端已经足够做 MVP，但为了更好接入桌面端，建议补几项。

### 11.1 建议新增 `GET /api/capabilities`

返回：

- `passthroughOnly`
- `serverVersion`
- `capabilities`

原因：

- 桌面端可以动态决定展示哪些操作

### 11.2 建议新增 `GET /api/sessions/:id/output?lines=`

原因：

- 当前桌面终端组件天然是“先拉历史，再收实时流”
- 远程 Web 现在用的是“订阅时顺便回放历史”
- 为复用桌面终端，单独历史接口更自然

### 11.3 建议在 session DTO 中补 `projectId`

当前远程 session 返回里主要依赖：

- `projectPath`

但桌面端项目树更适合用：

- `instanceId + projectId`

如果服务端直接给出 `projectId`，前端会更干净。

### 11.4 建议新增实例信息接口

例如：

- `GET /api/server-info`

返回：

- 实例名称
- 平台
- 版本
- 是否透传模式

这样桌面端挂载多个远程时，信息更清晰。

---

## 12. 多远程连接策略

### 12.1 一个远程实例一个 Socket 连接

推荐策略：

- 每个远程实例维护一条 Socket.IO 连接
- 该实例下所有打开中的 session 都通过这条 socket 订阅多个房间

优点：

- 连接数可控
- 实现简单
- 已与当前 `session:subscribe` 机制兼容

### 12.2 只订阅当前“打开中的会话”

不要订阅一个远程实例的全部会话输出。

推荐策略：

- 只有工作区中打开的会话才订阅输出
- 关闭 tab 后自动 `unsubscribe`

这样能避免：

- 无意义流量
- 过多 output fanout
- Cloudflare 中转压力

### 12.3 后台列表刷新与前台输出解耦

推荐：

- 项目 / 会话列表用定时刷新或显式刷新
- 输出与状态变化走 socket

不要把所有数据都绑定到高频 socket 全量同步。

---

## 13. 远程实例配置与存储设计

### 13.1 不建议把 token 放在 Renderer 的 localStorage

Web 远程页现在这样做是权宜之计。

桌面端不应该继续这样。

### 13.2 推荐做法

建议新增主进程存储：

- `remote-instances.json`

存储：

- 实例 id
- 名称
- baseUrl
- 显示配置
- 最近连接状态

token 存储建议：

- MVP：主进程单独 JSON 存储
- 后续：接入系统凭据保险箱

### 13.3 推荐新增主进程服务

建议新增：

- `src/main/services/remote-instance-store.ts`
- `src/main/services/remote-instance-manager.ts`
- `src/main/ipc/remote-instance-handlers.ts`

提供：

- 添加远程实例
- 编辑远程实例
- 删除远程实例
- 测试连通性
- 拉取能力信息

---

## 14. UI 方案设计

### 14.1 左侧结构建议

推荐将当前会话页扩展为：

```text
实例
  ├─ 本机
  │   ├─ 项目 A
  │   └─ 项目 B
  ├─ 远程-办公室
  │   ├─ 项目 X
  │   └─ 项目 Y
  └─ 远程-家里
      └─ 项目 Z
```

### 14.2 会话操作按钮按能力动态显示

例如远程透传实例里：

- 隐藏创建
- 隐藏启动
- 隐藏暂停
- 隐藏重启
- 隐藏删除

保留：

- 打开
- 输入
- resize
- 刷新

### 14.3 工作区层面保持统一体验

理想效果：

- 打开本地会话和远程会话时，用户感知尽量一致
- pane、tab、split、focus 逻辑都不区分本地还是远程

这就是“交互层几乎 0 损耗”的真正来源。

### 14.4 增加实例状态条

建议在 UI 上明确展示：

- 在线 / 离线
- 远程地址
- 透传模式
- 当前延迟级别

这样用户不会误解“按钮为什么不可用”。

---

## 15. 对当前业务的兼容策略

### 15.1 手机端 Web 保留

当前 Web 远程页不要删。

它适合：

- 手机访问
- 紧急操作
- 无需安装桌面客户端的场景

并且继续承担以下职责：

- Cloudflare / 浏览器入口
- 移动端远程登录与临时控制
- 在桌面端方案未覆盖的轻量使用场景中作为备份通道

### 15.2 桌面端作为主远程客户端

未来主路径应当是：

- 桌面客户端挂载远程实例

这条主路径只针对：

- 电脑端
- 多项目、多会话、高频终端操作
- 需要 pane / tab / workspace 的重度场景

### 15.3 本地业务不应被远程改造拖垮

一定要坚持：

- 本地路径继续走现有 IPC
- 本地体验不能因为远程改造而退化

所以推荐用适配器而不是重写。

---

## 16. 推荐 MVP 范围

### Phase 1：桌面端单远程挂载最小闭环

目标：

- 添加一个远程实例
- 拉项目列表
- 拉会话列表
- 打开远程会话到工作区
- 显示输出
- 输入透传
- resize 同步

这一期不做：

- 远程项目 prompt 编辑
- 远程路径打开
- 远程生命周期控制

这一期同时保持：

- 现有 Web 远程页继续可用
- Cloudflare Web 入口不受影响
- 移动端仍走 Web，不依赖桌面端新架构

这一期还有一个前置硬要求：

- 所有持久化变更都必须经过兼容迁移设计
- 不允许以“开发中先改结构，后面再迁移”为前提推进
- 迁移失败时必须保证旧数据文件仍可恢复

### Phase 2：多远程 + 工作区持久化

目标：

- 支持多个远程实例同时在线
- 工作区 tab 按 `globalSessionKey` 持久化
- 实例离线时保留 tab
- 支持手动重连与恢复

### Phase 3：能力补充与高阶管理

视需要增加：

- 远程 prompt 读写
- 远程文件打开
- 更安全的 token 存储
- 远程实例分组、收藏、快捷切换

---

## 17. 文件级改造清单

### 17.1 Renderer

重点改造：

- `src/renderer/src/api/session.ts`
- `src/renderer/src/api/project.ts`
- `src/renderer/src/services/session-output-stream.ts`
- `src/renderer/src/stores/sessions.ts`
- `src/renderer/src/stores/projects.ts`
- `src/renderer/src/stores/workspace.ts`
- `src/renderer/src/views/SessionsView.vue`
- `src/renderer/src/components/TerminalOutput.vue`

新增建议：

- `src/renderer/src/gateways/local-gateway.ts`
- `src/renderer/src/gateways/remote-gateway.ts`
- `src/renderer/src/gateways/gateway-resolver.ts`
- `src/renderer/src/stores/instances.ts`

### 17.2 Main

新增建议：

- `src/main/services/remote-instance-store.ts`
- `src/main/services/remote-instance-manager.ts`
- `src/main/ipc/remote-instance-handlers.ts`

### 17.3 Remote Server

建议补充：

- `GET /api/capabilities`
- `GET /api/server-info`
- `GET /api/sessions/:id/output`

---

## 18. 关键风险与应对

### 18.1 风险：远程路径不是本地路径

问题：

- 远程项目路径无法直接在本地文件系统操作

应对：

- 远程项目 path 只作展示和逻辑分组
- 本地“打开路径”按钮对远程实例禁用

### 18.2 风险：实例离线导致 tab 丢失

问题：

- 当前 reconcile 逻辑会清 tab

应对：

- 引入离线保留策略
- tab 和 session existence 解耦

### 18.3 风险：多远程 sessionId 冲突

问题：

- 不能只用 `sessionId`

应对：

- 全面使用 `globalSessionKey`

### 18.4 风险：本地与远程能力不一致

问题：

- UI 可能出现无效操作入口

应对：

- 全面用 capability 控制按钮和菜单

### 18.5 风险：继续让远程桌面端走 Web

问题：

- 会重复建设复杂桌面 UI

应对：

- 坚持 Web 只给手机和应急
- 桌面远程统一走 Electron 客户端

### 18.6 风险：升级后旧元数据或持久化文件损坏

问题：

- workspace 结构升级可能导致旧布局丢失
- 新远程实例字段可能误污染旧设置或旧业务存储
- 远程实体如果被写入本地主存储，会造成清理与恢复失控

应对：

- 严格隔离本地存储与远程存储
- 所有迁移先内存转换、校验，再落盘
- 所有关键持久化文件保留备份
- 新功能存储损坏时只降级新功能，不影响本地核心能力

---

## 19. 明确不推荐的方案

不推荐：

- 把远程项目写入本地 `ProjectManager`
- 把远程会话写入本地 `SessionManager`
- 在桌面端继续主推浏览器远程页
- 把远程 token 放在 renderer localStorage
- 让工作区继续只以 `sessionId` 作为唯一标识

这些方案短期也许省事，但后期一定会变成结构性债务。

---

## 20. 最终推荐

最终建议很明确：

- 电脑端放弃“大而全 Web 远程页”路线
- 保留 Web 作为手机入口
- 在现有 Electron 客户端中新增“多远程实例挂载”
- 通过“实例层 + Gateway 抽象 + 全局会话键 + 能力矩阵”完成接入

更准确地说，这不是“砍掉 Web 再做桌面远程”，而是：

- `Web` 继续承担移动端和浏览器应急业务
- `Electron` 承担电脑端主业务
- 两条线共享同一套远程后端与能力边界，但面向不同使用场景

这个方案最符合你们当前的代码现实，也最有机会做到：

- 远程能力强
- 产品体验统一
- 维护成本可控
- MVP 推进速度快

如果继续往下做，最优先的不是先改 UI，而是先做这三件事：

1. 抽 `Gateway` 接口  
2. 给 `workspace` 升级成 `instance-aware`  
3. 新增 `instances` 存储和配置面板

这三步一旦打通，后面的远程挂载基本就顺了。
