import type { CliType, CustomCliArgument } from '../../shared/cli-types'

export type { CliType, CustomCliArgument }

export interface ProcessInfo {
  id: string
  pid: number | undefined
  cliType: CliType
  command: string
  args: string[]
  status: 'running' | 'exited'
  exitCode: number | null
  startTime: number
  endTime?: number
}

export interface ProcessOutput {
  id: string
  stream: 'stdout' | 'stderr'
  data: string
  timestamp: number
}

export interface SpawnRequest {
  id: string
  command: string
  args: string[]
  options?: { cwd?: string }
}

export interface ClaudeSessionOptions {
  cliPath?: string
  // model 为旧字段：新表单统一通过 customArgs 的 --model 表达，保存时会清理；
  // adapter 仍读取它以兼容未重新保存过的旧会话数据
  model?: string
  allowedTools?: string[]
  resumeId?: string
  customArgs?: CustomCliArgument[]
}

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export type CodexPermissionsMode = 'read-only' | 'default' | 'full-access'
export type CodexApprovalMode = 'untrusted' | 'on-request' | 'never'
export type LegacyCodexApprovalMode = 'suggest' | 'auto-edit' | 'full-auto'
export type SupportedCodexApprovalMode = CodexApprovalMode | LegacyCodexApprovalMode

export interface CodexSessionOptions {
  cliPath?: string
  model?: string
  permissionsMode?: CodexPermissionsMode
  sandboxMode?: CodexSandboxMode
  approvalMode?: SupportedCodexApprovalMode
  inlineMode?: boolean
  resumeId?: string
  customArgs?: CustomCliArgument[]
}

export interface TerminalSessionOptions {
  // shell 可执行文件：检测到的 id（cmd/powershell/pwsh/git-bash/wsl）或任意可执行文件路径
  shell?: string
  shellArgs?: CustomCliArgument[]
  // 启动后逐行写入终端的初始命令（如激活 venv、运行脚本）
  startupCommands?: string[]
}

export interface OpenCodeSessionOptions {
  cliPath?: string
  model?: string
  agent?: string
  prompt?: string
  sessionId?: string
  continueLast?: boolean
  fork?: boolean
  attachUrl?: string
  serverMode?: 'off' | 'attach'
  variant?: string
  thinking?: string
  auto?: boolean
  mini?: boolean
  noReplay?: boolean
  replayLimit?: number
  format?: string
  file?: string[]
  title?: string
}

// FEAT-3：Gemini CLI 一等支持。gemini --resume <id> / --checkpointing 对齐
// 其官方参数；model 走 --model，approveMode 走 --approval-mode。
export interface GeminiSessionOptions {
  cliPath?: string
  model?: string
  approvalMode?: 'default' | 'auto_edit' | 'yolo'
  resumeId?: string
  customArgs?: CustomCliArgument[]
}

// 通用「pi 系」CLI（pi / omp 同源）launch options：
// resume 走 --session <path|id 前缀>（omp 为 -r/--resume，见 adapter 差异），
// pi -p/--print 是非交互模式，会话管理型桌面托管默认不开。
export interface PiSessionOptions {
  cliPath?: string
  model?: string
  thinking?: string
  approvalMode?: 'always-ask' | 'write' | 'yolo'
  resumeId?: string
  continueLast?: boolean
  customArgs?: CustomCliArgument[]
}

export type OmpSessionOptions = PiSessionOptions

// Grok Build（x.ai 官方 grok CLI）：-r/--resume <id>、-m/--model、
// --permission-mode default|acceptEdits|auto|dontAsk|bypassPermissions|plan。
export interface GrokSessionOptions {
  cliPath?: string
  model?: string
  permissionMode?: 'default' | 'acceptEdits' | 'auto' | 'dontAsk' | 'bypassPermissions' | 'plan'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  resumeId?: string
  continueLast?: boolean
  customArgs?: CustomCliArgument[]
}

// Hermes Agent（NousResearch）：--resume <id>|latest、-c/--continue、
// --model "provider/model"、会话存储在 ~/.hermes/state.db。
export interface HermesSessionOptions {
  cliPath?: string
  model?: string
  resumeId?: string
  continueLast?: boolean
  customArgs?: CustomCliArgument[]
}
