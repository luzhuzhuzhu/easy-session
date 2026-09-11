import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'

const sessions = [
  { id: 's1', name: 'Source One', type: 'claude', status: 'idle', projectPath: '/drag', createdAt: 1 },
  { id: 's2', name: 'Source Two', type: 'codex', status: 'idle', projectPath: '/drag', createdAt: 2 },
  { id: 's3', name: 'Target', type: 'claude', status: 'idle', projectPath: '/drag', createdAt: 3 }
]

const layout = {
  version: 2 as const,
  root: {
    type: 'split' as const,
    direction: 'horizontal' as const,
    ratio: 0.5,
    first: { type: 'leaf' as const, paneId: 'source', activeTabId: 'tab-s1', tabs: ['tab-s1', 'tab-s2'] },
    second: { type: 'leaf' as const, paneId: 'target', activeTabId: 'tab-s3', tabs: ['tab-s3'] }
  },
  tabs: {
    'tab-s1': { id: 'tab-s1', resourceType: 'session' as const, instanceId: 'local', sessionId: 's1', globalSessionKey: 'local:s1', pinned: false, createdAt: 1 },
    'tab-s2': { id: 'tab-s2', resourceType: 'session' as const, instanceId: 'local', sessionId: 's2', globalSessionKey: 'local:s2', pinned: false, createdAt: 2 },
    'tab-s3': { id: 'tab-s3', resourceType: 'session' as const, instanceId: 'local', sessionId: 's3', globalSessionKey: 'local:s3', pinned: false, createdAt: 3 }
  },
  activePaneId: 'source'
}

type DropPoint = 'left' | 'right' | 'top' | 'bottom' | 'center'

async function setup(page: Page): Promise<void> {
  await page.evaluate(({ initialLayout, fixtureSessions }) => {
    ;(window as any).__e2e_workspace_updates = []
    ;(window as any).__e2e_sessions = structuredClone(fixtureSessions)
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'session:list') return structuredClone((window as any).__e2e_sessions)
      if (channel === 'remote-instance:list' || channel === 'project:list') return []
      if (channel === 'project:gitBranches') return {
        target: { projectPath: '/drag', projectName: 'drag' },
        state: 'available',
        repoRoot: '/drag',
        projectSubpath: '',
        currentBranch: 'main',
        branches: [],
        message: null
      }
      if (channel === 'workspace:getLayout') return structuredClone(initialLayout)
      if (channel === 'workspace:updateLayout') {
        const value = structuredClone(args[0])
        ;(window as any).__e2e_workspace_updates.push(value)
        return value
      }
      if (channel === 'workspace:resetLayout') return structuredClone(initialLayout)
      return undefined
    }
  }, { initialLayout: layout, fixtureSessions: sessions })
  await page.keyboard.press('Control+2')
  await page.waitForURL(/#\/sessions/)
  await expect(page.locator('.sessions-page')).toBeVisible()
  await expect(page.locator('.workspace-pane')).toHaveCount(2)
}

async function dragHtml5(page: Page, source: string, target: string, point: DropPoint, finalPoint?: DropPoint): Promise<void> {
  await page.evaluate(({ source, target, point, finalPoint }) => {
    const from = document.querySelector(source)
    const to = document.querySelector(target) as HTMLElement | null
    if (!from || !to) throw new Error(`drag fixture missing: ${source} -> ${target}`)
    const rect = to.getBoundingClientRect()
    const coords = (where: DropPoint) => {
      const x = where === 'left' ? rect.left + 2 : where === 'right' ? rect.right - 2 : rect.left + rect.width / 2
      const y = where === 'top' ? rect.top + 2 : where === 'bottom' ? rect.bottom - 2 : rect.top + rect.height / 2
      return { x, y }
    }
    const transfer = new DataTransfer()
    from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: transfer }))
    const over = coords(point)
    to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: over.x, clientY: over.y }))
    const drop = coords(finalPoint ?? point)
    to.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer, clientX: drop.x, clientY: drop.y }))
    from.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: transfer }))
  }, { source, target, point, finalPoint })
}

