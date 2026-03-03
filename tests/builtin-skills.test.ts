import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { tmpdir } from 'os'
import { SkillManager } from '../src/main/services/skill-manager'

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

function writeSkill(home: string, source: 'claude' | 'codex', relPath: string, content: string): void {
  const root = source === 'claude' ? '.claude' : '.codex'
  const filePath = join(home, root, 'skills', relPath, 'SKILL.md')
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

describe('SkillManager builtin skill discovery', () => {
  let home: string
  let manager: SkillManager

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'easysession-skills-'))
    mocked.home = home
    manager = new SkillManager({ sendInput: () => true } as any)
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  it('marks .system skills as builtin and categorizes them as system', async () => {
    writeSkill(
      home,
      'codex',
      '.system/code-review',
      '# Code Review\n\nBuiltin review skill\n\n## Prompt\n\nReview {{filePath}}\n'
    )
    writeSkill(
      home,
      'codex',
      'custom/fix-bug',
      '# Fix Bug\n\nProject custom skill\n\n## Prompt\n\nFix {{filePath}}\n'
    )

    const skills = await manager.listSkills()
    const builtin = skills.find((s) => s.slug === 'code-review')
    const custom = skills.find((s) => s.slug === 'fix-bug')

    expect(builtin).toBeDefined()
    expect(builtin?.isBuiltin).toBe(true)
    expect(builtin?.category).toBe('system')
    expect(builtin?.compatibleCli).toEqual(['codex'])

    expect(custom).toBeDefined()
    expect(custom?.isBuiltin).toBe(false)
    expect(custom?.category).toBe('custom')
  })

  it('derives fields from template placeholders and keeps ids unique', async () => {
    writeSkill(
      home,
      'claude',
      '.system/explain-code',
      '# Explain Code\n\nBuiltin explainer\n\n## Prompt\n\nExplain {{filePath}} with {{language}}\n'
    )
    writeSkill(
      home,
      'codex',
      '.system/explain-code',
      '# Explain Code\n\nBuiltin explainer\n\n## Prompt\n\nExplain {{filePath}} with {{language}}\n'
    )

    const skills = await manager.listSkills()
    const ids = skills.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)

    const claudeSkill = skills.find((s) => s.sourceCli === 'claude' && s.slug === 'explain-code')
    expect(claudeSkill).toBeDefined()
    const fieldNames = claudeSkill?.inputSchema.fields.map((f) => f.name).sort()
    expect(fieldNames).toEqual(['filePath', 'language'])
  })
})
