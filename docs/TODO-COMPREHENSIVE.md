# EasySession 全面完善 TODO 总账（v0.8.x → 1.0）

> 生成时间：2026-09-05
> 口径：不求工作量最小，只求一步到位 —— 体验、性能、人机交互、安全、工程质量全维度收口。
> 每项带证据位置（文件:行号）与验收标准。勾选前必须通过对应验收。

---

## A. 安全加固（SEC）

### SEC-1 协作消息注入终端前剥离 ESC/ANSI 序列
- 位置：`src/main/services/agent-bus/dispatch-gate.ts:155-163`
- 问题：bracketed-paste 包裹 `\x1b[200~...\x1b[201~`，但 `text` 本体未剥离 `\x1b/0x9b`，消息内嵌 `\x1b[201~` 可提前结束 paste 模式，剩余内容逐键注入目标终端（任意命令）。
- 做法：注入前过滤/转义 `0x1b`、`0x9b`（保留包裹用 paste 标记本身）；正文加长度上限与显式分隔。
- 验收：单测覆盖"消息含内嵌 `[201~` / CSI 序列 / 控制字符"三类样本，注入后目标 PTY 收到的字节中不含可逃逸 paste 的 ESC；broker 层注入正文不改变可见字符。

### SEC-2 `cli:check` 改 execFile，消除命令注入
- 位置：`src/main/index.ts:586`
- 问题：`exec(`"${preferredPath}" --version`)`，路径来自 renderer，含 `"` 可在 cmd.exe 逃逸。
- 做法：`execFile(normalizedPreferredPath, ['--version'], { shell:false, timeout:5000 })`；renderer 侧先做路径存在性校验。
- 验收：含引号/特殊字符的路径不再逃逸；超时有上限；既有版本探测功能不回归（含 e2e cli 状态卡片）。

### SEC-3 WebSocket 通道加 per-socket 限流
- 位置：`src/main/remote/socket.ts:238-271`（事件注册）、`src/main/remote/server.ts:189-190`（限流只挂 REST）
- 问题：`session:input` / `session:write` 直写 PTY 零限速；REST 240 req/min 对 WS 不生效。
- 做法：per-socket 令牌桶（input/write/subscribe 分别设桶），超限断开或丢弃+告警事件；历史回放复用主进程 16ms 合帧逻辑（当前 socket.ts:57-64 同步逐条 emit 2000 行）。
- 验收：单测模拟洪泛 input 事件被限流；subscribe 回放产生合帧批次而非逐条洪峰；正常交互（打字节奏）不受影响。

### SEC-4 远程会话订阅授权收敛
- 位置：`src/main/remote/socket.ts:238-271`
- 问题：单一 bearer token 下任何 socket 可 `session:subscribe` 任意会话读全部输出（含敏感内容）。
- 做法：默认仅允许订阅本实例会话；跨实例/项目订阅需实例级授权开关（沿用"允许远程控制"的分级思路）。
- 验收：默认配置下订阅越权会话被拒并有日志；开启授权后恢复；Web 端现有合法订阅不回归。

### SEC-5 开启 renderer sandbox
- 位置：`src/main/index.ts:305-310`、`src/preload/index.ts:11-67`
- 问题：`sandbox:false` 无必要（preload 仅用 `ipcRenderer`/`contextBridge`）。
- 做法：`sandbox: true`，全量回归 e2e（重点：xterm、node-pty 桥、剪贴板、通知）。
- 验收：e2e 全绿 + 手工冒烟（终端输入输出、split、通知点击、远程挂载）。

### SEC-6 收敛高危 IPC 暴露面
- 位置：`src/main/ipc/config-handlers.ts:13-19`（projectPath 未校验）、shell:openPath、project:git*
- 做法：`config:claude:project:*` 校验 projectPath 属于已注册项目；`shell:openPath` 限制为已注册项目目录及其子路径；git push/pull/checkout 增加确认语义（renderer 侧已有 UI 则主进程侧记审计日志）。
- 验收：单测传入未注册路径被拒；已注册路径行为不变。

### SEC-7 限流改两级桶
- 位置：`src/main/remote/rate-limit.ts:72-81`
- 问题：key = ip:method:path，N 个端点 = N 倍配额；桶满后新 key 直接放行（限流对撑满场景失效）。
- 做法：per-IP 全局硬顶桶 + per-endpoint 细桶两级；登录路径独立更紧的桶；保留 active 条目保护语义。
- 验收：单测证明总配额不随端点数线性放大；桶满后新 IP 仍受限。

