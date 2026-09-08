import { CliManager } from '../services/cli-manager'
import { ClaudeAdapter } from '../services/claude-adapter'
import { CodexAdapter } from '../services/codex-adapter'
import { OpenCodeAdapter } from '../services/opencode-adapter'
import { PiAdapter, OmpAdapter } from '../services/pi-family-adapter'
import { GrokAdapter } from '../services/grok-adapter'
import { HermesAdapter } from '../services/hermes-adapter'
import { ConfigService } from '../services/config-service'
import { SessionManager } from '../services/session-manager'
import { ProjectManager } from '../services/project-manager'
import { SkillManager } from '../services/skill-manager'
import { WorkspaceLayoutManager } from '../services/workspace-layout-manager'
import { registerConfigHandlers } from './config-handlers'
import { registerCliHandlers } from './cli-handlers'
import { registerSessionHandlers } from './session-handlers'
import { registerProjectHandlers } from './project-handlers'
import { registerSkillHandlers } from './skill-handlers'
import { registerSettingsHandlers } from './settings-handlers'
import { registerWorkspaceHandlers } from './workspace-handlers'

export interface Services {
  cliManager: CliManager
  claudeAdapter: ClaudeAdapter
  codexAdapter: CodexAdapter
  openCodeAdapter: OpenCodeAdapter
  piAdapter?: PiAdapter
  ompAdapter?: OmpAdapter
  grokAdapter?: GrokAdapter
  hermesAdapter?: HermesAdapter
  configService: ConfigService
  sessionManager: SessionManager
  projectManager: ProjectManager
  skillManager: SkillManager
  workspaceLayoutManager: WorkspaceLayoutManager
  agentBus?: { presetCollabMode(sessionId: string, mode: string): void }
}

export function registerAllHandlers(services: Services): void {
  registerConfigHandlers(services.configService, services.projectManager)
  registerCliHandlers(services.cliManager, services.claudeAdapter, services.codexAdapter, services.openCodeAdapter, {
    pi: services.piAdapter,
    omp: services.ompAdapter,
    grok: services.grokAdapter,
    hermes: services.hermesAdapter
  })
  registerSessionHandlers(services.sessionManager, services.agentBus, services.openCodeAdapter, services.codexAdapter)
  registerProjectHandlers(services.projectManager, services.sessionManager)
  registerSkillHandlers(services.skillManager, services.projectManager)
  registerSettingsHandlers()
  registerWorkspaceHandlers(services.workspaceLayoutManager)
}