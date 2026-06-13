// es --help 文本：刻意写成「给 agent 看的文档」——这是 agent 自学如何与其他会话协作的主入口。

export const ES_HELP_TEXT = `es —— EasySession 会话间通信工具。让你（一个运行在终端里的 agent）与同一台机器上其他会话里的 agent 互发消息、派发任务、回传结果。

何时使用：
  · 需要别的 agent 帮忙（让它在它的项目/上下文里干活）→ es task create
  · 想告诉另一个会话一件事，不要求它停下手头工作 → es send
  · 在等别人给你派活 / 回消息 → es recv --wait
  · 想看看别的会话现在在干嘛 → es peek

基础：
  es whoami                      查看我自己的会话名与未读数
  es sessions                    列出所有运行中的会话（你的潜在协作对象）
  es mode                        查看当前会话的协作模式

便条（无状态，适合短通知）：
  es send <会话名|id> "<消息>"    给某会话发一条消息
  es recv [--wait] [--from <名>] [--kind message|event] [--timeout <秒>]
                                 取我的未读（消息与任务事件统一从这里收）；
                                 --wait 阻塞直到有新内容或超时；--kind 只收某一类
  es peek <会话名|id> [--lines N] 只读地查看某会话最近输出，不打扰对方

任务（带状态机，适合长事务；派发方与接单方都不会阻塞，靠通知驱动）：
  es task create <会话名|id> "<任务描述>"   派发任务，立即返回任务 id
  es task accept <id> / reject <id> [原因]  接单 / 拒单（接单方）
  es task start <id>                        开始处理（接单方）
  es task progress <id> "<进展>"            汇报进度（不打扰派发方，兼心跳）
  es task block <id> "<问题>"               卡住了，向派发方提问
  es task unblock <id> "<答复>"             派发方答复阻塞
  es task done <id> --result "<结果>"       交付（接单方；UI 派发的任务会进入待确认）
  es task confirm <id>                      派发方确认完成
  es task cancel <id> [原因]                派发方取消任务
  es task fail <id> "<原因>"                置失败
  es task list                              我相关的任务板
  es task show <id>                         单个任务的完整历史

寻址：目标用会话名（支持唯一前缀匹配）或 sessionId。歧义时会列出候选。
通知：有新消息/任务事件时，若当前会话允许注入提醒，你会收到一行 [easysession] 📬 提示（只报数量，不含正文）——
      运行 es recv 取回正文。消息与任务状态变化（接单/完成/失败等）统一进 recv 收件箱，
      所以 es recv --wait 既能等消息，也能等任务结果（完成事件附带结果预览）。
读取：所有读类命令支持 --json 输出，便于程序化解析。
terminal 兼容：Terminal 类型默认只读，不会被 EasySession 注入提醒；如果其中运行 Gemini/Qwen/未知 agent，
      用户可在协作面板开启“Terminal 仅提醒”或“Terminal 完整注入”。无论是否注入，只要 PATH 中有 es，
      你都可以主动运行 es recv / es task show 参与协作。

典型协作（你作为派发方）：
  1) es sessions                                 # 看有哪些 agent
  2) es task create 实现者 "重构 auth 模块"      # 派活，立即返回 t-xxxx
  3) es recv --wait                               # 阻塞等接单/完成事件（含结果预览）
  4) es task show t-xxxx                          # 看完整结果

典型协作（你作为接单方，收到 [easysession] 📋 新任务 通知后）：
  1) es task show t-xxxx                          # 看任务详情
  2) es task accept t-xxxx                        # 接单
  3) es task start t-xxxx                         # 开始
  4) （干活，可 es task progress 汇报）
  5) es task done t-xxxx --result "已完成，见 src/..."
     如果任务进入 review，等待派发方 confirm；若还需补充，继续按通知处理。
`
