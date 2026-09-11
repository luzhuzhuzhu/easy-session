import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

function horizontalSplitLayout() {
  return {
    version: 2,
    root: {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: {
        type: 'leaf',
        paneId: 'pane-1',
        activeTabId: null,
        tabs: []
      },
      second: {
        type: 'leaf',
        paneId: 'pane-2',
        activeTabId: null,
        tabs: []
      }
    },
    tabs: {},
    activePaneId: 'pane-1'
  }
}

async function setupIpcMocks(page: Page): Promise<void> {
  await page.evaluate((workspaceLayout) => {
    ;(window as any).__e2e_workspace_updates = []
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'remote-instance:list') return []
      if (channel === 'project:list') return []
      if (channel === 'session:list') return []
      if (channel === 'workspace:getLayout') return structuredClone(workspaceLayout)
      if (channel === 'workspace:updateLayout') {
        const persisted = structuredClone(args[0])
        ;(window as any).__e2e_workspace_updates.push(persisted)
        return structuredClone(persisted)
      }
      if (channel === 'workspace:resetLayout') return structuredClone(workspaceLayout)
      return undefined
    }
  }, horizontalSplitLayout())
}

async function navigateToSessions(page: Page): Promise<void> {
  await page.keyboard.press('Control+2')
  await page.waitForURL(/#\/sessions/)
  await expect(page.locator('.sessions-page')).toBeVisible()
  await expect(page.locator('.workspace-root.workspace-split.horizontal')).toBeVisible()
}

test.describe('workspace split resize', () => {
  test('dragging the root splitter persists one final cloneable ratio without clone errors', async ({ page }) => {
    const pageErrors: string[] = []
    const cloneConsoleErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error' && /clone|DataClone/i.test(message.text())) {
        cloneConsoleErrors.push(message.text())
      }
    })

    await setupIpcMocks(page)
    await navigateToSessions(page)

    const rootSplit = page.locator('.workspace-root.workspace-split.horizontal')
    const firstChild = rootSplit.locator(':scope > .split-child.first')
    const splitter = rootSplit.locator(':scope > .splitter')
    const widthBefore = await firstChild.evaluate((element) => element.getBoundingClientRect().width)
    const splitBox = await rootSplit.boundingBox()
    const splitterBox = await splitter.boundingBox()
    expect(splitBox).not.toBeNull()
    expect(splitterBox).not.toBeNull()

    const targetX = splitBox!.x + splitBox!.width * 0.68
    const targetRatio = (targetX - splitBox!.x) / splitBox!.width
    await page.mouse.move(splitterBox!.x + splitterBox!.width / 2, splitterBox!.y + splitterBox!.height / 2)
    await page.mouse.down()
    await page.mouse.move(targetX, splitterBox!.y + splitterBox!.height / 2, { steps: 8 })
    await page.mouse.up()

    await expect.poll(() => firstChild.evaluate((element) => element.getBoundingClientRect().width))
      .toBeGreaterThan(widthBefore + 20)
    await expect.poll(() => page.evaluate(() => (window as any).__e2e_workspace_updates.length))
      .toBeGreaterThan(0)

    const persisted = await page.evaluate(() => (window as any).__e2e_workspace_updates)
    expect(persisted).toHaveLength(1)
    expect(() => structuredClone(persisted[0])).not.toThrow()
    expect(persisted[0].root).toMatchObject({
      type: 'split',
      direction: 'horizontal',
      ratio: expect.closeTo(targetRatio, 1)
    })

    expect(pageErrors.filter((message) => /clone|DataClone/i.test(message))).toEqual([])
    expect(cloneConsoleErrors).toEqual([])
    await expect(page.locator('.toast-item').filter({ hasText: /clone|DataClone/i })).toHaveCount(0)
  })
})
