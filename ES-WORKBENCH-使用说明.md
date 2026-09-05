# ES 工作台（EasySession × DSH 插件包）使用说明

## 交付物
| 位置 | 内容 |
|---|---|
| D:\deepseek-harness\packages\es\es-bridge | Host 桥：引擎拉起/守护 + /es-bridge/* API（REST + SSE） |
| D:\deepseek-harness\packages\client\es-workbench | 工作台 UI（会话树 + xterm 终端标签页，overlay） |
| C:\Users\15479\.dsh\profiles\web\cordis.patch.yml | 两行插件组合（已热生效，无需重启） |
| D:\EasySession\src\main\index.ts | EasySession headless 补丁（--headless + 控制端口 quit） |

## 状态（2026-09-05 验证）
- es-bridge 已在运行中宿主生效：GET http://127.0.0.1:3080/es-bridge/state → 200
- client 工作台行已进入 __DSH_BOOT__ 图（48 项中含 dsh-client-es-workbench）
- GUI 只需**刷新页面（Ctrl+F5）**即可看到侧栏底部 “🖥 ES 工作台” 入口

## 使用步骤
1. 刷新 DSH Web GUI → 侧栏底部点击 “🖥 ES 工作台”。
2. 引擎当前 offline（autoStart 故意关闭，见下）。点“启动引擎”即可。
   - 若引擎是旧版安装包（无 headless 补丁），会拉起一个桌面窗口而不是
     headless 引擎 —— 请先重打包 EasySession（见“重建 ES”）。
3. 引擎在线后：会话树列出 ES userData 里的全部会话（claude/codex/opencode/终端），
   点击行打开终端标签；行内 ▶/⏸/↻/✕ 启停/重启/销毁；顶部“+ 新建会话”可建
   终端/CLI 会话（需项目路径）。
4. 用完点“关闭 ✕”退出工作台；“停止引擎”优雅关停 headless 进程。

## 重建 ES（让引擎真正 headless）
headless 补丁只在源码里；release\win-unpacked 是旧构建。请在 D:\EasySession 执行：
- 打包：`npm run build`（或 `npm run build:win` 出安装包）——按仓库规范由你本人执行
- 完成后引擎 exe 即支持 `--headless` + 控制端口（默认 19765）。

## 开启引擎自动拉起（可选）
headless 版就绪后把 profile 补丁里 es-bridge 的 config 改为 `autoStart: true`：
```yaml
- insert:
    - id: es-bridge
      name: '@deepseek-ai/dsh-es-bridge'
      config:
        autoStart: true
        engineExe: 'D:\EasySession\release\win-unpacked\EasySession.exe'
```
补丁 live reload，保存即生效。

## 注意事项
- headless 引擎与桌面版 EasySession 同一 userData 互斥（single instance lock）：
  引擎运行时不要同时开桌面版；桌面版在跑且 remote 已开时，桥会 attach 它而非再拉起。
- 引擎 remote 配置沿用 %APPDATA%\easysession（本机已 enabled + 非 passthrough-only，
  token 文件自动读取；spawn 时用临时 token 注入，不改用户配置文件）。
- 停止引擎 = 控制端口 `quit`（优雅 flush 后退出），8 秒超时兜底 taskkill /T /F。

## 回归测试
- Host 桥：D:\EasySession\.tmp-es-smoke\smoke.mts（mock 引擎 15/15）
- 终端交互/输入/resize 全链路：GUI 验证（真实引擎重建后进行）
## v3 操作速查（对齐 ES 桌面）
- 打开会话：树/顶部车道点击 → 当前窗格开标签；右键 → “放到右侧新窗格”
- 分窗：窗格头 ◫ 拆分当前标签；拖分割条调宽；≣ 均分；× 关闭窗格
- 标签：点击切换；右键 → 关闭/关闭其他/关闭右侧/移动到左(右)窗格
- 摆位：侧栏 ⇄ 顶部（顶部按项目分车道、横向滚动）
- 终端工具栏：⇓ 自动滚动开关、⧉ 复制全部、⌫ 清屏（引擎 API 历史窗口上限 2000 行）
- 引擎：顶栏 启动/停止/重启；状态胶囊 attached/spawned/offline
- 暂不支持（引擎 remote API 缺失）：重命名/会话设置/图标/拖拽排序（菜单中灰置并注明）