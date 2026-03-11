import { beforeEach, describe, expect, it, vi } from 'vitest'

const localSessionApi = vi.hoisted(() => ({
  createSession: vi.fn(async () => null),
  destroySession: vi.fn(async () => true),
  listSessions: vi.fn(async () => []),
  getSession: vi.fn(async () => null),
  getOutputHistory: vi.fn(async () => []),
  onSessionStatusChange: vi.fn(() => () => {}),
  pauseSession: vi.fn(async () => null),
  resizeTerminal: vi.fn(async () => undefined),
  restartSession: vi.fn(async () => null),
  startSession: vi.fn(async () => null),
  clearOutput: vi.fn(async () => undefined),
  writeToSession: vi.fn(async () => true)
}))

const localProjectApi = vi.hoisted(() => ({
  addProject: vi.fn(async () => null),
  detectProject: vi.fn(async () => ({ claude: false, codex: false, opencode: false })),
  listProjects: vi.fn(async () => []),
  getProject: vi.fn(async () => null),
  getProjectSessions: vi.fn(async () => []),
  openProject: vi.fn(async () => null),
  readProjectPrompt: vi.fn(async () => null),
  removeProject: vi.fn(async () => true),
  updateProject: vi.fn(async () => null),
  writeProjectPrompt: vi.fn(async () => null)
}))

const outputStreamApi = vi.hoisted(() => ({
  subscribeSessionOutput: vi.fn()
}))

vi.mock('@/api/local-session', () => localSessionApi)
vi.mock('@/api/local-project', () => localProjectApi)
vi.mock('@/services/session-output-stream', () => outputStreamApi)
vi.mock('../src/renderer/src/api/local-session', () => localSessionApi)
vi.mock('../src/renderer/src/api/local-project', () => localProjectApi)
vi.mock('../src/renderer/src/services/session-output-stream', () => outputStreamApi)

