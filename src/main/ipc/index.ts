import { CliManager } from '../services/cli-manager'
import { ClaudeAdapter } from '../services/claude-adapter'
import { CodexAdapter } from '../services/codex-adapter'
import { ConfigService } from '../services/config-service'
import { SessionManager } from '../services/session-manager'
import { ProjectManager } from '../services/project-manager'
import { SkillManager } from '../services/skill-manager'
import { registerConfigHandlers } from './config-handlers'
import { registerCliHandlers } from './cli-handlers'
import { registerSessionHandlers } from './session-handlers'
import { registerProjectHandlers } from './project-handlers'
import { registerSkillHandlers } from './skill-handlers'
import { registerSettingsHandlers } from './settings-handlers'

export interface Services {
  cliManager: CliManager
  claudeAdapter: ClaudeAdapter
  codexAdapter: CodexAdapter
  configService: ConfigService
  sessionManager: SessionManager
  projectManager: ProjectManager
  skillManager: SkillManager
}

export function registerAllHandlers(services: Services): void {
  registerConfigHandlers(services.configService)
  registerCliHandlers(services.cliManager, services.claudeAdapter, services.codexAdapter)
  registerSessionHandlers(services.sessionManager)
  registerProjectHandlers(services.projectManager, services.sessionManager)
  registerSkillHandlers(services.skillManager, services.projectManager)
  registerSettingsHandlers()
}
