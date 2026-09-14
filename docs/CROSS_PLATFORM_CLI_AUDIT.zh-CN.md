# 跨平台 CLI 兼容性审计

> 修复状态更新：2026-09-12 已完成本轮代码修复及 Windows/Linux 验证；下文保留修复前 `606b7b4` 基线。当前构建、测试和 macOS 待验收边界见 `CROSS_PLATFORM_BUILD.zh-CN.md`。

- 日期：2026-09-12
- 代码基线：`606b7b4`（`main`）
- 范围：8 个 Agent CLI + Terminal；可执行文件、环境、配置/会话目录、启动参数、恢复会话、远程实例隔离和打包运行时。
- 性质：检查报告，不是已完成的兼容性修复或发布承诺。

## 结论与证据边界

项目具有跨平台 Electron 外壳和部分 Unix 适配，但不能把“可生成目录产物”视为“所有 CLI 在三个平台可用”。发现的问题包括路径规则不一致、远程 Shell 来源错误、启动参数与上游不兼容，以及 Electron 运行时缺少数据库能力。

证据分三类：

- **已复现**：调用项目真实函数、隔离文件夹夹具、当前 Electron 运行时，或实际 CLI/上游参数解析器得到结果。
- **源码确认**：项目实现与已读取的官方文档/源码存在明确差异，但没有在目标平台启动完整 CLI。
- **待实测**：需要 macOS/Linux 桌面环境或具体发行方式才能确认，不能列作已发生的 bug。

本轮没有 macOS/Linux 真机验收。Windows 下传入 `platform: 'linux'` 的路径测试，只验证解析契约，不能冒充 Linux 实机测试。上游 main 分支、在线文档与 npm 元数据是本次读取时的快照，不代表用户安装的每个历史版本；需要以实际 CLI 版本建立兼容范围。

搜索工具本轮未返回可用结果，因此改为直接下载官方文档、上游仓库源码和发布包元数据；来源见文末。没有依据不明的第三方教程推导路径。

## 一、实际支持范围：不能把这些 CLI 当成一种运行时

项目注册来源：`src/shared/cli-types.ts`、`src/main/ipc/cli-registry.ts`。

| 类型 | 已核实的安装/运行方式差异 | 配置和会话规则 | 项目当前情况 |
| --- | --- | --- | --- |
| Claude | 官方原生安装、Homebrew；Windows 原生和 WSL 是不同环境 [S1] | `CLAUDE_CONFIG_DIR` 同时影响设置与会话 [S2] | 会话扫描读取该变量，配置编辑与技能目录仍固定默认路径 |
| Codex | 官方安装渠道有独立安装器、npm/Homebrew；不能只按 npm 目录定位 [S3] | `CODEX_HOME`，默认 `~/.codex` [S4] | 原生会话扫描支持 `CODEX_HOME`，配置编辑不支持 |
| OpenCode | 发布包/安装方式可能使用启动包装器及平台产物 [S5][S18] | XDG 配置/数据目录；JSON/JSONC；自定义配置文件/目录为不同机制 [S5][S6] | 列会话委托 CLI，有正确的一面；配置编辑固定 `~/.config/opencode/opencode.json` |
| Gemini | 已核实 npm 包的入口是 Node 脚本 [S18] | `GEMINI_CLI_HOME` 是替代 HOME，配置根还要追加 `.gemini`；系统配置另有平台规则 [S7] | 扫描根少拼 `.gemini`；配置编辑忽略变量；协作参数不兼容 |
| Pi | npm 的 Node 脚本入口；已核实新旧包名及不同 Node engines，不能只用命令名判断版本 [S8][S18] | `PI_CODING_AGENT_DIR`；独立 session-dir 覆盖；部分目录值支持 `~` 展开 [S8] | 绝对 agent 根可用；自定义 session 根与 `~` 展开遗漏 |
| OMP | Bun 安装、独立二进制、Homebrew 等；npm 元数据声明 Bun engine [S9][S18] | `PI_CONFIG_DIR`、`PI_CODING_AGENT_DIR`、profile、迁移后的 XDG 数据路径；不是 Pi 的完全等价实现 [S10] | 基本默认路径已有；profile 优先级、显式空值、自定义配置根和迁移目录未对齐 |
| Grok | 此项目接的是 xAI 官方 Grok Build，发布包为 `@xai-official/grok`，不是任意同名 grok CLI [S11][S18] | `GROK_HOME`，会话按工作目录关联；有官方 session 子命令 [S11] | 配置根覆盖已实现；列会话传递 cwd，不能把这些说成缺失。文本解析与部分可选参数需绑定版本验证 |
| Hermes | 官方 Python/uv 安装体系与 `hermes-agent` 非官方 npm 桥是两种发行方式 [S12][S18] | `HERMES_HOME`；Windows 默认 LOCALAPPDATA，Unix 默认 `~/.hermes`；profile 可改变运行目录 [S13] | 配置有基本适配，数据库扫描未统一；Electron 缺少 SQLite 能力；协作参数不兼容 |
| Terminal | 系统 Shell、用户 `$SHELL`、自定义路径；不是第九个 Agent | 不应套用 Agent 的配置/恢复 ID 规则 | 本地有 Windows/Unix 检测；远程表单却仍获取本机 Shell 列表 |