### SEC-8 非 loopback 监听的明文风险治理
- 位置：`src/main/remote/server.ts:284`（无 TLS listen）、`src/main/remote/config.ts:86-89,186`（token 明文落盘）、`src/main/services/cloudflare-tunnel-manager.ts:246`
- 做法：host 改为非 127.0.0.1 时 UI 强警示 + 二次确认；token 文件权限收紧（Windows 可选 DPAPI）；README/设置页明示"仅限隧道或可信网络"。
- 验收：切 0.0.0.0 出现不可跳过的警告；文档存在且与 UI 文案一致。

### SEC-9 Web 端"记住设备"改 HttpOnly cookie + 服务端会话表
- 位置：`src/main/remote/web/scripts/auth.ts:56-58`
- 问题：64 hex token 写 localStorage；`server.ts:172` CSP `unsafe-inline` 使任何注入点可读走。
- 做法：服务端 session 表（可按设备撤销）+ HttpOnly/Secure/SameSite cookie；localStorage 不再存 token；提供"退出所有设备"入口。
- 验收：登录后 localStorage 无 token；可撤销单个设备会话；移动端 Safari/Chrome 实测记住与撤销流程。

### SEC-10 CSP 去 unsafe-inline
- 位置：`src/main/remote/server.ts:170-173`
- 做法：内联脚本 nonce 化（登录页/会话页模板统一改）。
- 验收：CSP 报告无违规；页面功能（xterm 加载、降级纯文本路径）不回归；remote-web-template 测试更新。

### SEC-11 bus 管道/socket 命名去 token 前缀 + 权限收紧
- 位置：`src/main/services/agent-bus/bus-server.ts:76-84`
- 做法：pipe 名改纯随机串；POSIX 下 socket `chmod 600`；Windows named pipe 加 DACL 限制当前用户。
- 验收：枚举 pipe 名得不到 token 片段；agent 连接行为（attach-first）不回归。

### SEC-12 headless 控制端口加固
- 位置：`src/main/index.ts:709-755`（未提交 headless diff）
- 问题：`quit` 无鉴权本地可匿名关停；`socket.on('data')` 整 chunk 当一条命令（粘包/分段 `qu`+`it` 判 unknown）；连接不超时；`process.stdin 'end'` 在 Windows GUI/detached 下可能误触发 shutdown。
- 做法：一次性 token 经 env 下发；按 `\n` 分帧解析；空闲连接超时断开；stdin end 仅在确认 pipe 语义时注册，另加最小运行时长守卫。
- 验收：单测覆盖分帧/粘包/未知命令/超时/错误 token；真机 headless 启停 50 次无误关停。

### SEC-13 agent-bus 凭据下发方式文档化 + 中期改造
- 位置：`src/main/services/cli-manager.ts:219-226`、`src/main/services/agent-bus/es-client-source.ts:11`
- 问题：`EASYSESSION_BUS_TOKEN` 注入 PTY env，同终端任意子进程可读。
- 做法（分两步）：① skill/帮助文本与使用说明中明确警示；② es client 改 stdin/pipe 握手，主进程按 pid 验证后下发凭据，env 不再携带。
- 验收：①文档存在；②env 中无 token 时 es attach 仍可用，冒充他人 processId 被拒（沿用 P0#2 语义）。

### SEC-14 远程控制危险面的显式警示
- 位置：`src/main/remote/capabilities.ts`（passthroughOnly 语义）、设置页文案
- 问题：`sessionInput:true` 意味着 passthrough 模式下远程可写任意 PTY 输入（等价 RCE），UI 无醒目标识。
- 做法：设置页对该开关加风险分级徽标与展开说明；开启时写审计日志（谁在何时开启）。
- 验收：UI 可见警示；日志可查。

---

## B. 稳定性与性能（STAB）

### STAB-1 用户级 CLI 配置写入统一原子化
- 位置：`src/main/services/config-service.ts:25-28`、`src/main/ipc/settings-handlers.ts:26-27`、`src/main/services/project-manager.ts:197`
- 问题：绕过 DataStore 直接覆写用户 `~/.claude/settings.json` 等，崩溃/断电可截断损坏且无备份。
- 做法：抽出 `writeJsonAtomic`（tmp+fsync+rename+重试+备份，对齐 `data-store.ts:231-272` 标准），三处全部改走；prompt 文件同理。
- 验收：单测模拟中断写入（写一半 kill）后旧内容完好且有备份可恢复；现有配置编辑 live-detect 行为不回归。

