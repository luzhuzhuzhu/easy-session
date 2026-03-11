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
vi.mock('../src/renderer/src/api/local-session', () => sessionApi)
vi.mock('../src/renderer/src/api/local-project', () => projectApi)

import { useInstancesStore } from '../src/renderer/src/stores/instances'
import { useSessionsStore } from '../src/renderer/src/stores/sessions'
import { useSettingsStore } from '../src/renderer/src/stores/settings'
import { useWorkspaceStore } from '../src/renderer/src/stores/workspace'

describe('workspace store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useSettingsStore().settings.desktopRemoteMountEnabled = true
    workspaceApi.getWorkspaceLayout.mockReset()
    workspaceApi.updateWorkspaceLayout.mockClear()
    workspaceApi.resetWorkspaceLayout.mockClear()
    remoteInstanceApi.listRemoteInstances.mockResolvedValue([])
  })

  it('normalizes loaded legacy-like tabs to local session refs', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 1,
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: 'tab-1',
        tabs: ['tab-1']
      },
      tabs: {
        'tab-1': {
          id: 'tab-1',
          sessionId: 'session-1',
          pinned: false,
          createdAt: 1
        }
      },
      activePaneId: 'pane-1'
    })

    const store = useWorkspaceStore()
    await store.load()

    expect(store.layout.version).toBe(2)
    expect(store.layout.tabs['tab-1']).toMatchObject({
      instanceId: 'local',
      sessionId: 'session-1',
      globalSessionKey: 'local:session-1'
    })
    expect(store.activeSessionRef).toEqual({
      instanceId: 'local',
      sessionId: 'session-1',
      globalSessionKey: 'local:session-1'
    })
  })

  it('creates local global session key when opening session in active pane', async () => {
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

    const store = useWorkspaceStore()
    await store.load()
    store.openSessionInActivePane('session-2')

    const tabId = store.layout.root.type === 'leaf' ? store.layout.root.activeTabId : null
    expect(tabId).toBeTruthy()
    expect(store.activeGlobalSessionKey).toBe('local:session-2')
    expect(tabId ? store.layout.tabs[tabId] : null).toMatchObject({
      instanceId: 'local',
      sessionId: 'session-2',
      globalSessionKey: 'local:session-2'
    })
  })

  it('preserves remote tabs for offline instances during reconcile', async () => {
    remoteInstanceApi.listRemoteInstances.mockResolvedValue([
      {
        id: 'remote-1',
        type: 'remote',
        name: 'office',
        baseUrl: 'https://example.com',
        enabled: true,
        authRef: 'remote-1',
        status: 'offline',
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
        lastError: 'offline',
        latencyMs: null
      }
    ])

    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: 'tab-remote',
        tabs: ['tab-remote']
      },
      tabs: {
        'tab-remote': {
          id: 'tab-remote',
          resourceType: 'session',
          instanceId: 'remote-1',
          sessionId: 'session-9',
          globalSessionKey: 'remote-1:session-9',
          pinned: false,
          createdAt: 1
        }
      },
      activePaneId: 'pane-1'
    })

    const instancesStore = useInstancesStore()
    await instancesStore.fetchInstances()

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()

    expect(workspaceStore.resolvedTabs['tab-remote']?.availability).toBe('offline')

    workspaceStore.reconcileSessionRefs([], {
      preserveInstanceIds: ['remote-1']
    })

    expect(workspaceStore.layout.tabs['tab-remote']).toBeTruthy()
    expect(workspaceStore.resolvedTabs['tab-remote']?.availability).toBe('offline')
  })

  it('restores remote tab availability after instance comes back online', async () => {
    remoteInstanceApi.listRemoteInstances.mockResolvedValue([
      {
        id: 'remote-1',
        type: 'remote',
        name: 'office',
        baseUrl: 'https://example.com',
        enabled: true,
        authRef: 'remote-1',
        status: 'offline',
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
        lastError: 'offline',
        latencyMs: null
      }
    ])

    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: 'tab-remote',
        tabs: ['tab-remote']
      },
      tabs: {
        'tab-remote': {
          id: 'tab-remote',
          resourceType: 'session',
          instanceId: 'remote-1',
          sessionId: 'session-9',
          globalSessionKey: 'remote-1:session-9',
          pinned: false,
          createdAt: 1
        }
      },
      activePaneId: 'pane-1'
    })

    const instancesStore = useInstancesStore()
    await instancesStore.fetchInstances()

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()

    expect(workspaceStore.resolvedTabs['tab-remote']?.availability).toBe('offline')

    instancesStore.remoteInstances = instancesStore.remoteInstances.map((instance) =>
      instance.id === 'remote-1'
        ? {
            ...instance,
            status: 'online',
            lastError: null
          }
        : instance
    )

    const sessionsStore = useSessionsStore()
    sessionsStore.remoteSessionsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          sessionId: 'session-9',
          globalSessionKey: 'remote-1:session-9',
          name: 'Recovered Session',
          icon: null,
          type: 'claude',
          projectId: 'project-1',
          projectPath: 'D:/remote/project',
          status: 'running',
          createdAt: 1,
          lastActiveAt: 2,
          processId: 'proc-9',
          options: {},
          parentId: null,
          source: 'remote'
        }
      ]
    }

    expect(workspaceStore.layout.tabs['tab-remote']).toBeTruthy()
    expect(workspaceStore.resolvedTabs['tab-remote']?.availability).toBe('ready')
    expect(workspaceStore.resolvedTabs['tab-remote']?.sessionRef).toEqual({
      instanceId: 'remote-1',
      sessionId: 'session-9',
      globalSessionKey: 'remote-1:session-9'
    })
  })

  it('keeps remote tabs offline when desktop remote mount feature is disabled', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.settings.desktopRemoteMountEnabled = false

    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: 'tab-remote',
        tabs: ['tab-remote']
      },
      tabs: {
        'tab-remote': {
          id: 'tab-remote',
          resourceType: 'session',
          instanceId: 'remote-1',
          sessionId: 'session-9',
          globalSessionKey: 'remote-1:session-9',
          pinned: false,
          createdAt: 1
        }
      },
      activePaneId: 'pane-1'
    })

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()

    expect(workspaceStore.resolvedTabs['tab-remote']?.availability).toBe('offline')
  })
})
