import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

type CliType = 'claude' | 'codex' | 'opencode'
type SessionStatus = 'idle' | 'running' | 'stopped' | 'error'

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

function mkSession(
  id: string,
  name: string,
  type: CliType = 'claude',
  status: SessionStatus = 'running',
  projectPath = 'D:\\EasySession'
) {
  return {
    id,
    name,
    icon: null,
    type,
    status,
    projectPath,
    createdAt: Date.now(),
    lastActiveAt: Date.now(),
    processId: null,
    options: {},
    parentId: null
  }
}

async function setupIpcMocks(page: Page, sessions: ReturnType<typeof mkSession>[] = []) {
  await page.evaluate(({ sessionData, workspaceLayout }) => {
    ;(window as any).__e2e_sessions = sessionData
    ;(window as any).__e2e_destroy_calls = []
    ;(window as any).__e2e_workspace_layout = workspaceLayout
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'session:list') return (window as any).__e2e_sessions
      if (channel === 'session:destroy') {
        ;(window as any).__e2e_destroy_calls.push(args[0])
        ;(window as any).__e2e_sessions = (window as any).__e2e_sessions.filter((s: any) => s.id !== args[0])
        return true
      }
      if (channel === 'session:output:history') return []
      if (channel === 'project:list') return []
      if (channel === 'remote-instance:list') return []
      if (channel === 'project:fileTree') {
        return { target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' }, parentRelativePath: args[1] ?? '', entries: [] }
      }
      if (channel === 'project:fileRead') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' },
          relativePath: args[1] ?? '',
          absolutePath: args[1] ?? '',
          kind: 'text',
          size: 0,
          content: ''
        }
      }
      if (channel === 'project:gitStatus') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\EasySession',
          projectSubpath: '',
          items: [],
          message: null
        }
      }
      if (channel === 'project:gitDiff') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\EasySession',
          projectSubpath: '',
          relativePath: args[1] ?? '',
          viewMode: args[2]?.viewMode ?? 'auto',
          diff: '',
          message: null
        }
      }
      if (channel === 'project:gitLog') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\EasySession',
          projectSubpath: '',
          commits: [],
          hasMore: false,
          message: null
        }
      }
      if (channel === 'project:gitBranches') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\EasySession',
          projectSubpath: '',
          currentBranch: 'main',
          branches: [],
          message: null
        }
      }
      if (channel === 'project:gitFileHistory') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' },
          state: 'ready',
          repoRoot: args[0]?.projectPath ?? 'D:\\EasySession',
          projectSubpath: '',
          relativePath: args[1] ?? '',
          commits: [],
          hasMore: false,
          message: null
        }
      }
      if (channel === 'project:gitCommitChanges') {
        return {
          target: { projectPath: args[0]?.projectPath ?? 'D:\\EasySession', projectName: 'EasySession' },
          state: 'ready',
          commitHash: args[1] ?? '',
          parentHash: null,
          changes: [],
          message: null
        }
      }
      if (channel === 'project:gitCommitDiff') return ''
      if (channel === 'workspace:getLayout') return structuredClone((window as any).__e2e_workspace_layout)
      if (channel === 'workspace:updateLayout') {
        ;(window as any).__e2e_workspace_layout = structuredClone(args[0])
        return args[0]
      }
      if (channel === 'workspace:resetLayout') {
        ;(window as any).__e2e_workspace_layout = structuredClone(workspaceLayout)
        return structuredClone(workspaceLayout)
      }
      return undefined
    }
  }, { sessionData: sessions, workspaceLayout: defaultWorkspaceLayout() })
}

