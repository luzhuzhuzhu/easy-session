import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

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

function fullCapabilities(overrides: Record<string, boolean> = {}) {
  return {
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
    localPathOpen: true,
    ...overrides
  }
}

async function setupIpcMocks(page: Page) {
  await page.evaluate((workspaceLayout) => {
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'remote-instance:list') return []
      if (channel === 'project:list') return []
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

async function injectOfflineRemoteSession(page: Page) {
  await page.evaluate((capabilities) => {
    const settingsStore = (window as any).__pinia__?._s?.get('settings')
    const instancesStore = (window as any).__pinia__?._s?.get('instances')
    const sessionsStore = (window as any).__pinia__?._s?.get('sessions')
    const workspaceStore = (window as any).__pinia__?._s?.get('workspace')

    settingsStore.settings.desktopRemoteMountEnabled = true
    const remoteInstance = {
      id: 'remote-offline-1',
      type: 'remote',
      name: '远程工作站',
      baseUrl: 'https://remote.example.test',
      enabled: true,
      authRef: 'e2e',
      status: 'offline',
      lastCheckedAt: Date.now(),
      passthroughOnly: false,
      capabilities,
      lastError: '连接超时',
      latencyMs: null
    }
    const remoteSession = {
      instanceId: remoteInstance.id,
      sessionId: 'remote-session-1',
      globalSessionKey: `${remoteInstance.id}:remote-session-1`,
      name: 'Remote Offline Session',
      icon: null,
      type: 'codex',
      projectPath: '/remote/repo',
      status: 'running',
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      processId: 'remote-process',
      options: {},
      parentId: null,
      source: 'remote'
    }
    const sessionRef = {
      instanceId: remoteInstance.id,
      sessionId: remoteSession.sessionId,
      globalSessionKey: remoteSession.globalSessionKey
    }

    instancesStore.remoteInstances = [remoteInstance]
    sessionsStore.remoteSessionsByInstance = {
      [remoteInstance.id]: [remoteSession]
    }
    sessionsStore.setActiveSessionRef(sessionRef)
    workspaceStore.openSessionRefInActivePane(sessionRef)
  }, fullCapabilities({
    sessionStart: false,
    sessionPause: false,
    sessionRestart: false,
    sessionDestroy: false,
    sessionInput: false,
    sessionSubscribe: false,
    sessionOutputHistory: false,
    sessionResize: false
  }))
}

test.describe('远程离线和能力禁用状态', () => {
  test.beforeEach(async ({ page }) => {
    await setupIpcMocks(page)
  })

  test('远程离线 Tab 保留但不渲染终端，也不暴露不可用会话动作', async ({ page }) => {
    await navigateToSessions(page)
    await injectOfflineRemoteSession(page)

    await expect(page.locator('.pane-session-name')).toHaveText('Remote Offline Session')
    await expect(page.locator('.status-tag.offline')).toContainText('离线')
    await expect(page.locator('.pane-unavailable.offline')).toBeVisible()
    await expect(page.locator('.pane-unavailable.offline')).toContainText('远程工作站')
    await expect(page.locator('.pane-unavailable.offline')).toContainText('连接超时')
    await expect(page.locator('.pane-unavailable-action')).toContainText('重新测试或编辑远程实例')

    await expect(page.locator('.terminal-output')).toBeHidden()
    await expect(page.locator('.pane-action-btn-primary')).toBeHidden()
    await expect(page.locator('.pane-action-btn-danger')).toBeHidden()
    await expect(page.locator('.pane-action-btn')).toHaveCount(0)
  })
})
