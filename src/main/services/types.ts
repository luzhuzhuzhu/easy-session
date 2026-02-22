export type CliType = 'claude' | 'codex'

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
}
