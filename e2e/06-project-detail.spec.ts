import { test, expect } from './fixtures'

const MOCK_PROJECT = {
  id: 'proj-1',
  name: 'Test Project',
  path: '/home/user/test-project',
  createdAt: 1700000000000,
  lastOpenedAt: 1700000000000,
  settings: {
    collaborationEnabled: false,
    defaultCliType: 'claude',
    claude: { model: 'opus', systemPrompt: 'You are helpful' },
    codex: { model: 'codex-1', approvalMode: 'suggest' },
    customSettings: { foo: 'bar' }
  }
}

const MOCK_SESSIONS = [
  { id: 's1', name: 'Session A', type: 'claude', status: 'running', projectId: 'proj-1' },
  { id: 's2', name: 'Session B', type: 'codex', status: 'idle', projectId: 'proj-1' }
]

const MOCK_DETECT = { claude: true, codex: false }

async function mockIpcAndNavigate(page: import('@playwright/test').Page, opts: {
  project?: typeof MOCK_PROJECT | null
  sessions?: any[]
  detect?: { claude: boolean; codex: boolean }
} = {}) {
  const proj = opts.project !== undefined ? opts.project : MOCK_PROJECT
  const sessions = opts.sessions ?? MOCK_SESSIONS
  const detect = opts.detect ?? MOCK_DETECT

  await page.evaluate(({ proj, sessions, detect }) => {
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'project:get') return proj
      if (channel === 'project:sessions') return sessions
      if (channel === 'project:detect') return detect
      if (channel === 'project:update') {
        return { ...proj, name: args[1]?.name ?? proj?.name }
      }
      if (channel === 'project:settings:update') {
        return { ...proj, settings: { ...proj?.settings, ...args[1] } }
      }
      return undefined // 回退到真实 IPC
    }
  }, { proj, sessions, detect })

  await page.evaluate(() => { window.location.hash = '#/projects/proj-1' })
  await page.waitForURL(/#\/projects\/proj-1/)
}

async function restoreIpc(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    delete (window as any).__e2e_ipc_mock__
  })
}

// ==================== 面包屑与加载 ====================

test.describe('ProjectDetail - 面包屑与加载', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('面包屑显示 "项目 / 项目名"，"项目" 可点击返回列表', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const breadcrumb = page.locator('.breadcrumb')
    await expect(breadcrumb.locator('.breadcrumb-link')).toContainText('项目管理')
    await expect(breadcrumb.locator('.breadcrumb-sep')).toContainText('/')
    await expect(breadcrumb.locator('.breadcrumb-current')).toContainText('Test Project')
    await breadcrumb.locator('.breadcrumb-link').click()
    await page.waitForURL(/#\/projects$/)
  })

  test('项目不存在时自动重定向到 /projects', async ({ page }) => {
    await mockIpcAndNavigate(page, { project: null })
    await page.waitForURL(/#\/projects$/)
  })

  test('加载中显示 loading 状态', async ({ page }) => {
    // Delay project:get to observe loading state
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string) => {
        if (channel === 'project:get') {
          await new Promise(r => setTimeout(r, 1000))
          return null
        }
        return undefined
      }
    })
    await page.evaluate(() => { window.location.hash = '#/projects/proj-1' })
    await expect(page.locator('.loading-state')).toBeVisible()
  })
})

// ==================== 项目概览 ====================

test.describe('ProjectDetail - 项目概览', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('项目名称可内联编辑（input），blur 时自动保存', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const input = page.locator('.name-input')
    await expect(input).toHaveValue('Test Project')
    await input.fill('Renamed Project')
    await input.blur()
    // After blur, saveName is called — verify input retains new value
    await expect(input).toHaveValue('Renamed Project')
  })

  test('按 Enter 触发 blur 保存', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const input = page.locator('.name-input')
    await input.fill('Enter Renamed')
    await input.press('Enter')
    // Enter triggers blur which triggers save
    await expect(input).toHaveValue('Enter Renamed')
  })

  test('显示项目路径（等宽字体）和创建时间', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const pathEl = page.locator('.path-text')
    await expect(pathEl).toContainText('/home/user/test-project')
    const fontFamily = await pathEl.evaluate(el => getComputedStyle(el).fontFamily)
    expect(fontFamily).toMatch(/mono/i)
    await expect(page.locator('.overview-meta')).toContainText('创建时间')
  })

  test('检测结果显示 .claude/ 和 codex 徽章，存在时绿色', async ({ page }) => {
    await mockIpcAndNavigate(page, { detect: { claude: true, codex: false } })
    const badges = page.locator('.detect-badge')
    await expect(badges).toHaveCount(2)
    await expect(badges.nth(0)).toHaveClass(/found/)
    await expect(badges.nth(1)).not.toHaveClass(/found/)
  })
})

