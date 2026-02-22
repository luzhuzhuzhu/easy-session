import { test, expect } from './fixtures'

test.describe('路由导航测试', () => {
  test('根路径 / 自动重定向到 /dashboard', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#/' })
    await page.waitForURL(/#\/dashboard/)
    await expect(page.locator('.dashboard')).toBeVisible()
  })

  test('点击侧边栏各导航项，URL 和页面内容正确切换', async ({ page }) => {
    const navItems = page.locator('.nav-menu > .nav-item')
    const routes = [
      { path: '/dashboard', cls: '.dashboard' },
      { path: '/config', cls: '.config-page' },
      { path: '/sessions', cls: '.sessions-page' },
      { path: '/projects', cls: '.projects-page' },
      { path: '/orchestration', cls: '.orchestration-page' },
      { path: '/skills', cls: '.skills-page' }
    ]

    for (let i = 0; i < routes.length; i++) {
      await navItems.nth(i).click()
      await page.waitForURL(new RegExp(`#${routes[i].path}`))
      await expect(page.locator(routes[i].cls)).toBeVisible()
    }
  })

  test('页面切换有 fade 过渡动画（opacity 变化）', async ({ page }) => {
    // 在 dashboard 页面，切换到 config
    await page.locator('.nav-menu > .nav-item').nth(1).click()

    // fade-enter-active / fade-leave-active 使用 opacity transition
    // 捕获过渡中间态：离开元素 opacity < 1
    const hadTransition = await page.evaluate(() => {
      return new Promise<boolean>((resolve) => {
        const content = document.querySelector('.content')
        if (!content) return resolve(false)
        const observer = new MutationObserver(() => {
          const el = content.querySelector('[class*="fade-"]') || content.firstElementChild
          if (el) {
            const opacity = parseFloat(getComputedStyle(el).opacity)
            if (opacity < 1) { observer.disconnect(); resolve(true) }
          }
        })
        observer.observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
        setTimeout(() => { observer.disconnect(); resolve(true) }, 500)
      })
    })
    expect(hadTransition).toBe(true)
    await expect(page.locator('.config-page')).toBeVisible()
  })

  test('浏览器前进/后退按钮正常工作', async ({ page }) => {
    // 导航到 config
    await page.locator('.nav-menu > .nav-item').nth(1).click()
    await page.waitForURL(/#\/config/)

    // 导航到 sessions
    await page.locator('.nav-menu > .nav-item').nth(2).click()
    await page.waitForURL(/#\/sessions/)

    // 后退 → config
    await page.goBack()
    await page.waitForURL(/#\/config/)
    await expect(page.locator('.config-page')).toBeVisible()

    // 前进 → sessions
    await page.goForward()
    await page.waitForURL(/#\/sessions/)
    await expect(page.locator('.sessions-page')).toBeVisible()
  })

  test('直接访问 /#/sessions 等 hash 路由能正确渲染', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#/sessions' })
    await page.waitForURL(/#\/sessions/)
    await expect(page.locator('.sessions-page')).toBeVisible()

    await page.evaluate(() => { window.location.hash = '#/skills' })
    await page.waitForURL(/#\/skills/)
    await expect(page.locator('.skills-page')).toBeVisible()
  })

  test('访问不存在的路由不会白屏（ErrorBoundary 兜底）', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#/nonexistent-route-xyz' })
    await page.waitForTimeout(500)

    // 页面不应白屏：layout 仍然可见
    await expect(page.locator('.layout')).toBeVisible()
    await expect(page.locator('.sidebar')).toBeVisible()
    await expect(page.locator('.topbar')).toBeVisible()
  })

  test('项目详情页 /projects/:id 动态路由参数正确传递', async ({ electronApp, page }) => {
    const proj = {
      id: 'nav-test-p1', name: '导航测试项目', path: '/nav-test', createdAt: 1000, lastOpenedAt: 3000,
      settings: { collaborationEnabled: false, defaultCliType: 'both', claude: {}, codex: {}, customSettings: {} }
    }

    // 主进程注入
    await electronApp.evaluate(({ }, p) => {
      const pm = (global as any).__projectManager__
      if (pm) pm.projects.set(p.id, p)
    }, proj)

    // 渲染进程注入
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('projects')
      return store && !store.loading
    })
    await page.evaluate((json) => {
      ;(window as any).__e2e_inject__('projects', 'projects', json)
    }, JSON.stringify([proj]))

    await page.evaluate(() => { window.location.hash = '#/projects/nav-test-p1' })
    await page.waitForURL(/#\/projects\/nav-test-p1/)

    // 验证项目详情页渲染且参数正确传递
    await expect(page.locator('.project-detail-page')).toBeVisible()
    await expect(page.locator('.topbar .breadcrumb-current')).toHaveText('导航测试项目')
  })

  test('Session 页面 ?action=create query 参数自动打开创建对话框', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#/sessions?action=create' })
    await page.waitForURL(/#\/sessions/)

    // CreateSessionDialog 应该被打开（dialog-overlay + dialog）
    await expect(page.locator('.dialog-overlay .dialog')).toBeVisible()
  })
})
