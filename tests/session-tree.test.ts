import { describe, expect, it } from 'vitest'
import {
  buildInstanceTree,
  buildProjectGroupKey,
  buildProjectSessionTree,
  type ProjectMeta,
  type SessionTreeSessionItem
} from '../src/renderer/src/features/sessions/session-tree'
import { buildLocalInstance, type RemoteInstance } from '../src/renderer/src/models/unified-resource'

function createRemoteInstance(partial: Partial<RemoteInstance> = {}): RemoteInstance {
  return {
    id: 'remote-1',
    type: 'remote',
    name: 'office',
    baseUrl: 'https://remote.example.com',
    enabled: true,
    authRef: 'remote-1',
    status: 'online',
    lastCheckedAt: null,
    passthroughOnly: true,
    capabilities: {
      projectsList: true,
      projectRead: true,
      projectCreate: false,
      projectUpdate: false,
      projectRemove: false,
      projectOpen: false,
      projectSessionsList: true,
      projectDetect: true,
      sessionsList: true,
      sessionSubscribe: true,
      sessionInput: true,
      sessionResize: true,
      sessionOutputHistory: true,
      sessionCreate: false,
      sessionStart: false,
      sessionPause: false,
      sessionRestart: false,
      sessionDestroy: false,
      projectPromptRead: false,
      projectPromptWrite: false,
      localPathOpen: false
    },
    lastError: null,
    latencyMs: null,
    ...partial
  }
}

function createSession(overrides: Partial<SessionTreeSessionItem>): SessionTreeSessionItem {
  return {
    id: 'local:session-1',
    instanceId: 'local',
    sessionId: 'session-1',
    globalSessionKey: 'local:session-1',
    name: 'Session One',
    icon: null,
    type: 'claude',
    projectId: 'project-1',
    projectPath: 'D:/repo/local-project',
    status: 'running',
    createdAt: 1,
    lastActiveAt: 2,
    processId: 'proc-1',
    options: {},
    parentId: null,
    source: 'local',
    ...overrides
  }
}

