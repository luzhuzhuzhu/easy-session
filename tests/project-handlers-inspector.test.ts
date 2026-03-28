import { beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, Function>()
const inspectorMocks = vi.hoisted(() => ({
  listFileTree: vi.fn(async () => ({ entries: [] })),
  readFile: vi.fn(async () => ({ kind: 'text', content: 'demo' })),
  getGitStatus: vi.fn(async () => ({ state: 'non-git', items: [], message: 'no git' })),
  getGitDiff: vi.fn(async () => ({ state: 'non-git', diff: '', message: 'no git' }))
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => null)
  },
  dialog: {
    showOpenDialog: vi.fn()
  }
}))

vi.mock('../src/main/services/project-inspector', () => ({
  ProjectInspectorService: class MockProjectInspectorService {
    listFileTree = inspectorMocks.listFileTree
    readFile = inspectorMocks.readFile
    getGitStatus = inspectorMocks.getGitStatus
    getGitDiff = inspectorMocks.getGitDiff
  }
}))

import { registerProjectHandlers } from '../src/main/ipc/project-handlers'

describe('project-handlers inspector ipc', () => {
  beforeEach(() => {
    handlers.clear()
    inspectorMocks.listFileTree.mockClear()
    inspectorMocks.readFile.mockClear()
    inspectorMocks.getGitStatus.mockClear()
    inspectorMocks.getGitDiff.mockClear()
  })

  it('registers project inspector channels', () => {
    registerProjectHandlers({} as any, { listSessions: vi.fn(() => []) } as any)

    expect(handlers.has('project:fileTree')).toBe(true)
    expect(handlers.has('project:fileRead')).toBe(true)
    expect(handlers.has('project:gitStatus')).toBe(true)
    expect(handlers.has('project:gitDiff')).toBe(true)
  })

  it('forwards project:fileTree to inspector service', async () => {
    registerProjectHandlers({} as any, { listSessions: vi.fn(() => []) } as any)

    await handlers.get('project:fileTree')!({}, { projectPath: 'D:/demo' }, 'docs')

    expect(inspectorMocks.listFileTree).toHaveBeenCalledWith({ projectPath: 'D:/demo' }, 'docs')
  })
})