async function navigateToSessions(page: Page) {
  await page.keyboard.press('Control+2')
  await page.waitForURL(/#\/sessions/)
  await expect(page.locator('.sessions-page')).toBeVisible()
}

async function waitForSessionStore(page: Page, id: string) {
  await page.waitForFunction((sessionId) => {
    const store = (window as any).__pinia__?._s?.get('sessions')
    return !!store?.sessions?.find((session: any) => session.id === sessionId)
  }, id)
}

async function openSessionInWorkspace(page: Page, id: string) {
  await page.evaluate((sessionId) => {
    const sessionsStore = (window as any).__pinia__?._s?.get('sessions')
    const workspaceStore = (window as any).__pinia__?._s?.get('workspace')
    const sessionRef = {
      instanceId: 'local',
      sessionId,
      globalSessionKey: `local:${sessionId}`
    }
    sessionsStore?.setActiveSessionRef(sessionRef)
    workspaceStore?.openSessionRefInActivePane(sessionRef)
  }, id)
  await expect(page.locator('.pane-session-name')).toBeVisible()
}

test.describe('快捷键测试', () => {
  test.beforeEach(async ({ page }) => {
    await setupIpcMocks(page)
  })

  test('Ctrl+1~5 导航快捷键跳转到侧边栏顺序对应路由', async ({ page }) => {
    const shortcuts = [
      { key: '1', path: '/dashboard', cls: '.dashboard' },
      { key: '2', path: '/sessions', cls: '.sessions-page' },
      { key: '3', path: '/projects', cls: '.projects-page' },
      { key: '4', path: '/skills', cls: '.skills-page' },
      { key: '5', path: '/settings', cls: '.settings-page' }
    ]

    for (const s of shortcuts) {
      await page.keyboard.press(`Control+${s.key}`)
      await page.waitForURL(new RegExp(`#${s.path}`))
      await expect(page.locator(s.cls)).toBeVisible()
    }
  })

  test('Ctrl+, 跳转到设置页', async ({ page }) => {
    await page.keyboard.press('Control+,')
    await page.waitForURL(/#\/settings/)
    await expect(page.locator('.settings-page')).toBeVisible()
  })

  test('Ctrl+N 打开新建会话对话框', async ({ page }) => {
    await page.keyboard.press('Control+n')
    await page.waitForURL(/#\/sessions/)
    await expect(page.locator('.dialog-overlay .dialog')).toBeVisible()
  })

  test('Escape 关闭对话框', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#/sessions?action=create' })
    await expect(page.locator('.dialog-overlay .dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.dialog-overlay')).toBeHidden()
  })

  test('Ctrl+W 在 sessions 页面只关闭当前 Pane 的活动 Tab，不删除会话', async ({ page }) => {
    const session = mkSession('sw1', 'test-session')
    await setupIpcMocks(page, [session])
    await navigateToSessions(page)
    await waitForSessionStore(page, session.id)
    await openSessionInWorkspace(page, session.id)

    await page.keyboard.press('Control+w')

    await page.waitForFunction(() => {
      const workspaceStore = (window as any).__pinia__?._s?.get('workspace')
      return workspaceStore?.activePane?.activeTabId === null &&
        Object.keys(workspaceStore?.layout?.tabs ?? {}).length === 0
    })

    const state = await page.evaluate((sessionId) => {
      const sessionsStore = (window as any).__pinia__?._s?.get('sessions')
      const workspaceStore = (window as any).__pinia__?._s?.get('workspace')
      return {
        sessionStillExists: !!sessionsStore?.sessions?.find((s: any) => s.id === sessionId),
        activeSessionId: sessionsStore?.activeSessionId ?? null,
        destroyCalls: (window as any).__e2e_destroy_calls,
        tabCount: Object.keys(workspaceStore?.layout?.tabs ?? {}).length
      }
    }, session.id)

    expect(state.sessionStillExists).toBe(true)
    expect(state.destroyCalls).toEqual([])
    expect(state.tabCount).toBe(0)
  })

  test('删除会话必须确认，取消不删除，确认后才销毁', async ({ page }) => {
    const session = mkSession('delete-1', 'Delete Target', 'claude', 'running', 'D:\\repo')
    await setupIpcMocks(page, [session])
    await navigateToSessions(page)
    await waitForSessionStore(page, session.id)
    await openSessionInWorkspace(page, session.id)

    await page.locator('.pane-action-btn-danger').click()
    const dialog = page.locator('.confirm-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Delete Target')
    await expect(dialog).toContainText('Claude')
    await expect(dialog).toContainText('本机')
    await expect(dialog).toContainText('D:\\repo')

    await dialog.locator('.confirm-actions .btn').first().click()
    await expect(dialog).toBeHidden()
    await waitForSessionStore(page, session.id)

    await page.locator('.pane-action-btn-danger').click()
    await expect(dialog).toBeVisible()
    await dialog.locator('.confirm-actions .btn-danger').click()

    await page.waitForFunction((sessionId) => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      return !store?.sessions?.find((s: any) => s.id === sessionId)
    }, session.id)
    const destroyCalls = await page.evaluate(() => (window as any).__e2e_destroy_calls)
    expect(destroyCalls).toEqual([session.id])
  })

  test('创建会话对话框区分基础设置和高级选项', async ({ page }) => {
    await page.keyboard.press('Control+n')
    await page.waitForURL(/#\/sessions/)
    const dialog = page.locator('.dialog')
    await expect(dialog.locator('.section-kicker')).toHaveText('基础设置')
    await expect(dialog.locator('input[type="radio"][value="claude"]')).toBeVisible()
    await expect(dialog.locator('input[type="radio"][value="codex"]')).toBeVisible()
    await expect(dialog.locator('input[type="radio"][value="opencode"]')).toBeVisible()
    await expect(dialog.locator('.path-input')).toBeVisible()
    await expect(dialog.locator('.name-row')).toBeVisible()
    await expect(dialog.locator('.startup-mode-row')).toBeVisible()
    await expect(dialog.locator('.advanced-toggle')).toBeHidden()

    await dialog.locator('input[type="radio"][value="codex"]').check()
    await expect(dialog.locator('.advanced-toggle')).toBeVisible()
    await expect(dialog.locator('.advanced-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(dialog.locator('.advanced-fields')).toBeHidden()

    await dialog.locator('.advanced-toggle').click()
    await expect(dialog.locator('.advanced-toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(dialog.locator('.advanced-fields select')).toBeVisible()

    await dialog.locator('input[type="radio"][value="opencode"]').check()
    await expect(dialog.locator('.advanced-fields input[type="text"]').first()).toBeVisible()
  })

  test('在 INPUT 中按快捷键不触发导航', async ({ page }) => {
    await page.keyboard.press('Control+1')
    await page.waitForURL(/#\/dashboard/)

    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'e2e-temp-input'
      document.body.appendChild(input)
      input.focus()
    })

    await page.keyboard.press('Control+2')
    await page.waitForTimeout(300)

    expect(page.url()).toMatch(/#\/dashboard/)

    await page.evaluate(() => document.getElementById('e2e-temp-input')?.remove())
  })

  test('侧边栏快捷键提示与实际快捷键一致', async ({ page }) => {
    const navItems = page.locator('.nav-menu > .nav-item')
    const expected = [
      { path: '/dashboard', label: 'Ctrl+1' },
      { path: '/sessions', label: 'Ctrl+2' },
      { path: '/projects', label: 'Ctrl+3' },
      { path: '/skills', label: 'Ctrl+4' }
    ]

    for (let i = 0; i < expected.length; i += 1) {
      await expect(navItems.nth(i).locator('.shortcut-hint')).toHaveText(expected[i].label)

      const key = expected[i].label.replace('Ctrl+', '')
      await page.keyboard.press(`Control+${key}`)
      await page.waitForURL(new RegExp(`#${expected[i].path}`))
    }

    const settingsItem = page.locator('.sidebar-footer .nav-item .shortcut-hint')
    await expect(settingsItem).toHaveText('Ctrl+5')
    await page.keyboard.press('Control+5')
    await page.waitForURL(/#\/settings/)
    await page.keyboard.press('Control+,')
    await page.waitForURL(/#\/settings/)
  })
})