### STAB-2 视图 keep-alive 消除切页重建
- 位置：`src/renderer/src/layouts/MainLayout.vue:124-127`
- 问题：切页即卸载重建；SessionsView 每个 pane 重建 xterm + 重放 12000 行（warm cache 仅 30s TTL，`TerminalOutput.vue:834-898`）；Dashboard/ProjectDetail 每次挂载全量 refetch。
- 做法：SessionsView、CollaborationView 加 `<keep-alive>`（含 include 列表与激活时刷新策略）；Dashboard/ProjectDetail 的 fetch 下沉 store 层做 `loaded` 去重 + 显式刷新按钮/事件刷新；协作页 markSeen 改为离开页面时执行。
- 验收：切换 5 个页面往返后 xterm scrollback 保留、无重放日志；Dashboard 二次进入不发全量请求；内存无持续增长（挂 8 会话切页 30 分钟）。

### STAB-3 TerminalOutput 模块级快照缓存加淘汰
- 位置：`src/renderer/src/components/TerminalOutput.vue:131-135,203-212,249`
- 问题：`historySnapshotCache` 每条目最多 12000 行深拷贝，无写入侧淘汰、无会话销毁钩子，长驻滞留。
- 做法：写入时顺带 sweep 过期 key；sessions store `destroySessionRef` 后广播清理；缓存总字节上限（超限 LRU 驱逐）。
- 验收：单测（组件级）销毁会话后缓存清空；长跑内存曲线平稳。

### STAB-4 agent-bus 任务板有界化
- 位置：`src/main/services/agent-bus/task-store.ts:30,75-105`、`src/main/services/agent-bus/index.ts:241-253`
- 问题：tasks Map 永不淘汰（archive 只打标）、每任务 history 无上限（progress 心跳持续追加）、onChange 每 600ms 全量序列化落盘。
- 做法：终态任务保留 N 天/上限 M 条后滚动清除（归档文件可查）；history 截断最近 ~50 条；落盘改脏任务增量或加长去抖。
- 验收：单测验证滚动清除与 history 截断；注入 5000 任务后内存与 state 文件体积收敛；看板/归档 UI 可见性不回归。

### STAB-5 激活会话单一真源 + reconcile 收口
- 位置：`src/renderer/src/stores/sessions.ts:74,122-168`、`src/renderer/src/stores/workspace.ts:231-249`、`src/renderer/src/views/SessionsView.vue:553-580`、`src/renderer/src/stores/projects.ts:354-374`
- 问题：activeGlobalSessionKey 双份状态、三处几乎相同的 reconcile、动态 import 破循环依赖的痕迹。
- 做法：以 workspace.layout 为唯一真源，sessions store 的 active key 改 getter；抽独立 reconciliation 模块，三处调用同一实现；消除 store 间动态 import。
- 验收：现有 sessions/projects/workspace store 测试全绿 + 新增 reconcile 一致性单测；e2e 会话高亮与活动 pane 一致性用例通过。

### STAB-6 PTY kill 子进程树收口 + 退出等待
- 位置：`src/main/services/cli-manager.ts:349-368`、`src/main/index.ts:288-293`
- 问题：2s 兜底只做内存收口不验进程死亡；Windows kill 不追孙进程（npm→node→esbuild 孤儿）；shutdownApp killAll 后不等待即 quit。
- 做法：Windows 兜底 `taskkill /pid <pid> /T /F`；shutdownApp 在 killAll 后等待 finalizeExit 或 3s 上限。
- 验收：单测 + 手工（会话内起 dev server 后关闭应用，端口释放、无孤儿 node 进程）。

### STAB-7 journal 孤儿 reconcile
- 位置：`src/main/services/session-output.ts:80-98`、`src/main/services/session-manager.ts:386`
- 做法：启动时对 `output-journal/` 做 reconcile：sessions.json 中不存在的 id 直接清除（先并入待删清单防误删）。
- 验收：单测构造孤儿文件被清、活会话文件保留。

