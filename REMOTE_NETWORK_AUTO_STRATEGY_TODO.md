# REMOTE_NETWORK_AUTO_STRATEGY_TODO

## 1. 目标

为 EasySession 增加“远程网络自动策略层”，让应用在不同网络环境下自动选择合适的 Cloudflare 与 CLI 网络方案，避免用户手动修改 VPN、TUN、代理规则。

本方案要解决两个核心问题：

1. `Cloudflare Quick Tunnel` 在 `VPN + TUN` 环境下不稳定、连不上、530、超时。
2. `Codex / Claude / OpenCode` 在代理或 TUN 环境下出现：
   - `Stream disconnected before completion`
   - `os error 10060`
   - 请求超时
   - 流式中断

## 2. 范围

### 2.1 本次纳入
- Cloudflare Quick Tunnel 启动策略自动判定
- CLI 子进程代理策略自动判定
- 网络策略持久化
- 启动失败回退
- 上次成功策略记忆
- 设置页可视化
- 手工与自动化测试
- 与现有远程功能兼容

### 2.2 本次不纳入
- 自动修改用户 VPN 配置
- 自动改写 Clash Verge / Mihomo 配置文件
- 自动修改系统级代理设置
- 自动识别所有代理软件品牌的专有 API
- Web 端独立网络策略配置

## 3. 硬约束

- [x] 不破坏现有本机远程服务功能
- [x] 不破坏现有 Cloudflare Quick Tunnel 一键启动入口
- [x] 不破坏现有 Codex / Claude / OpenCode 会话创建与恢复逻辑
- [x] 不破坏现有 `app-settings.json` 旧字段语义
- [x] 不破坏现有 `remote-service`、`cloudflare-tunnel`、`sessions`、`projects` 持久化文件
- [x] 新增配置必须兼容老版本无此配置的情况
- [x] 迁移失败不得覆盖旧文件
- [x] 所有新增文件与代码必须使用 UTF-8
- [x] 在网络策略失效时，本地单机功能仍可正常使用
- [x] 在远程网络失败时，不能拖垮整个桌面端 UI

## 4. 方案总览

新增两套独立但可协同的网络策略：

1. Cloudflare Tunnel 策略
2. CLI 子进程策略

### 4.1 Cloudflare Tunnel 策略目标
自动决定：
- `transportMode`
  - `auto`
  - `http2`
  - `quic`
- `proxyMode`
  - `auto`
  - `off`
  - `inherit`
  - `custom`
- `customProxyUrl`
- 是否记忆上次成功策略
- 是否失败后自动回退重试

### 4.2 CLI 子进程策略目标
自动决定：
- `proxyMode`
  - `auto`
  - `off`
  - `inherit`
  - `custom`
- `customProxyUrl`
- 是否对 `codex / claude / opencode` 注入：
  - `HTTP_PROXY`
  - `HTTPS_PROXY`
  - `ALL_PROXY`
  - `NO_PROXY`

## 5. 目标数据模型

### 5.1 Cloudflare 网络策略配置

建议新增类型：

```ts
type TunnelTransportMode = 'auto' | 'http2' | 'quic'
type TunnelProxyMode = 'auto' | 'off' | 'inherit' | 'custom'

interface CloudflareNetworkStrategyConfig {
  transportMode: TunnelTransportMode
  proxyMode: TunnelProxyMode
  customProxyUrl: string | null
  rememberLastSuccess: boolean
  autoFallback: boolean
}
```

### 5.2 Cloudflare 最近成功策略状态

```ts
interface CloudflareNetworkStrategyRuntime {
  lastSuccessfulTransport: 'http2' | 'quic' | null
  lastSuccessfulProxyMode: 'off' | 'inherit' | 'custom' | null
  lastSuccessfulProxyUrl: string | null
  lastFailureReason: string | null
}
```

### 5.3 CLI 网络策略配置

```ts
type CliProxyMode = 'auto' | 'off' | 'inherit' | 'custom'

interface CliNetworkStrategyConfig {
  proxyMode: CliProxyMode
  customProxyUrl: string | null
  enableNoProxyLocalhost: boolean
}
```

### 5.4 统一网络设置

