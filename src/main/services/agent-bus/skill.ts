// Install the EasySession collaboration skill into user-level skill folders so
// newly created or compacted agent sessions can rediscover the es CLI protocol.

import { homedir } from 'os'
import { join } from 'path'
import { promises as fs } from 'fs'

const SKILL_VERSION = '6'
const SKILL_DIR_NAME = 'es-session-collab'

const SKILL_MD = `---
name: es-session-collab
description: 当你运行在 EasySession 管理的终端/Agent 会话中，需要通过 es CLI 与其他会话协作时使用：查看协作者、派发任务、发送消息、接收回复、处理阻塞、交付结果、恢复 compact/new 后的任务上下文。
---

# EasySession Agent 协作

你运行在 EasySession 管理的终端会话里。EasySession 会把 \`es\` 命令注入到托管会话中。用 \`es\` 与其他终端/Agent 会话协作，不要依赖聊天历史在 compact 或 new 之后仍然存在。

## 先检查

\`\`\`bash
es whoami
es sessions
es help
\`\`\`

如果 \`es\` 不存在，或提示 bus 不可用，说明当前会话不能使用 EasySession 协作协议。

需要查看全部指令、支持参数、精确 task 子命令或示例时，运行 \`es help\` 或 \`es --help\`。如果本技能里的任何命令失败，先运行 \`es help\`，不要猜。

## 标准协作周期

多 Agent 协作时按这个周期走：

1. 发现协作者：运行 \`es sessions\`，根据会话角色、名称或当前输出选择目标。
2. 带上下文派活：运行 \`es task create <会话名或id> "<目标、相关上下文、约束、验收标准>"\`。任务描述必须自包含，因为对方会话可能看不到你的聊天历史。
3. 派发方继续工作：创建任务后记录 task id，然后继续自己的工作。只有确实需要等待回复或结果时才运行 \`es recv --wait\`。
4. 接单方处理任务：先 \`es task show <id>\`，再 \`accept\` 或 \`reject\`；接单后 \`start\`，过程中按需 \`progress\`、\`block\`、\`done\` 或 \`fail\`。
5. 阻塞循环：接单方用 \`es task block <id> "<具体问题>"\` 提问；派发方用 \`es task unblock <id> "<决策或缺失信息>"\` 答复。
6. 交付与验收：接单方用 \`es task done <id> --result "<总结、改动文件、验证结果>"\` 交付。UI 派发的任务可能进入 \`review\`；用户在 EasySession 确认，或派发方运行 \`es task confirm <id>\`。
7. compact/new 后恢复：运行 \`es task list\`，再用 \`es task show <id>\` 查看相关任务，按当前状态继续，不要依赖记忆。

\`es send\` 只用于短通知。只要工作有负责人、状态、阻塞问题或需要验收结果，就使用 \`es task\`。

## 常用命令

- 查看协作者：
  \`\`\`bash
  es sessions
  \`\`\`

- 发送短消息：
  \`\`\`bash
  es send <会话名或id> "<消息>"
  \`\`\`

- 派发任务：
  \`\`\`bash
  es task create <会话名或id> "<任务、上下文、验收标准>"
  \`\`\`
  命令会返回类似 \`t-1234abcd\` 的任务 id。不要永久等待；任务状态变化时 EasySession 会通知相关会话。

- 接收消息或任务事件：
  \`\`\`bash
  es recv
  es recv --wait
  \`\`\`

- 不打扰对方，只读查看其最近输出：
  \`\`\`bash
  es peek <会话名或id> --lines 80
  \`\`\`

## 收到任务时

1. 查看任务：
   \`\`\`bash
   es task show <task-id>
   \`\`\`
2. 接单或拒单：
   \`\`\`bash
   es task accept <task-id>
   es task reject <task-id> "<原因>"
   \`\`\`
3. 开始并汇报进度：
   \`\`\`bash
   es task start <task-id>
   es task progress <task-id> "<简短进展>"
   \`\`\`
4. 卡住时提问：
   \`\`\`bash
   es task block <task-id> "<具体问题或缺失信息>"
   \`\`\`
5. 完成或失败：
   \`\`\`bash
   es task done <task-id> --result "<改了什么、涉及文件、如何验证>"
   es task fail <task-id> "<失败原因>"
   \`\`\`
   EasySession UI 派发的任务在 \`done\` 后可能进入 \`review\`。用户可在 EasySession 确认，派发方也可运行 \`es task confirm <task-id>\`。

## 其他 Agent 阻塞时

答复并解除阻塞：

\`\`\`bash
es task unblock <task-id> "<答复或决策>"
\`\`\`

## 原则

- 耗时工作用 \`es task\`，因为它有状态、提醒、阻塞和恢复能力。
- 短通知才用 \`es send\`。
- 派发任务必须写清上下文和验收标准，对方可能看不到你的聊天历史。
- 需要程序化解析时优先加 \`--json\`。
- compact 或新会话后，用 \`es task list\` 和 \`es task show <task-id>\` 恢复任务状态。
- 需要完整指令参考时运行 \`es help\` 或 \`es --help\`。
`

