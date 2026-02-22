import { test, expect } from './fixtures'

async function navigateToSettings(page: import('@playwright/test').Page) {
  await page.locator('.sidebar-footer .nav-item[href="#/settings"]').click()
  await page.waitForURL(/#\/settings/)
}

async function injectSettings(page: import('@playwright/test').Page, data: Record<string, any>) {
  await page.evaluate((json) => {
    ;(window as any).__e2e_inject__('settings', 'settings', json)
  }, JSON.stringify(data))
}

const DEFAULTS = {
  theme: 'dark', fontSize: 14, language: 'zh-CN',
  claudePath: '', codexPath: '', bufferSize: 5000,
  terminalFont: 'Consolas, monospace', sidebarCollapsed: false
}

// ==================== 外观设置 ====================

test.describe('Settings - 外观设置', () => {
  test('主题下拉默认 dark，light 选项 disabled 显示 "即将推出"', async ({ page }) => {
    await navigateToSettings(page)
    const select = page.locator('.settings-section').first().locator('select')
    await expect(select).toHaveValue('dark')
    const lightOption = select.locator('option[value="light"]')
    await expect(lightOption).toBeDisabled()
    await expect(lightOption).toContainText('即将支持')
  })

  test('字体大小显示当前值（如 14px），+/- 按钮调整', async ({ page }) => {
    await navigateToSettings(page)
    const fontValue = page.locator('.font-size-value')
    await expect(fontValue).toHaveText('14px')
    await page.locator('.font-size-control .btn-sm').last().click()
    await expect(fontValue).toHaveText('15px')
    await page.locator('.font-size-control .btn-sm').first().click()
    await expect(fontValue).toHaveText('14px')
  })

  test('字体大小范围 10-24px，边界值时按钮不再生效', async ({ page }) => {
    await navigateToSettings(page)
    await injectSettings(page, { ...DEFAULTS, fontSize: 10 })
    const fontValue = page.locator('.font-size-value')
    await expect(fontValue).toHaveText('10px')
    await page.locator('.font-size-control .btn-sm').first().click()
    await expect(fontValue).toHaveText('10px')
    await injectSettings(page, { ...DEFAULTS, fontSize: 24 })
    await expect(fontValue).toHaveText('24px')
    await page.locator('.font-size-control .btn-sm').last().click()
    await expect(fontValue).toHaveText('24px')
  })

  test('调整后自动保存 + Toast', async ({ page }) => {
    await navigateToSettings(page)
    await page.locator('.font-size-control .btn-sm').last().click()
    await expect(page.locator('.toast')).toBeVisible()
  })
})

// ==================== 语言设置 ====================

test.describe('Settings - 语言设置', () => {
  test('默认 zh-CN，English 选项 disabled', async ({ page }) => {
    await navigateToSettings(page)
    const select = page.locator('.settings-section').nth(1).locator('select')
    await expect(select).toHaveValue('zh-CN')
    const enOption = select.locator('option[value="en"]')
    await expect(enOption).toBeDisabled()
  })

  test('切换语言后保存', async ({ page }) => {
    await navigateToSettings(page)
    const select = page.locator('.settings-section').nth(1).locator('select')
    await expect(select).toHaveValue('zh-CN')
    await select.dispatchEvent('change')
    await expect(page.locator('.toast')).toBeVisible()
  })
})

// ==================== CLI 路径设置 ====================

test.describe('Settings - CLI 路径设置', () => {
  test('Claude 路径输入框，placeholder "自动检测"', async ({ page }) => {
    await navigateToSettings(page)
    const input = page.locator('.settings-section').nth(2).locator('input[type="text"]').first()
    await expect(input).toHaveAttribute('placeholder', '自动检测')
  })

  test('Codex 路径输入框，placeholder "自动检测"', async ({ page }) => {
    await navigateToSettings(page)
    const input = page.locator('.settings-section').nth(2).locator('input[type="text"]').last()
    await expect(input).toHaveAttribute('placeholder', '自动检测')
  })

  test('修改后 change 事件触发保存', async ({ page }) => {
    await navigateToSettings(page)
    const input = page.locator('.settings-section').nth(2).locator('input[type="text"]').first()
    await input.fill('/usr/local/bin/claude')
    await input.dispatchEvent('change')
    await expect(page.locator('.toast')).toBeVisible()
  })
})

// ==================== 终端设置 ====================

test.describe('Settings - 终端设置', () => {
  test('缓冲区大小 number 输入，min=1000 max=50000 step=1000', async ({ page }) => {
    await navigateToSettings(page)
    const input = page.locator('.settings-section').nth(3).locator('input[type="number"]')
    await expect(input).toHaveAttribute('min', '1000')
    await expect(input).toHaveAttribute('max', '50000')
    await expect(input).toHaveAttribute('step', '1000')
  })

  test('终端字体输入框', async ({ page }) => {
    await navigateToSettings(page)
    const input = page.locator('.settings-section').nth(3).locator('input[type="text"]')
    await expect(input).toBeVisible()
    await expect(input).toHaveValue('Consolas, monospace')
  })

  test('修改后保存', async ({ page }) => {
    await navigateToSettings(page)
    const input = page.locator('.settings-section').nth(3).locator('input[type="text"]')
    await input.fill('Monaco, monospace')
    await input.dispatchEvent('change')
    await expect(page.locator('.toast')).toBeVisible()
  })
})

// ==================== 关于信息 ====================

test.describe('Settings - 关于信息', () => {
  test('显示应用版本号', async ({ page }) => {
    await navigateToSettings(page)
    const aboutSection = page.locator('.settings-section').nth(4)
    const versionValue = aboutSection.locator('.about-value').first()
    await expect(versionValue).toBeVisible()
  })

  test('显示 Electron 版本、Node 版本、系统平台和架构', async ({ page }) => {
    await navigateToSettings(page)
    const items = page.locator('.settings-section').nth(4).locator('.about-item')
    await expect(items).toHaveCount(4)
    const labels = await items.locator('.about-label').allTextContents()
    expect(labels.join(',')).toContain('Electron')
    expect(labels.join(',')).toContain('Node')
    expect(labels.join(',')).toContain('系统信息')
  })

  test('信息通过 app:getSystemInfo IPC 获取', async ({ page }) => {
    await navigateToSettings(page)
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string) => {
        if (channel === 'app:getSystemInfo') return {
          electronVersion: '33.4.11', nodeVersion: '20.18.0',
          platform: 'win32', arch: 'x64'
        }
        return undefined
      }
    })
    // Re-navigate to trigger onMounted
    await page.locator('.sidebar-footer .nav-item[href="#/settings"]').click()
    const aboutSection = page.locator('.settings-section').nth(4)
    await expect(aboutSection).toContainText('33.4.11')
    await expect(aboutSection).toContainText('20.18.0')
    await expect(aboutSection).toContainText('win32')
    await expect(aboutSection).toContainText('x64')
  })
})
