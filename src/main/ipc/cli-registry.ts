import { z } from 'zod'

// 每个条目声明：launch options 的 zod schema、settings 里的可执行路径键。
// 显示名/徽章见 CLI_TYPE_DISPLAY_NAMES；adapter/lifecycle 装配见 main/cli-setup.ts。

const customCliArgSchema = z.object({ name: z.string(), value: z.string().optional() }).passthrough()

export const claudeOptionsSchema = z
  .object({
    cliPath: z.string().optional(),
    model: z.string().optional(),
    allowedTools: z.array(z.string()).optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

export const codexOptionsSchema = z
  .object({
    cliPath: z.string().optional(),
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
    serverMode: z.enum(['off', 'attach']).optional(),
    variant: z.string().optional(),
    thinking: z.string().optional(),
    auto: z.boolean().optional(),
    mini: z.boolean().optional(),
    noReplay: z.boolean().optional(),
    replayLimit: z.number().int().positive().optional(),
    format: z.string().optional(),
    file: z.array(z.string()).optional(),
    title: z.string().optional()
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
    cliPath: z.string().optional(),
    model: z.string().optional(),
    approvalMode: z.enum(['default', 'auto_edit', 'yolo']).optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

// pi / omp（oh-my-pi）共享同一形状：resumeId 对应 pi --session <id 前缀> /
// omp -r/--resume <id 前缀>；thinking 为档位枚举。
export const piOptionsSchema = z
  .object({
    cliPath: z.string().optional(),
    model: z.string().optional(),
    thinking: z.string().optional(),
    approvalMode: z.enum(['always-ask', 'write', 'yolo']).optional(),
    resumeId: z.string().optional(),
    continueLast: z.boolean().optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

export const ompOptionsSchema = piOptionsSchema

// Grok Build（x.ai grok CLI）。
export const grokOptionsSchema = z
  .object({
    cliPath: z.string().optional(),
    model: z.string().optional(),
    permissionMode: z
      .enum(['default', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions', 'plan'])
      .optional(),
    effort: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).optional(),
    resumeId: z.string().optional(),
    continueLast: z.boolean().optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

// Hermes Agent（NousResearch）。
export const hermesOptionsSchema = z
  .object({
    cliPath: z.string().optional(),
    model: z.string().optional(),
    resumeId: z.string().optional(),
    continueLast: z.boolean().optional(),
    customArgs: z.array(customCliArgSchema).optional()
  })
  .passthrough()

export type NativeSessionDiscoverySource = 'cli-json' | 'cli-text' | 'local-jsonl' | 'local-sqlite' | 'none'

export interface CliDiscoveryCapabilities {
  supportsResume: boolean
  nativeSessionCandidates: boolean
  source: NativeSessionDiscoverySource
  supportsTitle: boolean
  supportsContent: boolean
  requiresProjectPath: boolean
}

export interface CliRegistryEntry {
  id: string
  /** settings 中该 CLI 的自定义可执行路径键（无则用 PATH 探测） */
  settingsPathKey?: string
  /** 兼容旧调用方；新代码读取 discovery.nativeSessionCandidates。 */
  nativeSessionCandidates?: boolean
  /** 会话发现与恢复能力声明。 */
  discovery: CliDiscoveryCapabilities
  optionsSchema: z.ZodTypeAny
}

const discovery = (source: NativeSessionDiscoverySource, supportsContent = false): CliDiscoveryCapabilities => ({
  supportsResume: source !== 'none',
  nativeSessionCandidates: source !== 'none',
  source,
  supportsTitle: source !== 'none',
  supportsContent,
  requiresProjectPath: source !== 'none'
})

// 注册表本身：session:create 的 discriminatedUnion 由这里派生。
export const CLI_REGISTRY: CliRegistryEntry[] = [
  { id: 'claude', settingsPathKey: 'claudePath', discovery: discovery('local-jsonl', true), optionsSchema: claudeOptionsSchema },
  { id: 'codex', settingsPathKey: 'codexPath', discovery: discovery('local-jsonl', true), optionsSchema: codexOptionsSchema },
  { id: 'opencode', settingsPathKey: 'opencodePath', discovery: discovery('cli-json', false), optionsSchema: opencodeOptionsSchema },
  { id: 'terminal', discovery: discovery('none'), optionsSchema: terminalOptionsSchema },
  { id: 'gemini', settingsPathKey: 'geminiPath', discovery: discovery('local-jsonl', true), optionsSchema: geminiOptionsSchema },
  { id: 'pi', settingsPathKey: 'piPath', discovery: discovery('local-jsonl', true), optionsSchema: piOptionsSchema },
  { id: 'omp', settingsPathKey: 'ompPath', discovery: discovery('local-jsonl', true), optionsSchema: ompOptionsSchema },
  { id: 'grok', settingsPathKey: 'grokPath', discovery: discovery('cli-text', true), optionsSchema: grokOptionsSchema },
  { id: 'hermes', settingsPathKey: 'hermesPath', discovery: discovery('local-sqlite', true), optionsSchema: hermesOptionsSchema }
]

// 可 PATH 探测的 CLI（terminal 不参与 cli:check）。
export function getProbeableCliIds(): string[] {
  return CLI_REGISTRY.filter((entry) => !!entry.settingsPathKey).map((entry) => entry.id)
}

export function hasNativeSessionCandidates(id: string): boolean {
  return getCliRegistryEntry(id)?.discovery.nativeSessionCandidates === true
}

export function getCliDiscoveryCapabilities(id: string): CliDiscoveryCapabilities | undefined {
  return getCliRegistryEntry(id)?.discovery
}

export function getCliRegistryEntry(id: string): CliRegistryEntry | undefined {
  return CLI_REGISTRY.find((entry) => entry.id === id)
}
