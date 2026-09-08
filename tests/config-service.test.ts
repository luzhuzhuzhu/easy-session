import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfigService, ConfigServiceError } from '../src/main/services/config-service'

function expectServiceError(code: ConfigServiceError['code']) {
  return expect.objectContaining({ code })
}

describe('ConfigService unified text config', () => {
  let homeDir: string
  let service: ConfigService

  beforeEach(async () => {
    homeDir = await mkdtemp(join(tmpdir(), 'easysession-config-service-'))
    service = new ConfigService({ homeDir, env: {}, platform: 'linux' })
  })

  afterEach(async () => {
    await rm(homeDir, { recursive: true, force: true })
  })

  it.each([
    ['claude', '{"model":"sonnet"}', 'json'],
    ['codex', 'model = "gpt-5"\n', 'toml'],
    ['hermes', 'model: nous/hermes\n', 'yaml']
  ] as const)('写入并读取 %s 原始文本配置', async (cliType, content, format) => {
    const missing = await service.readConfig(cliType)
    expect(missing).toMatchObject({ cliType, format, exists: false, content: '', revision: null })

    const saved = await service.writeConfig(cliType, content, missing.revision)
    expect(saved).toMatchObject({ cliType, format, exists: true, content })
    expect(saved.revision).toMatch(/^sha256:[a-f0-9]{64}$/)
    expect(await readFile(saved.path, 'utf-8')).toBe(content)

    const loaded = await service.readConfig(cliType)
    expect(loaded).toEqual(saved)
  })

  it('原子覆盖已有文件并生成备份', async () => {
    const first = await service.writeConfig('gemini', '{"theme":"dark"}', null)
    const second = await service.writeConfig('gemini', '{"theme":"light"}', first.revision)

    expect(await readFile(second.path, 'utf-8')).toBe('{"theme":"light"}')
    expect(await readFile(`${second.path}.bak`, 'utf-8')).toBe('{"theme":"dark"}')
  })

  it.each([
    ['claude', '{broken', 'CONFIG_INVALID_SYNTAX'],
    ['claude', '[]', 'CONFIG_INVALID_SYNTAX'],
    ['codex', 'model = [', 'CONFIG_INVALID_SYNTAX'],
    ['omp', '---\na: 1\n---\nb: 2\n', 'CONFIG_INVALID_SYNTAX'],
    ['omp', '- item\n', 'CONFIG_INVALID_SYNTAX']
  ] as const)('拒绝 %s 非法内容且不改变原文件', async (cliType, invalid, code) => {
    const valid = cliType === 'codex' ? 'model = "ok"\n' : cliType === 'omp' ? 'model: ok\n' : '{}'
    const saved = await service.writeConfig(cliType, valid, null)

    await expect(service.writeConfig(cliType, invalid, saved.revision)).rejects.toMatchObject({ code })
    expect(await readFile(saved.path, 'utf-8')).toBe(valid)
  })

  it('拒绝超大和非字符串内容', async () => {
    await expect(
      service.writeConfig('claude', 'x'.repeat(ConfigService.MAX_CONFIG_BYTES + 1), null)
    ).rejects.toEqual(expectServiceError('CONFIG_TOO_LARGE'))
    await expect(
      service.writeConfig('claude', { invalid: true } as unknown as string, null)
    ).rejects.toEqual(expectServiceError('CONFIG_INVALID_CONTENT'))
  })

  it('检测 revision 冲突且保留外部修改', async () => {
    const saved = await service.writeConfig('grok', 'model = "first"\n', null)
    await writeFile(saved.path, 'model = "external"\n', 'utf-8')

    await expect(
      service.writeConfig('grok', 'model = "ours"\n', saved.revision)
    ).rejects.toEqual(expectServiceError('CONFIG_CONFLICT'))
    expect(await readFile(saved.path, 'utf-8')).toBe('model = "external"\n')
  })

  it('拒绝非白名单 CLI', async () => {
    await expect(service.readConfig('terminal' as never)).rejects.toEqual(
      expectServiceError('CONFIG_INVALID_CLI')
    )
  })

  it('不吞读取错误', async () => {
    const expectedPath = join(homeDir, '.pi', 'agent', 'settings.json')
    await mkdir(expectedPath, { recursive: true })
    await expect(service.readConfig('pi')).rejects.toMatchObject({ code: 'EISDIR' })
  })

  it('旧 JSON 读取仅把不存在视为空对象，不吞损坏内容', async () => {
    expect(await service.getClaudeProjectConfig(join(homeDir, 'missing-project'))).toEqual({})
    const configPath = join(homeDir, 'broken.json')
    await writeFile(configPath, '{broken', 'utf-8')
    await expect(service.readJsonFile(configPath)).rejects.toBeInstanceOf(SyntaxError)
  })
})