### 安装目录不是 HOME 目录

可执行文件目录、Node/Bun/Python 运行时目录、CLI 配置目录、会话数据目录，以及项目 cwd 是五件不同的事。设置一个绝对 CLI 路径，并不保证它的 shebang 能找到运行时，也不会自动告诉应用 CLI 使用哪个 profile/会话根。

Homebrew 有平台/架构相关前缀，nvm 通过用户 Shell 初始化选择 Node；Bun 也有自己的安装与 PATH 规则 [S15]。应发现当前环境实际生效的可执行文件，而不是按 OS 拼一个固定安装路径，更不能对版本管理器目录做“字典序找最高版本”。

## 二、已复现或源码确认的问题

### F01：Unix 桌面启动环境没有统一解析（源码确认；完整症状待目标平台验证）

- `src/main/services/shell-detector.ts:42` 仅补充 Windows 用户可执行目录。
- `src/main/services/cli-manager.ts:198` 仅在 Windows 分支补 PATH。
- `src/main/index.ts:697` 自动检测走当前进程环境中的 `which/where`；后续版本查询再按命令名执行。
- 非 Windows 的 PTY 启动没有先建立用户环境上下文，而是沿用当前应用进程的环境。

因此，对“终端启动应用”和“桌面启动应用”之间的环境差异尚无完整处理。不能只换成 `which`，也不能只给 PATH 追加 `/usr/local/bin` 就算解决。[S15]

**修复边界**：检测、版本查询、会话发现和 PTY 启动必须使用同一套解析环境。显式配置优先；用户 Shell 环境获取应异步、有超时和失败回退，不应在 Electron 主线程同步无限等待。仅探测所需内容，避免在日志中输出凭证变量。

### F02：Windows npm `.cmd` 与通用可执行文件混为一谈（已复现）

- `src/main/index.ts:684` 对手动指定路径使用 `execFile(path, ['--version'], { shell: false })`。
- OpenCode 会话列表也直接 `execFile`，见 `src/main/services/opencode-adapter.ts:46`。
- Grok 会话列表的执行边界同样使用 `execFile`，见 `native-session-candidates.ts:610`。

自建、仅输出固定版本文本的 `.cmd` 夹具，在当前 Windows Node 中产生 `spawn EINVAL`。这不是文件不存在，而是该调用方式不能直接执行 Windows batch shim。[S16]

**注意**：不能简单统一改回 `shell:true`。路径来自设置或远程请求，必须保留参数与命令分离的安全边界；应区分原生程序、npm shim、POSIX 脚本及其实际运行时。现有部分适配器版本方法仍用字符串拼接 `exec`，也应纳入同一个受控执行入口，而不是新增第三套规则。

### F03：Claude、Codex、OpenCode 的配置编辑与运行目录不一致（已复现）

`src/main/services/config-paths.ts:69–95` 固定默认路径：

| 场景 | 正确目标 | 当前结果 |
| --- | --- | --- |
| `CLAUDE_CONFIG_DIR=<root>` | `<root>/settings.json` | `<home>/.claude/settings.json` |
| `CODEX_HOME=<root>` | `<root>/config.toml` | `<home>/.codex/config.toml` |
| `XDG_CONFIG_HOME=<root>` | `<root>/opencode/opencode.json`（该 JSON 文件存在时） | `<home>/.config/opencode/opencode.json` |