### STAB-8 日志体积治理
- 位置：`src/main/index.ts:325-328`（renderer-crash.log appendFileSync 无上限）、`src/main/services/logger.ts:15-18`（pino 无轮转）
- 做法：crash.log 超 1MB 截断（保留尾部）；headless 模式提供 pino destination 落盘 + 轮转（pino-roll）或文档明确宿主轮转责任。
- 验收：注入超长崩溃信息后文件 ≤1MB；headless 跑 24h 日志体积有界。

### STAB-9 无谓轮询收口
- 位置：`src/renderer/src/views/ProjectDetailView.vue:816-818`
- 做法：1s tick 改为复用 `SessionRuntimeInfo.vue:70-81` 的 shouldTick 模式（仅运行中会话 tick），页面不可见（document.hidden / 路由离开）暂停。
- 验收：离开页面 interval 清理；运行中/停止态行为不回归。

### STAB-10 上帝文件拆分：src/main/index.ts
- 位置：`src/main/index.ts`（787 行、7 类职责，headless diff 又 +63 行）
- 做法：拆出 `ipc/bus-handlers.ts`（~140 行 bus:*）、`ipc/app-handlers.ts`（badge/notify/dialog/cli:check）、`lifecycle/headless-control.ts`（控制服务器+信号注册）、`lifecycle/shutdown.ts`（退出编排）；index.ts 只留 DI 装配。拆分与 SEC-12 同步做。
- 验收：index.ts ≤200 行；typecheck/lint/test/e2e 全绿；行为零变化（对照 e2e 全套）。

### STAB-11 巨石组件拆分
- 位置与做法：
  - `CollaborationView.vue`（2280 行）→ 按面板拆 5 个子组件（成员/看板/任务详情/预览/聊天）+ 斜杠命令 composable（`:555-568,962-1038`）。
  - `WorkspacePaneTree.vue`（1469 行，27 个 emits、73 处纯转发 `:345-376`）→ 叶子直接调 workspace/sessions store 或 provide/inject，删 ~300 行转发样板。
  - `SettingsView.vue`（1574 行）→ 远程表单/cloudflare/token 模式逻辑下沉到 settings stores 或子 section。
  - `ProjectDetailView.vue`（1313 行）→ 会话操作四段 try/catch（`:427-567`）抽统一 action 助手；prompt 编辑器（`:578-681`）独立组件。
  - `SessionOptionsForm.vue`（1223 行）→ 按 CLI 拆三个子表单 + 共享壳。
  - `InspectorPanel.vue`（1047 行）→ sidebar timer / 拖拽 resize / 多 tab 编排拆 composable。
- 验收：每个子组件 ≤500 行；typecheck/lint/test/e2e 全绿；对应页面手工冒烟（协作页拖放、分屏、设置保存、ProjectDetail 四操作、三 CLI 新建表单、Inspector 三 tab）。

### STAB-12 broker.ts 语法异常清理
- 位置：`src/main/services/agent-bus/broker.ts:932`（挤在一行的函数签名，疑似编辑事故）
- 做法：格式化修正并 git blame 核对；顺手给 agent-bus 目录加 prettier/格式检查。
- 验收：diff 仅格式；测试全绿。

---

## C. 人机交互与体验（UX）

### UX-1 journal 的桌面 UI 出口（人的出口）
- 现状：journal 只有 `es output`（agent 用），桌面 UI 无"查看已退出会话日志"入口，renderer 中 journal 零引用。
- 做法：新 IPC `session:journal:tail`（id + 行数）；已退出/崩溃会话的 pane 与右键菜单加"查看输出日志"，用现有 TextFileViewer/MarkdownPreview 风格渲染（strip ANSI）。
- 验收：e2e 用例——启动→输出→停止→查看日志可见；崩溃会话（journal 恢复路径）同样可看。

### UX-2 任务事件系统通知
- 现状：通知管道只有 exit 事件（三档偏好/聚焦静默/点击定位已就绪）。
- 做法：agent-bus task done/fail/blocked 事件接入同一 notify 管道（settings 增加开关档位）；点击通知跳协作页并定位到任务。
- 验收：单测事件→通知映射；手工：后台挂任务，完成/失败各弹一条，点击跳转正确；偏好关闭后静默。

### UX-3 会话聚焦请求去重
- 位置：`src/renderer/src/App.vue:81-100` 与 `src/renderer/src/views/SessionsView.vue:731-735` 双订阅，逻辑已分叉。
- 做法：保留 App.vue 一处（它处理跨页定位），SessionsView 删除自有订阅；聚焦链路统一走 workspace store action。
- 验收：点通知只触发一次导航/高亮（e2e 断言调用次数或最终状态）；页内点击行为不回归。

