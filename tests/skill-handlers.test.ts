import { describe, it, expect, vi, beforeEach } from 'vitest'

const { handlers, openPathMock } = vi.hoisted(() => ({
  handlers: new Map<string, Function>(),
  openPathMock: vi.fn().mockResolvedValue('')
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }
  },
  shell: {
    openPath: openPathMock
  }
}))

import { registerSkillHandlers } from '../src/main/ipc/skill-handlers'
import type { Skill } from '../src/main/services/skill-types'

const mockSkill: Skill = {
  id: 'test-id',
  name: '测试 Skill',
  slug: 'test-skill',
  description: '测试用途',
  compatibleCli: ['claude'],
  inputSchema: { fields: [{ name: 'file', type: 'text', required: true, description: '文件路径' }] },
  outputSchema: { format: 'text' },
  prompt: '处理 {{file}}',
  isBuiltin: false,
  sourceCli: 'claude',
  filePath: '/tmp/.claude/skills/test-skill/SKILL.md',
  category: '开发'
}

describe('skill-handlers', () => {
  let skillManager: any
  let projectManager: any

  beforeEach(() => {
    handlers.clear()
    openPathMock.mockClear()

    skillManager = {
      listSkills: vi.fn().mockResolvedValue([mockSkill]),
      getSkill: vi.fn().mockResolvedValue(mockSkill),
      createSkill: vi.fn().mockResolvedValue(mockSkill),
      deleteSkill: vi.fn().mockResolvedValue(true),
      executeSkill: vi.fn().mockResolvedValue({ success: true, prompt: '处理 src/index.ts' }),
      renderPrompt: vi.fn().mockReturnValue('处理 src/index.ts'),
      listProjectSkills: vi.fn().mockResolvedValue([mockSkill]),
      deleteProjectSkill: vi.fn().mockResolvedValue(true)
    }

    projectManager = {
      getProject: vi.fn().mockReturnValue({ id: 'project-1', path: '/tmp/project-1' })
    }

    registerSkillHandlers(skillManager, projectManager)
  })

  it('should register expected IPC handlers', () => {
    const expected = [
      'skill:list',
      'skill:get',
      'skill:create',
      'skill:delete',
      'skill:execute',
      'skill:preview',
      'project:skill:list',
      'project:skill:delete',
      'project:skill:openPath'
    ]

    for (const channel of expected) {
      expect(handlers.has(channel)).toBe(true)
    }
    expect(handlers.size).toBe(expected.length)
  })

  it('skill:list should call listSkills with filter', async () => {
    const filter = { category: '开发' }
    await handlers.get('skill:list')!({}, filter)
    expect(skillManager.listSkills).toHaveBeenCalledWith(filter)
  })

  it('skill:get should call getSkill with id', async () => {
    await handlers.get('skill:get')!({}, 'test-id')
    expect(skillManager.getSkill).toHaveBeenCalledWith('test-id')
  })

  it('skill:create should call createSkill', async () => {
    const { id, isBuiltin, sourceCli, filePath, ...data } = mockSkill
    void id
    void isBuiltin
    void sourceCli
    void filePath

    await handlers.get('skill:create')!({}, data)
    expect(skillManager.createSkill).toHaveBeenCalledWith(data)
  })

  it('skill:delete should call deleteSkill with id', async () => {
    await handlers.get('skill:delete')!({}, 'test-id')
    expect(skillManager.deleteSkill).toHaveBeenCalledWith('test-id')
  })

  it('skill:execute should call executeSkill with expected args', async () => {
    await handlers.get('skill:execute')!({}, 'test-id', 'session-1', { file: 'src/index.ts' })
    expect(skillManager.executeSkill).toHaveBeenCalledWith('test-id', 'session-1', { file: 'src/index.ts' })
  })

  it('skill:preview should return rendered prompt', async () => {
    const result = await handlers.get('skill:preview')!({}, 'test-id', { file: 'src/index.ts' })
    expect(skillManager.getSkill).toHaveBeenCalledWith('test-id')
    expect(skillManager.renderPrompt).toHaveBeenCalledWith(mockSkill, { file: 'src/index.ts' })
    expect(result).toBe('处理 src/index.ts')
  })

  it('skill:preview should return null for non-existent skill', async () => {
    skillManager.getSkill.mockResolvedValue(undefined)
    const result = await handlers.get('skill:preview')!({}, 'non-existent', {})
    expect(result).toBeNull()
  })

  it('project:skill:list should use project path', async () => {
    await handlers.get('project:skill:list')!({}, 'project-1')
    expect(projectManager.getProject).toHaveBeenCalledWith('project-1')
    expect(skillManager.listProjectSkills).toHaveBeenCalledWith('/tmp/project-1')
  })

  it('project:skill:delete should call deleteProjectSkill', async () => {
    await handlers.get('project:skill:delete')!({}, 'project-1', 'test-id')
    expect(skillManager.deleteProjectSkill).toHaveBeenCalledWith('/tmp/project-1', 'test-id')
  })

  it('project:skill:openPath should open parent directory', async () => {
    await handlers.get('project:skill:openPath')!({}, '/tmp/project-1/.claude/skills/s1/SKILL.md')
    expect(openPathMock).toHaveBeenCalledWith('/tmp/project-1/.claude/skills/s1')
  })
})
