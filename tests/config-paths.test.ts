import { describe, it, expect } from 'vitest'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import {
  CLAUDE_GLOBAL_CONFIG,
  CLAUDE_COMMANDS_DIR,
  CODEX_CONFIG,
  OPENCODE_GLOBAL_CONFIG,
  CLI_CONFIG_DESCRIPTORS,
  claudeProjectConfig,
  resolveCliConfigPath
} from '../src/main/services/config-paths'

describe('config-paths', () => {
  const HOME = homedir()

  it('保留旧全局配置路径导出并修正 Codex TOML 路径', () => {
    expect(CLAUDE_GLOBAL_CONFIG).toBe(join(HOME, '.claude', 'settings.json'))
    expect(CLAUDE_COMMANDS_DIR).toBe(join(HOME, '.claude', 'commands'))
    expect(CODEX_CONFIG).toBe(join(HOME, '.codex', 'config.toml'))
    expect(OPENCODE_GLOBAL_CONFIG).toBe(join(HOME, '.config', 'opencode', 'opencode.json'))
  })

  it('为八个可编辑 CLI 声明正确格式', () => {
    expect(Object.keys(CLI_CONFIG_DESCRIPTORS)).toEqual([
      'claude',
      'codex',
      'opencode',
      'gemini',
      'pi',
      'omp',
      'grok',
      'hermes'
    ])
    expect(
      Object.fromEntries(
        Object.entries(CLI_CONFIG_DESCRIPTORS).map(([cli, descriptor]) => [cli, descriptor.format])
      )
    ).toEqual({
      claude: 'json',
      codex: 'toml',
      opencode: 'json',
      gemini: 'json',
      pi: 'json',
      omp: 'yaml',
      grok: 'toml',
      hermes: 'yaml'
    })
  })

  it('解析标准主目录路径', () => {
    const context = { homeDir: '/home/tester', env: {}, platform: 'linux' as const }
    expect(resolveCliConfigPath('claude', context)).toBe(join('/home/tester', '.claude', 'settings.json'))
    expect(resolveCliConfigPath('codex', context)).toBe(join('/home/tester', '.codex', 'config.toml'))
    expect(resolveCliConfigPath('opencode', context)).toBe(
      join('/home/tester', '.config', 'opencode', 'opencode.json')
    )
    expect(resolveCliConfigPath('gemini', context)).toBe(join('/home/tester', '.gemini', 'settings.json'))
    expect(resolveCliConfigPath('pi', context)).toBe(join('/home/tester', '.pi', 'agent', 'settings.json'))
    expect(resolveCliConfigPath('omp', context)).toBe(join('/home/tester', '.omp', 'agent', 'config.yml'))
    expect(resolveCliConfigPath('grok', context)).toBe(join('/home/tester', '.grok', 'config.toml'))
    expect(resolveCliConfigPath('hermes', context)).toBe(join('/home/tester', '.hermes', 'config.yaml'))
  })

  it('应用 Pi、OMP、Grok 和 Hermes 环境变量覆盖', () => {
    expect(
      resolveCliConfigPath('pi', {
        homeDir: '/home/tester',
        env: { PI_CODING_AGENT_DIR: '/opt/pi-agent' },
        platform: 'linux'
      })
    ).toBe(join('/opt/pi-agent', 'settings.json'))
    expect(
      resolveCliConfigPath('omp', {
        homeDir: '/home/tester',
        env: { PI_CODING_AGENT_DIR: '/opt/omp-agent' },
        platform: 'linux'
      })
    ).toBe(join('/opt/omp-agent', 'config.yml'))
    expect(
      resolveCliConfigPath('omp', {
        homeDir: '/home/tester',
        env: { OMP_PROFILE: 'work' },
        platform: 'linux'
      })
    ).toBe(join('/home/tester', '.omp', 'profiles', 'work', 'agent', 'config.yml'))
    expect(
      resolveCliConfigPath('omp', {
        homeDir: '/home/tester',
        env: { PI_PROFILE: 'fallback' },
        platform: 'linux'
      })
    ).toBe(join('/home/tester', '.omp', 'profiles', 'fallback', 'agent', 'config.yml'))
    expect(
      resolveCliConfigPath('grok', {
        homeDir: '/home/tester',
        env: { GROK_HOME: '/opt/grok' },
        platform: 'linux'
      })
    ).toBe(join('/opt/grok', 'config.toml'))
    expect(
      resolveCliConfigPath('hermes', {
        homeDir: '/home/tester',
        env: { HERMES_HOME: '/opt/hermes' },
        platform: 'win32'
      })
    ).toBe(join('/opt/hermes', 'config.yaml'))
  })

  it('Windows Hermes 使用 LOCALAPPDATA 回退路径', () => {
    expect(
      resolveCliConfigPath('hermes', {
        homeDir: 'C:\\Users\\tester',
        env: { LOCALAPPDATA: 'C:\\Users\\tester\\AppData\\Local' },
        platform: 'win32'
      })
    ).toBe(join('C:\\Users\\tester\\AppData\\Local', 'hermes', 'config.yaml'))
  })

  describe('claudeProjectConfig', () => {
    it('在项目目录下拼出 .claude/settings.json', () => {
      const projectPath = join(tmpdir(), 'es-cfg-demo')
      expect(claudeProjectConfig(projectPath)).toBe(join(projectPath, '.claude', 'settings.json'))
    })
  })
})
