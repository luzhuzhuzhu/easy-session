# 发布 / 灰度 / 降级 / 回滚 策略（FEAT-6 / FEAT-7 / FEAT-10）

> 状态：策略文档化落地。签名证书与 electron-updater 接入需要证书资产与发布渠道
> 就绪后按本文档第 2、3 节执行；其余步骤当前即可操作。

## 1. 发布流程（release 流水线）

按 todo.md Phase 11 四步顺序，对应脚本：

| 步骤 | 命令 | 说明 |
| --- | --- | --- |
| 1. 全量门禁 | `npm run release:verify` | typecheck + lint + vitest + build 全绿才继续 |
| 2. 打包 | `npm run release:win`（或 `release:mac` / `release:linux`） | 产出安装包到 `release/` |
| 3. 冒烟 | 手工冒烟清单（见第 5 节） | 在干净环境安装并验证核心链路 |
| 4. 发布 | 打 tag（`v0.x.y`）→ GitHub Release 上传制品 + release notes | tag 触发 CI（后续接入） |

## 2. 自动更新 + 代码签名（FEAT-6 接入清单）

前置资产（未就绪，接入时补齐）：

- [ ] Windows 代码签名证书（OV 或 EV，EV 可消除 SmartScreen 告警）
- [ ] Apple Developer ID（mac 公证 notarize 用；Linux 无需签名）
- [ ] 发布渠道选型：GitHub Releases（推荐，electron-updater 原生支持）或自建 latest.yml 静态源

接入步骤（资产就绪后执行）：

1. `npm i electron-updater`；主进程 `app.whenReady` 后安全接入 `autoUpdater`
   （仅打包形态启用：`if (app.isPackaged)`，dev 不检查）。
2. `electron-builder.yml` 增加 `publish: { provider: github }`；
   Windows 签名配置 `win.certificateSubjectName`（EV 用 Azure Trusted Signing 则按其文档）。
3. GitHub Actions 增加 tag 触发的 release workflow：三平台 build → sign → `--publish always`。
4. 更新提示走应用内 toast（复用 UX-13 的 action toast：「立即更新 / 稍后」），
   不做强制静默升级。

验收（接入后）：

- [ ] 旧版本启动后收到更新提示并完成升级，升级后用户数据（sessions.json、
      projects.json、设置）完好。
- [ ] Windows 安装不再出现「未知发布者」告警。

## 3. 灰度与功能开关降级路径（FEAT-7）

远程三开关（设置页可实时切换，全部无需重启）：

| 开关 | 关闭路径 | 影响面 |
| --- | --- | --- |
| passthrough 模式 | Web 端仅展示 running 会话（只读），控制按钮隐藏 | 远程控制面 |
| allowRemoteControl | socket input/write/resize 被 ensureJoined 拒绝 | 远程注入 |
| Quick Tunnel | Web 无法经公网访问；局域网直连不受影响 | 公网入口 |

降级演练（每季度一次，记录时间与结果）：

- [ ] 远程服务开启 → 关闭 → 开启，Web 端 30s 内恢复连接。
- [ ] Tunnel 断链（杀 cloudflared 进程）→ 自动重建 → Web 重连成功。
- [ ] 三开关全关时桌面端核心功能（本地会话/协作）零影响。

## 4. 回滚验证（数据兼容）

- 数据文件（sessions.json / projects.json / settings.json）为「读入新字段 →
  缺失字段取默认值」的向后兼容模式；旧版本读新文件时忽略未知字段即可。
- 回滚演练（每个 minor release 前做一次）：
  - [ ] 用新版跑出 sessions.json（含 FEAT-1 nativeSessionId 等新字段），
        装回旧版本验证会话列表/启动/恢复不报错。

## 5. 冒烟清单（每次发布必过）

1. 安装包在干净目录安装、启动、卸载无残留报错。
2. 创建 Claude / Codex / OpenCode / Terminal / Gemini 会话各一，输入输出正常。
3. 会话重启（resume）保留上下文；停止后 journal 可回看。
4. 协作页：派发任务 → 确认完成；布局拖动后重启保留。
5. 设置：主题/语言切换即时生效；CLI 路径自定义后 cli:check 刷新。
6. 远程服务：开启 → Web 登录 → 会话浏览 + 输入；token 错误被拒。

## 6. FEAT-10 autoStart 决策记录

- **决策：暂不放开 headless `autoStart`。** 依据：
  1. 真实引擎 e2e（ENG-6/7）尚未建立，开机自启会在无人值守场景放大
     崩溃循环与资源占用风险（UX-13 的连崩安全模式正是为此兜底）。
  2. ES-DSH-PLUGIN-NOTES 中 autoStart 压制原因（插件装载时序）未解除。
- 重新评估条件：ENG-6 真实 CLI 引擎 e2e 全绿 + 连崩安全模式演练通过 +
  插件时序问题修复，三者齐备后在下个 minor 放开并在此处更新记录。
