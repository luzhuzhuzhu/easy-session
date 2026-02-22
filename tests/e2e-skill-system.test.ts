import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Protocol } from '../src/main/services/protocol'
import { SessionOutputManager } from '../src/main/services/session-output'
import { registerSkillHandlers } from '../src/main/ipc/skill-handlers'
import type { Skill } from '../src/main/services/skill-types'

const { handlers, openPathMock, sendMock } = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  openPathMock: vi.fn().mockResolvedValue(''),
  sendMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }
  },
  shell: {
    openPath: openPathMock
  },
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: sendMock } }]
  }
}))

const sampleSkill: Skill = {
  id: 'claude:test-skill%2FSKILL.md',
  name: '代码审查',
  slug: 'code-review',
  description: '审查代码质量和可维护性',
  sourceCli: 'claude',
  filePath: '/tmp/.claude/skills/code-review/SKILL.md',
  compatibleCli: ['claude', 'codex'],
  inputSchema: {
    fields: [{ name: 'filePath', type: 'text', required: true, description: '目标文件' }]
  },
  outputSchema: { format: 'markdown' },
  prompt: '请审查 {{filePath}}',
  isBuiltin: true,
  category: '开发'
}

describe('skill system integration', () => {
  let skillManager: any
  let projectManager: any

  beforeEach(() => {
    handlers.clear()
    sendMock.mockClear()
    openPathMock.mockClear()

    skillManager = {
      listSkills: vi.fn().mockResolvedValue([sampleSkill]),
      getSkill: vi.fn().mockResolvedValue(sampleSkill),
      createSkill: vi.fn().mockResolvedValue(sampleSkill),
      deleteSkill: vi.fn().mockResolvedValue(true),
      executeSkill: vi.fn().mockResolvedValue({ success: true, prompt: '请审查 src/index.ts' }),
      renderPrompt: vi.fn().mockReturnValue('请审查 src/index.ts'),
      listProjectSkills: vi.fn().mockResolvedValue([sampleSkill]),
      deleteProjectSkill: vi.fn().mockResolvedValue(true)
    }

    projectManager = {
      getProject: vi.fn().mockImplementation((id: string) => {
        if (id === 'p1') return { id: 'p1', path: '/tmp/p1' }
        return null
      })
    }

    registerSkillHandlers(skillManager, projectManager)
  })

  it('protocol message can be formatted and parsed', () => {
    const request = Protocol.formatSkillRequest(sampleSkill, { filePath: 'src/index.ts' })
    const msg = Protocol.formatMessage(
      { role: 'orchestrator', cliType: 'claude' },
      { role: 'worker', cliType: 'codex' },
      'skill-request',
      request,
      sampleSkill.slug
    )

    const parsed = Protocol.parseMessage(msg)
    expect(parsed).not.toBeNull()
    expect(parsed!.type).toBe('skill-request')
    expect(parsed!.skill).toBe(sampleSkill.slug)
  })

  it('SessionOutputManager should forward protocol events', () => {
    const outputManager = new SessionOutputManager()
    const protocolMsg = Protocol.formatMessage(
      { role: 'leader', cliType: 'claude' },
      { role: 'worker', cliType: 'codex' },
      'skill-request',
      'review',
      'code-review'
    )

    outputManager.appendOutput('s1', protocolMsg, 'stdout')

    const calls = sendMock.mock.calls.filter((args: any[]) => args[0] === 'protocol:message')
    expect(calls).toHaveLength(1)
    expect(calls[0][1].message.skill).toBe('code-review')
  })

  it('should register skill handlers without edit channel', () => {
    const channels = [...handlers.keys()]

    expect(channels).toContain('skill:list')
    expect(channels).toContain('skill:get')
    expect(channels).toContain('skill:create')
    expect(channels).toContain('skill:delete')
    expect(channels).toContain('skill:execute')
    expect(channels).toContain('skill:preview')
    expect(channels).toContain('project:skill:list')
    expect(channels).toContain('project:skill:delete')
    expect(channels).toContain('project:skill:openPath')
    expect(channels).not.toContain('skill:update')
    expect(channels).not.toContain('project:skill:update')
  })

  it('skill:preview should return null when skill not found', async () => {
    skillManager.getSkill.mockResolvedValueOnce(undefined)
    const result = await handlers.get('skill:preview')!({}, 'missing', {})
    expect(result).toBeNull()
  })

  it('project handlers should use project path', async () => {
    await handlers.get('project:skill:list')!({}, 'p1')
    expect(skillManager.listProjectSkills).toHaveBeenCalledWith('/tmp/p1')

    await handlers.get('project:skill:delete')!({}, 'p1', 'skill-1')
    expect(skillManager.deleteProjectSkill).toHaveBeenCalledWith('/tmp/p1', 'skill-1')

    await handlers.get('project:skill:openPath')!({}, '/tmp/p1/.claude/skills/s1/SKILL.md')
    expect(openPathMock).toHaveBeenCalledWith('/tmp/p1/.claude/skills/s1')
  })
})
