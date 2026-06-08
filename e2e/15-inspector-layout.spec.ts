import { test, expect, type Page } from './fixtures'

function defaultWorkspaceLayout() {
  return {
    version: 2,
    root: {
      type: 'leaf',
      paneId: 'pane-1',
      activeTabId: null,
      tabs: []
    },
    tabs: {},
    activePaneId: 'pane-1'
  }
}

async function setupIpcMocks(page: Page) {
  await page.evaluate((workspaceLayout) => {
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'remote-instance:list') return []
      if (channel === 'project:list') return [{
        id: 'inspector-project',
        name: 'Inspector Project',
        path: 'D:\\repo\\inspector-project',
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        pathExists: true
      }]
      if (channel === 'project:fileTree') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\repo\\inspector-project', projectName: 'Inspector Project' },
          parentRelativePath: args[1] ?? '',
          entries: []
        }
      }
      if (channel === 'project:gitStatus') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\repo\\inspector-project', projectName: 'Inspector Project' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\repo\\inspector-project',
          projectSubpath: '',
          items: [],
          message: null
        }
      }
      if (channel === 'project:gitBranches') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\repo\\inspector-project', projectName: 'Inspector Project' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\repo\\inspector-project',
          projectSubpath: '',
          currentBranch: 'main',
          branches: [],
          message: null
        }
      }
      if (channel === 'project:gitLog') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\repo\\inspector-project', projectName: 'Inspector Project' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\repo\\inspector-project',
          projectSubpath: '',
          commits: [],
          hasMore: false,
          message: null
        }
      }
      if (channel === 'session:list') return []
      if (channel === 'workspace:getLayout') return structuredClone(workspaceLayout)
      if (channel === 'workspace:updateLayout') return args[0]
      if (channel === 'workspace:resetLayout') return structuredClone(workspaceLayout)
      return undefined
    }
  }, defaultWorkspaceLayout())
}

async function navigateToSessions(page: Page) {
  await page.keyboard.press('Control+2')
  await page.waitForURL(/#\/sessions/)
  await expect(page.locator('.sessions-page')).toBeVisible()
}

async function injectActiveLocalSession(page: Page) {
  await page.evaluate(() => {
    const sessionsStore = (window as any).__pinia__?._s?.get('sessions')
    const workspaceStore = (window as any).__pinia__?._s?.get('workspace')
    const session = {
      id: 'inspector-session',
      name: 'Inspector Session',
      icon: null,
      type: 'codex',
      status: 'running',
      projectPath: 'D:\\repo\\inspector-project',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      processId: 'proc-inspector',
      options: {},
      parentId: null
    }
    const sessionRef = {
      instanceId: 'local',
      sessionId: session.id,
      globalSessionKey: `local:${session.id}`
    }
    sessionsStore.sessions = [session]
    sessionsStore.setActiveSessionRef(sessionRef)
    workspaceStore.openSessionRefInActivePane(sessionRef)
  })
}

test.describe('Inspector 布局优先级', () => {
  test.beforeEach(async ({ page }) => {
    await setupIpcMocks(page)
  })

  test('收起时不占用中央工作区横向空间，打开后才占右侧宽度', async ({ page }) => {
    await navigateToSessions(page)
    await page.evaluate(() => {
      const inspectorStore = (window as any).__pinia__?._s?.get('inspector')
      inspectorStore?.setPanelOpen(false)
    })

    const collapsedWidth = await page.locator('.inspector-panel').evaluate((el) => {
      return Math.round(el.getBoundingClientRect().width)
    })
    expect(collapsedWidth).toBe(0)

    await page.evaluate(() => {
      const inspectorStore = (window as any).__pinia__?._s?.get('inspector')
      inspectorStore?.setPanelOpen(true)
    })

    const openWidth = await page.locator('.inspector-panel').evaluate((el) => {
      return Math.round(el.getBoundingClientRect().width)
    })
    expect(openWidth).toBeGreaterThanOrEqual(420)
  })

  test('left session list auto-collapses in narrow windows and preserves workspace width', async ({ page, electronApp }) => {
    const browserWindow = await electronApp.browserWindow(page)
    await browserWindow.evaluate((win) => {
      win.setBounds({ width: 1000, height: 720 })
    })
    await navigateToSessions(page)
    await page.evaluate(() => {
      const inspectorStore = (window as any).__pinia__?._s?.get('inspector')
      inspectorStore?.setPanelOpen(false)
    })

    await expect(page.locator('.session-list-panel')).toHaveClass(/auto-collapsed/)
    await expect(page.locator('.session-items.compact')).toBeVisible()
    await expect(page.locator('.session-empty-guide')).toBeHidden()

    const listWidth = await page.locator('.session-list-panel').evaluate((el) => {
      return Math.round(el.getBoundingClientRect().width)
    })
    expect(listWidth).toBe(56)

    const workspaceWidth = await page.locator('.session-detail-panel').evaluate((el) => {
      return Math.round(el.getBoundingClientRect().width)
    })
    expect(workspaceWidth).toBeGreaterThanOrEqual(700)
  })

  test('inspector remembered zoom and auto-collapsed sidebar keep viewer usable', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('easysession.inspector.panel-open', '1')
      window.localStorage.setItem('easysession.inspector.width', '520')
      window.localStorage.setItem('easysession.inspector.zoom', '150')
      window.localStorage.setItem('easysession.inspector.sidebar-visible', '1')
      window.localStorage.setItem('easysession.inspector.sidebar-auto-collapse', '1')
      window.localStorage.setItem('easysession.inspector.sidebar-height', '320')
    })
    await navigateToSessions(page)
    await injectActiveLocalSession(page)

    await expect(page.locator('.inspector-panel')).toBeVisible()
    await expect(page.locator('.viewer-zoom-btn')).toContainText('150%')
    await expect(page.locator('.panel-body')).toHaveClass(/sidebar-auto-collapse/)
    await expect(page.locator('.panel-sidebar')).toHaveClass(/collapsed/)

    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.inspector-panel')
      const sidebar = document.querySelector('.panel-sidebar')
      const viewer = document.querySelector('.panel-viewer')
      return {
        panelWidth: Math.round(panel?.getBoundingClientRect().width ?? 0),
        sidebarHeight: Math.round(sidebar?.getBoundingClientRect().height ?? 0),
        viewerHeight: Math.round(viewer?.getBoundingClientRect().height ?? 0)
      }
    })
    expect(metrics.panelWidth).toBe(520)
    expect(metrics.sidebarHeight).toBeLessThanOrEqual(1)
    expect(metrics.viewerHeight).toBeGreaterThanOrEqual(420)
  })
})
