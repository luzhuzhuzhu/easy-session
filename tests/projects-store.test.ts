import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const remoteInstanceApi = vi.hoisted(() => ({
  listRemoteInstances: vi.fn(async () => []),
  addRemoteInstance: vi.fn(),
  updateRemoteInstance: vi.fn(),
  removeRemoteInstance: vi.fn(),
  testRemoteInstance: vi.fn(),
  getRemoteInstanceToken: vi.fn(async () => null)
}))

const workspaceApi = vi.hoisted(() => ({
  getWorkspaceLayout: vi.fn(),
  updateWorkspaceLayout: vi.fn(async (layout) => layout),
  resetWorkspaceLayout: vi.fn()
}))

const sessionApi = vi.hoisted(() => ({
  listSessions: vi.fn(async () => []),
  onSessionStatusChange: vi.fn(() => () => {}),
  getSession: vi.fn(async () => null),
  getOutputHistory: vi.fn(async () => []),
  resizeTerminal: vi.fn(),
  onSessionOutput: vi.fn(() => () => {}),
  writeToSession: vi.fn(async () => true)
}))

const projectApi = vi.hoisted(() => ({
  listProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => null),
  addProject: vi.fn(),
  removeProject: vi.fn(),
  updateProject: vi.fn(),
  openProject: vi.fn(),
  selectFolder: vi.fn(async () => null),
  detectProject: vi.fn(),
  readProjectPrompt: vi.fn(),
  writeProjectPrompt: vi.fn(),
  getProjectSessions: vi.fn(async () => [])
}))

vi.mock('@/api/remote-instance', () => remoteInstanceApi)
vi.mock('@/api/workspace', () => workspaceApi)
vi.mock('@/api/session', () => sessionApi)
vi.mock('@/api/project', () => projectApi)
vi.mock('@/api/local-session', () => sessionApi)
vi.mock('@/api/local-project', () => projectApi)
vi.mock('../src/renderer/src/api/remote-instance', () => remoteInstanceApi)
vi.mock('../src/renderer/src/api/workspace', () => workspaceApi)
vi.mock('../src/renderer/src/api/session', () => sessionApi)
vi.mock('../src/renderer/src/api/project', () => projectApi)
vi.mock('../src/renderer/src/api/local-session', () => sessionApi)
vi.mock('../src/renderer/src/api/local-project', () => projectApi)

import { useInstancesStore } from '../src/renderer/src/stores/instances'
import { useProjectsStore } from '../src/renderer/src/stores/projects'
import { useSettingsStore } from '../src/renderer/src/stores/settings'
import { resetSharedGatewayResolver } from '../src/renderer/src/gateways'

