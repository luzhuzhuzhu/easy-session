import { describe, it, expect } from 'vitest'
import { BUILTIN_SKILLS } from '../src/main/services/builtin-skills'

describe('BUILTIN_SKILLS', () => {
  it('should have 6 builtin skills', () => {
    expect(BUILTIN_SKILLS).toHaveLength(6)
  })

  it('should all be marked as builtin', () => {
    for (const skill of BUILTIN_SKILLS) {
      expect(skill.isBuiltin).toBe(true)
    }
  })

  it('should have unique slugs', () => {
    const slugs = BUILTIN_SKILLS.map(s => s.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('should have unique ids', () => {
    const ids = BUILTIN_SKILLS.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  const expectedSlugs = [
    'code-review',
    'generate-tests',
    'explain-code',
    'fix-bug',
    'architecture-analysis',
    'refactor'
  ]

  it.each(expectedSlugs)('should contain skill with slug "%s"', (slug) => {
    expect(BUILTIN_SKILLS.find(s => s.slug === slug)).toBeDefined()
  })

  it('architecture-analysis should only be compatible with claude', () => {
    const skill = BUILTIN_SKILLS.find(s => s.slug === 'architecture-analysis')!
    expect(skill.compatibleCli).toEqual(['claude'])
  })

  it('other skills should be compatible with both claude and codex', () => {
    const others = BUILTIN_SKILLS.filter(s => s.slug !== 'architecture-analysis')
    for (const skill of others) {
      expect(skill.compatibleCli).toContain('claude')
      expect(skill.compatibleCli).toContain('codex')
    }
  })

  it('should have correct output formats', () => {
    const formats: Record<string, string> = {
      'code-review': 'markdown',
      'generate-tests': 'text',
      'explain-code': 'markdown',
      'fix-bug': 'diff',
      'architecture-analysis': 'markdown',
      'refactor': 'diff'
    }
    for (const [slug, format] of Object.entries(formats)) {
      const skill = BUILTIN_SKILLS.find(s => s.slug === slug)!
      expect(skill.outputSchema.format).toBe(format)
    }
  })

  it('should have valid categories', () => {
    const validCategories = ['开发', '审查', '测试', '分析']
    for (const skill of BUILTIN_SKILLS) {
      expect(validCategories).toContain(skill.category)
    }
  })

  it('generate-tests framework should default to vitest', () => {
    const skill = BUILTIN_SKILLS.find(s => s.slug === 'generate-tests')!
    const fw = skill.inputSchema.fields.find(f => f.name === 'framework')!
    expect(fw.default).toBe('vitest')
  })

  it('prompts should contain {{variable}} placeholders matching input fields', () => {
    for (const skill of BUILTIN_SKILLS) {
      const requiredFields = skill.inputSchema.fields.filter(f => f.required)
      for (const field of requiredFields) {
        expect(skill.prompt).toContain(`{{${field.name}}}`)
      }
    }
  })
})