export interface EsSkillInstallResult {
  dir: string
  ok: boolean
  skipped: boolean
  error?: string
}

export interface EsSkillInstallSummary {
  ok: boolean
  installed: EsSkillInstallResult[]
  failed: EsSkillInstallResult[]
}

const INSTALL_TARGETS = [
  join(homedir(), '.claude', 'skills', SKILL_DIR_NAME),
  join(homedir(), '.codex', 'skills', SKILL_DIR_NAME),
  join(homedir(), '.config', 'opencode', 'skills', SKILL_DIR_NAME),
  join(homedir(), '.agents', 'skills', SKILL_DIR_NAME)
]

export function getEsSkillMarkdown(): string {
  return SKILL_MD
}

export async function installEsSkill(): Promise<EsSkillInstallSummary> {
  const results = await Promise.all(INSTALL_TARGETS.map((dir) => installSkillDir(dir)))
  const failed = results.filter((item) => !item.ok)
  const installed = results.filter((item) => item.ok)

  if (failed.length === results.length) {
    console.warn('[agent-bus] failed to install es collaboration skill in every target', failed)
  } else if (failed.length) {
    console.warn('[agent-bus] es collaboration skill partially installed; failed targets:', failed)
  }

  return { ok: failed.length === 0, installed, failed }
}

async function installSkillDir(dir: string): Promise<EsSkillInstallResult> {
  try {
    const file = join(dir, 'SKILL.md')
    const marker = join(dir, '.es-version')
    let existingVersion: string | null = null
    let existingContent: string | null = null
    try {
      existingVersion = await fs.readFile(marker, 'utf-8')
    } catch {
      existingVersion = null
    }
    try {
      existingContent = await fs.readFile(file, 'utf-8')
    } catch {
      existingContent = null
    }
    if (existingVersion === SKILL_VERSION && existingContent === SKILL_MD) {
      return { dir, ok: true, skipped: true }
    }
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(file, SKILL_MD, 'utf-8')
    await fs.writeFile(marker, SKILL_VERSION, 'utf-8')
    console.info(`[agent-bus] es collaboration skill installed: ${dir}`)
    return { dir, ok: true, skipped: false }
  } catch (err) {
    console.warn(`[agent-bus] failed to install es collaboration skill: ${dir}`, err)
    return { dir, ok: false, skipped: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export const ES_SYSTEM_PROMPT_HINT =
  '你运行在 EasySession 中。使用 es CLI 与其他会话协作：es sessions 查看协作者，es task create <会话> "<任务>" 派发长期任务，es send 发送短消息，es recv --wait 接收回复/事件。es-session-collab skill 包含可在 compact/new 后恢复的完整协作协议。'
