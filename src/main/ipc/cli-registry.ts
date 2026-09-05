import { z } from 'zod'

// FEAT-2：CLI 注册表——新增一个 CLI 的主进程接触面收敛到这里。
// 每个条目声明：launch options 的 zod schema、settings 里的可执行路径键。
// 显示名/徽章见 CLI_TYPE_DISPLAY_NAMES；adapter/lifecycle 装配见 main/cli-setup.ts。

const customCliArgSchema = z.object({ name: z.string(), value: z.string().optional() }).passthrough()

export const claudeOptionsSchema = z
  .object({
    model: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

export const codexOptionsSchema = z
  .object({
    model: z.string().optional(),
    permissionsMode: z.enum(['read-only', 'default', 'full-access']).optional(),
    sandboxMode: z.enum(['read-only', 'workspace-write', 'danger-full-access']).optional(),
    approvalMode: z
      .enum(['untrusted', 'on-request', 'never', 'suggest', 'auto-edit', 'full-auto'])
      .optional(),
    inlineMode: z.boolean().optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

export const opencodeOptionsSchema = z
  .object({
    cliPath: z.string().optional(),
    model: z.string().optional(),
    agent: z.string().optional(),
    prompt: z.string().optional(),
    sessionId: z.string().optional(),
    continueLast: z.boolean().optional(),
    fork: z.boolean().optional(),
    attachUrl: z.string().optional(),
    serverMode: z.enum(['off', 'attach']).optional()
  })
  .passthrough()

export const terminalOptionsSchema = z
  .object({
    shell: z.string().optional(),
    shellArgs: z.array(customCliArgSchema).optional(),
    startupCommands: z.array(z.string()).optional()
  })
  .passthrough()

// FEAT-3：Gemini CLI launch options。
export const geminiOptionsSchema = z
  .object({
    model: z.string().optional(),
    approvalMode: z.enum(['default', 'auto_edit', 'yolo']).optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

export interface CliRegistryEntry {
  id: string
  /** settings 中该 CLI 的自定义可执行路径键（无则用 PATH 探测） */
  settingsPathKey?: string
  optionsSchema: z.ZodTypeAny
}

// 注册表本身：session:create 的 discriminatedUnion 由这里派生。
export const CLI_REGISTRY: CliRegistryEntry[] = [
  { id: 'claude', settingsPathKey: 'claudePath', optionsSchema: claudeOptionsSchema },
  { id: 'codex', settingsPathKey: 'codexPath', optionsSchema: codexOptionsSchema },
  { id: 'opencode', settingsPathKey: 'opencodePath', optionsSchema: opencodeOptionsSchema },
  { id: 'terminal', optionsSchema: terminalOptionsSchema },
  { id: 'gemini', settingsPathKey: 'geminiPath', optionsSchema: geminiOptionsSchema }
]

// 可 PATH 探测的 CLI（terminal 不参与 cli:check）。
export function getProbeableCliIds(): string[] {
  return CLI_REGISTRY.filter((entry) => !!entry.settingsPathKey).map((entry) => entry.id)
}

export function getCliRegistryEntry(id: string): CliRegistryEntry | undefined {
  return CLI_REGISTRY.find((entry) => entry.id === id)
}
