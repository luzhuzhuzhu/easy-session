import { test, expect } from './fixtures'

function mkProject(id: string, name: string, opts: Partial<{ path: string; createdAt: number; lastOpenedAt: number; collaborationEnabled: boolean }> = {}) {
  return {
    id,
    name,
    path: opts.path ?? `/projects/${name}`,
    createdAt: opts.createdAt ?? Date.now(),
    lastOpenedAt: opts.lastOpenedAt ?? Date.now(),
    settings: {
      collaborationEnabled: opts.collaborationEnabled ?? false,
      defaultCliType: 'both',
      claude: {},
      codex: {},
      customSettings: {}
    }
  }
}

async function navigateToProjects(page: import('@playwright/test').Page) {
  await page.locator('.nav-menu > .nav-item').nth(3).click()
  await page.waitForURL(/#\/projects/)
}

async function injectProjects(page: import('@playwright/test').Page, data: any[]) {
  await page.evaluate((json) => {
    ;(window as any).__e2e_inject__('projects', 'projects', json)
  }, JSON.stringify(data))
}

// ==================== 工具栏 ====================

test.describe('Projects - 工具栏', () => {
  test('显示 "添加项目" 按钮、搜索框、排序下拉', async ({ page }) => {
    await navigateToProjects(page)
    const toolbar = page.locator('.toolbar')
    await expect(toolbar.locator('.btn-primary')).toBeVisible()
    await expect(toolbar.locator('.search-input')).toBeVisible()
    await expect(toolbar.locator('.sort-select')).toBeVisible()
  })

  test('点击 "添加项目" 触发 dialog:selectFolder，选择后添加项目 + Toast', async ({ electronApp, page }) => {
    await navigateToProjects(page)
    // Mock dialog.showOpenDialog in main process — use app temp path (exists)
    await electronApp.evaluate(({ dialog, app }) => {
      const tmpDir = app.getPath('temp')
      ;(dialog as any)._origShowOpenDialog = dialog.showOpenDialog
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [tmpDir] })) as any
    })
    await page.locator('.toolbar .btn-primary').click()
    await expect(page.locator('.toast-item')).toBeVisible()
    await expect(page.locator('.project-card')).toHaveCount(1)
    // Cleanup
    await electronApp.evaluate(({ dialog }) => {
      if ((dialog as any)._origShowOpenDialog) {
        dialog.showOpenDialog = (dialog as any)._origShowOpenDialog
      }
    })
  })

  test('搜索框输入关键词实时过滤（匹配名称或路径）', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, [
      mkProject('p1', 'Alpha', { path: '/home/alpha' }),
      mkProject('p2', 'Beta', { path: '/home/beta' }),
      mkProject('p3', 'Gamma', { path: '/home/alpha-extra' })
    ])
    await expect(page.locator('.project-card')).toHaveCount(3)
    // Filter by name
    await page.locator('.search-input').fill('Beta')
    await expect(page.locator('.project-card')).toHaveCount(1)
    // Filter by path
    await page.locator('.search-input').fill('alpha')
    await expect(page.locator('.project-card')).toHaveCount(2)
  })

  test('排序切换：按名称(name) / 最近打开(recent) / 创建时间(created)', async ({ page }) => {
    await navigateToProjects(page)
    const now = Date.now()
    await injectProjects(page, [
      mkProject('p1', 'Charlie', { createdAt: now - 3000, lastOpenedAt: now - 1000 }),
      mkProject('p2', 'Alpha', { createdAt: now - 1000, lastOpenedAt: now - 3000 }),
      mkProject('p3', 'Bravo', { createdAt: now - 2000, lastOpenedAt: now - 2000 })
    ])
    // Sort by name
    await page.locator('.sort-select').selectOption('name')
    const nameOrder = await page.locator('.card-name').allTextContents()
    expect(nameOrder).toEqual(['Alpha', 'Bravo', 'Charlie'])
    // Sort by recent (default, descending lastOpenedAt)
    await page.locator('.sort-select').selectOption('recent')
    const recentOrder = await page.locator('.card-name').allTextContents()
    expect(recentOrder).toEqual(['Charlie', 'Bravo', 'Alpha'])
    // Sort by created (descending createdAt)
    await page.locator('.sort-select').selectOption('created')
    const createdOrder = await page.locator('.card-name').allTextContents()
    expect(createdOrder).toEqual(['Alpha', 'Bravo', 'Charlie'])
  })
})

// ==================== 空状态 ====================

