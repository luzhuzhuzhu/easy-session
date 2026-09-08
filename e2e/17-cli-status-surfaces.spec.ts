import { test, expect } from './fixtures'

const EXTERNAL_CLI_NAMES = ['Claude', 'Codex', 'OpenCode', 'Gemini', 'Pi', 'OMP', 'Grok', 'Hermes']

test.describe('all CLI status surfaces', () => {
  test('top bar renders every external CLI and excludes Terminal', async ({ page }) => {
    await expect(page.locator('.cli-status-btn')).toHaveCount(EXTERNAL_CLI_NAMES.length)
    const labels = await page.locator('.cli-status-btn').evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('aria-label') || '')
    )
    for (const name of EXTERNAL_CLI_NAMES) {
      expect(labels.some((label) => label.includes(name))).toBe(true)
    }
    expect(labels.some((label) => label.includes('Terminal'))).toBe(false)
  })

  test('dashboard renders eight status cards and every card opens its config editor', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#/dashboard' })
    await page.waitForURL(/#\/dashboard/)

    await expect(page.locator('.cli-card')).toHaveCount(EXTERNAL_CLI_NAMES.length)
    await expect(page.locator('.cli-card .chevron')).toHaveCount(EXTERNAL_CLI_NAMES.length)
    await expect(page.locator('.cli-card .settings-shortcut')).toHaveCount(0)
    await expect(page.locator('.cli-card-name')).toHaveText(EXTERNAL_CLI_NAMES)

    for (let index = 0; index < EXTERNAL_CLI_NAMES.length; index += 1) {
      await page.locator('.cli-card').nth(index).click()
      await expect(page.locator('.config-editor-panel')).toBeVisible()
      await expect(page.locator('.format-badge')).toBeVisible()
      await page.locator('.cli-card').nth(index).click()
    }
  })
})