### UX-4 协作页 markSeen 副作用修正
- 位置：`src/renderer/src/views/CollaborationView.vue:681-684`、`src/renderer/src/stores/collab.ts:163-168`
- 问题：watch snapshot 即 markSeen，任何 bus 推送（含发给他人的事件）都会清 notified 去重集，吞掉本应弹的通知。
- 做法：仅在用户有交互（打开对应面板/消息）时更新水位；离开页面时统一 markSeen。
- 验收：停留在协作页时其他会话的退出通知仍能弹出；角标语义正确。

### UX-5 快捷键统一注册表
- 位置：`src/renderer/src/composables/useShortcuts.ts:12-19`、`src/renderer/src/layouts/MainLayout.vue:161-168`、`src/renderer/src/components/ShortcutHelpDialog.vue:82-118`、`src/renderer/src/components/TerminalOutput.vue:642-675`
- 做法：单一 registry（id → keys → handler → i18n label → scope），useShortcuts 消费 handler、帮助面板自动渲染；终端 Ctrl+C/V 等入册；支持后续改键。
- 验收：帮助面板所列与实际行为一一对应（e2e 抽查全部键位）；三处硬编码删除。

### UX-6 i18n 硬编码清零 + 错误码化
- 位置：`src/renderer/src/layouts/MainLayout.vue:103,108,113`（窗口按钮中文 title）、`src/renderer/src/stores/sessions.ts:58,418,431,553,558,575`（中文异常串）、`src/renderer/src/stores/instances.ts:94`（文案兼做判定关键词）、`src/renderer/src/views/ProjectDetailView.vue:309`（中文顿号拼英文）
- 做法：全部改 i18n key；instances 错误改结构化错误码（文案与判定解耦）；store 抛错带 code，toast 层翻译。
- 验收：切英文后无中文残留（e2e 全页面英文截图抽查）；offline 判定单测不依赖文案。

### UX-7 启动语言闪烁修复
- 位置：`src/renderer/src/i18n/index.ts`（初始 en）+ `src/renderer/src/stores/settings.ts:68`（默认 zh-CN）+ `App.vue:64`（挂载后切）
- 做法：i18n 创建前同步取设置（主进程设置随窗口创建下发，或 settings store 同步初始化），首帧即正确语言。
- 验收：中文用户冷启动首帧无英文闪现（录屏/慢 CPU 节流下人工确认）。

### UX-8 终端内搜索（Ctrl+F）
- 现状：Roadmap 承诺"会话历史搜索"，v0.8.0 只做了会话名搜索。
- 做法：xterm search addon（@xterm/addon-search）接入 TerminalOutput，Ctrl+F 唤起搜索条（高亮/上下个/大小写/正则可选），快捷键入 UX-5 registry。
- 验收：e2e 在输出中搜索到目标行并高亮；关闭面板快捷键与 overlay 栈（useOverlayStack）兼容。

### UX-9 跨会话输出全文搜索
- 做法：基于 journal 建轻量索引（会话 id + 行文本，启动/空闲时增量），全局搜索入口（会话页顶部）列出命中会话与行，点击跳转定位。
- 验收：多会话数千行下搜索 <300ms；退出会话可搜（journal）；i18n 与空态/加载态齐全。

### UX-10 Web 端能力补齐（对齐"应急入口"定位）
- 现状：无多实例概念（scripts/sessions.ts 中 instance 零命中）、无 journal 回看、无新建会话 UI（capabilities 有 sessionCreate 但 UI 不暴露）、无状态变更前台提醒、断线后靠手动刷新。
- 做法（一步到位版）：① 新建会话入口（选项目 + CLI 类型）；② 已退出会话 journal 查看；③ socket status 事件驱动的页内 toast/角标提醒；④ 断线重连后自动回拉列表与当前会话历史；⑤ 实例切换视图（只读列表即可）；⑥ baseUrl 记忆。
- 验收：手机 Safari/Chrome 实测六项；remote-web-template 测试同步更新。

