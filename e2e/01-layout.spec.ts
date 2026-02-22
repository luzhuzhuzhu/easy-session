import { test, expect } from './fixtures'

test.describe('主布局 - 侧边栏', () => {
  test('侧边栏默认展开，显示 Logo、品牌名、副标题', async ({ page }) => {
    const layout = page.locator('.layout')
    await expect(layout).not.toHaveClass(/collapsed/)

    const logo = page.locator('.sidebar-header .logo')
    await expect(logo).toBeVisible()
    await expect(logo).toHaveText('⚡')

    const brandTitle = page.locator('.brand-title')
    await expect(brandTitle).toBeVisible()
    await expect(brandTitle).toHaveText('Claude-Codex-Mix')

    const brandSubtitle = page.locator('.brand-subtitle')
    await expect(brandSubtitle).toBeVisible()
    await expect(brandSubtitle).toHaveText('AI 协同工作平台')
  })

  test('导航菜单包含 6 个主项：仪表盘、配置、会话、项目、编排、技能', async ({ page }) => {
    const navItems = page.locator('.nav-menu > .nav-item')
    await expect(navItems).toHaveCount(6)

    const expectedLabels = ['仪表盘', '配置管理', 'Session 管理', '项目管理', '协同编排', 'Skill 管理']
    for (let i = 0; i < expectedLabels.length; i++) {
      await expect(navItems.nth(i).locator('.nav-text')).toHaveText(expectedLabels[i])
    }
  })

  test('每个导航项显示图标 + 文字 + 快捷键提示', async ({ page }) => {
    const navItems = page.locator('.nav-menu > .nav-item')
    const expectedIcons = ['📊', '⚙️', '💬', '📁', '🔗', '🧩']
    const expectedShortcuts = ['Ctrl+1', 'Ctrl+2', 'Ctrl+3', 'Ctrl+4', 'Ctrl+5', 'Ctrl+6']

    for (let i = 0; i < 6; i++) {
      const item = navItems.nth(i)
      await expect(item.locator('.nav-icon')).toBeVisible()
      await expect(item.locator('.nav-icon')).toHaveText(expectedIcons[i])
      await expect(item.locator('.nav-text')).toBeVisible()
      await expect(item.locator('.shortcut-hint')).toHaveText(expectedShortcuts[i])
    }
  })

  test('侧边栏底部显示设置入口 + 版本号', async ({ page }) => {
    const footer = page.locator('.sidebar-footer')
    const settingsLink = footer.locator('.nav-item')
    await expect(settingsLink).toBeVisible()
    await expect(settingsLink.locator('.nav-icon')).toHaveText('⚙')
    await expect(settingsLink.locator('.nav-text')).toHaveText('设置')

    const version = footer.locator('.sidebar-version')
    await expect(version).toBeVisible()
    await expect(version).toHaveText(/^v\d+/)
  })

  test('点击折叠按钮（«），侧边栏收起为图标模式，文字隐藏', async ({ page }) => {
    const collapseBtn = page.locator('.collapse-btn')
    await expect(collapseBtn).toHaveText('«')
    await collapseBtn.click()

    await expect(page.locator('.layout')).toHaveClass(/collapsed/)
    // v-if 移除了 .nav-text 元素
    await expect(page.locator('.nav-menu .nav-text').first()).toBeHidden()
    // 折叠按钮变为 »
    await expect(collapseBtn).toHaveText('»')
  })

  test('折叠状态下 hover 导航项显示 title tooltip', async ({ page }) => {
    await page.locator('.collapse-btn').click()
    await expect(page.locator('.layout')).toHaveClass(/collapsed/)

    const navItems = page.locator('.nav-menu > .nav-item')
    const expectedTitles = ['仪表盘', '配置管理', 'Session 管理', '项目管理', '协同编排', 'Skill 管理']
    for (let i = 0; i < expectedTitles.length; i++) {
      await expect(navItems.nth(i)).toHaveAttribute('title', expectedTitles[i])
    }
  })

  test('再次点击展开按钮（»），侧边栏恢复展开', async ({ page }) => {
    // 先折叠
    await page.locator('.collapse-btn').click()
    await expect(page.locator('.layout')).toHaveClass(/collapsed/)
    // 再展开
    await page.locator('.collapse-btn').click()
    await expect(page.locator('.layout')).not.toHaveClass(/collapsed/)
    await expect(page.locator('.brand-title')).toBeVisible()
    await expect(page.locator('.nav-menu .nav-text').first()).toBeVisible()
  })

  test('项目导航项下方显示最近 3 个项目的子菜单（有项目数据时）', async ({ page }) => {
    const s = { collaborationEnabled: false, defaultCliType: 'both', claude: {}, codex: {}, customSettings: {} }
    const jsonStr = JSON.stringify([
      { id: 'p1', name: '项目A', path: '/a', createdAt: 1000, lastOpenedAt: 3000, settings: s },
      { id: 'p2', name: '项目B', path: '/b', createdAt: 2000, lastOpenedAt: 2000, settings: s },
      { id: 'p3', name: '项目C', path: '/c', createdAt: 3000, lastOpenedAt: 1000, settings: s }
    ])

    // 等待初始 fetchProjects 完成，再注入数据（防止异步覆盖）
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('projects')
      return store && !store.loading
    })

    // 通过 __e2e_inject__ 注入数据（内部会禁用 fetchProjects 防止覆盖）
    await page.evaluate((json) => {
      ;(window as any).__e2e_inject__('projects', 'projects', json)
    }, jsonStr)

    const navSub = page.locator('.nav-sub')
    await expect(navSub).toBeVisible()

    const subItems = navSub.locator('.nav-sub-item')
    await expect(subItems).toHaveCount(3)

    // 按 lastOpenedAt 降序：项目A(3000) > 项目B(2000) > 项目C(1000)
    await expect(subItems.nth(0)).toHaveText('项目A')
    await expect(subItems.nth(1)).toHaveText('项目B')
    await expect(subItems.nth(2)).toHaveText('项目C')

    // 子菜单项链接到项目详情页
    await expect(subItems.nth(0)).toHaveAttribute('href', /\/projects\/p1/)
  })

  test('点击导航项跳转到对应路由，当前项高亮（router-link-active）', async ({ page }) => {
    const paths = ['/dashboard', '/config', '/sessions', '/projects', '/orchestration', '/skills']
    const navItems = page.locator('.nav-menu > .nav-item')

    for (let i = 0; i < paths.length; i++) {
      await navItems.nth(i).click()
      await page.waitForURL(new RegExp(`#${paths[i]}`))
      await expect(navItems.nth(i)).toHaveClass(/router-link-active/)
    }
  })
})

