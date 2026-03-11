import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getPathMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

import { ProjectStore } from '../src/main/services/project-store'

describe('ProjectStore compatibility', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'easysession-project-store-'))
    getPathMock.mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('loads legacy projects.json without requiring migration and recomputes pathExists', async () => {
    const existingProjectPath = join(tempDir, 'repo-a')
    await mkdir(existingProjectPath, { recursive: true })

    const legacyProjects = [
      {
        id: 'project-a',
        name: 'Project A',
        path: existingProjectPath,
        createdAt: 1,
        lastOpenedAt: 2
      },
      {
        id: 'project-b',
        name: 'Project B',
        path: join(tempDir, 'missing-repo'),
        createdAt: 3,
        lastOpenedAt: 4
      }
    ]

    await writeFile(
      join(tempDir, 'projects.json'),
      JSON.stringify(legacyProjects, null, 2),
      'utf-8'
    )

    const store = new ProjectStore()
    const result = await store.load()

    expect(result.restoredFromBackup).toBe(false)
    expect(result.normalized).toBe(false)
    expect(result.projects).toHaveLength(2)
    expect(result.projects[0]).toMatchObject({
      id: 'project-a',
      name: 'Project A',
      path: existingProjectPath,
      pathExists: true
    })
    expect(result.projects[1]).toMatchObject({
      id: 'project-b',
      name: 'Project B',
      pathExists: false
    })
  })

  it('sanitizes malformed legacy project records instead of crashing on upgrade', async () => {
    const legacyProjectPath = join(tempDir, 'repo-c')
    await mkdir(legacyProjectPath, { recursive: true })

    await writeFile(
      join(tempDir, 'projects.json'),
      JSON.stringify(
        [
          {
            id: 'project-c',
            path: legacyProjectPath,
            createdAt: 12,
            lastOpenedAt: 'bad'
          },
          {
            id: '',
            name: 'broken',
            path: ''
          },
          {
            foo: 'bar'
          }
        ],
        null,
        2
      ),
      'utf-8'
    )

    const store = new ProjectStore()
    const result = await store.load()

    expect(result.normalized).toBe(true)
    expect(result.projects).toHaveLength(1)
    expect(result.projects[0]).toMatchObject({
      id: 'project-c',
      name: 'repo-c',
      path: legacyProjectPath,
      createdAt: 12,
      lastOpenedAt: 12,
      pathExists: true
    })
  })

  it('falls back safely when legacy projects.json has an unexpected top-level shape', async () => {
    await writeFile(
      join(tempDir, 'projects.json'),
      JSON.stringify(
        {
          id: 'project-x',
          name: 'Wrong Shape'
        },
        null,
        2
      ),
      'utf-8'
    )

    const store = new ProjectStore()
    const result = await store.load()

    expect(result.normalized).toBe(true)
    expect(result.projects).toEqual([])
  })
})