依据 [S2][S4][S6]。Claude/Codex 的扫描代码已经读取对应环境变量，不能误说为“扫描也完全不支持”。真正问题是同一个产品内不同入口指向不同目录。

OpenCode 还支持 JSONC、自定义配置文件与多层覆盖 [S5]。这些是额外的配置编辑覆盖范围问题；不能武断地把所有层合并写回一个文件，也不能把只展示全局文件说成已经展示“最终生效配置”。

### F04：Gemini 对 `GEMINI_CLI_HOME` 的语义理解错误（已复现）

官方 `utils/paths.ts` 把变量作为替代 HOME；`Storage.getGlobalGeminiDir()` 再追加 `.gemini`。[S7]

- 上游：`GEMINI_CLI_HOME=<root>` → `<root>/.gemini/settings.json`、`<root>/.gemini/tmp/...`。
- 当前配置编辑：忽略变量，仍读取原 HOME。
- 当前扫描：`native-session-candidates.ts:112` 直接返回变量值，扫描 `<root>/tmp/...`。

使用相同夹具，向 collector 显式传入 `<root>/.gemini` 可以发现 1 条会话，使用默认根返回 0 条。因此不是“可能需要支持一个变量”，而是已有变量处理具体错误。

**对前一轮结论的纠正**：不能把 `GEMINI_CLI_HOME` 等同于最终 Gemini 配置根。

### F05：Pi 自定义会话目录与 `~` 展开遗漏（已复现）

- `config-paths.ts:36` 与 `native-session-candidates.ts:350` 接受原始 agent 根，但没有与上游一致地展开 `~`。
- 扫描只去 `<agentRoot>/sessions`，没有处理上游支持的独立会话目录覆盖。[S8]
- 隔离测试设置 `PI_CODING_AGENT_SESSION_DIR` 后，默认扫描找不到夹具；显式指定正确根的对照调用能找到。

不能因绝对 `PI_CODING_AGENT_DIR` 的测试通过，就认定 Pi 路径能力完整。该绝对路径场景本轮也作为正向对照验证通过。

### F06：OMP 不能完全沿用 Pi 的路径规则（部分已复现，其余源码确认）

本地：`config-paths.ts:42–49`、`native-session-candidates.ts:354–360`。

已复现：

1. `OMP_PROFILE=''` 且 `PI_PROFILE='work'`：上游选择默认 profile，本地通过 `||` 错选 work。
2. 同时存在具名 profile 与普通 `PI_CODING_AGENT_DIR` 覆盖：已读取的上游实现优先具名 profile，本地配置函数先选 agent 覆盖。
3. `PI_CONFIG_DIR`：上游支持，本地配置路径函数忽略。

源码确认：上游当前实现还有迁移后的 XDG data/state/cache 根，并检查对应迁移目录存在；具名 profile 的判断又不同。本地扫描只列传统 `<agentRoot>/sessions`，未对齐这套机制。[S10]

本地还会把多个 profile/default 根一起加入候选扫描。候选列表返回 ID，却不携带对应 profile/运行目录；不能保证当前启动上下文能恢复跨 profile 找到的 ID。完整恢复失败应在目标 OMP 版本上补测，不能把所有多根扫描本身都认定为 bug。

### F07：Hermes 有两个独立问题（已复现）

**目录不一致**：

- 配置编辑已支持 `HERMES_HOME` 和 Windows `LOCALAPPDATA`。
- `native-session-candidates.ts:519` 的数据库却固定到 `<home>/.hermes/state.db`。
- 注入只记录路径、不读取实际数据库的 opener，确认即使设置 `HERMES_HOME` 也仍请求旧路径。
- 上游路径规则见 [S13]，npm 包本身也明确是非官方桥接，不应把它当成 Hermes 唯一安装方式 [S12]。

**运行时缺少 SQLite 能力**：

项目真实 Electron 执行结果：

```text
Electron: 33.4.11
Node: 20.18.3
Platform: win32 x64
import('node:sqlite') -> ERR_UNKNOWN_BUILTIN_MODULE
```

collector 使用 `node:sqlite`，见 `native-session-candidates.ts:458–469`。CI 测试使用 Node 22，而真实应用使用 Electron 自带 Node；两者不是同一个运行时。[S17]

已有 `HermesCandidatesUnsupportedError` 和 UI 的 unsupported 降级，因此这是**会话发现能力不可用**，不是已证明的整应用崩溃。解决目录之后也不能宣称 Hermes 会话发现已完成，数据库运行时问题必须单独解决。