async function dragUsingElements(page: Page, source: Locator, target: Locator, point: DropPoint, finalPoint?: DropPoint): Promise<void> {
  const sourceSelector = await source.evaluate((el) => { const id = `e2e-${Math.random().toString(36).slice(2)}`; el.setAttribute('data-e2e-drag', id); return `[data-e2e-drag="${id}"]` })
  const targetSelector = await target.evaluate((el) => { const id = `e2e-${Math.random().toString(36).slice(2)}`; el.setAttribute('data-e2e-drop', id); return `[data-e2e-drop="${id}"]` })
  await dragHtml5(page, sourceSelector, targetSelector, point, finalPoint)
}

async function leaves(page: Page): Promise<any[]> {
  return page.evaluate(() => {
    const value = (window as any).__e2e_workspace_updates?.at(-1) ?? (window as any).__pinia__?._s?.get('workspace')?.layout
    const out: any[] = []
    const visit = (node: any) => node.type === 'leaf' ? out.push(node) : (visit(node.first), visit(node.second))
    if (value) visit(value.root)
    return out
  })
}

async function expectPersisted(page: Page): Promise<any> {
  await expect.poll(() => page.evaluate(() => (window as any).__e2e_workspace_updates?.length)).toBeGreaterThan(0)
  return page.evaluate(() => (window as any).__e2e_workspace_updates.at(-1))
}

