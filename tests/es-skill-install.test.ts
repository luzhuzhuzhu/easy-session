import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const mocked = vi.hoisted(() => ({
  home: ''
}))

vi.mock('os', async (importOriginal) => {
  const original = await importOriginal<typeof import('os')>()
  return {
    ...original,
    homedir: () => mocked.home
  }
})

describe('es collaboration skill installer', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'easysession-es-skill-'))
    mocked.home = home
    vi.resetModules()
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('installs the es collaboration skill for Claude, Codex, OpenCode, and legacy agents', async () => {
    const { installEsSkill } = await import('../src/main/services/agent-bus/skill')

    const summary = await installEsSkill()

    expect(summary.ok).toBe(true)
    expect(summary.failed).toEqual([])

    const files = [
      join(home, '.claude', 'skills', 'es-session-collab', 'SKILL.md'),
      join(home, '.codex', 'skills', 'es-session-collab', 'SKILL.md'),
      join(home, '.config', 'opencode', 'skills', 'es-session-collab', 'SKILL.md'),
      join(home, '.agents', 'skills', 'es-session-collab', 'SKILL.md')
    ]

    for (const file of files) {
      expect(existsSync(file)).toBe(true)
      const content = readFileSync(file, 'utf8')
      expect(content).toContain('name: es-session-collab')
      expect(content).toContain('es task create')
      expect(content).toContain('es recv --wait')
      expect(content).toContain('标准协作周期')
      expect(content).toContain('需要查看全部指令')
    }
  })

  it('exports the same skill content for manual installation', async () => {
    const { getEsSkillMarkdown } = await import('../src/main/services/agent-bus/skill')

    const content = getEsSkillMarkdown()

    expect(content).toContain('name: es-session-collab')
    expect(content).toContain('es task list')
    expect(content).toContain('es task show <task-id>')
    expect(content).toContain('es task confirm <task-id>')
    expect(content).toContain('es --help')
    expect(content).toContain('需要查看全部指令')
    expect(content).toContain('## 标准协作周期')
    expect(content).toContain('阻塞循环')
    expect(content).toContain('交付与验收')
    expect(content).toContain('compact/new 后恢复')
  })

  it('updates the skill when content changed even if the version marker matches', async () => {
    const { installEsSkill, getEsSkillMarkdown } = await import('../src/main/services/agent-bus/skill')
    const dir = join(home, '.codex', 'skills', 'es-session-collab')
    const file = join(dir, 'SKILL.md')
    const marker = join(dir, '.es-version')
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, 'old skill content', 'utf8')
    writeFileSync(marker, '6', 'utf8')

    const summary = await installEsSkill()

    expect(summary.ok).toBe(true)
    expect(readFileSync(file, 'utf8')).toBe(getEsSkillMarkdown())
  })
})
