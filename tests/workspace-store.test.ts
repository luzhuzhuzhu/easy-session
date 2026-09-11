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
import type { WorkspaceLayoutState } from '../src/renderer/src/api/workspace'

function leaf(paneId: string, tabs: string[] = [], activeTabId: string | null = tabs[0] ?? null) {
  return { type: 'leaf' as const, paneId, tabs, activeTabId }
}

function sessionTab(id: string, sessionId: string, pinned = false) {
  return { id, resourceType: 'session' as const, instanceId: 'local', sessionId, globalSessionKey: `local:${sessionId}`, pinned, createdAt: 1 }
}

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

  it('marks remote tabs offline even when a cached remote session still exists', async () => {
    remoteInstanceApi.listRemoteInstances.mockResolvedValue([
      {
        id: 'remote-1',
        type: 'remote',
        name: 'office',
        baseUrl: 'https://example.com',
        enabled: true,
        authRef: 'remote-1',
        status: 'offline',
        lastCheckedAt: 10,
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
        lastError: 'token expired',
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

    const sessionsStore = useSessionsStore()
    sessionsStore.remoteSessionsByInstance = {
      'remote-1': [
        {
          instanceId: 'remote-1',
          sessionId: 'session-9',
          globalSessionKey: 'remote-1:session-9',
          name: 'Cached Remote Session',
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

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()

    expect(sessionsStore.sessionIndexByGlobalKey['remote-1:session-9']).toBeTruthy()
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

  it('keeps a center drop onto the same pane as a no-op', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: leaf('pane', ['one', 'two'], 'one'),
      tabs: { one: sessionTab('one', 'one'), two: sessionTab('two', 'two') },
      activePaneId: 'pane'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()

    store.moveTabToPane({ fromPaneId: 'pane', toPaneId: 'pane', tabId: 'one' })

    expect(store.layout.root).toMatchObject({ tabs: ['one', 'two'], activeTabId: 'one' })
    expect(store.undoDepth).toBe(0)
    expect(workspaceApi.updateWorkspaceLayout).not.toHaveBeenCalled()
  })

  it('opens a session atomically at center without replacing target tabs', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'split', direction: 'horizontal', ratio: 0.5,
        first: leaf('source', ['moving'], 'moving'),
        second: leaf('target', ['kept'], 'kept')
      },
      tabs: { moving: sessionTab('moving', 'moving', true), kept: sessionTab('kept', 'kept') },
      activePaneId: 'source'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()

    store.openSessionRefAtPlacement({ instanceId: 'local', sessionId: 'moving', globalSessionKey: 'local:moving' }, 'target', 'center')

    expect(store.layout.root).toMatchObject({
      first: { tabs: [], activeTabId: null },
      second: { tabs: ['kept', 'moving'], activeTabId: 'moving' }
    })
    expect(store.layout.tabs.moving.pinned).toBe(true)
    expect(store.undoDepth).toBe(1)
    store.flushPersist()
    expect(workspaceApi.updateWorkspaceLayout).toHaveBeenCalledTimes(1)
    expect(store.undoLayoutChange()).toBe(true)
    expect(store.layout.root).toMatchObject({ first: { tabs: ['moving'] }, second: { tabs: ['kept'] } })
  })

  it.each([
    ['left', 'horizontal', true],
    ['right', 'horizontal', false],
    ['top', 'vertical', true],
    ['bottom', 'vertical', false]
  ] as const)('opens at root %s with the new pane in the requested order', async (placement, direction, newFirst) => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2, root: leaf('target', ['kept']), tabs: { kept: sessionTab('kept', 'kept') }, activePaneId: 'target'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()

    store.openSessionRefAtPlacement({ instanceId: 'local', sessionId: 'new', globalSessionKey: 'local:new' }, 'target', placement)

    expect(store.layout.root.type).toBe('split')
    if (store.layout.root.type !== 'split') return
    expect(store.layout.root.direction).toBe(direction)
    const created = newFirst ? store.layout.root.first : store.layout.root.second
    const existing = newFirst ? store.layout.root.second : store.layout.root.first
    expect(created).toMatchObject({ type: 'leaf', tabs: [expect.any(String)] })
    expect(existing).toMatchObject({ type: 'leaf', paneId: 'target', tabs: ['kept'] })
  })

  it('splits a nested target and moves a tab with one mutation', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: { type: 'split', direction: 'horizontal', ratio: 0.5, first: leaf('source', ['moving', 'other'], 'moving'), second: leaf('target', ['kept']) },
      tabs: { moving: sessionTab('moving', 'moving'), other: sessionTab('other', 'other'), kept: sessionTab('kept', 'kept') },
      activePaneId: 'source'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()

    store.splitPaneAndMoveTab({ targetPaneId: 'target', sourcePaneId: 'source', tabId: 'moving', placement: 'top' })

    expect(store.layout.root).toMatchObject({
      first: { tabs: ['other'], activeTabId: 'other' },
      second: { type: 'split', direction: 'vertical', first: { tabs: ['moving'] }, second: { paneId: 'target', tabs: ['kept'] } }
    })
    expect(store.undoDepth).toBe(1)
  })

  it('does not edge-split the only tab onto its own pane, but allows a multi-tab split', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2, root: leaf('pane', ['one']), tabs: { one: sessionTab('one', 'one') }, activePaneId: 'pane'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()
    store.openSessionRefAtPlacement({ instanceId: 'local', sessionId: 'one', globalSessionKey: 'local:one' }, 'pane', 'left')
    expect(store.layout.root.type).toBe('leaf')
    expect(store.undoDepth).toBe(0)

    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2, root: leaf('pane', ['one', 'two']), tabs: { one: sessionTab('one', 'one'), two: sessionTab('two', 'two') }, activePaneId: 'pane'
    } satisfies WorkspaceLayoutState)
    await store.load()
    store.openSessionRefAtPlacement({ instanceId: 'local', sessionId: 'one', globalSessionKey: 'local:one' }, 'pane', 'right')
    expect(store.layout.root).toMatchObject({ type: 'split', first: { paneId: 'pane', tabs: ['two'] }, second: { tabs: ['one'] } })
  })

  it('keeps invalid placement operations as no-ops and accepts empty source panes', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2, root: { type: 'split', direction: 'horizontal', ratio: 0.5, first: leaf('empty'), second: leaf('target', ['kept']) },
      tabs: { kept: sessionTab('kept', 'kept') }, activePaneId: 'target'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()
    const before = JSON.parse(JSON.stringify(store.layout)) as WorkspaceLayoutState
    store.openSessionRefAtPlacement({ instanceId: 'local', sessionId: 'new', globalSessionKey: 'local:new' }, 'missing', 'left')
    store.splitPaneAndMoveTab({ targetPaneId: 'target', sourcePaneId: 'empty', tabId: 'missing', placement: 'left' })
    expect(store.layout).toEqual(before)
    expect(store.undoDepth).toBe(0)
  })

  it('persists the final live split ratio as cloneable data without adding undo history', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'split',
        direction: 'horizontal',
        ratio: 0.5,
        first: {
          type: 'leaf',
          paneId: 'pane-1',
          activeTabId: null,
          tabs: []
        },
        second: {
          type: 'leaf',
          paneId: 'pane-2',
          activeTabId: null,
          tabs: []
        }
      },
      tabs: {},
      activePaneId: 'pane-1'
    })
    workspaceApi.updateWorkspaceLayout.mockImplementationOnce(async (layout) => structuredClone(layout))

    const workspaceStore = useWorkspaceStore()
    await workspaceStore.load()

    workspaceStore.updateSplitRatioLive('root', 0.6)
    workspaceStore.updateSplitRatioLive('root', 0.7)

    expect(workspaceStore.undoDepth).toBe(0)
    expect(workspaceApi.updateWorkspaceLayout).not.toHaveBeenCalled()

    workspaceStore.commitSplitRatio()
    expect(() => workspaceStore.flushPersist()).not.toThrow()

    expect(workspaceApi.updateWorkspaceLayout).toHaveBeenCalledTimes(1)
    const persisted = workspaceApi.updateWorkspaceLayout.mock.calls[0][0]
    expect(() => structuredClone(persisted)).not.toThrow()
    expect(persisted.root).toMatchObject({ type: 'split', ratio: 0.7 })
    expect(workspaceStore.undoDepth).toBe(0)
  })
  it('opens newly created sessions as tabs in the active pane without replacing existing tabs', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: leaf('pane', ['existing'], 'existing'),
      tabs: { existing: sessionTab('existing', 'existing') },
      activePaneId: 'pane'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()

    store.openSessionRefInActivePane({
      instanceId: 'local',
      sessionId: 'new-session',
      globalSessionKey: 'local:new-session'
    })

    expect(store.layout.root).toMatchObject({
      type: 'leaf',
      paneId: 'pane',
      tabs: ['existing', expect.any(String)],
      activeTabId: expect.any(String)
    })
    if (store.layout.root.type !== 'leaf') throw new Error('expected leaf workspace')
    expect(store.layout.tabs[store.layout.root.activeTabId!]).toMatchObject({
      sessionId: 'new-session',
      globalSessionKey: 'local:new-session'
    })
    expect(store.layout.tabs.existing).toBeTruthy()
  })

  it('removes duplicate physical tab references when loading a corrupted multi-pane layout', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'split', direction: 'horizontal', ratio: 0.5,
        first: leaf('left', ['shared'], 'shared'),
        second: leaf('right', ['shared', 'right-only'], 'shared')
      },
      tabs: {
        shared: sessionTab('shared', 'shared'),
        'right-only': sessionTab('right-only', 'right-only')
      },
      activePaneId: 'right'
    } satisfies WorkspaceLayoutState)

    const store = useWorkspaceStore()
    await store.load()

    expect(store.layout.root).toMatchObject({
      first: { tabs: ['shared'], activeTabId: 'shared' },
      second: { tabs: ['right-only'], activeTabId: 'right-only' }
    })
  })


  it('moves tabs into the surviving group when closing a pane', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: {
        type: 'split', direction: 'horizontal', ratio: 0.5,
        first: leaf('left', ['left-tab'], 'left-tab'),
        second: leaf('right', ['right-tab'], 'right-tab')
      },
      tabs: { 'left-tab': sessionTab('left-tab', 'left'), 'right-tab': sessionTab('right-tab', 'right') },
      activePaneId: 'left'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()

    store.closePane('left')

    expect(store.layout.root).toMatchObject({
      type: 'leaf', paneId: 'right', tabs: ['right-tab', 'left-tab'], activeTabId: 'left-tab'
    })
    expect(store.layout.tabs['left-tab']).toBeTruthy()
  })

  it('preserves pinned tabs when closing other tabs or tabs to the right', async () => {
    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: leaf('pane', ['active', 'pinned', 'plain'], 'active'),
      tabs: {
        active: sessionTab('active', 'active'),
        pinned: sessionTab('pinned', 'pinned', true),
        plain: sessionTab('plain', 'plain')
      },
      activePaneId: 'pane'
    } satisfies WorkspaceLayoutState)
    const store = useWorkspaceStore()
    await store.load()

    store.closeOtherTabs('pane', 'active')
    expect(store.layout.root).toMatchObject({ tabs: ['active', 'pinned'] })

    workspaceApi.getWorkspaceLayout.mockResolvedValue({
      version: 2,
      root: leaf('pane', ['active', 'pinned', 'plain'], 'active'),
      tabs: {
        active: sessionTab('active', 'active'),
        pinned: sessionTab('pinned', 'pinned', true),
        plain: sessionTab('plain', 'plain')
      },
      activePaneId: 'pane'
    } satisfies WorkspaceLayoutState)
    await store.load()
    store.closeTabsToRight('pane', 'active')
    expect(store.layout.root).toMatchObject({ tabs: ['active', 'pinned'] })
  })

})
