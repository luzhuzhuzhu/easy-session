# 跨平台开发构建与验证记录

日期：2026-09-12。本文是工程构建记录，不是已经完成三平台桌面认证的声明。

## 当前交付边界

| 目标 | 工程配置 | 本轮实际验证 |
| --- | --- | --- |
| Windows x64 | NSIS / 解包目录 | 单元测试、类型检查、构建、25 项流式/分窗/多 tab E2E；实际 Electron 与打包后 SQLite / PTY 冒烟 |
| Linux x64 | AppImage + deb | Ubuntu 24.04 WSL2 内使用独立 Linux Node 和依赖：单元测试、类型检查、构建；WSLg 下 25 项流式/分窗/刷新 E2E；两种安装包生成、deb 元数据检查、包内 SQLite / PTY 冒烟 |
| Linux arm64 | Ubuntu ARM 原生 runner | 工作流已配置；本机没有执行 ARM64 产物验收 |
| macOS arm64 | Apple Silicon 原生 runner、DMG | 工作流已配置；未在本机运行 macOS 应用或生成已验证的 DMG |
| macOS x64 | Intel 原生 runner、DMG | 工作流已配置；未在本机运行 macOS 应用或生成已验证的 DMG |

Linux 本地界面 E2E 已通过：先用 `XOpenDisplay` 确认现有 WSLg 显示服务可用，再直接运行 25 项 Electron 界面回归，全部成功。此前隔离 Xvfb 因缺少系统路径下的 `xkbcomp` 失败，仅为测试环境问题，不是应用缺陷。没有修改 WSL 系统 X server，也没有安装系统级 X11 包。

Windows 的 25 项界面回归已重新在独立测试数据目录执行。CI 对 Windows、Linux、macOS 配置了同组界面门禁；Linux CI 使用 hosted runner 上的 Xvfb。

WSL 验证不等于已覆盖所有 Linux 发行版、显卡、桌面环境或普通用户安装路径；macOS 原生构建、运行及正式签名验收仍需相应 runner 和发布凭证。

## 本轮修复的运行契约

八个 Agent CLI 为 Claude、Codex、OpenCode、Gemini、Pi、OMP、Grok、Hermes；Terminal 单独处理系统 Shell。

- `cli-runtime.ts` 统一可执行文件查找、环境补充、版本查询和受控执行。进程参数以数组传递，不使用通用的字符串拼接 `shell:true` 回退。
- CLI 程序查找与 PTY 启动使用同一会话工作目录，相对可执行路径和相对 PATH 条目不会错误指向桌面进程目录的同名程序。
- Unix 桌面启动时异步恢复用户 Shell 环境，带执行期限与回退；不会修改系统 PATH。Shell 配置中新增环境变量后，重启应用可重新获取环境。配置目录覆盖建议使用绝对路径。Shell 环境通过内置 Electron/Node 序列化为 JSON，保留多行值、等号和空值，不把变量内容中的换行误当作新变量；不依赖旧版 macOS 未提供的 `env -0`，也不要求额外安装 Node。
- Windows 支持原生程序、标准 npm/Yarn 启动器、npm PS1 对应 CMD 启动器，以及 Hermes 官方的纯 EXE 委托包装器。复杂自定义 batch 脚本不会被当作标准包装器随意执行；检测失败会保留原因。
- Claude/Codex 的配置、会话和现有技能目录使用对应配置根。OpenCode 编辑选中的 JSON/JSONC 源文件，识别自定义配置位置，不把多层配置合并写回一个任意文件；技能发现同时保留自定义根、全局根及共享根。
- Gemini 的替代 HOME 正确追加 `.gemini`；Pi 的 agent/session 根分开；OMP 的 profile 优先级、显式空值、自定义配置根和迁移后的 XDG 会话根分别处理。
- Hermes 的配置与数据库使用相同根，并支持 profile 上下文。数据库读取保留真正 SQLite 的只读连接，而不是忽略 WAL 的静态文件拷贝。
- profile/session-dir 查询上下文跨 IPC、主进程远程桥和 HTTP 传递。旧远端没有确认上下文时返回不支持，不能把默认 profile 的候选冒充当前 profile。
- 远程 Terminal 读取目标实例的 Shell 列表；旧端点不可用时保留目标默认 Shell，不把控制端的 `cmd`、PowerShell 等发送给 Linux/macOS。
- Gemini/Hermes 不再收到不支持的 `--append-system-prompt`。`es` 总线环境仍保留，但不能宣称这两个 CLI 通过该旧参数获得自动提示词注入。Pi 不再把 OMP 的审批选项作为内置能力展示；用户显式自定义的扩展参数不做粗暴删除。
- Grok 官方 1.0.30 的原生程序已单独核验：`--permission-mode plan --version` 成功，而故意构造的未知参数失败，因此没有误删其有效参数。

技能管理的产品范围仍主要是 Claude/Codex/OpenCode。八类会话支持不等于八类技能管理、任意 CLI 版本、任意发行包装器都已完成同等功能认证。