describe('projects store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetSharedGatewayResolver()
    useSettingsStore().settings.desktopRemoteMountEnabled = true
  })

  it('keeps local project collections separate from remote project collections', () => {
    const store = useProjectsStore()

    store.projects = [
      {
        id: 'project-local',
        name: 'Local Project',
        path: 'D:/repo/local-project',
        createdAt: 1,
        lastOpenedAt: 20,
        pathExists: true
      }
    ]
    store.remoteProjectsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          projectId: 'project-remote',
          globalProjectKey: 'remote-1:project-remote',
          name: 'Remote Project',
          path: 'D:/repo/remote-project',
          createdAt: 2,
          lastOpenedAt: 30,
          pathExists: true,
          source: 'remote'
        }
      ]
    }

    expect(store.projects).toHaveLength(1)
    expect(store.recentProjects).toHaveLength(1)
    expect(store.recentProjects[0].id).toBe('project-local')
    expect(store.unifiedProjects.map((project) => project.globalProjectKey)).toEqual([
      'local:project-local',
      'remote-1:project-remote'
    ])
  })

  it('keeps quick access projects stable when remote instances become unavailable', () => {
    const instancesStore = useInstancesStore()
    instancesStore.remoteInstances = [
      {
        id: 'remote-1',
        type: 'remote',
        name: 'Office',
        baseUrl: 'https://example.com',
        enabled: true,
        authRef: 'remote-1',
        status: 'offline',
        lastCheckedAt: 123,
        passthroughOnly: false,
        capabilities: {
          projectsList: true,
          projectRead: true,
          projectCreate: true,
          projectUpdate: true,
          projectRemove: true,
          projectOpen: true,
          projectSessionsList: true,
          projectDetect: true,
          sessionsList: true,
          sessionSubscribe: true,
          sessionInput: true,
          sessionResize: true,
          sessionOutputHistory: true,
          sessionCreate: true,
          sessionStart: true,
          sessionPause: true,
          sessionRestart: true,
          sessionDestroy: true,
          projectPromptRead: true,
          projectPromptWrite: true,
          localPathOpen: false
        },
        lastError: 'gateway timeout',
        latencyMs: null
      }
    ]

    const store = useProjectsStore()
    store.projects = [
      {
        id: 'project-local',
        name: 'Local Project',
        path: 'D:/repo/local-project',
        createdAt: 1,
        lastOpenedAt: 50,
        pathExists: true
      }
    ]
    store.remoteProjectsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          projectId: 'project-remote',
          globalProjectKey: 'remote-1:project-remote',
          name: 'Remote Project',
          path: 'D:/repo/remote-project',
          createdAt: 2,
          lastOpenedAt: 300,
          pathExists: true,
          source: 'remote'
        }
      ]
    }

    expect(store.unifiedRecentProjects[0]?.globalProjectKey).toBe('remote-1:project-remote')
    expect(store.quickAccessProjectCount).toBe(1)
    expect(store.quickAccessRecentProjects.map((project) => project.globalProjectKey)).toEqual([
      'local:project-local'
    ])
    expect(store.unavailableRemoteProjectCount).toBe(1)
  })

  it('keeps local projects available when a remote instance fetch fails', async () => {
    projectApi.listProjects.mockResolvedValue([
      {
        id: 'project-local',
        name: 'Local Project',
        path: 'D:/repo/local-project',
        createdAt: 1,
        lastOpenedAt: 20,
        pathExists: true
      }
    ])

    const instancesStore = useInstancesStore()
    instancesStore.remoteInstances = [
      {
        id: 'remote-1',
        type: 'remote',
        name: 'Office',
        baseUrl: 'https://example.com',
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
        latencyMs: null
      }
    ]

    const store = useProjectsStore()
    const projects = await store.fetchAllProjects()

    expect(projectApi.listProjects).toHaveBeenCalledTimes(1)
    expect(remoteInstanceApi.getRemoteInstanceToken).toHaveBeenCalledWith('remote-1')
    expect(projects.map((project) => project.globalProjectKey)).toEqual(['local:project-local'])
    expect(store.remoteProjectsByInstance['remote-1']).toBeUndefined()
    expect(instancesStore.remoteInstanceIndex['remote-1']?.status).toBe('offline')
    expect(instancesStore.remoteInstanceIndex['remote-1']?.lastError).toBeTruthy()
  })

  it('creates remote projects through RemoteGateway and stores them by instance', async () => {
    remoteInstanceApi.getRemoteInstanceToken.mockResolvedValue('token-1')
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: 'project-remote',
            name: 'Remote Project',
            path: 'D:/repo/remote-project',
            createdAt: 2,
            lastOpenedAt: 30,
            pathExists: true
          },
          requestId: 'req-1'
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

    const instancesStore = useInstancesStore()
    instancesStore.remoteInstances = [
      {
        id: 'remote-1',
        type: 'remote',
        name: 'Office',
        baseUrl: 'https://example.com',
        enabled: true,
        authRef: 'remote-1',
        status: 'online',
        lastCheckedAt: null,
        passthroughOnly: false,
        capabilities: {
          projectsList: true,
          projectRead: true,
          projectCreate: true,
          projectUpdate: true,
          projectRemove: true,
          projectOpen: true,
          projectSessionsList: true,
          projectDetect: true,
          sessionsList: true,
          sessionSubscribe: true,
          sessionInput: true,
          sessionResize: true,
          sessionOutputHistory: true,
          sessionCreate: true,
          sessionStart: true,
          sessionPause: true,
          sessionRestart: true,
          sessionDestroy: true,
          projectPromptRead: true,
          projectPromptWrite: true,
          localPathOpen: false
        },
        lastError: null,
        latencyMs: null
      }
    ]

    const store = useProjectsStore()
    const created = await store.createProjectForInstance('remote-1', {
      path: 'D:/repo/remote-project',
      name: 'Remote Project'
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          path: 'D:/repo/remote-project',
          name: 'Remote Project'
        })
      })
    )
    expect(created.globalProjectKey).toBe('remote-1:project-remote')
    expect(store.remoteProjectsByInstance['remote-1']?.[0]?.globalProjectKey).toBe('remote-1:project-remote')
  })

  it('opens remote projects through openProjectRef and refreshes recent ordering safely', async () => {
    remoteInstanceApi.getRemoteInstanceToken.mockResolvedValue('token-1')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/projects/project-remote/open')) {
        expect(init?.method).toBe('POST')
        return new Response(
          JSON.stringify({
            data: {
              id: 'project-remote',
              name: 'Remote Project',
              path: 'D:/repo/remote-project',
              createdAt: 2,
              lastOpenedAt: 300,
              pathExists: true
            },
            requestId: 'req-open'
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      throw new Error(`Unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const instancesStore = useInstancesStore()
    instancesStore.remoteInstances = [
      {
        id: 'remote-1',
        type: 'remote',
        name: 'Office',
        baseUrl: 'https://example.com',
        enabled: true,
        authRef: 'remote-1',
        status: 'online',
        lastCheckedAt: null,
        passthroughOnly: false,
        capabilities: {
          projectsList: true,
          projectRead: true,
          projectCreate: true,
          projectUpdate: true,
          projectRemove: true,
          projectOpen: true,
          projectSessionsList: true,
          projectDetect: true,
          sessionsList: true,
          sessionSubscribe: true,
          sessionInput: true,
          sessionResize: true,
          sessionOutputHistory: true,
          sessionCreate: true,
          sessionStart: true,
          sessionPause: true,
          sessionRestart: true,
          sessionDestroy: true,
          projectPromptRead: true,
          projectPromptWrite: true,
          localPathOpen: false
        },
        lastError: null,
        latencyMs: null
      }
    ]

    const store = useProjectsStore()
    store.projects = [
      {
        id: 'project-local',
        name: 'Local Project',
        path: 'D:/repo/local-project',
        createdAt: 1,
        lastOpenedAt: 50,
        pathExists: true
      }
    ]
    store.remoteProjectsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          projectId: 'project-remote',
          globalProjectKey: 'remote-1:project-remote',
          name: 'Remote Project',
          path: 'D:/repo/remote-project',
          createdAt: 2,
          lastOpenedAt: 30,
          pathExists: true,
          source: 'remote'
        }
      ]
    }

    const opened = await store.openProjectRef({
      instanceId: 'remote-1',
      projectId: 'project-remote',
      globalProjectKey: 'remote-1:project-remote'
    })

    expect(opened?.lastOpenedAt).toBe(300)
    expect(store.unifiedRecentProjects[0]?.globalProjectKey).toBe('remote-1:project-remote')
    expect(store.activeGlobalProjectKey).toBe('remote-1:project-remote')
  })
})