```ts
interface RemoteNetworkSettingsRecord {
  cloudflare: CloudflareNetworkStrategyConfig
  cli: CliNetworkStrategyConfig
}
```

## 6. 持久化设计

### 6.1 新增文件
建议新增独立配置文件，不污染现有通用设置：

- `remote-network-settings.json`

如有必要，再增加运行态文件：

- `remote-network-runtime.json`

### 6.2 持久化原则
- [x] 新文件损坏时不影响旧功能
- [x] 缺字段自动补默认值
- [x] 顶层结构异常时回退默认值
- [x] 自动写回规范化结构
- [x] 保留 `.bak` 恢复机制
- [x] 不把复杂网络策略硬塞进 `app-settings.json`

### 6.3 默认值
建议默认：

```ts
cloudflare.transportMode = 'auto'
cloudflare.proxyMode = 'auto'
cloudflare.customProxyUrl = null
cloudflare.rememberLastSuccess = true
cloudflare.autoFallback = true

cli.proxyMode = 'auto'
cli.customProxyUrl = null
cli.enableNoProxyLocalhost = true
```

## 7. Cloudflare 自动策略实现

### 7.1 改造点
文件：
- `src/main/services/cloudflare-tunnel-manager.ts`

### 7.2 新增能力
- [x] 支持 `--protocol http2`
- [x] 支持 `--protocol quic`
- [x] 支持自动策略决策
- [x] 支持自定义代理环境注入
- [x] 支持失败重试
- [x] 支持记忆上次成功策略
- [x] 支持返回“当前生效策略”到 UI

### 7.3 启动决策树

#### Auto 模式推荐顺序
1. 先确保本地远程服务可用：
   - `http://127.0.0.1:${port}/api/health`
2. 第一次尝试：
   - `protocol = http2`
   - `proxyMode = inherit` 或 `auto` 推导结果
3. 若失败：
   - `protocol = http2`
   - `proxyMode = custom`（若用户配置了）
4. 若失败：
   - `protocol = quic`
   - `proxyMode = inherit/custom`
5. 若成功：
   - 记录本次成功策略
6. 下次优先复用上次成功策略

#### 判定原则
- [ ] 不依赖 VPN 品牌名
- [ ] 不强依赖 Clash Verge
- [ ] 以“是否成功建立 Quick Tunnel”为最终标准
- [ ] 避免一次失败就直接判死

### 7.4 Cloudflare 环境变量策略
- [x] `off`：不注入任何代理环境
- [x] `inherit`：继承父进程环境
- [x] `custom`：显式注入代理变量
- [x] `auto`：先继承，再必要时回退到 custom 或 off

建议支持：

```text
HTTP_PROXY
HTTPS_PROXY
ALL_PROXY
NO_PROXY
```

### 7.5 启动命令策略
当前：

```bash
cloudflared tunnel --url http://127.0.0.1:18765
```

需要改成可组合：

```bash
cloudflared tunnel --protocol http2 --url http://127.0.0.1:18765
cloudflared tunnel --protocol quic --url http://127.0.0.1:18765
```

## 8. CLI 自动策略实现

### 8.1 改造点
文件：
- `src/main/services/cli-manager.ts`

### 8.2 新增能力
- [x] 为子进程构建“按策略注入”的网络环境
- [x] 区分 `Codex / Claude / OpenCode`
- [x] 自动给 localhost 注入 `NO_PROXY`
- [x] 支持继承模式与自定义模式
- [x] 支持调试输出“当前 CLI 生效代理策略”

### 8.3 代理变量注入逻辑

#### `off`
- 不写入代理变量
- 可显式删除已有代理变量

#### `inherit`
- 继承当前 `process.env`

#### `custom`
显式注入：

```text
HTTP_PROXY
HTTPS_PROXY
ALL_PROXY
NO_PROXY=127.0.0.1,localhost,::1
```

#### `auto`
优先级建议：
1. 若设置里已有 `customProxyUrl`，优先使用 custom
2. 若系统环境已有代理变量，使用 inherit
3. 若检测到常见本地代理端口可用，可选择自动生成：
   - `http://127.0.0.1:7897`
   - `socks5://127.0.0.1:7898`
