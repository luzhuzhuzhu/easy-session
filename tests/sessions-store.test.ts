import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const workspaceApi = vi.hoisted(() => ({
  getWorkspaceLayout: vi.fn(),
  updateWorkspaceLayout: vi.fn(async (layout) => layout),
  resetWorkspaceLayout: vi.fn(async () => ({
    version: 2,
    root: {
      type: 'leaf',
      paneId: 'pane-1',
      activeTabId: null,
      tabs: []
    },
    tabs: {},
    activePaneId: 'pane-1'
  }))
}))

const remoteInstanceApi = vi.hoisted(() => ({
  listRemoteInstances: vi.fn(async () => []),
  addRemoteInstance: vi.fn(),
  updateRemoteInstance: vi.fn(),
  removeRemoteInstance: vi.fn(),
  testRemoteInstance: vi.fn(),
  getRemoteInstanceToken: vi.fn(async () => null)
}))

const sessionApi = vi.hoisted(() => ({
  createSession: vi.fn(),
  destroySession: vi.fn(),
  listSessions: vi.fn(async () => []),
  sendInput: vi.fn(),
  clearOutput: vi.fn(),
  renameSession: vi.fn(),
  updateSessionIcon: vi.fn(),
  restartSession: vi.fn(),
  startSession: vi.fn(),
  pauseSession: vi.fn(),
  onSessionStatusChange: vi.fn(() => () => {}),
  getSession: vi.fn(async () => null),
  getOutputHistory: vi.fn(async () => []),
  resizeTerminal: vi.fn(),
  writeToSession: vi.fn(async () => true),
  onSessionOutput: vi.fn(() => () => {})
}))

const projectApi = vi.hoisted(() => ({
  listProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => null),
  selectFolder: vi.fn(async () => null),
  detectProject: vi.fn(),
  readProjectPrompt: vi.fn(),
  writeProjectPrompt: vi.fn(),
  getProjectSessions: vi.fn(async () => [])
}))

vi.mock('@/api/workspace', () => workspaceApi)
vi.mock('@/api/remote-instance', () => remoteInstanceApi)
vi.mock('@/api/session', () => sessionApi)
vi.mock('@/api/project', () => projectApi)
vi.mock('@/api/local-session', () => sessionApi)
vi.mock('@/api/local-project', () => projectApi)
vi.mock('../src/renderer/src/api/workspace', () => workspaceApi)
vi.mock('../src/renderer/src/api/remote-instance', () => remoteInstanceApi)
vi.mock('../src/renderer/src/api/session', () => sessionApi)
vi.mock('../src/renderer/src/api/project', () => projectApi)
vi.mock('../src/renderer/src/api/local-session', () => sessionApi)
vi.mock('../src/renderer/src/api/local-project', () => projectApi)

import { useInstancesStore } from '../src/renderer/src/stores/instances'
import { useSessionsStore } from '../src/renderer/src/stores/sessions'
import { useSettingsStore } from '../src/renderer/src/stores/settings'
import { useWorkspaceStore } from '../src/renderer/src/stores/workspace'
import { resetSharedGatewayResolver } from '../src/renderer/src/gateways'

