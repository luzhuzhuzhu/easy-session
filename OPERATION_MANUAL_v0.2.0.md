# EasySession 0.2.0 操作手册

更新时间：2026-03-08  
适用版本：`0.2.0`  
适用系统：Windows

---

## 1. 手册目标

这份手册用于指导你完成以下操作：

1. 安装并启动 `EasySession 0.2.0`
2. 配置本机远程服务
3. 一键开启 `Cloudflare Quick Tunnel`
4. 在另一台电脑上挂载远程实例
5. 在手机浏览器中通过 Web 应急接入
6. 排查最常见的连接问题

当前版本的产品定位：

- `桌面端` 是电脑重度使用主路径
- `Web 端` 保留为移动端正式入口和浏览器应急入口
- 远程能力默认采用 `全透传` 模式

---

## 2. 安装包位置

当前已构建的 Windows 安装包：

- `release/EasySession Setup 0.2.0.exe`

如果你需要解包后的绿色目录：

- `release/win-unpacked/`

安装方式：

1. 双击 `EasySession Setup 0.2.0.exe`
2. 按安装向导完成安装
3. 启动 `EasySession`

---

## 3. 使用前先理解三条主线

### 3.1 本机远程服务

这是当前机器暴露远程能力的本地服务，供以下两类入口使用：

- 手机 Web 接入
- 另一台桌面客户端挂载

### 3.2 Cloudflare Quick Tunnel

这是把本机远程服务临时暴露到公网的通道。

它不会改协议，只是把本地端口转发出去。  
当前项目的网络形态仍然是：

- `HTTP REST`
- `Socket.IO`

### 3.3 远程实例

这是“另一台桌面客户端”保存的连接配置。  
它的核心信息只有两项：

- `Base URL`
- `Token`

---

## 4. 首次启动建议

第一次使用建议先完成下面 4 件事：

1. 安装并打开 `EasySession`
2. 进入“设置”页面
3. 确认本机 CLI 路径能正常工作
4. 再开始配置远程能力

如果你只是本机使用，不开远程，也不会影响现有本地使用流程。

---

## 5. 本机远程服务配置

打开路径：

1. 启动 `EasySession`
2. 进入“设置”
3. 找到“本机远程服务”面板

### 5.1 面板作用

这个面板用于把当前机器变成可远程接入的主机。

你可以配置：

- 是否启用
- `Host`
- `Port`
- 是否保持全透传
- `Token` 模式

### 5.2 推荐配置

如果你准备使用 Cloudflare Quick Tunnel，推荐直接这样配：

- `启用本机远程服务`：开启
- `监听 Host`：`127.0.0.1`
- `监听端口`：`18765`
- `保持全透传模式`：开启

原因：

- `cloudflared` 和 `EasySession` 跑在同一台机器时，`127.0.0.1` 最安全
- 不需要把服务直接暴露给整个局域网

### 5.3 什么时候用 `0.0.0.0`

只有在以下场景才建议使用：

- 你要让局域网里的手机或另一台电脑直接通过局域网 IP 访问
- 你明确知道当前网络环境可控

如果你主要走 Cloudflare，不建议默认使用 `0.0.0.0`

### 5.4 Token 模式说明

当前本机远程服务支持 3 种来源：

1. `环境变量`
2. `自定义 token`
3. `默认 token 文件 / 自动随机生成`

优先级从高到低：

1. `EASYSESSION_REMOTE_TOKEN`
2. 设置页里的自定义 token
3. `remote-token.txt`
4. 不存在时自动随机生成

### 5.5 推荐 Token 策略

个人自用推荐：

- 平时使用“默认 token”
- 需要稳定可记忆的访问令牌时再改成“自定义 token”

建议：

- token 长度至少 `64` 位
- 不要使用可猜测的短字符串

### 5.6 保存并应用

设置完成后：

1. 点击“保存并应用”
2. 确认面板里出现：
   - 服务运行中
   - 当前访问地址
   - token 来源
   - token 指纹

如果当前有环境变量覆盖，界面会明确提示哪些字段被覆盖。

---

## 6. 一键开启 Cloudflare Quick Tunnel

打开路径：

1. 进入“设置”
2. 找到“Cloudflare Quick Tunnel”面板

### 6.1 开启前提

必须先满足下面两个条件：

1. 上方“本机远程服务”已启用并运行
2. 机器上已安装 `cloudflared`

如果未安装 `cloudflared`，请先安装。

### 6.2 安装 cloudflared

可以优先尝试：

```powershell
winget install --id Cloudflare.cloudflared --source winget
```

如果 `winget` 不可用或失败，请改用 Cloudflare 官方安装方式下载 Windows 可执行文件。