4. 若都没有，则 off

### 8.4 兼容性要求
- [x] 不影响 Claude Git Bash 路径注入
- [x] 不影响现有 TERM、FORCE_COLOR 等环境变量
- [x] 不影响本地非联网命令执行
- [x] 不影响恢复已有会话

## 9. 设置页改造

### 9.1 改造点
文件：
- `src/renderer/src/views/SettingsView.vue`

### 9.2 新增设置分组
新增一个分组：

#### 远程网络策略
包含两个卡片：

##### Cloudflare Quick Tunnel 网络
- 传输协议
  - 自动
  - HTTP/2
  - QUIC
- 代理模式
  - 自动
  - 不使用代理
  - 继承当前环境
  - 自定义代理
- 自定义代理地址
- 自动失败回退
- 记住上次成功策略

##### CLI 网络
- 代理模式
  - 自动
  - 不使用代理
  - 继承当前环境
  - 自定义代理
- 自定义代理地址
- 对 localhost 自动设置 NO_PROXY

### 9.3 设置页状态展示
- [x] 当前 Cloudflare 生效协议
- [x] 当前 Cloudflare 生效代理模式
- [x] 当前 CLI 生效代理模式
- [x] 最近失败原因
- [x] 上次成功策略
- [x] 是否处于自动回退结果

## 10. 文案与术语统一

### 10.1 术语
统一使用：
- `自动`
- `HTTP/2`
- `QUIC`
- `不使用代理`
- `继承当前环境`
- `自定义代理`
- `上次成功策略`
- `自动回退`

### 10.2 文案文件
- [x] `src/renderer/src/i18n/locales/zh-CN.ts`
- [x] `src/renderer/src/i18n/locales/en.ts`

## 11. 错误处理与提示

### 11.1 Cloudflare 错误细分
需要把当前模糊错误拆清楚：
- [x] 协议不兼容
- [x] 代理不可达
- [x] Tunnel 建立超时
- [x] 公网地址获取失败
- [x] 本地远程服务不可达
- [x] Cloudflare API 不可达

### 11.2 CLI 错误细分
需要把：
- `os error 10060`
- `Stream disconnected before completion`
- 上游连接超时
- 代理不可达

尽量转成可理解提示：
- [x] 代理未生效
- [x] 代理可达但上游超时
- [x] 当前网络策略不适合 Codex
- [x] 建议切换为自动/自定义代理

## 12. 自动探测能力

### 12.1 可以做的探测
- [x] 本地远程服务是否可用
- [x] 系统环境是否存在 `HTTP_PROXY / HTTPS_PROXY / ALL_PROXY`
- [x] 常见本地代理端口是否可连：
  - `127.0.0.1:7897`
  - `127.0.0.1:7898`
- [x] Cloudflare Tunnel 是否在给定协议下启动成功
- [x] 上次成功策略是否还能复用

### 12.2 不做的探测
- [ ] 不做 VPN 厂商品牌识别作为主判断
- [ ] 不直接操作 Clash Verge 配置
- [ ] 不直接读取/修改用户 VPN 规则

## 13. 自动回退策略

### 13.1 Cloudflare 回退链
- [x] `auto -> http2 + inherit`
- [x] 失败后 `http2 + custom`
- [x] 再失败 `quic + inherit/custom`
- [x] 最终写入最近失败原因

### 13.2 CLI 回退链
- [x] `auto -> inherit`
- [ ] 失败后 `custom`
- [ ] 若仍失败，提示用户当前网络环境不兼容

## 14. 日志与调试

### 14.1 必须新增日志
#### Cloudflare
- [x] 启动策略选择结果
- [x] 使用的协议
- [x] 使用的代理模式
- [x] 是否命中上次成功策略
- [x] 回退次数
- [x] 最终失败原因

#### CLI
- [x] 子进程代理模式
- [x] 是否注入了代理变量
- [x] 注入了哪些键名
- [x] 是否设置了 `NO_PROXY`

### 14.2 注意
- [x] 日志不得泄露完整代理账号密码
- [x] 日志不得完整打印 token
- [x] 代理 URL 如包含认证信息，必须脱敏

## 15. 兼容性与升级