test.describe('主布局 - 顶栏', () => {
  test('顶栏显示面包屑导航，根据当前路由动态变化', async ({ page }) => {
    const breadcrumb = page.locator('.breadcrumb')
    await expect(breadcrumb).toBeVisible()

    // 默认在 dashboard，面包屑显示"仪表盘"
    await expect(breadcrumb.locator('.breadcrumb-current')).toHaveText('仪表盘')

    // 切换到配置页
    await page.locator('.nav-menu > .nav-item').nth(1).click()
    await page.waitForURL(/#\/config/)
    await expect(breadcrumb.locator('.breadcrumb-current')).toHaveText('配置管理')

    // 切换到会话页
    await page.locator('.nav-menu > .nav-item').nth(2).click()
    await page.waitForURL(/#\/sessions/)
    await expect(breadcrumb.locator('.breadcrumb-current')).toHaveText('Session 管理')
  })

  test('项目详情页面包屑显示：项目 / 项目名，项目可点击返回列表', async ({ electronApp, page }) => {
    const proj = {
      id: 'p1', name: '测试项目', path: '/test', createdAt: 1000, lastOpenedAt: 3000,
      settings: { collaborationEnabled: false, defaultCliType: 'both', claude: {}, codex: {}, customSettings: {} }
    }

    // 主进程注入项目数据，使 project:get IPC 返回数据
    await electronApp.evaluate(({ }, p) => {
      const pm = (global as any).__projectManager__
      if (pm) pm.projects.set(p.id, p)
    }, proj)

    // 渲染进程注入 store 数据
    await page.evaluate((json) => {
      ;(window as any).__e2e_inject__('projects', 'projects', json)
    }, JSON.stringify([proj]))

    await page.evaluate(() => { window.location.hash = '#/projects/p1' })
    await page.waitForURL(/#\/projects\/p1/)

    // 顶栏面包屑
    const bc = page.locator('.topbar .breadcrumb')
    const link = bc.locator('.breadcrumb-link')
    await expect(link).toHaveText('项目管理')
    await expect(link).toHaveAttribute('href', /\/projects/)
    await expect(bc.locator('.breadcrumb-current')).toHaveText('测试项目')
    await expect(bc.locator('.breadcrumb-sep')).toBeVisible()

    await link.click()
    await page.waitForURL(/#\/projects/)
  })

  test('顶栏右侧显示 Claude 和 Codex 状态指示灯', async ({ page }) => {
    const indicators = page.locator('.status-indicators')
    await expect(indicators).toBeVisible()

    const dots = indicators.locator('.status-dot')
    await expect(dots).toHaveCount(2)

    const labels = indicators.locator('.status-label')
    await expect(labels.nth(0)).toHaveText('Claude')
    await expect(labels.nth(1)).toHaveText('Codex')
  })

  test('Claude 在线时状态点为绿色（.online），离线为灰色（.offline）', async ({ page }) => {
    const dots = page.locator('.status-indicators .status-dot')

    // 默认离线状态
    await expect(dots.nth(0)).toHaveClass(/offline/)

    // 注入 claudeAvailable = true
    await page.evaluate(() => {
      ;(window as any).__e2e_inject__('app', 'claudeAvailable', JSON.stringify(true))
    })
    await expect(dots.nth(0)).toHaveClass(/online/)
  })

  test('有运行中 Session 时显示活跃 Session 计数徽章', async ({ page }) => {
    // 默认无活跃 session，徽章不显示
    await expect(page.locator('.session-count')).toBeHidden()

    // 注入运行中的 session
    const jsonStr = JSON.stringify([
      { id: 's1', name: 'test', type: 'claude', status: 'running', projectPath: '/a', createdAt: 1000 },
      { id: 's2', name: 'test2', type: 'codex', status: 'running', projectPath: '/b', createdAt: 2000 }
    ])
    await page.evaluate((json) => {
      ;(window as any).__e2e_inject__('sessions', 'sessions', json)
    }, jsonStr)

    const badge = page.locator('.session-count')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('2')
  })

  test('窗口控制按钮：最小化（─）、最大化（☐）、关闭（✕）', async ({ page }) => {
    const controls = page.locator('.window-controls')
    const buttons = controls.locator('.win-btn')
    await expect(buttons).toHaveCount(3)

    await expect(buttons.nth(0)).toHaveText('─')
    await expect(buttons.nth(1)).toHaveText('☐')
    await expect(buttons.nth(2)).toHaveText('✕')
  })

  test('关闭按钮 hover 时背景变红', async ({ page }) => {
    const closeBtn = page.locator('.win-btn-close')
    await expect(closeBtn).toBeVisible()

    await closeBtn.hover()
    // 等待 CSS transition 完成
    await page.waitForTimeout(300)

    const bg = await closeBtn.evaluate((el) => getComputedStyle(el).backgroundColor)
    // --status-error 应为红色系，rgb 红色分量 > 150
    const match = bg.match(/rgba?\((\d+)/)
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeGreaterThan(150)
  })

  test('双击顶栏触发最大化/还原', async ({ electronApp, page }) => {
    // 获取 BrowserWindow 并检查初始状态
    const isMaxBefore = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].isMaximized()
    })

    // topbar 有 -webkit-app-region: drag，Playwright 鼠标事件被系统拦截
    // 通过 topbar-right（no-drag 区域）的父级 topbar 触发 dblclick
    // 使用 page.evaluate 直接调用 Vue 绑定的 dblclick handler
    await page.evaluate(() => {
      document.querySelector('.topbar')!.dispatchEvent(
        new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window })
      )
    })
    await page.waitForTimeout(500)

    const isMaxAfter = await electronApp.evaluate(({ BrowserWindow }) => {
      return BrowserWindow.getAllWindows()[0].isMaximized()
    })
    expect(isMaxAfter).not.toBe(isMaxBefore)
  })
})