describe('sessions store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    resetSharedGatewayResolver()
    useSettingsStore().settings.desktopRemoteMountEnabled = true
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: null,
        tabs: []
      },
      tabs: {},
      activePaneId: 'pane-1'
    })
    vi.unstubAllGlobals()
  })

  it('isolates same sessionId across multiple remote instances by globalSessionKey', () => {
    const store = useSessionsStore()

    store.remoteSessionsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          sessionId: 'same-session',
          globalSessionKey: 'remote-1:same-session',
          name: 'Remote One',
          icon: null,
          type: 'claude',
          projectId: 'project-1',
          projectPath: 'D:/remote-1/project',
          status: 'running',
          createdAt: 1,
          lastActiveAt: 2,
          processId: 'proc-1',
          options: {},
          parentId: null,
          source: 'remote'
        }
      ],
      'remote-2': [
        {
          instanceId: 'remote-2',
          sessionId: 'same-session',
          globalSessionKey: 'remote-2:same-session',
          name: 'Remote Two',
          icon: null,
          type: 'codex',
          projectId: 'project-2',
          projectPath: 'D:/remote-2/project',
          status: 'idle',
          createdAt: 3,
          lastActiveAt: 4,
          processId: null,
          options: {},
          parentId: null,
          source: 'remote'
        }
      ]
    }

    expect(store.sessionIndexByGlobalKey['remote-1:same-session']?.name).toBe('Remote One')
    expect(store.sessionIndexByGlobalKey['remote-2:same-session']?.name).toBe('Remote Two')

    store.setActiveSessionRef({
      instanceId: 'remote-2',
      sessionId: 'same-session',
      globalSessionKey: 'remote-2:same-session'
    })

    expect(store.activeGlobalSessionKey).toBe('remote-2:same-session')
    expect(store.activeUnifiedSession?.name).toBe('Remote Two')
  })

  it('keeps local sessions available when a remote instance fetch fails', async () => {
    sessionApi.listSessions.mockResolvedValue([
      {
        id: 'session-local',
        name: 'Local Session',
        icon: null,
        type: 'claude',
        projectPath: 'D:/repo/local-project',
        status: 'running',
        createdAt: 10,
        lastActiveAt: 20,
        processId: 'proc-1',
        options: {},
        parentId: null
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

    const store = useSessionsStore()
    const sessions = await store.fetchAllSessions()

    expect(sessionApi.listSessions).toHaveBeenCalledTimes(1)
    expect(remoteInstanceApi.getRemoteInstanceToken).toHaveBeenCalledWith('remote-1')
    expect(sessions.map((session) => session.globalSessionKey)).toEqual(['local:session-local'])
    expect(store.remoteSessionsByInstance['remote-1']).toBeUndefined()
    expect(instancesStore.remoteInstanceIndex['remote-1']?.status).toBe('offline')
    expect(instancesStore.remoteInstanceIndex['remote-1']?.lastError).toBeTruthy()
  })

  it('routes remote lifecycle operations through RemoteGateway and updates remote session state', async () => {
    remoteInstanceApi.getRemoteInstanceToken.mockResolvedValue('token-1')
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: 'session-remote',
            name: 'Remote Session',
            icon: null,
            type: 'claude',
            projectId: 'project-1',
            projectPath: 'D:/repo/remote-project',
            status: 'running',
            createdAt: 1,
            lastActiveAt: 20,
            processId: 'proc-1',
            options: {},
            parentId: null
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

    const store = useSessionsStore()
    store.remoteSessionsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          sessionId: 'session-remote',
          globalSessionKey: 'remote-1:session-remote',
          name: 'Remote Session',
          icon: null,
          type: 'claude',
          projectId: 'project-1',
          projectPath: 'D:/repo/remote-project',
          status: 'idle',
          createdAt: 1,
          lastActiveAt: 10,
          processId: null,
          options: {},
          parentId: null,
          source: 'remote'
        }
      ]
    }

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()
    workspaceStore.openSessionRefInActivePane({
      instanceId: 'remote-1',
      sessionId: 'session-remote',
      globalSessionKey: 'remote-1:session-remote'
    })

    await store.startSessionRef({
      instanceId: 'remote-1',
      sessionId: 'session-remote',
      globalSessionKey: 'remote-1:session-remote'
    })

    expect(remoteInstanceApi.getRemoteInstanceToken).toHaveBeenCalledWith('remote-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/sessions/session-remote/start',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-1'
        })
      })
    )
    expect(store.remoteSessionsByInstance['remote-1']?.[0]?.status).toBe('running')
    expect(workspaceStore.activeSessionRef).toEqual({
      instanceId: 'remote-1',
      sessionId: 'session-remote',
      globalSessionKey: 'remote-1:session-remote'
    })
  })

  it('creates remote sessions through RemoteGateway and stores them by instance', async () => {
    remoteInstanceApi.getRemoteInstanceToken.mockResolvedValue('token-1')
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            id: 'session-created',
            name: 'Created Remote Session',
            icon: '🤖',
            type: 'claude',
            projectId: 'project-1',
            projectPath: 'D:/repo/remote-project',
            status: 'idle',
            createdAt: 1,
            lastActiveAt: 1,
            processId: null,
            options: {},
            parentId: null
          },
          requestId: 'req-2'
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

    const store = useSessionsStore()
    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()
    const created = await store.createSessionForInstance('remote-1', {
      type: 'claude',
      projectId: 'project-1',
      projectPath: 'D:/repo/remote-project',
      name: 'Created Remote Session'
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          type: 'claude',
          projectId: 'project-1',
          projectPath: 'D:/repo/remote-project',
          name: 'Created Remote Session'
        })
      })
    )
    expect(created.globalSessionKey).toBe('remote-1:session-created')
    expect(store.remoteSessionsByInstance['remote-1']?.[0]?.globalSessionKey).toBe('remote-1:session-created')
    expect(store.activeGlobalSessionKey).toBe('remote-1:session-created')
    expect(workspaceStore.activeSessionRef).toEqual({
      instanceId: 'remote-1',
      sessionId: 'session-created',
      globalSessionKey: 'remote-1:session-created'
    })
  })

  it('reconciles workspace and active session when destroying a remote active session', async () => {
    remoteInstanceApi.getRemoteInstanceToken.mockResolvedValue('token-1')
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            deleted: true
          },
          requestId: 'req-3'
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

    const store = useSessionsStore()
    store.remoteSessionsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          sessionId: 'session-remote-1',
          globalSessionKey: 'remote-1:session-remote-1',
          name: 'Remote Session One',
          icon: null,
          type: 'claude',
          projectId: 'project-1',
          projectPath: 'D:/repo/remote-project',
          status: 'running',
          createdAt: 1,
          lastActiveAt: 10,
          processId: 'proc-1',
          options: {},
          parentId: null,
          source: 'remote'
        },
        {
          instanceId: 'remote-1',
          sessionId: 'session-remote-2',
          globalSessionKey: 'remote-1:session-remote-2',
          name: 'Remote Session Two',
          icon: null,
          type: 'claude',
          projectId: 'project-1',
          projectPath: 'D:/repo/remote-project',
          status: 'idle',
          createdAt: 2,
          lastActiveAt: 11,
          processId: null,
          options: {},
          parentId: null,
          source: 'remote'
        }
      ]
    }

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()
    workspaceStore.openSessionRefInActivePane({
      instanceId: 'remote-1',
      sessionId: 'session-remote-1',
      globalSessionKey: 'remote-1:session-remote-1'
    })

    store.setActiveSessionRef({
      instanceId: 'remote-1',
      sessionId: 'session-remote-1',
      globalSessionKey: 'remote-1:session-remote-1'
    })

    await store.destroySessionRef({
      instanceId: 'remote-1',
      sessionId: 'session-remote-1',
      globalSessionKey: 'remote-1:session-remote-1'
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/api/sessions/session-remote-1',
      expect.objectContaining({
        method: 'DELETE'
      })
    )
    expect(store.remoteSessionsByInstance['remote-1']?.map((session) => session.globalSessionKey)).toEqual([
      'remote-1:session-remote-2'
    ])
    expect(store.activeSessionRef).toEqual({
      instanceId: 'remote-1',
      sessionId: 'session-remote-2',
      globalSessionKey: 'remote-1:session-remote-2'
    })
    expect(workspaceStore.activeSessionRef).toEqual({
      instanceId: 'remote-1',
      sessionId: 'session-remote-2',
      globalSessionKey: 'remote-1:session-remote-2'
    })
  })
})
