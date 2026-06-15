import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import {
  CLAUDE_GLOBAL_CONFIG,
  CLAUDE_COMMANDS_DIR,
  CODEX_CONFIG,
  OPENCODE_GLOBAL_CONFIG,
  claudeProjectConfig,
} from '../src/main/services/config-paths'

// config-paths 是各 CLI 工具配置的"数据根"，过去零测试。
// 这些常量一旦被误改会静默指向错误目录，故加防回归断言。
describe('config-paths', () => {
  const HOME = homedir()

  it('CLAUDE_GLOBAL_CONFIG 指向用户主目录下的 .claude/settings.json', () => {
    expect(CLAUDE_GLOBAL_CONFIG).toBe(join(HOME, '.claude', 'settings.json'))
  })

  it('CLAUDE_COMMANDS_DIR 指向 .claude/commands', () => {
    expect(CLAUDE_COMMANDS_DIR).toBe(join(HOME, '.claude', 'commands'))
  })

  it('CODEX_CONFIG 指向 .codex/config.json', () => {
    expect(CODEX_CONFIG).toBe(join(HOME, '.codex', 'config.json'))
  })

  it('OPENCODE_GLOBAL_CONFIG 指向 .config/opencode/opencode.json', () => {
    expect(OPENCODE_GLOBAL_CONFIG).toBe(join(HOME, '.config', 'opencode', 'opencode.json'))
  })

  it('所有全局配置路径都落在用户主目录内', () => {
    for (const p of [CLAUDE_GLOBAL_CONFIG, CLAUDE_COMMANDS_DIR, CODEX_CONFIG, OPENCODE_GLOBAL_CONFIG]) {
      expect(p.startsWith(HOME)).toBe(true)
    }
  })

  describe('claudeProjectConfig', () => {
    it('在项目目录下拼出 .claude/settings.json', () => {
      const projectPath = join('D:', 'work', 'demo')
      expect(claudeProjectConfig(projectPath)).toBe(join(projectPath, '.claude', 'settings.json'))
    })

    it('对不同项目路径返回各自独立的配置路径', () => {
      const a = claudeProjectConfig('/tmp/a')
      const b = claudeProjectConfig('/tmp/b')
      expect(a).not.toBe(b)
      expect(a).toBe(join('/tmp/a', '.claude', 'settings.json'))
    })
  })
})