### UX-11 terminal-inject 开关前移
- 现状：Gemini/Qwen 等 terminal 会话参与协作需在协作面板里找开关（i18n 有风险确认文案）。
- 做法：新建 terminal 会话表单（SessionOptionsForm/创建对话框）直接提供"协作注入：仅提醒/完整注入"选项，带风险确认。
- 验收：e2e 新建 terminal 会话含该选项；选完整注入后会话在协作页可直接被 @ 注入。

### UX-12 删除死代码 ConfigView
- 位置：`src/renderer/src/views/ConfigView.vue`（275 行，路由已重定向、零引用）
- 验收：删除后 typecheck/lint/test/e2e 全绿。

### UX-13 崩溃恢复用户感知
- 位置：`src/main/index.ts:323-339`（render-process-gone 静默 reload）
- 做法：reload 后 toast 一次性提示"页面已自动恢复"，附"查看详情"（打开 crash 日志目录）；连续崩溃 ≥3 次时给出安全模式提示（禁用可疑状态恢复）。
- 验收：注入 crash 后出现提示；连崩场景不再无限静默循环。

### UX-14 协作页 5 面板独立布局记忆
- 现状：自由 dock 已支持拖放/嵌套分屏（commit 490b6f2），布局已持久化；补齐点：默认布局模板（单人/多 agent/监控三档一键切换）。
- 做法：布局预设 + 快捷切换；与现有持久化共存。
- 验收：切换预设→拖动→重启后保留自定义；e2e 覆盖预设切换。

---

## D. 功能演进（FEAT）

### FEAT-1 nativeSessionId 抽象（CLI 注册表化前置）
- 位置：`src/renderer/src/stores/sessions.ts:50-52`（claudeSessionId/codexSessionId/opencodeSessionId 平铺）、`src/renderer/src/stores/app.ts`（三套 available 平铺）
- 做法：`UnifiedSession.nativeSessionId + cliType`；CLI 可用性检测循环化；共享类型与 store getter 全部去具名化。含数据迁移（旧字段读入新字段，保留回写兼容）。
- 验收：迁移单测（旧 sessions.json → 新结构 → 读回）；e2e 三 CLI 会话恢复/继续不回归。

### FEAT-2 CLI 注册表机制
- 位置：`src/shared/cli-types.ts`、`src/main/index.ts:89-104`（硬编码 new）、`src/main/ipc/cli-handlers.ts`、`src/main/ipc/session-handlers.ts:64-67`（zod literal 写死）、`src/renderer/src/components/CreateSessionDialog.vue:196,242-244`、`src/renderer/src/api/cli.ts`、设置页 CliPathsSettingsSection
- 做法：注册表对象（id/显示名/徽章/NAME_PATTERN/adapter 工厂/lifecycle 工厂/launch 参数 schema），IPC 与 zod schema 由注册表派生；新增一个 CLI 的文件接触面从 12–15 个收敛到"1 个注册文件 + 1 对 adapter/lifecycle"。
- 验收：注册表驱动单测；用一个假 CLI 完成端到端注册演练（列在创建对话框、可启动、可恢复）。

### FEAT-3 Gemini CLI 一等支持（Roadmap 已承诺）
- 前置：FEAT-1、FEAT-2。
- 做法：gemini-adapter + gemini-session-lifecycle（resume 语义按其 CLI 实际参数），i18n、图标、agent-bus 话术、设置页路径配置。
- 验收：真实 Gemini CLI 启动/恢复/停止/协作注入全链手工验收 + 单测；Windows 下启动稳定性对齐 Claude（复用 f2023a9 类修复经验）。

### FEAT-4 Web 端 instance 感知
- 前置：UX-10。
- 做法：capabilities/REST 暴露实例列表（只读摘要），Web 顶部实例切换器；远程实例会话仅浏览与跳转本机（不在 Web 控制其他机器，保持安全边界）。
- 验收：多实例环境下 Web 可查看全部实例会话归属；默认不开跨实例控制。

### FEAT-5 macOS / Linux 支持（Roadmap 已承诺）
- 做法：electron-builder 增加 mac(dmg)/linux(AppImage,deb) 配置；排查 node-pty/ConPTY 分支（shell-detector、kill 收口 STAB-6 的平台差异）、路径处理（tests 中 Windows 路径断言解耦）、托盘/通知平台差异。
- 验收：三大平台 CI 产出制品；Linux 实机冒烟清单（启动/会话/分屏/通知/远程服务）通过。