### 6.3 路径配置方式

Cloudflare 面板支持两种方式：

1. 留空  
   作用：自动从系统 `PATH` 检测 `cloudflared`

2. 手动填写完整路径  
   示例：

```text
C:\Tools\cloudflared\cloudflared.exe
```

如果系统里没加 `PATH`，就用第二种。

### 6.4 一键开启步骤

1. 确认本机远程服务正在运行
2. 在 Cloudflare 面板中确认 `cloudflared` 路径可用
3. 点击“一键开启 Quick Tunnel”
4. 等待面板显示：
   - Tunnel 运行中
   - 当前公网地址

成功后会看到类似地址：

```text
https://xxxx.trycloudflare.com
```

### 6.5 这条公网地址有什么用

这个地址可以同时给两种入口使用：

1. 手机 Web
2. 另一台桌面客户端

也就是说：

- `Web 端` 和 `桌面端`
- 共用同一个 Cloudflare 公网地址

### 6.6 一键停止

如果不再需要公网暴露：

1. 回到 Cloudflare 面板
2. 点击“停止 Tunnel”

这不会删除本机远程服务配置，只会停止 Cloudflare 转发。

### 6.7 Quick Tunnel 的特点

优点：

- 无域名
- 快速
- 自用方便
- 不需要改现有协议

限制：

- 地址通常不是永久固定的
- 每次重新开启可能变化
- 更适合个人使用和 MVP 阶段

---

## 7. 电脑端挂载远程实例

这是电脑端的推荐主路径。

### 7.1 使用场景

适合：

- 电脑重度操作
- 多项目、多会话管理
- 长时间远程使用

不建议电脑长期依赖手机 Web 页面。

### 7.2 添加远程实例

在“控制端电脑”上操作：

1. 打开 `EasySession`
2. 进入“设置”
3. 找到“远程实例”面板
4. 点击“添加实例”

填写：

- `实例名称`
- `Base URL`
- `Token`

例如：

- `Base URL`：`https://xxxx.trycloudflare.com`
- `Token`：本机远程服务当前 token

### 7.3 测试连通性

填写后先点击“测试连通性”。

成功时说明：

- 远程服务可访问
- token 正确
- 能力探测正常

### 7.4 保存后怎么使用

保存成功后：

1. 进入 `Sessions`
2. 左侧树会出现：
   - `Instance -> Project -> Session`
3. 打开需要的远程会话

### 7.5 当前桌面端远程支持什么

当前支持：

- 多个远程实例同时挂载
- 每个远程实例下多个项目
- 每个项目下多个会话
- 输出查看
- 输入透传
- 终端 resize
- 状态同步

### 7.6 当前桌面端远程不做什么

当前默认是 `全透传` 路线，不承担完整生命周期控制。

也就是说，远程实例下默认不提供：

- 新建远程 CLI 会话
- 启动
- 暂停
- 重启
- 删除

桌面端当前的远程主用途是：

- 连接已有运行中的会话

---

## 8. 手机 Web 使用方法

这是移动端正式入口，也是浏览器应急入口。

### 8.1 打开方式

在手机浏览器访问：

```text
https://xxxx.trycloudflare.com/login
```

或者局域网直连时访问：

```text
http://你的主机IP:18765/login
```

### 8.2 登录填写

填写：

- `Base URL`
- `Token`

如果是 Cloudflare：

- `Base URL` 填 `https://xxxx.trycloudflare.com`

### 8.3 登录后会进入哪里

登录后进入：

- `/sessions`

页面定位是：

- 移动端正式入口
- 浏览器应急入口

### 8.4 当前 Web 能做什么

当前支持：

- 查看已有会话列表
- 连接已有会话
- 查看历史输出
- 接收实时输出
- 输入透传
- 基础 resize

### 8.5 当前 Web 的定位边界

Web 端不是电脑重度工作的推荐主路径。  
如果你需要长时间高频操作，建议改用桌面端挂载远程实例。

---

## 9. 三种典型使用方式

### 9.1 本机单机使用

最简单：

1. 安装
2. 打开 `EasySession`
3. 直接本地使用

此时不需要开启远程服务。

### 9.2 手机远程应急

步骤：

1. 在被控电脑开启“本机远程服务”
2. 一键开启 Cloudflare Quick Tunnel
3. 复制公网地址
4. 手机打开 `/login`
5. 输入 `Base URL + Token`
6. 进入 `/sessions` 使用

### 9.3 另一台电脑远程挂载

步骤：

1. 在被控电脑开启“本机远程服务”
2. 一键开启 Cloudflare Quick Tunnel
3. 复制公网地址
4. 在控制端电脑的 `EasySession` 中添加远程实例
5. 测试连通性
6. 保存
7. 进入 `Sessions` 打开远程项目和会话

