import { copyFile, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const getPathMock = vi.hoisted(() => vi.fn())

vi.mock('electron', () => ({
  app: {
    getPath: getPathMock
  }
}))

import { WorkspaceLayoutManager } from '../src/main/services/workspace-layout-manager'

describe('WorkspaceLayoutManager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'easysession-workspace-layout-'))
    getPathMock.mockReturnValue(tempDir)
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
  })

  it('migrates legacy v1 layout to v2 and persists compatible fields', async () => {
    const legacyLayout = {
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
          createdAt: 123
        }
      },
      activePaneId: 'pane-1'
    }

    await writeFile(join(tempDir, 'workspace-layout.json'), JSON.stringify(legacyLayout, null, 2), 'utf-8')

    const manager = new WorkspaceLayoutManager()
    await manager.init()

    const layout = manager.getLayout()
    expect(layout.version).toBe(2)
    expect(layout.tabs['tab-1']).toMatchObject({
      resourceType: 'session',
      instanceId: 'local',
      sessionId: 'session-1',
      globalSessionKey: 'local:session-1'
    })

    const persisted = JSON.parse(
      await readFile(join(tempDir, 'workspace-layout.json'), 'utf-8')
    ) as Record<string, unknown>
    expect(persisted.version).toBe(2)
    expect((persisted.tabs as Record<string, any>)['tab-1'].instanceId).toBe('local')
    expect((persisted.tabs as Record<string, any>)['tab-1'].globalSessionKey).toBe('local:session-1')
  })

  it('tolerates missing v2 tab fields and normalizes them before persisting', async () => {
    const incompleteV2Layout = {
      version: 2,
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: 'tab-1',
        tabs: ['tab-1']
      },
      tabs: {
        'tab-1': {
          id: 'tab-1',
          sessionId: 'session-2'
        }
      },
      activePaneId: 'pane-1'
    }

    await writeFile(join(tempDir, 'workspace-layout.json'), JSON.stringify(incompleteV2Layout, null, 2), 'utf-8')

    const manager = new WorkspaceLayoutManager()
    await manager.init()

    const layout = manager.getLayout()
    expect(layout.version).toBe(2)
    expect(layout.tabs['tab-1']).toMatchObject({
      resourceType: 'session',
      instanceId: 'local',
      sessionId: 'session-2',
      globalSessionKey: 'local:session-2',
      pinned: false
    })
    expect(typeof layout.tabs['tab-1'].createdAt).toBe('number')

    const persisted = JSON.parse(
      await readFile(join(tempDir, 'workspace-layout.json'), 'utf-8')
    ) as Record<string, any>

    expect(persisted.tabs['tab-1']).toMatchObject({
      resourceType: 'session',
      instanceId: 'local',
      sessionId: 'session-2',
      globalSessionKey: 'local:session-2',
      pinned: false
    })
    expect(typeof persisted.tabs['tab-1'].createdAt).toBe('number')
  })

  it('migrates versionless legacy layouts through the version chain to the current format', async () => {
    const legacyLayoutWithoutVersion = {
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: 'tab-1',
        tabs: ['tab-1']
      },
      tabs: {
        'tab-1': {
          sessionId: 'session-legacy'
        }
      },
      activePaneId: 'pane-1'
    }

    await writeFile(
      join(tempDir, 'workspace-layout.json'),
      JSON.stringify(legacyLayoutWithoutVersion, null, 2),
      'utf-8'
    )

    const manager = new WorkspaceLayoutManager()
    await manager.init()

    const layout = manager.getLayout()
    expect(layout.version).toBe(2)
    expect(layout.tabs['tab-1']).toMatchObject({
      resourceType: 'session',
      instanceId: 'local',
      sessionId: 'session-legacy',
      globalSessionKey: 'local:session-legacy'
    })

    const persisted = JSON.parse(await readFile(join(tempDir, 'workspace-layout.json'), 'utf-8')) as Record<string, any>
    expect(persisted.version).toBe(2)
    expect(persisted.tabs['tab-1'].globalSessionKey).toBe('local:session-legacy')
  })

  it('restores workspace layout from backup when the primary file is corrupted', async () => {
    const validLayout = {
      version: 2,
      root: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: 'tab-1',
        tabs: ['tab-1']
      },
      tabs: {
        'tab-1': {
          id: 'tab-1',
          resourceType: 'session',
          instanceId: 'remote-1',
          sessionId: 'session-9',
          globalSessionKey: 'remote-1:session-9',
          pinned: false,
          createdAt: 456
        }
      },
      activePaneId: 'pane-1'
    }

    const layoutPath = join(tempDir, 'workspace-layout.json')
    await writeFile(layoutPath, JSON.stringify(validLayout, null, 2), 'utf-8')
    await copyFile(layoutPath, `${layoutPath}.bak`)
    await writeFile(layoutPath, '{"broken": ]', 'utf-8')

    const manager = new WorkspaceLayoutManager()
    await manager.init()

    expect(manager.getLayout().tabs['tab-1']).toMatchObject({
      instanceId: 'remote-1',
      sessionId: 'session-9',
      globalSessionKey: 'remote-1:session-9'
    })

    const persisted = JSON.parse(await readFile(layoutPath, 'utf-8')) as Record<string, any>
    expect(persisted.tabs['tab-1']).toMatchObject({
      instanceId: 'remote-1',
      sessionId: 'session-9',
      globalSessionKey: 'remote-1:session-9'
    })
  })

  it('keeps a corrupted workspace file intact and boots with safe default layout when no backup exists', async () => {
    const layoutPath = join(tempDir, 'workspace-layout.json')
    const corrupted = '{"broken": ]'
    await writeFile(layoutPath, corrupted, 'utf-8')

    const manager = new WorkspaceLayoutManager()
    await manager.init()

    expect(manager.getLayout()).toMatchObject({
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

    expect(await readFile(layoutPath, 'utf-8')).toBe(corrupted)
  })
})