### FEAT-6 自动更新 + 代码签名
- 现状：无 electron-updater、无签名、release:win 纯本地手动。
- 做法：electron-updater + 发布通道（GitHub Releases 或自建 latest.yml）；Windows 签名证书接入；tag 触发的 Release workflow 构建+签名+发布。
- 验收：旧版本收到更新提示并完成升级；未签名告警消除。

### FEAT-7 发布/灰度/降级策略落地（todo.md Phase 11 欠账）
- 做法：按 todo.md L593-596 四步顺序文档化并脚本化；远程功能开关（passthrough/allowRemoteControl/quick tunnel）降级路径演练；回滚验证（旧版本读新数据文件兼容性）。
- 验收：演练记录归档；老用户升级/回滚各一轮真机验证。

### FEAT-8 Inspector 树重构（遗留 Pending 计划）
- 位置：`.opencode/plans/inspector-tree-refactor.md`（Status: Pending Implementation）
- 做法：按该计划执行 Grid 列错位修复与树组件重构。
- 验收：计划内验收项勾完；e2e inspector 布局用例全绿。

### FEAT-9 UI 样式统一收口
- 位置：`.opencode/plans/2026-04-01-ui-style-unification.md`
- 做法：按既有 checkbox 计划逐页过一遍，tokens（remote/web/styles/tokens.ts 同源色板）与桌面主题变量对齐（含 docs/chatgpt-demo 试验的 GPT Dark 色板去留决策）。
- 验收：明暗两主题全页面走查（截图对比表）；无缺失 token 的硬编码色值（lint 规则或脚本扫描）。

### FEAT-10 Quick Tunnel 稳定性与 autoStart 决策
- 位置：todo.md L108,509（未勾）；ES-DSH-PLUGIN-NOTES（autoStart 压制中）
- 做法：quick tunnel 长跑稳定性测试（trycloudflare 24h）+ 失败自动重建；headless `autoStart` 依据 FEAT-11 的真实引擎 e2e 结果决策放开。
- 验收：tunnel 断链自动恢复演练；autoStart 决策记录进文档。

---

## E. 工程化与质量门禁（ENG）

### ENG-1 测试去真实 userData 依赖 → npm test 进 CI
- 位置：`.github/workflows/ci.yml`（注释自认排除 npm test 的原因）、`tests/config-paths.test.ts`、`tests/data-store.test.ts`
- 做法：为 DataStore/ConfigPaths 等提供 tmp 目录 fixture（统一 helpers），路径断言平台无关化；CI 矩阵 windows+ubuntu 跑 typecheck/lint/test/build。
- 验收：CI 全绿两平台；71 个测试文件在 CI 稳定通过（10 次连跑无 flake）。

### ENG-2 e2e 进门禁 + 配置补全
- 位置：`playwright.config.ts`（极简：无 webServer/projects/retries）、`package.json` release:verify 不含 e2e
- 做法：playwright 配置补 webServer（自动 build+launch）、失败重试、报告；`release:verify` 加入 test:e2e；e2e 依赖 ENG-1 的 build 产物链路理顺。
- 验收：本地一条命令完成 verify；CI 跑 e2e job。

### ENG-3 废弃 e2e 清理
- 位置：`e2e/07-orchestration.spec.ts`（32 用例导航到已不存在的 /orchestration 路由）
- 做法：删除或改写为 collaboration 场景（并入 ENG-4）。
- 验收：e2e 套件内无失效路由引用。

### ENG-4 协作与工作区 e2e 补齐
- 现状：CollaborationView/CollabDock（v0.7–0.8 最大投入）e2e 零覆盖；分屏拖拽、CreateSessionDialog opencode 分支、系统通知链路、远程实例挂载 UI 均无。
- 做法：新增 spec：协作页消息收发/任务流转/dock 拖放、分屏 split/even/reset、创建对话框三 CLI 分支、通知点击跨页定位（mock Notification）、设置页远程实例增删。
- 验收：上述各 ≥1 条 e2e；进 ENG-2 门禁。

### ENG-5 渲染层单测起步
- 现状：`src/renderer` 零测试；vitest 仅 include tests/**/*.test.ts 且 node 环境。
- 做法：vitest 增加 jsdom/happy-dom 环境与 renderer include；优先覆盖 stores（sessions/workspace/settings/collab 的状态机与 reconcile）、composables（useCollabDock/useWorkspacePaneActions/useOverlayStack）、纯函数（features/sessions/session-tree.ts、keyboard-reorder 的 renderer 侧与 tests 副本一致性——或直接引用同一实现消除副本）。
- 验收：核心 stores/composables 行覆盖 ≥60%；keyboard-reorder 双副本问题消除。