### F08：远程 Terminal 获取了本机 Shell 列表（已复现函数边界）

- `SessionOptionsForm.vue:650` 导入本地 API 的 `detectShells`。
- `ensureShellsLoaded()`（约 1165 行）不判断 `instanceId`，直接调用它。
- `syncShellChoice()` 默认使用列表第一项。
- 创建表单允许远程 Terminal，构建 options 时会把选择的 shell 发送给目标实例。

从真实 Vue 文件抽取这两个函数执行，传入 `instanceId='remote-linux'`，仍调用本地检测并填入 Windows CMD。该测试没有模拟整个 Electron 页面，但确认了错误的数据来源。

例如 Windows 控制端创建 Linux Terminal，可传出 `shell:'cmd'`；远端 `resolveShellPath` 对未匹配的 ID 原样返回，不会自动变成 Linux 默认 Shell。需要目标实例 Shell 能力接口，或在未获取远端信息时保留“由远端选择默认 Shell”。

**已有正确实现**：创建远程 Agent 时不会自动复制本机设置中的 `cliPath`；远程会话候选查询也不附带本机路径。见 `CreateSessionDialog.vue:349–351` 与 `SessionOptionsForm.vue:869`。不能把这两处已经做好的隔离再列成遗漏。

### F09：协作提示词注入被错误地视为所有 CLI 的通用参数（已复现 + 上游核对）

`src/main/index.ts:807–812` 给多个适配器开启协作提示注入。Gemini、Hermes 适配器会追加 `--append-system-prompt`。

- 本机 Gemini **0.40.0** 的 `--help` 成功，未声明该参数；实际调用加入该参数后退出码为 1，报 `Unknown arguments: append-system-prompt, appendSystemPrompt`。
- 已读取的 Gemini 上游参数解析也启用 strict，未声明该参数。[S7]
- 下载并检查 Hermes 官方 `_parser.py` 后，只运行其标准库 argparse 构造器：普通 `--model` 参数解析成功；加入 `--append-system-prompt` 后退出码为 2。[S14] 没有启动 Hermes Agent，也没有请求模型。

这是启动契约错误，不是 macOS/Linux 专属问题。提示词注入必须按 CLI 能力选择官方支持的机制，不能把 Claude 风格参数复制给其他 CLI。

另需区分：OMP 官方参数表支持 `--approval-mode`，Pi 的已读取核心参数表没有声明同名内建参数（存在扩展参数机制）。Grok 的部分可选权限参数也需结合具体版本核对。后两者本轮不作为已复现的启动失败，也不应把 OMP 已支持的参数误删。

## 三、已检查但不应误报为 bug 的部分

1. Unix Shell 检测已支持 `$SHELL` 和 bash/zsh/sh 回退；不是“只支持 PowerShell”。自定义 Shell 也能传入。
2. Agent Bus 已有 Unix socket、POSIX shim 和可执行权限设置；`es` 使用 Electron 的 Node 模式，不要求用户另外安装全局 `es`。
3. Grok 的 `GROK_HOME`、Pi 的绝对 agent 目录、Hermes 的显式配置目录均通过本轮正向断言。
4. OpenCode 列会话委托 CLI，并显式传 cwd；Grok 列会话也传 cwd。不能因为应用没有自行读它们全部数据库，就说无法识别会话。
5. `npmRebuild:false` **本身不证明错误**。需要目标平台实际加载 `node-pty` 和启动 PTY 的结果，而不是仅凭设置猜测 ABI 不兼容。
6. 当前技能管理主要实现 Claude/Codex/OpenCode 三类，路径也固定在传统目录。其他 CLI 的技能管理是覆盖范围限制，不等于其会话启动不可用。已有三类技能目录与自定义根的一致性应跟随路径解析一起处理。
7. Linux/macOS 的进程退出只走 PTY 的 kill，Windows 有额外 taskkill。Unix 进程树是否残留需要受控子孙进程测试，不能仅凭“没有 taskkill”判定 Unix 实现错误。

## 四、跨平台验收仍需要的实测

以下是验收项目，不是已确认 bug：

