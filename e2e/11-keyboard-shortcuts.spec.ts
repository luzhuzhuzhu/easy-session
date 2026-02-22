import { test, expect } from './fixtures'

test.describe('快捷键测试', () => {
  test('Ctrl+1~6 导航快捷键跳转到对应路由', async ({ page }) => {
    const shortcuts = [
      { key: '1', path: '/dashboard', cls: '.dashboard' },
      { key: '2', path: '/config', cls: '.config-page' },
      { key: '3', path: '/sessions', cls: '.sessions-page' },
      { key: '4', path: '/projects', cls: '.projects-page' },
      { key: '5', path: '/orchestration', cls: '.orchestration-page' },
      { key: '6', path: '/skills', cls: '.skills-page' }
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
  })

  test('Ctrl+N 打开新建会话对话框', async ({ page }) => {
    await page.keyboard.press('Control+n')
    await page.waitForURL(/#\/sessions/)
    await expect(page.locator('.dialog-overlay .dialog')).toBeVisible()
  })

  test('Escape 关闭对话框', async ({ page }) => {
    // 先打开创建对话框
    await page.evaluate(() => { window.location.hash = '#/sessions?action=create' })
    await expect(page.locator('.dialog-overlay .dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('.dialog-overlay')).toBeHidden()
  })

  test('Ctrl+W 在 sessions 页面销毁活跃会话', async ({ page }) => {
    // 导航到 sessions 页面
    await page.keyboard.press('Control+3')
    await page.waitForURL(/#\/sessions/)

    // 注入一个活跃 session
    await page.evaluate(() => {
      ;(window as any).__e2e_inject__('sessions', 'sessions', JSON.stringify([
        { id: 'sw1', name: 'test-session', type: 'claude', status: 'running', projectPath: '/a', createdAt: 1000 }
      ]))
      ;(window as any).__e2e_inject__('sessions', 'activeSessionId', JSON.stringify('sw1'))
    })

    // 验证 session 存在
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      return store?.activeSessionId === 'sw1'
    })

    await page.keyboard.press('Control+w')

    // destroySession 被调用后 activeSessionId 应被清除或 session 被移除
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      return !store?.sessions?.find((s: any) => s.id === 'sw1') || store?.activeSessionId !== 'sw1'
    }, {}, { timeout: 3000 })
  })

  test('在 INPUT 中按快捷键不触发导航', async ({ page }) => {
    // 先确保在 dashboard
    await page.keyboard.press('Control+1')
    await page.waitForURL(/#\/dashboard/)

    // 在页面中创建一个临时 input 并聚焦
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.id = 'e2e-temp-input'
      document.body.appendChild(input)
      input.focus()
    })

    // 在 input 聚焦状态下按 Ctrl+2，不应跳转
    await page.keyboard.press('Control+2')
    await page.waitForTimeout(300)

    // 仍然在 dashboard
    expect(page.url()).toMatch(/#\/dashboard/)

    // 清理
    await page.evaluate(() => document.getElementById('e2e-temp-input')?.remove())
  })

  test('SHORTCUT_LABELS 映射与实际快捷键一致', async ({ page }) => {
    // 验证侧边栏导航项显示的快捷键提示与 SHORTCUT_LABELS 一致
    const navItems = page.locator('.nav-menu > .nav-item')
    const expected = [
      { path: '/dashboard', label: 'Ctrl+1' },
      { path: '/config', label: 'Ctrl+2' },
      { path: '/sessions', label: 'Ctrl+3' },
      { path: '/projects', label: 'Ctrl+4' },
      { path: '/orchestration', label: 'Ctrl+5' },
      { path: '/skills', label: 'Ctrl+6' }
    ]

    for (let i = 0; i < expected.length; i++) {
      // 验证显示的快捷键提示
      await expect(navItems.nth(i).locator('.shortcut-hint')).toHaveText(expected[i].label)

      // 验证按下该快捷键确实跳转到对应路由
      const key = expected[i].label.replace('Ctrl+', '')
      await page.keyboard.press(`Control+${key}`)
      await page.waitForURL(new RegExp(`#${expected[i].path}`))
    }

    // 验证设置页快捷键 Ctrl+,
    const settingsItem = page.locator('.sidebar-footer .nav-item .shortcut-hint')
    await expect(settingsItem).toHaveText('Ctrl+,')
    await page.keyboard.press('Control+,')
    await page.waitForURL(/#\/settings/)
  })
})
