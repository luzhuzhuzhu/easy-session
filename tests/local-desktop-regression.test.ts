import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const workspaceApi = vi.hoisted(() => ({
  getWorkspaceLayout: vi.fn(),
  updateWorkspaceLayout: vi.fn(async (layout) => layout),
  resetWorkspaceLayout: vi.fn()
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
  listSessions: vi.fn(),
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
  addProject: vi.fn(),
  removeProject: vi.fn(),
  listProjects: vi.fn(),
  getProject: vi.fn(async () => null),
  updateProject: vi.fn(),
  openProject: vi.fn(),
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
import { useProjectsStore } from '../src/renderer/src/stores/projects'
import { useSessionsStore } from '../src/renderer/src/stores/sessions'
import { useWorkspaceStore } from '../src/renderer/src/stores/workspace'

describe('local desktop regression', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
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
    projectApi.listProjects.mockResolvedValue([
      {
        id: 'project-1',
        name: 'Local Project',
        path: 'D:/repo/local-project',
        createdAt: 1,
        lastOpenedAt: 2,
        pathExists: true
      }
    ])
    sessionApi.listSessions.mockResolvedValue([
      {
        id: 'session-1',
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
  })

  it('keeps local projects, sessions and workspace flow working without remote instances', async () => {
    const instancesStore = useInstancesStore()
    const projectsStore = useProjectsStore()
    const sessionsStore = useSessionsStore()
    const workspaceStore = useWorkspaceStore()

    await instancesStore.fetchInstances()
    await workspaceStore.load()
    await Promise.all([projectsStore.fetchAllProjects(), sessionsStore.fetchAllSessions()])

    expect(instancesStore.instances.map((instance) => instance.id)).toEqual(['local'])
    expect(remoteInstanceApi.listRemoteInstances).not.toHaveBeenCalled()
    expect(projectsStore.projects).toHaveLength(1)
    expect(projectsStore.unifiedProjects[0]?.instanceId).toBe('local')
    expect(projectsStore.quickAccessProjectCount).toBe(1)
    expect(projectsStore.quickAccessRecentProjects[0]?.globalProjectKey).toBe('local:project-1')
    expect(projectsStore.unavailableRemoteProjectCount).toBe(0)
    expect(sessionsStore.sessions).toHaveLength(1)
    expect(sessionsStore.unifiedSessions[0]?.globalSessionKey).toBe('local:session-1')

    workspaceStore.openSessionInActivePane('session-1')
    expect(workspaceStore.activeGlobalSessionKey).toBe('local:session-1')
    expect(workspaceStore.activeSessionRef).toEqual({
      instanceId: 'local',
      sessionId: 'session-1',
      globalSessionKey: 'local:session-1'
    })

    workspaceStore.reconcileSessionRefs(['local:session-1'], {
      fallbackSessionRef: sessionsStore.getSessionRef('session-1')
    })
    expect(Object.keys(workspaceStore.layout.tabs)).toHaveLength(1)
    expect(workspaceStore.resolvedTabs[Object.keys(workspaceStore.layout.tabs)[0]]?.availability).toBe('ready')
  })
})
