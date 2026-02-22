import { describe, it, expect } from 'vitest'
import { Protocol } from '../src/main/services/protocol'
import type { Skill } from '../src/main/services/skill-types'

describe('Protocol', () => {
  const from = { role: 'leader', cliType: 'claude' as const }
  const to = { role: 'worker', cliType: 'codex' as const }

  describe('formatMessage', () => {
    it('should format a basic message without skill', () => {
      const result = Protocol.formatMessage(from, to, 'command', 'hello world')
      expect(result).toBe(
        '[CCM-PROTOCOL v1]\n' +
        'FROM: leader (claude)\n' +
        'TO: worker (codex)\n' +
        'TYPE: command\n' +
        '---\n' +
        'hello world\n' +
        '---\n' +
        '[/CCM-PROTOCOL]'
      )
    })

    it('should include SKILL line when skill is provided', () => {
      const result = Protocol.formatMessage(from, to, 'skill-request', 'review this', 'code-review')
      expect(result).toContain('SKILL: code-review')
    })

    it('should not include SKILL line when skill is undefined', () => {
      const result = Protocol.formatMessage(from, to, 'command', 'test')
      expect(result).not.toContain('SKILL:')
    })
  })

  describe('parseMessage', () => {
    it('should parse a formatted message correctly', () => {
      const raw = Protocol.formatMessage(from, to, 'skill-request', 'content here', 'code-review')
      const parsed = Protocol.parseMessage(raw)
      expect(parsed).toEqual({
        from: { role: 'leader', cliType: 'claude' },
        to: { role: 'worker', cliType: 'codex' },
        type: 'skill-request',
        skill: 'code-review',
        content: 'content here'
      })
    })

    it('should parse message without skill field', () => {
      const raw = Protocol.formatMessage(from, to, 'notification', 'done')
      const parsed = Protocol.parseMessage(raw)
      expect(parsed).not.toBeNull()
      expect(parsed!.skill).toBeUndefined()
      expect(parsed!.content).toBe('done')
    })

    it('should return null for invalid input', () => {
      expect(Protocol.parseMessage('random text')).toBeNull()
      expect(Protocol.parseMessage('')).toBeNull()
    })

    it('should handle multiline content', () => {
      const raw = Protocol.formatMessage(from, to, 'result', 'line1\nline2\nline3')
      const parsed = Protocol.parseMessage(raw)
      expect(parsed!.content).toBe('line1\nline2\nline3')
    })
  })

  describe('isProtocolMessage', () => {
    it('should detect valid protocol messages', () => {
      const msg = Protocol.formatMessage(from, to, 'command', 'test')
      expect(Protocol.isProtocolMessage(msg)).toBe(true)
    })

    it('should reject non-protocol text', () => {
      expect(Protocol.isProtocolMessage('hello world')).toBe(false)
    })

    it('should reject partial protocol markers', () => {
      expect(Protocol.isProtocolMessage('[CCM-PROTOCOL v1] only start')).toBe(false)
    })
  })

  describe('formatSkillRequest', () => {
    const skill = {
      id: '1', name: '代码审查', slug: 'code-review',
      description: '', compatibleCli: ['claude' as const],
      inputSchema: { fields: [] }, outputSchema: { format: 'markdown' as const },
      prompt: '', isBuiltin: true, category: '审查'
    } satisfies Skill

    it('should format skill request with inputs', () => {
      const result = Protocol.formatSkillRequest(skill, { filePath: 'src/index.ts', context: 'security' })
      expect(result).toContain('Skill Request: 代码审查 (code-review)')
      expect(result).toContain('filePath: src/index.ts')
      expect(result).toContain('context: security')
    })
  })

  describe('formatSkillResult', () => {
    const skill = {
      id: '1', name: '代码审查', slug: 'code-review',
      description: '', compatibleCli: ['claude' as const],
      inputSchema: { fields: [] }, outputSchema: { format: 'markdown' as const },
      prompt: '', isBuiltin: true, category: '审查'
    } satisfies Skill

    it('should format skill result', () => {
      const result = Protocol.formatSkillResult(skill, '## 审查结果\n没有问题')
      expect(result).toContain('Skill Result: 代码审查 (code-review)')
      expect(result).toContain('Format: markdown')
      expect(result).toContain('## 审查结果\n没有问题')
    })
  })

  describe('roundtrip', () => {
    it('should roundtrip format and parse for all message types', () => {
      const types = ['skill-request', 'skill-result', 'notification', 'command', 'result'] as const
      for (const type of types) {
        const raw = Protocol.formatMessage(from, to, type, `content for ${type}`, 'test-skill')
        const parsed = Protocol.parseMessage(raw)
        expect(parsed).not.toBeNull()
        expect(parsed!.type).toBe(type)
        expect(parsed!.content).toBe(`content for ${type}`)
      }
    })
  })
})