describe('session tree helpers', () => {
  it('hides local-only project actions for remote groups while keeping local project actions available', () => {
    const localInstance = buildLocalInstance('win32')
    const remoteInstance = createRemoteInstance()
    const localKey = buildProjectGroupKey('local', 'D:/repo/local-project', 'win32')
    const remoteKey = buildProjectGroupKey('remote-1', 'D:/repo/remote-project', 'win32')

    const sortedProjects: ProjectMeta[] = [
      {
        globalProjectKey: 'local:project-1',
        projectId: 'project-1',
        instanceId: 'local',
        name: 'Local Project',
        path: 'D:/repo/local-project',
        lastOpenedAt: 20,
        source: 'local'
      },
      {
        globalProjectKey: 'remote-1:project-9',
        projectId: 'project-9',
        instanceId: 'remote-1',
        name: 'Remote Project',
        path: 'D:/repo/remote-project',
        lastOpenedAt: 10,
        source: 'remote'
      }
    ]

    const tree = buildProjectSessionTree({
      filteredSessions: [
        createSession({ id: 'local:session-1' }),
        createSession({
          id: 'remote-1:session-9',
          instanceId: 'remote-1',
          sessionId: 'session-9',
          globalSessionKey: 'remote-1:session-9',
          name: 'Remote Session',
          projectId: 'project-9',
          projectPath: 'D:/repo/remote-project',
          source: 'remote',
          processId: 'proc-9'
        })
      ],
      sortedProjects,
      projectByKey: new Map([
        [localKey, sortedProjects[0]],
        [remoteKey, sortedProjects[1]]
      ]),
      instancesById: {
        local: localInstance,
        'remote-1': remoteInstance
      },
      includeEmptyProjects: true,
      smartSessionsEnabled: false,
      smartProjectsEnabled: false,
      mode: 'balanced',
      now: 100,
      manualSessionOrder: {},
      manualProjectOrder: [],
      unmanagedProjectLabel: '未归档项目'
    })

    const localGroup = tree.find((group) => group.instanceId === 'local')
    const remoteGroup = tree.find((group) => group.instanceId === 'remote-1')

    expect(localGroup?.canCreateSession).toBe(true)
    expect(localGroup?.canOpenProjectDetail).toBe(true)
    expect(localGroup?.canOpenLocalProject).toBe(true)
    expect(remoteGroup?.canCreateSession).toBe(false)
    expect(remoteGroup?.canOpenProjectDetail).toBe(true)
    expect(remoteGroup?.canOpenLocalProject).toBe(false)
    expect(remoteGroup?.instanceLatencyMs).toBeNull()
    expect(remoteGroup?.instanceLastError).toBeNull()
  })

  it('allows remote project groups to expose create action when remote sessionCreate is enabled', () => {
    const localInstance = buildLocalInstance('win32')
    const remoteInstance = createRemoteInstance({
      passthroughOnly: false,
      capabilities: {
        ...createRemoteInstance().capabilities,
        sessionCreate: true
      }
    })
    const remoteKey = buildProjectGroupKey('remote-1', 'D:/repo/remote-project', 'win32')
    const remoteProject: ProjectMeta = {
      globalProjectKey: 'remote-1:project-9',
      projectId: 'project-9',
      instanceId: 'remote-1',
      name: 'Remote Project',
      path: 'D:/repo/remote-project',
      lastOpenedAt: 10,
      source: 'remote'
    }

    const tree = buildProjectSessionTree({
      filteredSessions: [],
      sortedProjects: [remoteProject],
      projectByKey: new Map([[remoteKey, remoteProject]]),
      instancesById: {
        local: localInstance,
        'remote-1': remoteInstance
      },
      includeEmptyProjects: true,
      smartSessionsEnabled: false,
      smartProjectsEnabled: false,
      mode: 'balanced',
      now: 100,
      manualSessionOrder: {},
      manualProjectOrder: [],
      unmanagedProjectLabel: '未归档项目'
    })

    expect(tree[0]?.instanceId).toBe('remote-1')
    expect(tree[0]?.canCreateSession).toBe(true)
  })

  it('keeps local instance first when building the instance tree', () => {
    const localInstance = buildLocalInstance('win32')
    const remoteA = createRemoteInstance({ id: 'remote-a', name: 'A remote' })
    const remoteB = createRemoteInstance({
      id: 'remote-b',
      name: 'B remote',
      lastError: 'last failure',
      latencyMs: 420,
      lastCheckedAt: 99
    })

    const instanceTree = buildInstanceTree(
      [remoteB, localInstance, remoteA],
      [
        {
          key: 'local-group',
          instanceId: 'local',
          instanceName: '本机',
          instanceType: 'local',
          instanceStatus: 'online',
          instanceLastError: null,
          instanceLatencyMs: null,
          instanceLastCheckedAt: null,
          projectId: 'project-1',
          projectName: 'Local Project',
          projectPath: 'D:/repo/local-project',
          sessions: [createSession({ id: 'local:session-1' })],
          canCreateSession: true,
          canOpenProjectDetail: true,
          canOpenLocalProject: true
        },
        {
          key: 'remote-group',
          instanceId: 'remote-b',
          instanceName: 'B remote',
          instanceType: 'remote',
          instanceStatus: 'online',
          instanceLastError: 'last failure',
          instanceLatencyMs: 420,
          instanceLastCheckedAt: 99,
          projectId: 'project-9',
          projectName: 'Remote Project',
          projectPath: 'D:/repo/remote-project',
          sessions: [
            createSession({
              id: 'remote-b:session-9',
              instanceId: 'remote-b',
              sessionId: 'session-9',
              globalSessionKey: 'remote-b:session-9',
              projectId: 'project-9',
              projectPath: 'D:/repo/remote-project',
              source: 'remote'
            })
          ],
          canCreateSession: false,
          canOpenProjectDetail: true,
          canOpenLocalProject: false
        }
      ]
    )

    expect(instanceTree.map((group) => group.instanceId)).toEqual(['local', 'remote-a', 'remote-b'])
    expect(instanceTree[0].sessionCount).toBe(1)
    expect(instanceTree[2].sessionCount).toBe(1)
    expect(instanceTree[2].instanceLastError).toBe('last failure')
    expect(instanceTree[2].instanceLatencyMs).toBe(420)
    expect(instanceTree[2].instanceLastCheckedAt).toBe(99)
  })
})