test.describe('workspace five-zone HTML5 drag and drop', () => {
  test('tab center moves across panes, keeps unique tabs, and persists', async ({ page }) => {
    await setup(page)
    await dragUsingElements(page, page.locator('.pane-tab[data-tab-id="tab-s1"]'), page.locator('.workspace-pane').nth(1), 'center')
    const persisted = await expectPersisted(page)
    expect(persisted.tabs).toHaveProperty('tab-s1')
    expect((await leaves(page)).flatMap((leaf) => leaf.tabs).filter((id) => id === 'tab-s1')).toHaveLength(1)
    expect(persisted.root).toBeTruthy()
  })

  for (const point of ['left', 'right', 'top', 'bottom'] as const) {
    test(`tab edge ${point} creates ordered split tree`, async ({ page }) => {
      await setup(page)
      const target = page.locator('.workspace-pane').nth(1)
      await dragUsingElements(page, page.locator('.pane-tab[data-tab-id="tab-s1"]'), target, point)
      const persisted = await expectPersisted(page)
      expect(persisted.root.type).toBe('split')
      const targetSplit = persisted.root.second
      expect(targetSplit).toMatchObject({
        type: 'split',
        direction: point === 'left' || point === 'right' ? 'horizontal' : 'vertical'
      })
      const orderedTabs = [targetSplit.first.tabs, targetSplit.second.tabs]
      expect(orderedTabs).toEqual(
        point === 'left' || point === 'top'
          ? [['tab-s1'], ['tab-s3']]
          : [['tab-s3'], ['tab-s1']]
      )
      const allTabs = (await leaves(page)).flatMap((leaf) => leaf.tabs)
      expect(allTabs).toEqual(expect.arrayContaining(['tab-s1', 'tab-s2', 'tab-s3']))
      expect(new Set(allTabs).size).toBe(3)
    })
  }

  test('header center swaps complete pane tab sets', async ({ page }) => {
    await setup(page)
    await dragUsingElements(page, page.locator('.workspace-pane').nth(0).locator('.pane-header'), page.locator('.workspace-pane').nth(1), 'center')
    const persisted = await expectPersisted(page)
    const result = await leaves(page)
    expect(result.map((leaf) => leaf.tabs)).toEqual([['tab-s3'], ['tab-s1', 'tab-s2']])
    expect(persisted.activePaneId).toBe('target')
  })

  test('header edge splits and moves only the active tab', async ({ page }) => {
    await setup(page)
    await dragUsingElements(page, page.locator('.workspace-pane').nth(0).locator('.pane-header'), page.locator('.workspace-pane').nth(1), 'right')
    await expectPersisted(page)
    const result = await leaves(page)
    expect(result.flatMap((leaf) => leaf.tabs)).toEqual(expect.arrayContaining(['tab-s1', 'tab-s2', 'tab-s3']))
    expect(result.filter((leaf) => leaf.tabs.includes('tab-s1'))).toHaveLength(1)
  })

  test('sidebar session center drop retains target tabs', async ({ page }) => {
    await setup(page)
    await dragUsingElements(page, page.locator('.session-item').filter({ hasText: 'Source One' }), page.locator('.workspace-pane').nth(1), 'center')
    await expectPersisted(page)
    const result = await leaves(page)
    expect(result.find((leaf) => leaf.paneId === 'target')?.tabs).toEqual(expect.arrayContaining(['tab-s3', 'tab-s1']))
  })

  test('quick edge dragover then immediate drop uses final coordinates', async ({ page }) => {
    await setup(page)
    const target = page.locator('.workspace-pane').nth(1)
    await dragUsingElements(page, page.locator('.pane-tab[data-tab-id="tab-s1"]'), target, 'center', 'bottom')
    const persisted = await expectPersisted(page)
    expect(persisted.root.type).toBe('split')
    expect(persisted.root.second).toMatchObject({ type: 'split', direction: 'vertical' })
    await expect(page.locator('.workspace-pane[data-drop-active="true"]')).toHaveCount(0)
  })

  test('all drop placements align the indicator and styled copy with their target zone', async ({ page }) => {
    await setup(page)
    const target = page.locator('.workspace-pane').nth(1)
    const source = page.locator('.pane-tab[data-tab-id="tab-s1"]')
    const sourceSelector = await source.evaluate((el) => { el.setAttribute('data-e2e-drag', 'source'); return '[data-e2e-drag="source"]' })
    const targetSelector = await target.evaluate((el) => { el.setAttribute('data-e2e-drop', 'target'); return '[data-e2e-drop="target"]' })
    const expectedPosition = { left: [0.25, 0.5], right: [0.75, 0.5], top: [0.5, 0.25], bottom: [0.5, 0.75], center: [0.5, 0.5] } as const

    for (const point of ['left', 'right', 'top', 'bottom', 'center'] as const) {
      await page.evaluate(({ source, target, point }) => {
        const from = document.querySelector(source)!
        const to = document.querySelector(target) as HTMLElement
        const r = to.getBoundingClientRect()
        const x = point === 'left' ? r.left + 2 : point === 'right' ? r.right - 2 : r.left + r.width / 2
        const y = point === 'top' ? r.top + 2 : point === 'bottom' ? r.bottom - 2 : r.top + r.height / 2
        const dt = new DataTransfer()
        from.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }))
        to.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: x, clientY: y }))
      }, { source: sourceSelector, target: targetSelector, point })

      await expect(target).toHaveAttribute('data-drop-kind', 'tab')
      await expect(target).toHaveAttribute('data-drop-placement', point)
      const geometry = await target.evaluate((pane, placement) => {
        const paneRect = pane.getBoundingClientRect()
        const copy = pane.querySelector('.pane-drop-copy') as HTMLElement
        const indicator = pane.querySelector('.edge-drop-indicator') as HTMLElement
        const copyRect = copy.getBoundingClientRect()
        const indicatorRect = indicator.getBoundingClientRect()
        const live = pane.querySelector('.sr-only') as HTMLElement
        return {
          copyX: (copyRect.left + copyRect.width / 2 - paneRect.left) / paneRect.width,
          copyY: (copyRect.top + copyRect.height / 2 - paneRect.top) / paneRect.height,
          indicatorWidth: indicatorRect.width / paneRect.width,
          indicatorHeight: indicatorRect.height / paneRect.height,
          copyRadius: getComputedStyle(copy).borderRadius,
          copyZ: Number(getComputedStyle(copy).zIndex),
          indicatorZ: Number(getComputedStyle(indicator).zIndex),
          liveWidth: live.getBoundingClientRect().width,
          placement
        }
      }, point)
      expect(geometry.copyX).toBeCloseTo(expectedPosition[point][0], 1)
      expect(geometry.copyY).toBeCloseTo(expectedPosition[point][1], 1)
      expect(geometry.copyRadius).not.toBe('0px')
      expect(geometry.copyZ).toBeGreaterThan(geometry.indicatorZ)
      expect(geometry.liveWidth).toBeLessThanOrEqual(1)
      if (point === 'left' || point === 'right') expect(geometry.indicatorWidth).toBeGreaterThan(0.4)
      if (point === 'top' || point === 'bottom') expect(geometry.indicatorHeight).toBeGreaterThan(0.4)
      if (point === 'center') {
        expect(geometry.indicatorWidth).toBeGreaterThan(0.8)
        expect(geometry.indicatorHeight).toBeGreaterThan(0.8)
      }

      await target.evaluate((to) => to.dispatchEvent(new DragEvent('dragleave', { bubbles: true, relatedTarget: document.body })))
      await expect(target).toHaveAttribute('data-drop-active', 'false')
    }
  })
})