### ENG-6 真实引擎 e2e 闭环（agent-bus 线最大欠账）
- 位置：ES-DSH-PLUGIN-NOTES.md / ES-WORKBENCH-使用说明.md 反复强调"全部验证基于 mock 引擎"
- 做法：搭建真实 Claude CLI headless 冒烟套件（启动→attach→注入→输出采集→停止→journal 取证），纳入 nightly（不进 PR 门禁）；smoke 与 Playwright 16 项在真实引擎下复跑。
- 验收：nightly 连续 5 天全绿；autoStart 决策（FEAT-10）依据该结果出结论。

### ENG-7 remote web 行为测试
- 现状：仅 remote-web-template.test.ts 模板级测试。
- 做法：对 web/scripts（auth/sessions/terminal，共 ~2100 行原生 JS）抽出可测纯函数（状态映射、输入序列构造、stripAnsi）做单测；Playwright 对 web 页面（login→sessions→terminal 透传）起真服务跑一条 happy path。
- 验收：纯函数单测 + web happy path e2e 进门禁。

### ENG-8 remote 输出回放合帧统一
- 位置：`src/main/remote/socket.ts:57-64`（同步逐条 emit）
- 做法：与主进程 16ms 合帧（session-output）共用批处理出口；顺带服务 SEC-3。
- 验收：2000 行回放的网络包数量级下降（断言 batch 数）；Web 端渲染无回归。

---

## F. 仓库与文档卫生（HYG）

### HYG-1 根目录清理
- 项：6 张 collab-*.png 调试截图、`.tmp-es-smoke/`、`ez-normal-css-preview.html`、`ez-normal-css.skill`、`docs/chatgpt-demo/`（与产品零耦合）。
- 做法：删除或移入 `docs/archive/`；`.gitignore` 增补 `*.tmp-*/`、调试截图模式。
- 验收：根目录仅剩产品文件；git status 干净。

### HYG-2 文档与现状对齐
- 项：`docs/PROJECT_ARCHITECTURE.zh-CN.md:18`（仍写 0.5.0）、RELEASE_NOTES 停在 v0.4.8（补 0.7.x/0.8.0）、`ES-DSH-PLUGIN-NOTES.md` 前半段 GBK 乱码、根 todo.md 的远程总账与本文件合并收口。
- 做法：版本引用改自动生成或删除具体数字；补两版 release notes；乱码段重写；todo.md 保留远程专项、总账指向本文件。
- 验收：文档内无过时版本号；乱码清零；两文档交叉引用一致。

### HYG-3 未提交工作收口
- 项：`src/main/index.ts` 的 headless diff（+63 行）未提交且含 SEC-12 问题。
- 做法：先拆（STAB-10）再修（SEC-12）后按逻辑分 commit 提交；两个说明文档（ES-WORKBENCH/ES-DSH-PLUGIN-NOTES）决定去留并纳入跟踪或归档。
- 验收：git status 只剩预期外文件为零。

---

## 执行顺序（依赖链，非工作量排序）

1. **地基**：ENG-1（测试可进 CI）——后续所有重构的安全网。
2. **安全速修**：SEC-1、SEC-2（小 diff）→ SEC-3/4/8（remote 线一起动）。
3. **数据安全**：STAB-1（原子写统一），随后 STAB-7/8。
4. **体验主线**：STAB-2（keep-alive）+ STAB-5（双真源收敛，同动 sessions/workspace）→ UX-1/2/3/4（journal 出口 + 通知闭环，同动 notify 管道）→ UX-5/6/7（registry + i18n 清零）。
5. **拆分**：STAB-10/11（index.ts 与巨石组件，在门禁齐备后做）。
6. **抽象**：FEAT-1 → FEAT-2 → FEAT-3（Gemini）。
7. **Web 与平台**：UX-10 → FEAT-4；FEAT-5/6/7 平行推进。
8. **专项收口**：ENG-6（真实引擎 e2e）→ FEAT-10（autoStart 决策）；ENG-4/5/7 按模块顺带。
9. **卫生**：HYG-1/2/3 随时穿插，HYG-3 的拆/修在 STAB-10/SEC-12 完成后执行。
