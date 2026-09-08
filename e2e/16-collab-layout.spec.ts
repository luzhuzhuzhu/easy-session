import { test, expect } from './fixtures'
import type { Page } from '@playwright/test'

// ENG-4：协作页 e2e 补齐——布局预设切换（UX-14）、预设持久化、面板显隐。
// 协作数据来自全局 collab store 订阅的 bus 推送；这里用 pinia 直填快照，
// 使面板有真实 agents/tasks 可渲染，聚焦布局行为本身。

async function seedCollabSnapshot(page: Page): Promise<void> {
  await page.evaluate(() => {
    const collabStore = (window as any).__pinia__?._s?.get('collab')
    if (!collabStore) return
    collabStore.snapshot = {
      agents: [
        { sessionId: 'agent-1', name: 'Claude-001', type: 'claude', collabMode: 'known-agent', injectable: true, unread: 0, activeTaskCount: 1 },
        { sessionId: 'agent-2', name: 'Codex-001', type: 'codex', collabMode: 'known-agent', injectable: true, unread: 2, activeTaskCount: 0 }
      ],
      tasks: [
        {
          id: 'task-1', from: 'user', fromName: 'You', to: 'agent-1', toName: 'Claude-001',
          title: 'Fix login flow', status: 'delivered', createdAt: Date.now() - 5000, updatedAt: Date.now() - 1000,
          statusSince: Date.now() - 1000, history: []
        }
      ],
      messages: [],
      ready: true,
      error: null
    }
  })
}

async function navigateToCollaboration(page: Page): Promise<void> {
  await page.keyboard.press('Control+3')
  await page.waitForURL(/#\/collaboration/)
  await expect(page.locator('.collab-view')).toBeVisible()
}

test.describe('collaboration layout (ENG-4 / UX-14)', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToCollaboration(page)
    await seedCollabSnapshot(page)
    await page.waitForTimeout(300)
  })

  test('layout menu shows three presets', async ({ page }) => {
    await page.locator('.layout-menu-wrap > .icon-button').first().click()
    await expect(page.locator('.layout-panel .ms-preset')).toHaveCount(3)
  })

  test('solo preset collapses to 2 panels, reset restores 5', async ({ page }) => {
    await page.locator('.layout-menu-wrap > .icon-button').first().click()
    await page.locator('.layout-panel .ms-preset').first().click()
    await expect(page.locator('.panel-content')).toHaveCount(2)

    await page.locator('.layout-menu-wrap > .icon-button').first().click()
    await page.locator('.layout-panel .ms-all').last().click()
    await expect(page.locator('.panel-content')).toHaveCount(5)
  })

  test('monitor preset keeps members and board visible with scoped board styles', async ({ page }) => {
    await page.locator('.layout-menu-wrap > .icon-button').first().click()
    await page.locator('.layout-panel .ms-preset').nth(2).click()
    await expect(page.locator('.panel-content')).toHaveCount(2)
    // 成员栏与看板均在可见面板中
    await expect(page.locator('.agent-list')).toBeVisible()
    await expect(page.locator('.board-region')).toBeVisible()
    await expect(page.locator('.board-grid')).toHaveCSS('display', 'grid')
    await expect(page.locator('.board-col').first()).toHaveCSS('min-width', '146px')
  })

  test('preset persists to localStorage (survives restart)', async ({ page }) => {
    await page.locator('.layout-menu-wrap > .icon-button').first().click()
    await page.locator('.layout-panel .ms-preset').first().click()
    await expect(page.locator('.panel-content')).toHaveCount(2)

    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('easy-session:collab:dock')))
      .not.toBeNull()
    const stored = await page.evaluate(() => window.localStorage.getItem('easy-session:collab:dock'))
    const parsed = JSON.parse(stored as string)
    expect(JSON.stringify(parsed.root)).toContain('chat')
  })
})