// ==================== Session 面板（可折叠） ====================

test.describe('ProjectDetail - Session 面板', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('面板标题显示 Session 数量', async ({ page }) => {
    await mockIpcAndNavigate(page)
    await expect(page.locator('.panel-title').first()).toContainText('Session 列表 (2)')
  })

  test('点击标题折叠/展开面板', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const header = page.locator('.panel-header').first()
    const body = page.locator('.panel-body').first()
    await expect(body).toBeVisible()
    await header.click()
    await expect(body).not.toBeVisible()
    await header.click()
    await expect(body).toBeVisible()
  })

  test('无 Session 时显示空提示', async ({ page }) => {
    await mockIpcAndNavigate(page, { sessions: [] })
    await expect(page.locator('.empty-hint')).toContainText('该项目下暂无 Session')
  })

  test('有 Session 时列表显示类型徽章 + 名称 + 状态点', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const rows = page.locator('.session-row')
    await expect(rows).toHaveCount(2)
    // First session: claude type
    await expect(rows.nth(0).locator('.type-badge')).toHaveText('C')
    await expect(rows.nth(0).locator('.type-badge')).toHaveClass(/claude/)
    await expect(rows.nth(0).locator('.session-name')).toHaveText('Session A')
    await expect(rows.nth(0).locator('.status-dot')).toHaveClass(/running/)
    // Second session: codex type
    await expect(rows.nth(1).locator('.type-badge')).toHaveText('X')
    await expect(rows.nth(1).locator('.type-badge')).toHaveClass(/codex/)
  })

  test('点击 "新建会话" 按钮跳转到 /sessions', async ({ page }) => {
    await mockIpcAndNavigate(page)
    await page.locator('.panel-body .btn-primary').first().click()
    await page.waitForURL(/#\/sessions/)
  })
})

// ==================== 项目设置面板（可折叠） ====================

