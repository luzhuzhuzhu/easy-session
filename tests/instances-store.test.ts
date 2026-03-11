import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { RemoteInstance } from '../src/renderer/src/models/unified-resource'

const remoteApi = vi.hoisted(() => ({
  listRemoteInstances: vi.fn(),
  addRemoteInstance: vi.fn(),
  updateRemoteInstance: vi.fn(),
  removeRemoteInstance: vi.fn(),
  testRemoteInstance: vi.fn(),
  getRemoteInstanceToken: vi.fn()
}))

const sessionApi = vi.hoisted(() => ({
  getOutputHistory: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
  onSessionStatusChange: vi.fn(() => () => {}),
  resizeTerminal: vi.fn(),
  onSessionOutput: vi.fn(() => () => {}),
  writeToSession: vi.fn()
}))

const projectApi = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  selectFolder: vi.fn(async () => null),
  detectProject: vi.fn(),
  readProjectPrompt: vi.fn(),
  writeProjectPrompt: vi.fn(),
  getProjectSessions: vi.fn(async () => [])
}))

vi.mock('@/api/remote-instance', () => remoteApi)
vi.mock('@/api/session', () => sessionApi)
vi.mock('@/api/project', () => projectApi)
vi.mock('@/api/local-session', () => sessionApi)
vi.mock('@/api/local-project', () => projectApi)
vi.mock('../src/renderer/src/api/remote-instance', () => remoteApi)
vi.mock('../src/renderer/src/api/session', () => sessionApi)
vi.mock('../src/renderer/src/api/project', () => projectApi)
vi.mock('../src/renderer/src/api/local-session', () => sessionApi)
vi.mock('../src/renderer/src/api/local-project', () => projectApi)

import { useInstancesStore } from '../src/renderer/src/stores/instances'
import { useSettingsStore } from '../src/renderer/src/stores/settings'

function createRemoteInstance(partial: Partial<RemoteInstance> = {}): RemoteInstance {
  return {
    id: 'remote-1',
    type: 'remote',
    name: 'office',
    baseUrl: 'https://example.com',
    enabled: true,
    authRef: 'remote-1',
    status: 'unknown',
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

describe('instances store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    remoteApi.listRemoteInstances.mockReset()
    remoteApi.addRemoteInstance.mockReset()
    remoteApi.updateRemoteInstance.mockReset()
    remoteApi.removeRemoteInstance.mockReset()
    remoteApi.testRemoteInstance.mockReset()
    remoteApi.getRemoteInstanceToken.mockReset()
    useSettingsStore().settings.desktopRemoteMountEnabled = true
  })

  it('combines local instance with remote instances', async () => {
    remoteApi.listRemoteInstances.mockResolvedValue([createRemoteInstance()])
    const store = useInstancesStore()

    await store.fetchInstances()

    expect(store.instances).toHaveLength(2)
    expect(store.instances[0].id).toBe('local')
    expect(store.instances[1].id).toBe('remote-1')
    expect(store.remoteInstanceIndex['remote-1']?.baseUrl).toBe('https://example.com')
  })

  it('merges test result into stored remote instance state', async () => {
    remoteApi.listRemoteInstances.mockResolvedValue([createRemoteInstance()])
    remoteApi.testRemoteInstance.mockResolvedValue({
      ok: true,
      status: 'online',
      lastCheckedAt: 123,
      passthroughOnly: true,
      capabilities: createRemoteInstance().capabilities,
      serverInfo: null,
      latencyMs: 42,
      error: null
    })

    const store = useInstancesStore()
    await store.fetchInstances()
    const result = await store.testRemoteInstance('remote-1')

    expect(result.status).toBe('online')
    expect(store.remoteInstanceIndex['remote-1']?.status).toBe('online')
    expect(store.remoteInstanceIndex['remote-1']?.latencyMs).toBe(42)
  })

  it('falls back to pure local mode when desktop remote mount is disabled', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.settings.desktopRemoteMountEnabled = false

    const store = useInstancesStore()
    store.remoteInstances = [createRemoteInstance()]

    const result = await store.fetchInstances()

    expect(remoteApi.listRemoteInstances).not.toHaveBeenCalled()
    expect(store.remoteInstances).toEqual([])
    expect(result.map((instance) => instance.id)).toEqual(['local'])
  })

  it('marks connectivity-like remote fetch failures as offline and later clears them on success', async () => {
    remoteApi.listRemoteInstances.mockResolvedValue([createRemoteInstance({ status: 'online' })])
    const store = useInstancesStore()

    await store.fetchInstances()
    store.markRemoteFetchFailure('remote-1', new Error('gateway timeout'))

    expect(store.remoteInstanceIndex['remote-1']?.status).toBe('offline')
    expect(store.remoteInstanceIndex['remote-1']?.lastError).toBe('gateway timeout')
    expect(store.remoteInstanceIndex['remote-1']?.lastCheckedAt).not.toBeNull()

    store.markRemoteFetchSuccess('remote-1')
    expect(store.remoteInstanceIndex['remote-1']?.status).toBe('online')
    expect(store.remoteInstanceIndex['remote-1']?.lastError).toBeNull()
  })

  it('marks Cloudflare 530 fetch failures as offline instead of unknown test state', async () => {
    remoteApi.listRemoteInstances.mockResolvedValue([createRemoteInstance({ status: 'online' })])
    const store = useInstancesStore()

    await store.fetchInstances()
    const error = Object.assign(
      new Error('Cloudflare Quick Tunnel 不可用（530）。当前公网地址可能已失效。'),
      { status: 530 }
    )
    store.markRemoteFetchFailure('remote-1', error)

    expect(store.remoteInstanceIndex['remote-1']?.status).toBe('offline')
    expect(store.remoteInstanceIndex['remote-1']?.lastError).toContain('Cloudflare Quick Tunnel')
  })
})