test.describe('Projects - 空状态', () => {
  test('无项目时显示空状态：图标 + 提示文字 + 添加按钮', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, [])
    const empty = page.locator('.empty-state')
    await expect(empty).toBeVisible()
    await expect(empty.locator('.empty-icon')).toBeVisible()
    await expect(empty.locator('.empty-title')).toBeVisible()
    await expect(empty.locator('.empty-desc')).toBeVisible()
    await expect(empty.locator('.btn-primary')).toBeVisible()
  })

  test('空状态下的添加按钮功能与工具栏一致', async ({ electronApp, page }) => {
    await navigateToProjects(page)
    await injectProjects(page, [])
    await expect(page.locator('.empty-state')).toBeVisible()
    // Mock dialog.showOpenDialog in main process
    await electronApp.evaluate(({ dialog, app }) => {
      const tmpDir = app.getPath('temp')
      ;(dialog as any)._origShowOpenDialog = dialog.showOpenDialog
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [tmpDir] })) as any
    })
    await page.locator('.empty-state .btn-primary').click()
    await expect(page.locator('.toast-item')).toBeVisible()
    await expect(page.locator('.project-card')).toHaveCount(1)
    // Cleanup
    await electronApp.evaluate(({ dialog }) => {
      if ((dialog as any)._origShowOpenDialog) {
        dialog.showOpenDialog = (dialog as any)._origShowOpenDialog
      }
    })
  })
})

// ==================== 项目卡片网格 ====================

test.describe('Projects - 项目卡片网格', () => {
  const now = Date.now()
  const sampleProjects = [
    mkProject('p1', 'Alpha', { path: '/home/user/alpha', createdAt: now - 3000, lastOpenedAt: now - 1000, collaborationEnabled: true }),
    mkProject('p2', 'Beta', { path: '/home/user/beta', createdAt: now - 2000, lastOpenedAt: now - 2000, collaborationEnabled: false })
  ]

  test('项目以卡片网格展示（auto-fill, minmax 320px）', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    const grid = page.locator('.project-grid')
    await expect(grid).toBeVisible()
    const style = await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    // auto-fill with minmax(320px, 1fr) produces column widths >= 320px
    expect(style).toBeTruthy()
    await expect(page.locator('.project-card')).toHaveCount(2)
  })

  test('每张卡片显示：名称、路径（等宽字体）、协作状态徽章、最后打开时间', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    const card = page.locator('.project-card').first()
    await expect(card.locator('.card-name')).toBeVisible()
    await expect(card.locator('.card-path')).toBeVisible()
    await expect(card.locator('.collab-badge')).toBeVisible()
    await expect(card.locator('.card-meta')).toBeVisible()
    // Verify path uses monospace font
    const fontFamily = await card.locator('.card-path').evaluate((el) => getComputedStyle(el).fontFamily)
    expect(fontFamily).toMatch(/mono/i)
  })

  test('协作开启时徽章绿色，关闭时灰色', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    // Sort by name so Alpha (collab on) is first, Beta (collab off) is second
    await page.locator('.sort-select').selectOption('name')
    const badges = page.locator('.collab-badge')
    // Alpha has collaborationEnabled: true → .on class
    await expect(badges.nth(0)).toHaveClass(/\bon\b/)
    // Beta has collaborationEnabled: false → no .on class
    await expect(badges.nth(1)).not.toHaveClass(/\bon\b/)
  })

  test('hover 卡片时显示操作按钮（设置、打开文件夹、删除）', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    const card = page.locator('.project-card').first()
    const actions = card.locator('.card-actions')
    // Before hover, actions should be hidden (opacity: 0)
    await expect(actions).toHaveCSS('opacity', '0')
    // Hover the card
    await card.hover()
    await expect(actions).toHaveCSS('opacity', '1')
    // Verify 3 action buttons exist
    await expect(actions.locator('.icon-btn')).toHaveCount(3)
  })

  test('点击卡片跳转到 /projects/:id', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    await page.locator('.project-card').first().click()
    await page.waitForURL(/#\/projects\/p1/)
  })

  test('点击 "打开文件夹" 按钮调用 shell:openPath IPC', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    // Intercept electronAPI.invoke to capture the IPC call
    await page.evaluate(() => {
      ;(window as any).__ipcCalls = []
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        ;(window as any).__ipcCalls.push([channel, ...args])
        return undefined
      }
    })
    const card = page.locator('.project-card').first()
    await card.hover()
    // Click the "open folder" button (2nd icon-btn)
    await card.locator('.icon-btn').nth(1).click()
    const calls = await page.evaluate(() => (window as any).__ipcCalls)
    expect(calls.some((c: any[]) => c[0] === 'shell:openPath')).toBeTruthy()
  })

  test('点击删除按钮弹出 confirm，确认后移除项目 + Toast', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    await expect(page.locator('.project-card')).toHaveCount(2)
    const card = page.locator('.project-card').first()
    await card.hover()
    // Listen for dialog (confirm) and accept it
    page.on('dialog', (dialog) => dialog.accept())
    // Click the delete button (3rd icon-btn, has .danger class)
    await card.locator('.icon-btn.danger').click()
    await expect(page.locator('.toast-item')).toBeVisible()
    await expect(page.locator('.project-card')).toHaveCount(1)
  })
})

// ==================== 搜索与排序联动 ====================