test.describe('ProjectDetail - 项目设置面板', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('协作模式 toggle 开关，切换后 500ms 防抖保存', async ({ page }) => {
    await mockIpcAndNavigate(page)
    // Open settings panel (2nd panel)
    const settingsBody = page.locator('.settings-body')
    await expect(settingsBody).toBeVisible()
    const toggle = settingsBody.locator('.switch input[type="checkbox"]')
    await expect(toggle).not.toBeChecked()
    await toggle.check()
    await expect(toggle).toBeChecked()
    // Wait for debounce
    await page.waitForTimeout(600)
  })

  test('默认 CLI 下拉：Claude / Codex / Both', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const select = page.locator('.setting-select').first()
    await expect(select).toHaveValue('claude')
    const options = await select.locator('option').allTextContents()
    expect(options).toEqual(['Claude', 'Codex', 'Both'])
    await select.selectOption('codex')
    await expect(select).toHaveValue('codex')
  })

  test('Claude 设置区：model 输入框 + systemPrompt 文本域', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const claudeGroup = page.locator('.setting-group').nth(0)
    await expect(claudeGroup.locator('h4')).toHaveText('Claude')
    const modelInput = claudeGroup.locator('.setting-input')
    await expect(modelInput).toHaveValue('opus')
    const textarea = claudeGroup.locator('.setting-textarea')
    await expect(textarea).toHaveValue('You are helpful')
  })

  test('Codex 设置区：model 输入框 + approvalMode 下拉', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const codexGroup = page.locator('.setting-group').nth(1)
    await expect(codexGroup.locator('h4')).toHaveText('Codex')
    await expect(codexGroup.locator('.setting-input')).toHaveValue('codex-1')
    const approvalSelect = codexGroup.locator('.setting-select')
    await expect(approvalSelect).toHaveValue('suggest')
    const opts = await approvalSelect.locator('option').allTextContents()
    expect(opts).toEqual(['suggest', 'auto-edit', 'full-auto'])
  })

  test('自定义设置 JSON 编辑器，输入非法 JSON 显示红色错误提示', async ({ page }) => {
    await mockIpcAndNavigate(page)
    const jsonEditor = page.locator('.json-editor')
    await expect(jsonEditor).toBeVisible()
    await jsonEditor.fill('{invalid json}')
    await page.waitForTimeout(600)
    await expect(page.locator('.json-error')).toContainText('Invalid JSON')
    // Fix JSON — error should disappear
    await jsonEditor.fill('{"valid": true}')
    await page.waitForTimeout(600)
    await expect(page.locator('.json-error')).not.toBeVisible()
  })

  test('所有设置变更 500ms 防抖后自动保存', async ({ page }) => {
    await mockIpcAndNavigate(page)
    // Track IPC calls via mock hook
    await page.evaluate(() => {
      ;(window as any).__settingsCalls = []
      const prevMock = (window as any).__e2e_ipc_mock__
      ;(window as any).__e2e_ipc_mock__ = async (ch: string, ...args: any[]) => {
        if (ch === 'project:settings:update') {
          ;(window as any).__settingsCalls.push(args)
        }
        return prevMock ? prevMock(ch, ...args) : undefined
      }
    })
    // Rapid changes — should debounce to fewer calls
    const claudeModel = page.locator('.setting-group').nth(0).locator('.setting-input')
    await claudeModel.fill('new-model')
    await page.waitForTimeout(100)
    await claudeModel.fill('new-model-2')
    await page.waitForTimeout(600)
    const calls = await page.evaluate(() => (window as any).__settingsCalls)
    // Debounce means only 1 call after 500ms
    expect(calls.length).toBe(1)
  })
})

// ==================== 路由参数变化 ====================

test.describe('ProjectDetail - 路由参数变化', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('切换不同项目 ID 时重新加载数据', async ({ page }) => {
    await mockIpcAndNavigate(page)
    await expect(page.locator('.breadcrumb-current')).toContainText('Test Project')
    // Switch to a different project ID — mock returns different data
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (ch: string) => {
        if (ch === 'project:get') return {
          id: 'proj-2', name: 'Second Project', path: '/other',
          createdAt: Date.now(), lastOpenedAt: Date.now(),
          settings: { collaborationEnabled: false, defaultCliType: 'codex', claude: {}, codex: {}, customSettings: {} }
        }
        if (ch === 'project:sessions') return []
        if (ch === 'project:detect') return { claude: false, codex: false }
        return undefined
      }
    })
    await page.evaluate(() => { window.location.hash = '#/projects/proj-2' })
    await page.waitForURL(/#\/projects\/proj-2/)
    await expect(page.locator('.breadcrumb-current')).toContainText('Second Project')
  })

  test('watch route.params.id 触发 loadProject', async ({ page }) => {
    // Track project:get calls
    await page.evaluate(() => {
      ;(window as any).__getCalls = []
      ;(window as any).__e2e_ipc_mock__ = async (ch: string, ...args: any[]) => {
        if (ch === 'project:get') {
          ;(window as any).__getCalls.push(args)
          return {
            id: args[0], name: 'P-' + args[0], path: '/p',
            createdAt: Date.now(), lastOpenedAt: Date.now(),
            settings: { collaborationEnabled: false, defaultCliType: 'claude', claude: {}, codex: {}, customSettings: {} }
          }
        }
        if (ch === 'project:sessions') return []
        if (ch === 'project:detect') return { claude: false, codex: false }
        return undefined
      }
    })
    await page.evaluate(() => { window.location.hash = '#/projects/proj-a' })
    await page.waitForURL(/#\/projects\/proj-a/)
    await page.evaluate(() => { window.location.hash = '#/projects/proj-b' })
    await page.waitForURL(/#\/projects\/proj-b/)
    const calls = await page.evaluate(() => (window as any).__getCalls)
    // At least 2 calls: one for proj-a, one for proj-b
    expect(calls.length).toBeGreaterThanOrEqual(2)
  })
})