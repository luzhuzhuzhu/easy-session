// es 使用 Skill：写入用户级 ~/.claude/skills/，让每个 Claude Code 会话自动发现「如何与其他会话协作」。
// 幂等安装：内容带版本标记，变化时覆盖，否则跳过。

import { homedir } from 'os'
import { join } from 'path'
import { promises as fs } from 'fs'

const SKILL_VERSION = '1'

const SKILL_MD = `---
name: es-session-collab
description: Use when you need to coordinate with other agents/sessions running in EasySession — to delegate work, send a message, wait for a reply, or check what another session is doing. Triggers on intents like "ask the other agent", "have another session do X", "wait for results from", "hand this off".
---

# 与其他 EasySession 会话协作

你运行在 EasySession 管理的一个终端会话里。同一台机器上可能还有别的会话（其他 agent）。
命令行工具 \`es\` 是你与它们通信的通道：发消息、派任务、收结果、看状态。

## 先确认环境

\`\`\`
es whoami      # 我是谁
es sessions    # 有哪些可协作的会话
\`\`\`

若 \`es\` 不存在或报「bus 未启用」，说明当前不在 EasySession 环境，放弃使用本技能。

## 选择动作

- **要别人帮忙干一件需要时间的事** → 用任务（不阻塞，靠通知驱动）：
  \`\`\`
  es task create <会话名> "<清晰的任务描述，含验收标准>"
  \`\`\`
  立即返回 \`t-xxxx\`。你不用一直等——对方接单、阻塞提问、完成时，你都会在终端收到
  \`[easysession]\` 开头的通知（表现为一条用户消息）。收到完成通知后：
  \`\`\`
  es task show t-xxxx     # 查看结果
  \`\`\`

- **只是通知一件事，不要求对方停下** → 便条：
  \`\`\`
  es send <会话名> "<消息>"
  \`\`\`

- **你在等别人给你派活或回消息** → 阻塞等待（默认 ~100s 超时，超时 exit 2，可重跑继续等）：
  \`\`\`
  es recv --wait
  \`\`\`

- **想知道某会话现在在做什么，又不想打扰** → 只读查看它的屏幕：
  \`\`\`
  es peek <会话名> --lines 60
  \`\`\`

## 收到 \`[easysession]\` 通知时

那是别的会话给你的消息或任务唤醒。按提示处理：
- \`📨 …消息\` → \`es recv\` 读取
- \`📋 新任务 t-xxxx …\` → \`es task show t-xxxx\` 看详情，再 \`es task accept t-xxxx\` / \`reject\`
- 接单后：\`es task start t-xxxx\` → 干活（可 \`es task progress t-xxxx "进展"\`）→
  \`es task done t-xxxx --result "…"\`；卡住就 \`es task block t-xxxx "问题"\`。

## 原则

- 寻址用会话名（支持唯一前缀），歧义时 \`es\` 会列候选。
- 派任务时把验收标准写清楚，对方在另一个上下文里看不到你的对话历史。
- 长任务永远用 \`es task\`（有状态、有兜底），不要用 \`es send\` 然后干等。
- 所有读命令支持 \`--json\`，需要程序化处理时加上。

完整命令见 \`es help\`。
`

export async function installEsSkill(): Promise<void> {
  try {
    const dir = join(homedir(), '.claude', 'skills', 'es-session-collab')
    const file = join(dir, 'SKILL.md')
    const marker = join(dir, '.es-version')
    let existing: string | null = null
    try {
      existing = await fs.readFile(marker, 'utf-8')
    } catch {
      existing = null
    }
    if (existing === SKILL_VERSION) return
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, SKILL_MD, 'utf-8')
    await fs.writeFile(marker, SKILL_VERSION, 'utf-8')
    console.info('[agent-bus] es 协作技能已安装到 ~/.claude/skills/es-session-collab')
  } catch (err) {
    console.warn('[agent-bus] 安装 es 技能失败:', err)
  }
}

// 注入到 claude 启动的 --append-system-prompt 一句话，确保即使技能未触发也知道 es 存在。
export const ES_SYSTEM_PROMPT_HINT =
  '你运行在 EasySession 中，可用命令行工具 es 与其他会话的 agent 协作：es sessions 看有谁、es task create <会话名> "<任务>" 派活（不阻塞，完成会通知你）、es send 发消息、es recv --wait 收消息。详见 es help 或 es-session-collab 技能。'