| 维度 | 需要覆盖的情况 |
| --- | --- |
| macOS | arm64/x64、桌面启动与终端启动、Homebrew/独立程序/Node 或 Bun 包、签名与权限 |
| Linux | 明确支持的发行版/架构、AppImage/deb、桌面 PATH、可执行权限、glibc/musl 差异；不能把支持 Linux 泛化为支持所有发行版 |
| Windows | 原生 EXE、npm cmd shim、Bun、官方 Hermes 安装；WSL 视为独立执行环境而不是把 Windows 路径换斜杠 |
| 目录 | 空格、中文、显式目录覆盖、profile、已有 JSONC、多用户 HOME、符号链接/真实路径 |
| 运行时 | 找到 CLI 但找不到 node/bun/python；原生 CLI 不应被额外的 Node 检查误挡 |
| 生命周期 | 新建、恢复指定会话、暂停/重启/销毁、退出后子进程清理、CLI 更新后的重新检测 |
| 交互 | 持续流式输出时上翻、刷新恢复、多 pane/tab、窗口关闭与重新激活、实际终端快捷键 |
| 远程 | 控制端与被控端平台不同；CLI/Shell/配置根/cwd 都必须由目标实例解释 |
| 打包 | 启动打包后的 Electron，实际加载 node-pty、创建 PTY、读写与退出；不能只执行 electron-builder --dir |

目前 `.github/workflows/ci.yml` 的单测矩阵是 Windows/Linux，Node 22；三平台 package-smoke 只构建目录产物。配置存在不代表本轮检查了远端 CI 的实际运行状态，更不代表以上功能测试通过。

## 五、修复时应保持的设计边界

建议引入共享的 **CLI 运行上下文解析**，而不是给每个 adapter 各加一组路径常量。一个解析结果应包含：

- 目标实例及平台/架构；
- 选中的实际可执行文件、发行方式和必要运行时；
- 受控的命令参数与有效环境；
- 当前 CLI 的配置根、数据/会话根和 profile；
- 已验证的版本与能力，例如会话发现、提示注入、恢复方式；
- 明确失败原因：未安装、不可执行、运行时缺失、版本不支持、配置根冲突、目标离线。

检测状态、版本查询、会话发现、恢复和实际 PTY 启动应消费同一个结果。不要把 Pi 的 `--session` 强行统一成其他 CLI 的 `--resume`；不要把所有 `*_HOME` 都当成相同层级；不要把多个配置层的合成结果回写到任意一个源文件。

应先处理可复现的启动阻断与实例隔离，再统一目录解析，最后以明确版本/平台矩阵做运行验收。对于完全自由的自定义参数，不应承诺能自动解析所有未来的配置覆盖；明确支持的 profile/目录参数需要显式建模，其余给出能力限制说明。

## 六、本轮执行的验证

| 验证 | 结果与边界 |
| --- | --- |
| 已有相关测试 | 8 个文件、67 项通过；未重跑完整项目全部测试 |
| 定向契约检查 | 16 项：13 项未满足、3 项正向对照通过；13 项不等于 13 个独立缺陷，也不是新改动引入的回归 |
| Gemini 路径夹具 | 同一文件树，显式正确根找到 1 条；默认环境解析找到 0 条 |
| Pi 会话路径夹具 | 正确 root 对照找到 1 条；独立 session 环境变量路径未被默认扫描使用 |
| Windows npm shim | `execFile(..., shell:false)` → `spawn EINVAL` |
| 远程 Terminal | 真实表单函数在 remote-linux 上仍调用本机 Shell 检测；非完整 UI E2E |
| Electron SQLite | Electron 33.4.11 / Node 20.18.3：`node:sqlite` 不可用 |
| Gemini CLI 参数 | 本机 0.40.0 帮助成功；加入协作参数后明确未知参数、退出 1 |
| Hermes 官方解析器 | 标准参数成功；协作参数解析退出 2；未启动完整 Agent |
| Gemini 不带注入的列扩展对照 | 20 秒未完成，已终止本次探测；原因未定位，不计为 EasySession bug，也不声称该对照完整运行成功 |

本地证据保存在被 git 忽略的 `.tmp-tests/cross-platform-audit/`：

- `sources.json`、`package-metadata.json`：获取来源；
- `audit.test.ts`、`vitest.config.ts`、`reproductions.log`：定向契约检查，故意保留失败结果用于后续修复；
- `existing-tests.log`：67 项通过的记录；
- `installed-gemini-help.log`、`installed-gemini-injected.log`；
- `hermes-parser-probe.json`、`electron-runtime-probe.json`。