test.describe('Projects - 搜索与排序联动', () => {
  test('搜索 + 排序同时生效（先过滤再排序）', async ({ page }) => {
    await navigateToProjects(page)
    const now = Date.now()
    await injectProjects(page, [
      mkProject('p1', 'Alpha-App', { path: '/home/alpha', createdAt: now - 3000, lastOpenedAt: now - 1000 }),
      mkProject('p2', 'Beta-Service', { path: '/home/beta', createdAt: now - 1000, lastOpenedAt: now - 3000 }),
      mkProject('p3', 'Alpha-Lib', { path: '/home/alpha-lib', createdAt: now - 2000, lastOpenedAt: now - 2000 }),
      mkProject('p4', 'Gamma-Tool', { path: '/home/gamma', createdAt: now - 500, lastOpenedAt: now - 500 })
    ])
    await expect(page.locator('.project-card')).toHaveCount(4)
    // Search for "Alpha" — should filter to 2 results
    await page.locator('.search-input').fill('Alpha')
    await expect(page.locator('.project-card')).toHaveCount(2)
    // Sort by name — Alpha-App before Alpha-Lib
    await page.locator('.sort-select').selectOption('name')
    const nameOrder = await page.locator('.card-name').allTextContents()
    expect(nameOrder).toEqual(['Alpha-App', 'Alpha-Lib'])
    // Sort by recent (descending lastOpenedAt) — Alpha-App (now-1000) before Alpha-Lib (now-2000)
    await page.locator('.sort-select').selectOption('recent')
    const recentOrder = await page.locator('.card-name').allTextContents()
    expect(recentOrder).toEqual(['Alpha-App', 'Alpha-Lib'])
    // Sort by created (descending createdAt) — Alpha-Lib (now-2000) before Alpha-App (now-3000)
    await page.locator('.sort-select').selectOption('created')
    const createdOrder = await page.locator('.card-name').allTextContents()
    expect(createdOrder).toEqual(['Alpha-Lib', 'Alpha-App'])
  })

  test('搜索无结果时显示空状态', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, [
      mkProject('p1', 'Alpha', { path: '/home/alpha' }),
      mkProject('p2', 'Beta', { path: '/home/beta' })
    ])
    await expect(page.locator('.project-card')).toHaveCount(2)
    // Search for non-existent keyword
    await page.locator('.search-input').fill('zzz-no-match')
    await expect(page.locator('.project-card')).toHaveCount(0)
    await expect(page.locator('.empty-state')).toBeVisible()
  })
})

// ==================== 右键菜单 ====================

// Electron 中 Playwright dispatchEvent 不触发 Vue @contextmenu，需用 evaluate 构造完整 MouseEvent
async function rightClickCard(page: import('@playwright/test').Page, nth = 0) {
  await page.locator('.project-card').nth(nth).waitFor({ state: 'visible' })
  await page.evaluate((idx) => {
    const el = document.querySelectorAll('.project-card')[idx]!
    const rect = el.getBoundingClientRect()
    el.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, view: window,
      clientX: rect.left + 10, clientY: rect.top + 10, button: 2
    }))
  }, nth)
}

test.describe('Projects - 右键菜单', () => {
  const now = Date.now()
  const sampleProjects = [
    mkProject('p1', 'Alpha', { path: '/home/user/alpha', createdAt: now - 3000, lastOpenedAt: now - 1000, collaborationEnabled: true }),
    mkProject('p2', 'Beta', { path: '/home/user/beta', createdAt: now - 2000, lastOpenedAt: now - 2000, collaborationEnabled: false })
  ]

  test('右键卡片弹出菜单：设置、打开文件夹、移除', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    await rightClickCard(page, 0)
    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    const items = menu.locator('.context-item')
    await expect(items).toHaveCount(3)
    const texts = await items.allTextContents()
    expect(texts.length).toBe(3)
    await expect(items.nth(2)).toHaveClass(/danger/)
  })

  test('菜单操作与按钮操作一致', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    // Open folder: right-click → click "打开文件夹" → menu closes (handler ran)
    await rightClickCard(page, 0)
    await expect(page.locator('.context-menu')).toBeVisible()
    await page.locator('.context-menu .context-item').nth(1).click()
    await expect(page.locator('.context-menu')).not.toBeVisible()
    // Remove: right-click 2nd card → confirm → toast + card removed
    page.on('dialog', (d) => d.accept())
    await page.evaluate(() => { (window as any).confirm = () => true })
    await rightClickCard(page, 1)
    await expect(page.locator('.context-menu')).toBeVisible()
    await page.locator('.context-menu .context-item.danger').click()
    await expect(page.locator('.project-card')).toHaveCount(1)
    // Settings: right-click → click "设置" → navigates to /projects/:id
    await rightClickCard(page, 0)
    await page.locator('.context-menu .context-item').first().click()
    await page.waitForURL(/#\/projects\/p1/)
  })

  test('点击遮罩关闭菜单', async ({ page }) => {
    await navigateToProjects(page)
    await injectProjects(page, sampleProjects)
    await rightClickCard(page, 0)
    await expect(page.locator('.context-menu')).toBeVisible()
    await page.locator('.context-overlay').click()
    await expect(page.locator('.context-menu')).not.toBeVisible()
  })
})
