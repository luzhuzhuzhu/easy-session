# EasySession 接入 OpenCode CLI 设计方案（增强版）

## 1. 文档目的

本文用于指导 EasySession 在现有 `claude/codex` 架构下接入 `opencode`，并确保：

- 可落地：任务可直接拆分执行，不停留在概念层。
- 可回滚：出现故障可快速降级，不影响现有用户。
- 可演进：支持先 Phase A（TUI 直连），再 Phase B（serve/attach 增强）。

---

## 2. 现有方案主要问题（审计结论）

## 2.1 关键缺漏

- 缺少“参数冲突规则”：
  - `sessionId / continueLast / fork / attachUrl` 同时出现时，优先级未定义。
- 缺少“设置项生效链路”：
  - 仅写了 `opencodePath`，未明确如何覆盖 `CliManager` 命令解析。
- 缺少“状态机约束”：
  - `starting/running/stopped/error` 之外，未定义 attach 失败、resume 失败处理。
- 缺少“安全策略”：
  - `OPENCODE_SERVER_PASSWORD` 存储策略、日志脱敏、URL 打印规则未定义。
- 缺少“回滚策略”：
  - 接入失败时如何一键回退到仅 `claude/codex` 未定义。

## 2.2 工程风险点

- 未定义 OpenCode CLI 版本兼容策略（参数在版本间可能变化）。
- 未定义 Windows 下路径/引号转义策略（`projectPath` 含空格常见）。
- 未定义“会话 ID 不可得”时的一致行为，容易出现误恢复到错误会话。
- 未定义测试矩阵（仅 happy path 不够）。

---

## 3. 设计原则（新增）

- 单一真相源：会话恢复优先使用显式 `opencodeSessionId`，杜绝“猜测恢复”。
- 安全优先：敏感值不入日志，不明文长期存储。
- 失败可预期：任何恢复失败都必须可降级为“新会话启动”并给出提示。
- 兼容优先：不改变 `claude/codex` 既有代码路径语义。

---

## 4. 总体架构

沿用现有架构，不引入新的横向复杂度：

- `OpenCodeAdapter`：命令拼接与进程启动（参数校验、版本兼容）。
- `OpenCodeSessionLifecycle`：会话级状态决策（create/start/restart/pause/cleanup）。
- `SessionManager`：统一调度与持久化（保持现有模式）。
- IPC/preload/renderer：仅增加最小必要通道。

---

## 5. 核心设计细化

## 5.1 参数优先级与冲突规则（必须实现）

恢复决策优先级：

1. `attachUrl`（若开启 server/attach 模式）
2. `sessionId`（显式恢复）
3. `continueLast=true`
4. 新会话启动

冲突处理：

- `sessionId` 与 `continueLast=true` 同时存在：以 `sessionId` 为准，记录 warn 日志。
- `fork=true` 仅在恢复路径生效（`attach/sessionId/continueLast`），新会话忽略。
- `attachUrl` 存在但不可用：回退 `sessionId/continueLast/新会话`，禁止直接报 fatal。

---

## 5.2 OpenCodeSessionOptions（建议定稿）

```ts
interface OpenCodeSessionOptions {
  model?: string
  agent?: string
  prompt?: string
  sessionId?: string
  continueLast?: boolean
  fork?: boolean
  attachUrl?: string
  serverMode?: 'off' | 'attach'
}
```

说明：

- `sessionId` 为业务会话恢复锚点，优先级高于 `continueLast`。
- `serverMode` 初期默认 `off`，Phase B 可切 `attach`。

---

## 5.3 会话生命周期行为（状态与降级）

### 创建

- 成功：`running`
- CLI 不存在/参数非法：`error` + 明确 stderr 提示

### 启动/重启

- 恢复失败（session 不存在、attach 失败）：
  - 先记 warning
  - 自动降级新会话启动
  - 若降级失败，最终置 `error`

### 暂停/销毁

- 与现有 `SessionManager` 语义保持一致，不新增分支语义。

---

## 5.4 `opencodePath` 生效方案（补齐）

问题：现有 `CliManager` 主要依赖 PATH 解析。

设计：

- 新增“命令解析覆盖层”：
  - 若 settings 中存在 `opencodePath`，优先使用该绝对路径。
  - 若为空，回退 PATH 查找。
- `cli:check('opencode')` 同步使用该逻辑，避免“设置可用但检测不可用”。

---

## 5.5 会话 ID 策略（避免误恢复）

Phase A：

- 不强依赖终端输出解析提取 ID。
- 仅使用用户显式提供 `sessionId` 或 `--continue`。

Phase B：

- 如果 OpenCode server API 可稳定拿到 session id，再启用自动回填。
- 自动回填必须带“项目路径 + 时间窗口”双重约束，防止串会话。

---

## 5.6 安全设计（新增）

- `OPENCODE_SERVER_PASSWORD`：
  - 默认不落盘，不写入 settings 明文字段。
  - 必须日志脱敏（只显示 `***`）。
- `attachUrl`：
  - 日志中仅显示 host:port，不打印用户信息与 query。
- 错误日志：
  - 禁止打印完整 env。

---

## 5.7 可观测性（新增）

新增日志点（info/warn/error）：

- 启动命令策略（新会话/continue/session/attach）
- 参数冲突裁决结果
- 恢复失败与降级链路
- CLI 版本识别结果

要求：

- 日志可用于定位“为什么没有恢复到预期会话”。

---

## 6. 分阶段实施策略

## 6.1 Phase A（必须）

范围：

- `opencode` 类型接入
- Adapter + Lifecycle + UI + 设置 + IPC
- 基础恢复（`sessionId/continueLast`）
- 基础测试与回归

退出标准：

- 能稳定创建、启动、暂停、重启、销毁 OpenCode 会话
- 重启应用后可执行可预期恢复

## 6.2 Phase B（可选）

范围：

- `serve/attach` 复用后端
- sidecar 管理
- 事件流增强（如 SSE）

退出标准：

- attach 可显著降低冷启动时间
- 状态同步准确率不低于 Phase A

---

## 7. 回滚与灰度

灰度建议：

- 增加 feature flag：`ENABLE_OPENCODE_CLI`（默认开/关按发布策略）
- 内测阶段仅对测试用户组开放

回滚策略：

- 关闭 feature flag 后，前端隐藏 OpenCode，后端拒绝 `type=opencode` 创建。
- 不删除历史数据；仅标记不可启动，保留可见与导出能力。

---

## 8. 验收标准（增强版）

- 功能验收：
  - OpenCode 会话全生命周期可用
  - 参数冲突规则按预期执行
  - 恢复失败可自动降级并有提示
- 稳定性验收：
  - 不回归 Claude/Codex
  - Windows 路径/空格目录可用
- 安全验收：
  - 无敏感信息明文日志
- 可运维验收：
  - 关键失败路径可通过日志快速定位

---

## 9. 参考

- 本地：`opencode.md`
- OpenCode CLI：https://opencode.ai/docs/zh-cn/cli
- OpenCode Server：https://opencode.ai/docs/server
- OpenCode SDK：https://opencode.ai/docs/sdk
- OpenCode Permissions：https://opencode.ai/docs/permissions