describe('LocalGateway', () => {
  beforeEach(() => {
    localProjectApi.addProject.mockReset()
    localProjectApi.updateProject.mockReset()
    localProjectApi.removeProject.mockReset()
    localProjectApi.openProject.mockReset()
    localProjectApi.getProjectSessions.mockReset()
    localProjectApi.detectProject.mockReset()
    localProjectApi.readProjectPrompt.mockReset()
    localProjectApi.writeProjectPrompt.mockReset()
    localSessionApi.createSession.mockReset()
    localSessionApi.startSession.mockReset()
    localSessionApi.pauseSession.mockReset()
    localSessionApi.restartSession.mockReset()
    localSessionApi.destroySession.mockReset()
    localSessionApi.getOutputHistory.mockReset()
    localSessionApi.writeToSession.mockReset()
    localSessionApi.resizeTerminal.mockReset()
    outputStreamApi.subscribeSessionOutput.mockReset()
  })

  it('keeps local terminal transport behavior intact after introducing the gateway layer', async () => {
    const historyLines = [{ data: 'history-line', stream: 'stdout', timestamp: 1, seq: 1 }]
    let outputListener: ((event: { data: string; stream: 'stdout' | 'stderr'; timestamp: number }) => void) | null = null

    localSessionApi.getOutputHistory.mockResolvedValue(historyLines)
    localSessionApi.writeToSession.mockResolvedValue(true)
    outputStreamApi.subscribeSessionOutput.mockImplementation((_sessionRef, listener) => {
      outputListener = listener
      return () => {
        outputListener = null
      }
    })

    const { LocalGateway } = await import('../src/renderer/src/gateways/local-gateway')
    const gateway = new LocalGateway()
    const outputEvents: Array<{ globalSessionKey: string; data: string }> = []

    const history = await gateway.getOutputHistory('local', 'session-1', 200)
    expect(history).toEqual(historyLines)
    expect(localSessionApi.getOutputHistory).toHaveBeenCalledWith('session-1', 200)

    const unsubscribe = gateway.subscribeOutput('local', 'session-1', (event) => {
      outputEvents.push({
        globalSessionKey: event.globalSessionKey,
        data: event.data
      })
    })

    expect(outputStreamApi.subscribeSessionOutput).toHaveBeenCalledWith(
      {
        instanceId: 'local',
        sessionId: 'session-1',
        globalSessionKey: 'local:session-1'
      },
      expect.any(Function)
    )

    outputListener?.({
      data: 'live-output',
      stream: 'stdout',
      timestamp: 2
    })

    await gateway.writeRaw('local', 'session-1', 'ls')
    await gateway.resize('local', 'session-1', 120, 40)

    expect(outputEvents).toEqual([
      {
        globalSessionKey: 'local:session-1',
        data: 'live-output'
      }
    ])
    expect(localSessionApi.writeToSession).toHaveBeenCalledWith('session-1', 'ls')
    expect(localSessionApi.resizeTerminal).toHaveBeenCalledWith('session-1', 120, 40)

    unsubscribe()
  })

  it('wraps local project and lifecycle operations without changing local semantics', async () => {
    localProjectApi.getProject.mockResolvedValue({ id: 'p1', name: 'demo', path: 'D:/repo/demo', createdAt: 1, lastOpenedAt: 2 })
    localProjectApi.addProject.mockResolvedValue({ id: 'p2', name: 'new-project', path: 'D:/repo/new-project', createdAt: 3, lastOpenedAt: 4 })
    localProjectApi.updateProject.mockResolvedValue({ id: 'p1', name: 'demo-updated', path: 'D:/repo/demo', createdAt: 1, lastOpenedAt: 5 })
    localProjectApi.openProject.mockResolvedValue({ id: 'p1', name: 'demo', path: 'D:/repo/demo', createdAt: 1, lastOpenedAt: 6 })
    localProjectApi.getProjectSessions.mockResolvedValue([
      { id: 's1', name: 'session-1', icon: null, type: 'claude', projectPath: 'D:/repo/demo', status: 'idle', createdAt: 1, lastActiveAt: 1, processId: null, options: {}, parentId: null }
    ])
    localProjectApi.detectProject.mockResolvedValue({ claude: true, codex: false, opencode: false })
    localProjectApi.readProjectPrompt.mockResolvedValue({ path: 'D:/repo/demo/CLAUDE.md', content: 'prompt', exists: true })
    localProjectApi.writeProjectPrompt.mockResolvedValue({ path: 'D:/repo/demo/CLAUDE.md', content: 'updated', exists: true })
    localSessionApi.createSession.mockResolvedValue({
      id: 's2',
      name: 'created',
      icon: null,
      type: 'claude',
      projectPath: 'D:/repo/demo',
      status: 'idle',
      createdAt: 2,
      lastActiveAt: 2,
      processId: null,
      options: {},
      parentId: null
    })
    localSessionApi.startSession.mockResolvedValue({
      id: 's2',
      name: 'created',
      icon: null,
      type: 'claude',
      projectPath: 'D:/repo/demo',
      status: 'running',
      createdAt: 2,
      lastActiveAt: 3,
      lastStartAt: 3,
      processId: 'pid-1',
      options: {},
      parentId: null
    })
    localSessionApi.destroySession.mockResolvedValue(true)

    const { LocalGateway } = await import('../src/renderer/src/gateways/local-gateway')
    const gateway = new LocalGateway()

    const createdProject = await gateway.createProject('local', { path: 'D:/repo/new-project', name: 'new-project' })
    const updatedProject = await gateway.updateProject('local', 'p1', { name: 'demo-updated' })
    const openedProject = await gateway.openProject('local', 'p1')
    const projectSessions = await gateway.listProjectSessions('local', 'p1')
    const detectResult = await gateway.detectProject('local', 'p1')
    const promptFile = await gateway.readProjectPrompt('local', 'p1', 'claude')
    const savedPromptFile = await gateway.writeProjectPrompt('local', 'p1', 'claude', 'updated')
    const createdSession = await gateway.createSession('local', { type: 'claude', projectId: 'p1', name: 'created' })
    const startedSession = await gateway.startSession('local', 's2')
    const destroyed = await gateway.destroySession('local', 's2')

    expect(createdProject.projectId).toBe('p2')
    expect(updatedProject?.name).toBe('demo-updated')
    expect(openedProject?.projectId).toBe('p1')
    expect(projectSessions[0]?.sessionId).toBe('s1')
    expect(detectResult.claude).toBe(true)
    expect(promptFile?.content).toBe('prompt')
    expect(savedPromptFile?.content).toBe('updated')
    expect(createdSession.sessionId).toBe('s2')
    expect(startedSession?.status).toBe('running')
    expect(destroyed).toBe(true)
  })
})
