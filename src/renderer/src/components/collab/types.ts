import type { AgentTask } from '@/api/agent-bus'

// STAB-11：协作页 5 个面板子组件共享的类型。

export interface BoardColumn {
  key: string
  label: string
  tasks: AgentTask[]
}

export interface SlashCommand {
  name: string
  argHint: string
  descKey: string
}
