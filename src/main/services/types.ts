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
  model?: string
  maxTurns?: number
  allowedTools?: string[]
  customArgs?: CustomCliArgument[]
}

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access'
export type CodexPermissionsMode = 'read-only' | 'default' | 'full-access'
export type CodexApprovalMode = 'untrusted' | 'on-request' | 'never'
export type LegacyCodexApprovalMode = 'suggest' | 'auto-edit' | 'full-auto'
export type SupportedCodexApprovalMode = CodexApprovalMode | LegacyCodexApprovalMode

export interface CodexSessionOptions {
  model?: string
  permissionsMode?: CodexPermissionsMode
  sandboxMode?: CodexSandboxMode
  approvalMode?: SupportedCodexApprovalMode
  inlineMode?: boolean
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
}