## 构建与运行时门禁

Electron 固定为 `42.11.3`。实际二进制内的 Node 为 `24.19.0`，已执行 SQLite 查询及 PTY 创建、读写、resize 和退出检查。原先 Electron 33 内置的 Node 20 无法提供 `node:sqlite`，因此只改 Hermes 数据库路径是不够的。

开发工具要求 Node >= 22.12；CI 使用 Node 24。`package.json.allowScripts` 按依赖名和精确版本声明必要安装脚本，避免新 npm 默认阻止原生依赖准备。更新锁文件中的相关包时，需要重新审核此列表，不使用不受控的全量脚本授权。

通用检查：

```text
npm ci
npm run typecheck
npm test
npm run lint
npm run build
npm run test:runtime
```

在对应原生系统打包：

```text
npm run build:win
npm run build:linux
npm run build:mac
```

需要指定架构时，在对应架构的构建机执行 `npm run build` 后，再执行下面相应的一条。这里的 macOS/ARM64 命令属于已配置入口，不代表本机已经执行成功。

```text
npx electron-builder --linux --x64 --publish never
npx electron-builder --linux --arm64 --publish never
npx electron-builder --mac --arm64 --publish never
npx electron-builder --mac --x64 --publish never
```

构建后必须验证包内运行时：

```text
npm run test:runtime:packaged
```

私有输出目录用直接 Node 命令指定，避免某些 PowerShell/npm 组合吞掉转发选项而误验旧的 `release`：

```text
node scripts/run-runtime-smoke.cjs --packaged --package-dir <output-directory>
```

冒烟检查会核对 Electron 版本，并从产物解包资源加载 `node-pty`，而不只是加载开发目录里的模块。`asarUnpack` 已显式包含 `node-pty` 的运行文件。关闭该应用所依赖的 Electron RunAsNode 能力会同时影响 `es` 和运行时检查，不应在签名/打包时未经验证改变。

本机网络不能让 WSL 直接下载部分 GitHub 构建工具，因此验证时使用了官方发行文件和上游 SHA 校验后的隔离缓存。没有关闭 TLS 校验或更换为不明来源的二进制。

## 工作流与发布

- `.github/workflows/ci.yml`：三平台单测及 UI 回归；Windows x64、Linux x64/arm64、macOS x64/arm64 的目录打包和包内运行时检查。
- `.github/workflows/desktop-installers.yml`：手动触发，各平台在原生 runner 生成安装包并上传 CI artifact。不自动发布 GitHub Release。
- Windows/macOS 产物当前没有配置发行证书、公证凭证。工作流明确关闭自动发现签名身份；这些凭证应通过 CI secret 配置，不能提交进仓库。未签名/未公证的 macOS 产物不等于可无提示公开分发的正式安装包。
- macOS 配置的最低系统版本为 12.0；这是一项构建声明，不能替代最低版本机器上的验收。

本轮 Linux x64 安装包位于：

```text
release/linux-x64/EasySession-0.8.2-linux-x86_64.AppImage
release/linux-x64/EasySession-0.8.2-linux-amd64.deb
```

原始检查日志、上游快照和隔离夹具在 git 忽略的 `.tmp-tests/cross-platform-audit/` 下，不随提交发布。修复前的逐项证据保留在 `CROSS_PLATFORM_CLI_AUDIT.zh-CN.md`；其中的“当前问题”应按该报告的基线时间理解，而不是把已修复的问题重新当作本轮未完成项。

## 续修验证证据

- 新增回归先确认两处路径缺陷：会话目录与桌面进程目录有同名程序时选错目标；相对 PATH 目录没有按指定 cwd 查找。修复后原用例通过。
- 环境解析回归确认多行值会被截断，并把值内的 `CODEX_HOME=...` 误识别为变量；改为 JSON 后保留原值且不产生伪变量。Unix 实际 Shell 用例同时覆盖带空格和单引号的运行时路径。
- Windows：94 个测试文件通过，593 项通过、2 项平台条件跳过；Linux：94 个测试文件通过，594 项通过、1 项平台条件跳过。
- 最新源码在 Windows 和 Linux 各通过 25 项界面回归、类型检查、构建及运行时冒烟；重新生成的 Windows 解包目录与 Linux AppImage/deb 对应的解包目录均通过包内 SQLite / PTY 检查。Linux 安装包及 `SHA256SUMS` 已同步更新。Lint 为 0 错误、567 条 warning。
- Linux 额外使用真实 Electron 42.11.3（内置 Node 24.19.0）执行生产环境恢复模块的 Shell 探针，多行值、等号、空值及控制变量过滤均通过。
- 原始日志为 `.tmp-tests/cross-platform-audit/` 内的 `cwd-before.log`、`cwd-after.log`、`env-before.log`、`env-after.log`、`linux-electron-shell-env.log` 和各平台 `*-continuation.log`。这些本地证据不替代 macOS/ARM64 原生验收。