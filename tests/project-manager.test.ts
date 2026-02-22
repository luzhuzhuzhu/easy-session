import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  storeState: { projects: [] as any[] },
  accessMock: vi.fn(async () => undefined),
  uuidCounter: 0
}))

vi.mock('crypto', () => ({
  randomUUID: () => `project-${++mocks.uuidCounter}`
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    access: mocks.accessMock
  }
})

vi.mock('../src/main/services/project-store', () => ({
  ProjectStore: class MockProjectStore {
    async load() {
      return { projects: mocks.storeState.projects, restoredFromBackup: false }
    }

    async save(projects: any[]) {
      mocks.storeState.projects = projects.map((project) => ({ ...project }))
    }
  }
}))

import { ProjectManager } from '../src/main/services/project-manager'

describe('ProjectManager', () => {
  let manager: ProjectManager

  beforeEach(async () => {
    mocks.uuidCounter = 0
    mocks.accessMock.mockClear()
    mocks.storeState.projects = []
    manager = new ProjectManager()
    await manager.init()
  })

  it('should normalize path and avoid duplicate project records', async () => {
    const first = await manager.addProject('C:/workspace/demo/')
    const second = await manager.addProject('C:/workspace/demo')

    expect(second.id).toBe(first.id)
    expect(await manager.listProjects()).toHaveLength(1)
    expect(first.path.endsWith('/') || first.path.endsWith('\\')).toBe(false)
  })

  it('should update lastOpenedAt and keep path state when opening project', async () => {
    const project = await manager.addProject('C:/workspace/open-test')
    const previousOpenedAt = project.lastOpenedAt

    await new Promise((resolve) => setTimeout(resolve, 2))
    const opened = await manager.openProject(project.id)

    expect(opened).not.toBeNull()
    expect(opened!.lastOpenedAt).toBeGreaterThan(previousOpenedAt)
    expect(opened!.pathExists).toBe(true)
  })
})