### 15.1 老版本兼容
- [x] 没有 `remote-network-settings.json` 时自动补默认值
- [x] 老版本启动后无新文件也能正常运行
- [x] 升级后不要求用户手工迁移

### 15.2 持久化容错
- [x] 新文件损坏时回退默认值
- [x] `.bak` 恢复可用
- [x] 恢复失败不影响主功能
- [x] 不得拖垮现有 `app-settings.json` 读取

### 15.3 回滚兼容
- [ ] 即使新版本写入了网络策略文件，回滚旧版本也不应影响基本启动
- [ ] 不依赖旧版本必须认识新文件

## 16. 自动化测试

### 16.1 Cloudflare 策略测试
- [x] `auto` 模式优先 `http2`
- [x] `http2` 失败后能回退
- [x] `custom proxy` 会正确注入环境
- [x] 成功后会记忆策略
- [x] 下次优先复用上次成功策略
- [x] 本地远程服务不可用时不会盲目启动 Tunnel

### 16.2 CLI 策略测试
- [x] `inherit` 会继承环境变量
- [x] `custom` 会写入代理变量
- [x] `off` 会移除代理变量
- [x] 会自动设置 `NO_PROXY`
- [x] 不影响 Claude Git Bash 配置
- [x] 不影响本地普通会话

### 16.3 持久化兼容测试
- [x] 缺字段配置可自动补齐
- [x] 顶层结构异常可回退默认值
- [x] `.bak` 恢复可用
- [ ] 损坏时不覆盖旧文件

## 17. 手工验收

### 17.1 场景一：TUN 开启 + Cloudflare
- [ ] Cloudflare Quick Tunnel 能稳定拿到公网地址
- [ ] 远程桌面端可连接
- [ ] 手机 Web 可连接
- [ ] 多次重启 Tunnel 仍稳定

### 17.2 场景二：TUN 开启 + Codex
- [ ] Codex 能正常创建会话
- [ ] Codex 流式输出不中断
- [ ] 不再出现 `os error 10060`
- [ ] 不再出现 `Stream disconnected before completion`

### 17.3 场景三：Cloudflare 与 Codex 同时使用
- [ ] 开启 Tunnel 后 Codex 仍可用
- [ ] 开启 Codex 后 Tunnel 仍可用
- [ ] 两者不会互相拖死

### 17.4 场景四：无代理环境
- [ ] 关闭代理后不会白屏
- [ ] 错误提示明确
- [ ] 本地功能仍可使用

## 18. 实施顺序

### Phase A：数据结构与持久化
- [x] 新增网络策略类型定义
- [x] 新增 `remote-network-settings.json`
- [x] 新增 runtime 记录
- [x] 完成默认值与兼容读取

### Phase B：Cloudflare 策略执行器
- [x] 支持 protocol 参数
- [x] 支持 proxyMode
- [x] 支持启动回退链
- [x] 支持记忆成功策略
- [x] 支持状态返回

### Phase C：CLI 子进程代理注入
- [x] 扩展 `CliManager.buildSpawnEnv`
- [x] 支持 `auto/off/inherit/custom`
- [x] 给 Codex/Claude/OpenCode 注入代理变量
- [x] 保持旧逻辑兼容

### Phase D：设置页
- [x] 新增“远程网络策略”分组
- [x] 新增 Cloudflare 卡片
- [x] 新增 CLI 卡片
- [x] 状态展示与错误提示

### Phase E：日志与调试
- [x] Cloudflare 日志
- [x] CLI 日志
- [x] 错误提示优化

### Phase F：测试与验收
- [ ] 自动化测试补齐
- [ ] 手工验收清单跑通
- [ ] TODO 回填

## 19. 当前阶段最重要的三件事

- [x] 先把 `CloudflareTunnelManager` 改造成可选 `http2/quic + proxyMode`
- [x] 再把 `CliManager` 改造成 CLI 子进程可独立代理注入
- [x] 最后做设置页与回退策略展示

## 20. 一句话定义

这个 TODO 的核心不是“教用户怎么调 VPN”，而是：

**让 EasySession 自己学会在复杂网络环境里，自动选择 Cloudflare 与 Codex 的最优联网策略。**