复查命令：

```powershell
npx vitest run --config .tmp-tests/cross-platform-audit/vitest.config.ts
npm test -- tests/config-paths.test.ts tests/config-service.test.ts tests/native-session-candidates.test.ts tests/native-session-discovery.test.ts tests/new-cli-adapters.test.ts tests/gemini-cli.test.ts tests/cli-launch-args.test.ts tests/remote-instance-awareness.test.ts
```

这组定向测试是本地审计夹具，不会加入默认 `npm test` 扫描，也没有改动生产实现。报告可以随代码保留；忽略目录中的原始下载与夹具不随提交自动发布。

## 七、上游来源

均于 2026-09-12 直接读取；GitHub 的 main/dev 源码用于确认当前契约，不代替已安装版本的实测。

- **[S1] Claude 官方安装**：https://code.claude.com/docs/en/setup.md
- **[S2] Claude 官方配置**：https://code.claude.com/docs/en/settings.md
- **[S3] Codex 官方 CLI**：https://developers.openai.com/codex/cli （本次重定向到 https://learn.chatgpt.com/docs/codex/cli ）
- **[S4] Codex 官方高级配置**：https://developers.openai.com/codex/config-advanced （本次重定向到 https://learn.chatgpt.com/docs/config-file/config-advanced ，Config and state locations）
- **[S5] OpenCode 官方配置**：https://opencode.ai/docs/config/
- **[S6] OpenCode 官方源码**：https://github.com/anomalyco/opencode/blob/dev/packages/core/src/global.ts ；https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/config/paths.ts
- **[S7] Gemini 官方源码**：https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/utils/paths.ts ；https://github.com/google-gemini/gemini-cli/blob/main/packages/core/src/config/storage.ts ；https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/config.ts ；https://github.com/google-gemini/gemini-cli/blob/main/packages/cli/src/config/settings.ts
- **[S8] Pi 官方仓库**：https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md ；https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/config.ts ；https://github.com/earendil-works/pi/blob/main/packages/coding-agent/src/cli/args.ts
- **[S9] OMP 官方仓库/安装**：https://github.com/can1357/oh-my-pi
- **[S10] OMP 官方目录与参数源码**：https://github.com/can1357/oh-my-pi/blob/main/packages/utils/src/dirs.ts ；https://github.com/can1357/oh-my-pi/blob/main/packages/coding-agent/src/cli/flag-tables.ts
- **[S11] xAI 官方 Grok Build 文档**：https://docs.x.ai/build/overview ；https://docs.x.ai/build/settings ；https://docs.x.ai/build/settings/reference ；https://docs.x.ai/build/cli/reference ；https://docs.x.ai/build/features/sessions
- **[S12] Hermes 官方与桥接包的各自来源**：https://github.com/NousResearch/hermes-agent ；https://github.com/NousResearch/hermes-agent/blob/main/scripts/install.sh ；https://github.com/wyrtensi/hermes-agent-npm （后者明确自称 unofficial；只用于说明该桥自身行为，不代表官方规范）
- **[S13] Hermes 官方目录规则**：https://github.com/NousResearch/hermes-agent/blob/main/hermes_constants.py ；https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/config.py
- **[S14] Hermes 官方参数解析器**：https://github.com/NousResearch/hermes-agent/blob/main/hermes_cli/_parser.py
- **[S15] 安装环境规则**：https://docs.brew.sh/FAQ ；https://github.com/nvm-sh/nvm ；https://bun.sh/docs/installation
- **[S16] Node 官方子进程文档**：https://nodejs.org/api/child_process.html （Windows .bat/.cmd 与 execFile 的区别）
- **[S17] Node 官方 SQLite 文档**：https://nodejs.org/api/sqlite.html （另有本机 Electron 实测结果，不只依据文档推断）
- **[S18] 发布包自身元数据**：https://registry.npmjs.org/@google/gemini-cli/latest ；https://registry.npmjs.org/@earendil-works/pi-coding-agent/latest ；https://registry.npmjs.org/@mariozechner/pi-coding-agent/latest ；https://registry.npmjs.org/@oh-my-pi/pi-coding-agent/latest ；https://registry.npmjs.org/@xai-official/grok/latest ；https://registry.npmjs.org/hermes-agent/latest ；https://registry.npmjs.org/opencode-ai/latest
