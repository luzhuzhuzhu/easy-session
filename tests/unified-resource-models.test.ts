import { describe, expect, it } from 'vitest'
import {
  LOCAL_INSTANCE_ID,
  buildGlobalProjectKey,
  buildGlobalSessionKey,
  buildLocalInstance,
  toUnifiedProject,
  toUnifiedSession
} from '../src/renderer/src/models/unified-resource'

describe('unified resource models', () => {
  it('builds stable global keys', () => {
    expect(buildGlobalProjectKey('remote-1', 'project-1')).toBe('remote-1:project-1')
    expect(buildGlobalSessionKey('remote-1', 'session-1')).toBe('remote-1:session-1')
  })

  it('builds local instance with full capabilities', () => {
    const instance = buildLocalInstance(process.platform)

    expect(instance.id).toBe(LOCAL_INSTANCE_ID)
    expect(instance.type).toBe('local')
    expect(instance.status).toBe('online')
    expect(instance.capabilities.sessionCreate).toBe(true)
    expect(instance.capabilities.projectPromptWrite).toBe(true)
  })

  it('maps local project and session to unified shapes', () => {
    const project = toUnifiedProject({
      id: 'project-1',
      name: 'demo',
      path: 'D:/repo/demo',
      createdAt: 1,
      lastOpenedAt: 2,
      pathExists: true
    })
    const session = toUnifiedSession({
      id: 'session-1',
      name: 'Claude-001',
      icon: null,
      type: 'claude',
      projectPath: 'D:/repo/demo',
      status: 'running',
      createdAt: 1,
      lastStartAt: 2,
      totalRunMs: 3,
      lastRunMs: 4,
      lastActiveAt: 5,
      processId: 'proc-1',
      options: {},
      parentId: null,
      claudeSessionId: 'claude-1',
      projectId: 'project-1'
    })

    expect(project.instanceId).toBe(LOCAL_INSTANCE_ID)
    expect(project.globalProjectKey).toBe('local:project-1')
    expect(session.instanceId).toBe(LOCAL_INSTANCE_ID)
    expect(session.sessionId).toBe('session-1')
    expect(session.globalSessionKey).toBe('local:session-1')
    expect(session.projectId).toBe('project-1')
    expect(session.source).toBe('local')
  })
})
