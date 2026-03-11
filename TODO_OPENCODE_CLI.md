# OpenCode CLI 接入修复 TODO（UTF-8）

更新时间：2026-03-02

## 目标
- 修复 OpenCode 会话恢复链路不完整问题，保证“创建-暂停-重启-恢复”可闭环。
- 补齐 OpenCode 创建参数能力（model/agent/prompt/sessionId/continue/fork/attach）。
- 保持 Claude/Codex 既有链路行为不回归。

## 状态说明
- `[ ]` 未开始
- `[-]` 进行中
- `[x]` 已完成

## P0 必修（本次实现）

### 1. OpenCode 会话 ID 回填与恢复闭环
- [x] 在 `OpenCodeAdapter` 增加“按项目路径发现 sessionId”的能力（失败可降级，不中断流程）
- [x] 在 `OpenCodeSessionLifecycle` 增加输出解析与历史回填逻辑
- [x] 在 `OpenCodeSessionLifecycle` 增加异步 sessionId 发现任务（创建后延迟探测）
- [x] 在 `SessionManager` 接入 OpenCode 的 sessionId 发现调度
- [x] 验收：OpenCode 新建会话在一段时间后能回填 `opencodeSessionId`，后续 `start/restart` 优先恢复

### 2. 启动策略完整化（create/start 一致）
- [x] 统一策略优先级：`attach > sessionId > continueLast > new`
- [x] 处理冲突参数：`sessionId + continueLast` 时优先 `sessionId` 并输出 warning
- [x] 验收：创建与重启都遵循同一套策略，不出现“创建忽略 sessionId/continueLast”

### 3. 前端创建参数补齐（OpenCode）
- [x] `CreateSessionDialog` 增加 OpenCode 高级参数区域：
  - [x] `model`
  - [x] `agent`
  - [x] `prompt`
  - [x] `sessionId`
  - [x] `continueLast`
  - [x] `fork`
  - [x] `attachUrl`
  - [x] `serverMode`
- [x] 参数约束：
  - [x] `serverMode=attach` 时可填写 `attachUrl`
  - [x] `sessionId` 与 `continueLast` 同时启用时给出提示
- [x] 验收：表单提交后 OpenCode options 正确透传到主进程

## P1 推荐（本次尽量实现）

### 4. 兼容与稳健性增强
- [x] `OpenCodeAdapter.getVersion` 支持传入 `preferredPath`
- [x] `cli:opencode:version` 支持可选自定义路径参数
- [x] sessionId 解析与日志避免泄露敏感信息（URL 仅记录 host）

### 5. 文档与清单同步
- [x] 更新本 TODO 状态
- [ ] 更新 `OPENCODE_CLI_INTEGRATION_PLAN.md` 的已实现项（当前文件存在历史乱码，建议单独重写）

## 非本次（后续）
- [ ] 单测：`opencode-adapter` / `opencode-session-lifecycle` / `session-manager(opencode)`
- [ ] Phase B：`serve/attach` sidecar 管理与 API 协同
