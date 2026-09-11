import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const sessions = [
  { id: 'stream-a', name: 'Stream A', icon: null, type: 'codex', status: 'running', projectPath: '/stream', createdAt: 1, lastActiveAt: 1, processId: 'p-a', options: {}, parentId: null },
  { id: 'stream-b', name: 'Stream B', icon: null, type: 'claude', status: 'running', projectPath: '/stream', createdAt: 2, lastActiveAt: 2, processId: 'p-b', options: {}, parentId: null }
]

const layout = {
  version: 2 as const,
  root: { type: 'leaf' as const, paneId: 'pane-stream', activeTabId: 'tab-a', tabs: ['tab-a', 'tab-b'] },
  tabs: {
    'tab-a': { id: 'tab-a', resourceType: 'session' as const, instanceId: 'local', sessionId: 'stream-a', globalSessionKey: 'local:stream-a', pinned: false, createdAt: 1 },
    'tab-b': { id: 'tab-b', resourceType: 'session' as const, instanceId: 'local', sessionId: 'stream-b', globalSessionKey: 'local:stream-b', pinned: false, createdAt: 2 }
  },
  activePaneId: 'pane-stream'
}

async function setup(page: Page): Promise<void> {
  await page.evaluate(({ fixtureSessions, initialLayout }) => {
    const histories: Record<string, Array<{ text: string; stream: 'stdout'; timestamp: number; seq: number }>> = {
      'stream-a': Array.from({ length: 500 }, (_, index) => ({ text: `A-${String(index + 1).padStart(4, '0')}\r\n`, stream: 'stdout', timestamp: index + 1, seq: index + 1 })),
      'stream-b': Array.from({ length: 80 }, (_, index) => ({ text: `B-${String(index + 1).padStart(4, '0')}\r\n`, stream: 'stdout', timestamp: index + 1, seq: index + 1 }))
    }
    ;(window as any).__e2e_terminal_histories = histories
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'session:list') return structuredClone(fixtureSessions)
      if (channel === 'session:output:history') return structuredClone(histories[args[0]] ?? [])
      if (channel === 'remote-instance:list' || channel === 'project:list') return []
      if (channel === 'project:gitBranches') return {
        target: { projectPath: '/stream', projectName: 'stream' }, state: 'available', repoRoot: '/stream',
        projectSubpath: '', currentBranch: 'main', branches: [], message: null
      }
      if (channel === 'workspace:getLayout') return structuredClone(initialLayout)
      if (channel === 'workspace:updateLayout') return structuredClone(args[0])
      if (channel === 'workspace:resetLayout') return structuredClone(initialLayout)
      if (channel === 'session:resize' || channel === 'session:writeRaw') return true
      return undefined
    }
  }, { fixtureSessions: sessions, initialLayout: layout })

  await page.keyboard.press('Control+2')
  await page.waitForURL(/#\/sessions/)
  await expect(page.locator('.xterm-viewport')).toBeVisible()
  await expect(page.locator('.xterm-rows')).toContainText('A-0500')
}

async function emitOutput(page: Page, sessionId: string, startSeq: number, count: number): Promise<void> {
  await page.evaluate(({ sessionId, startSeq, count }) => {
    const bridge = (window as any).__easy_session_ipc_bus__?.channels?.get('session:output')?.bridge
    if (!bridge) throw new Error('session:output bridge is not registered')
    for (let offset = 0; offset < count; offset += 1) {
      const seq = startSeq + offset
      const data = `${sessionId}-${seq}\r\n`
      const histories = (window as any).__e2e_terminal_histories
      histories[sessionId] ??= []
      histories[sessionId].push({ text: data, stream: 'stdout', timestamp: seq, seq })
      bridge({}, { sessionId, data, stream: 'stdout', timestamp: seq, seq })
    }
  }, { sessionId, startSeq, count })
}

test.describe('terminal streaming regressions', () => {
  test('keeps a user-scrolled viewport stationary while output continues', async ({ page }) => {
    await setup(page)
    const rows = page.locator('.xterm-rows')
    await page.locator('.xterm-helper-textarea').focus()
    for (let index = 0; index < 6; index += 1) {
      await page.keyboard.press('Shift+PageUp')
    }
    await page.waitForTimeout(100)
    const before = await rows.textContent()
    expect(before).not.toContain('A-0500')

    await emitOutput(page, 'stream-a', 501, 60)
    await page.waitForTimeout(100)

    const after = await rows.textContent()
    expect(after).toBe(before)
    expect(after).not.toContain('stream-a-560')
  })

  test('does not mix output across rapid tab switches', async ({ page }) => {
    await setup(page)
    await page.locator('[data-tab-id="tab-b"]').click()
    await expect(page.locator('.xterm-rows')).toContainText('B-0080')
    await emitOutput(page, 'stream-a', 501, 1)
    await emitOutput(page, 'stream-b', 81, 1)
    await expect(page.locator('.xterm-rows')).toContainText('stream-b-81')
    await expect(page.locator('.xterm-rows')).not.toContainText('stream-a-501')

    await page.locator('[data-tab-id="tab-a"]').click()
    await expect(page.locator('.xterm-rows')).toContainText('stream-a-501')
    await expect(page.locator('.xterm-rows')).not.toContainText('stream-b-81')
  })
})

