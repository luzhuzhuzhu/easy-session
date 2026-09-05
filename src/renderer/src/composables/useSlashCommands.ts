import { computed, ref } from 'vue'
import {
  createBusTask,
  sendBusMessage,
  setBusTaskStatus,
  setSessionCollabMode,
  transitionBusTask,
  type AgentCollabMode,
  type AgentTask,
  type BusActionResult
} from '@/api/agent-bus'
import type { SlashCommand } from '@/components/collab/types'

// STAB-11：协作页斜杠命令（/task /confirm /cancel /block /unblock /mode）
// 的菜单状态、按键导航与命令分发。UI 呈现留在面板组件，此处只管逻辑。

export interface SlashCommandDeps {
  t: (key: string, params?: Record<string, unknown>) => string
  activeAgentId: () => string
  selectedTask: () => AgentTask | null
  clearChatInput: () => void
  refresh: () => Promise<void>
  confirmCancel: (taskId: string) => Promise<boolean>
  onTaskSelected: (taskId: string) => void
  onError: (message: string) => void
  onSuccess: (message: string) => void
  onNeedTask: () => void
}

export function useSlashCommands(deps: SlashCommandDeps) {
  const { t } = deps

  const SLASH_COMMANDS: SlashCommand[] = [
    { name: 'task', argHint: '<desc>', descKey: 'collab.cmd.task' },
    { name: 'confirm', argHint: '', descKey: 'collab.cmd.confirm' },
    { name: 'cancel', argHint: '[reason]', descKey: 'collab.cmd.cancel' },
    { name: 'block', argHint: '<question>', descKey: 'collab.cmd.block' },
    { name: 'unblock', argHint: '<answer>', descKey: 'collab.cmd.unblock' },
    { name: 'mode', argHint: 'readonly|nudge|inject', descKey: 'collab.cmd.mode' }
  ]

  // 聊天输入与命令菜单状态（chatInput 本体由父视图持有，这里只读查询）。
  const chatInputRef = ref('')
  const activeMenuIndex = ref(0)
  const menuDismissed = ref(false)

  // 斜杠命令：仅在「正在键入命令名」阶段（以 / 开头且尚未输入空格）弹菜单。
  const commandQuery = computed(() => {
    const text = chatInputRef.value
    if (!text.startsWith('/')) return null
    if (/\s/.test(text)) return null
    return text.slice(1).toLowerCase()
  })
  const filteredCommands = computed(() => {
    const query = commandQuery.value
    if (query === null) return []
    return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(query))
  })
  const commandMenuOpen = computed(() => !menuDismissed.value && filteredCommands.value.length > 0)

  function setChatInput(text: string): void {
    chatInputRef.value = text
    if (!text.startsWith('/')) menuDismissed.value = false
    if (activeMenuIndex.value >= filteredCommands.value.length) activeMenuIndex.value = 0
  }

  function requireTask(task: AgentTask | null): task is AgentTask {
    if (!task) {
      // 依赖方注入 error toast；这里用抛错前的回调模式不便，直接返回布尔 + 错误文案。
      deps.onNeedTask()
      return false
    }
    return true
  }

  function fail(error?: string): void {
    deps.onError(t('collab.actionFailed', { error: error || '-' }))
  }

  function finishCommand(result: BusActionResult, onOk?: () => void): void {
    if (!result.ok) {
      fail(result.error)
      return
    }
    deps.onSuccess(t('collab.cmdDone'))
    deps.clearChatInput()
    onOk?.()
    void deps.refresh()
  }

  async function runCommand(raw: string): Promise<void> {
    const body = raw.slice(1)
    const spaceIdx = body.search(/\s/)
    const name = (spaceIdx >= 0 ? body.slice(0, spaceIdx) : body).toLowerCase()
    const arg = spaceIdx >= 0 ? body.slice(spaceIdx + 1).trim() : ''
    const task = deps.selectedTask()

    switch (name) {
      case 'task': {
        if (!deps.activeAgentId()) {
          deps.onError(t('collab.cmdNeedMember'))
          return
        }
        if (!arg) {
          deps.onError(t('collab.cmdNeedArg'))
          return
        }
        const result = await createBusTask([deps.activeAgentId()], arg)
        finishCommand(result, () => {
          if (result.taskId) deps.onTaskSelected(result.taskId as string)
        })
        return
      }
      case 'confirm': {
        if (!requireTask(task)) return
        finishCommand(await transitionBusTask(task.id, 'confirm'))
        return
      }
      case 'cancel': {
        if (!requireTask(task)) return
        const confirmed = await deps.confirmCancel(task.id)
        if (!confirmed) return
        finishCommand(await transitionBusTask(task.id, 'cancel', arg || undefined))
        return
      }
      case 'unblock': {
        if (!requireTask(task)) return
        if (!arg) {
          deps.onError(t('collab.cmdNeedArg'))
          return
        }
        finishCommand(await transitionBusTask(task.id, 'unblock', arg))
        return
      }
      case 'block': {
        if (!requireTask(task)) return
        finishCommand(await setBusTaskStatus(task.id, 'blocked', arg || undefined))
        return
      }
      case 'mode': {
        if (!deps.activeAgentId()) {
          deps.onError(t('collab.cmdNeedMember'))
          return
        }
        const map: Record<string, AgentCollabMode> = {
          readonly: 'terminal-readonly',
          nudge: 'terminal-nudge',
          inject: 'terminal-inject'
        }
        const mode = map[arg.toLowerCase()]
        if (!mode) {
          deps.onError(t('collab.cmdBadMode'))
          return
        }
        finishCommand(await setSessionCollabMode(deps.activeAgentId(), mode))
        return
      }
      default:
        deps.onError(t('collab.cmdUnknown', { name }))
    }
  }

  return {
    SLASH_COMMANDS,
    chatInputRef,
    activeMenuIndex,
    menuDismissed,
    commandQuery,
    filteredCommands,
    commandMenuOpen,
    setChatInput,
    setChatInputForSend: (text: string) => {
      chatInputRef.value = text
    },
    runCommand,
    finishCommand,
    sendDirectMessage: async (text: string): Promise<boolean> => {
      const result = await sendBusMessage([deps.activeAgentId()], text)
      if (!result.ok) {
        fail(result.error)
        return false
      }
      deps.clearChatInput()
      await deps.refresh()
      return true
    }
  }
}