---

## 10. 推荐配置模板

### 10.1 个人自用，主要走 Cloudflare

被控端设置推荐：

- 本机远程服务：开启
- Host：`127.0.0.1`
- Port：`18765`
- 全透传：开启
- Token 模式：默认 token 或自定义 token
- Cloudflare Quick Tunnel：开启

### 10.2 局域网直连

被控端设置推荐：

- 本机远程服务：开启
- Host：`0.0.0.0`
- Port：`18765`
- Cloudflare：可不开

控制端使用：

- `http://局域网IP:18765`

### 10.3 只自己本机调试

被控端设置推荐：

- 本机远程服务：可不开

如果只是测试远程入口：

- Host：`127.0.0.1`
- Port：`18765`
- 本机浏览器访问 `http://127.0.0.1:18765/login`

---

## 11. 常见问题排查

### 11.1 看不到 Cloudflare 公网地址

先检查：

1. 本机远程服务是否已运行
2. `cloudflared` 是否已安装
3. Cloudflare 面板里的“最近错误”是什么
4. `cloudflared` 路径是否填对

### 11.2 提示未检测到 cloudflared

处理顺序：

1. 确认机器已安装 `cloudflared`
2. 若已安装但未加入 `PATH`，填写完整路径
3. 保存路径配置后再点“一键开启”

### 11.3 手机 Web 打不开

先检查：

1. Cloudflare Tunnel 是否仍在运行
2. 公网地址是否已变化
3. token 是否正确
4. 是否访问了 `/login`

### 11.4 登录成功但会话为空

先检查：

1. 当前主机是否真的已有运行中的会话
2. 当前是否仍是全透传模式
3. 是否打开了错误的远程实例或错误的主机

### 11.5 桌面端测试连通性失败

优先检查：

1. `Base URL` 是否正确
2. `Token` 是否正确
3. 对端本机远程服务是否已运行
4. Cloudflare Tunnel 是否还在线

### 11.6 修改设置后效果和界面不一致

有一种常见情况：

- 环境变量正在覆盖设置页配置

如果设置页里看到“环境变量覆盖提示”，说明：

- 你保存的本地配置会保留
- 但当前实际运行优先使用环境变量

---

## 12. 安全建议

1. 不要把 token 发到公共群聊
2. 不要使用过短的自定义 token
3. 不需要公网访问时，及时停止 Cloudflare Tunnel
4. 仅在需要局域网直连时才使用 `0.0.0.0`
5. 个人自用优先选择：
   - `127.0.0.1`
   - Cloudflare Quick Tunnel

---

## 13. 当前版本你应该怎么选

如果你想快速可用，建议直接按下面选：

### 13.1 电脑长期使用

选：

- `桌面端挂载远程实例`

### 13.2 手机临时查看和操作

选：

- `Web 端`

### 13.3 无域名、快速跨网

选：

- `Cloudflare Quick Tunnel`

---

## 14. 一条最短上手路径

如果你只想最快跑通一次，照下面做：

1. 安装并打开 `EasySession 0.2.0`
2. 设置 -> 本机远程服务
3. 开启服务，`Host=127.0.0.1`，`Port=18765`
4. 点击“保存并应用”
5. 设置 -> Cloudflare Quick Tunnel
6. 点击“一键开启 Quick Tunnel”
7. 复制公网地址
8. 手机打开：

```text
https://xxxx.trycloudflare.com/login
```

9. 输入同一个 `Base URL + Token`
10. 进入 `/sessions` 使用

如果是另一台电脑：

1. 打开控制端 `EasySession`
2. 设置 -> 远程实例
3. 添加：
   - `Base URL`
   - `Token`
4. 测试连通性
5. 保存
6. 进入 `Sessions` 打开远程会话

---

## 15. 当前版本已知边界

1. Cloudflare Quick Tunnel 更适合个人自用和 MVP 阶段
2. Quick Tunnel 地址不是稳定域名
3. Web 端当前定位仍然是移动端 / 浏览器应急入口
4. 桌面端远程默认是全透传，不负责完整远程生命周期管理

---

## 16. 相关文件

如果后续要继续维护，当前主要对应以下功能：

- 本机远程服务：`src/main/services/remote-service-manager.ts`
- 本机远程服务设置：`src/main/services/remote-service-settings-manager.ts`
- Cloudflare Quick Tunnel：`src/main/services/cloudflare-tunnel-manager.ts`
- 桌面设置页：`src/renderer/src/views/SettingsView.vue`
- Web 远程页：`src/main/remote/web.ts`

