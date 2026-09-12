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

async function setup(page: Page, historyCount = 500): Promise<void> {
  await page.evaluate(({ fixtureSessions, initialLayout, historyCount }) => {
    const histories: Record<string, Array<{ text: string; stream: 'stdout'; timestamp: number; seq: number }>> = {
      'stream-a': Array.from({ length: historyCount }, (_, index) => ({ text: `A-${String(index + 1).padStart(4, '0')}\r\n`, stream: 'stdout', timestamp: index + 1, seq: index + 1 })),
      'stream-b': Array.from({ length: 80 }, (_, index) => ({ text: `B-${String(index + 1).padStart(4, '0')}\r\n`, stream: 'stdout', timestamp: index + 1, seq: index + 1 }))
    }
    ;(window as any).__e2e_terminal_histories = histories
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'session:list') return structuredClone(fixtureSessions)
      if (channel === 'session:output:history') return structuredClone((histories[args[0]] ?? []).slice(-(args[1] ?? historyCount)))
      if (channel === 'remote-instance:list' || channel === 'project:list') return []
      if (channel === 'project:gitBranches') return {
        target: { projectPath: '/stream', projectName: 'stream' }, state: 'available', repoRoot: '/stream',
        projectSubpath: '', currentBranch: 'main', branches: [], message: null
      }
      if (channel === 'workspace:getLayout') return structuredClone(initialLayout)
      if (channel === 'workspace:updateLayout') return structuredClone(args[0])
      if (channel === 'workspace:resetLayout') return structuredClone(initialLayout)
      if (channel === 'session:resize' || channel === 'session:write') return true
      if (channel === 'session:get') return structuredClone(fixtureSessions.find(session => session.id === args[0]) ?? null)
      return undefined
    }
  }, { fixtureSessions: sessions, initialLayout: layout, historyCount })

  await page.keyboard.press('Control+2')
  await page.waitForURL(/#\/sessions/)
  await expect(page.locator('.xterm-viewport')).toBeVisible()
  await expect(page.locator('.xterm-rows')).toContainText(`A-${String(historyCount).padStart(4, '0')}`)
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


test('history failure preserves the live events received while waiting', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:history' && args[0] === 'stream-b') {
        return new Promise((_resolve, reject) => { w.__e2e_rejectHistory = reject })
      }
      return original(channel, ...args)
    }
  })
  await page.locator('[data-tab-id="tab-b"]').click()
  await page.waitForFunction(() => typeof (window as any).__e2e_rejectHistory === 'function')
  await emitOutput(page, 'stream-b', 81, 1)
  await page.evaluate(() => (window as any).__e2e_rejectHistory(new Error('history unavailable')))
  await page.waitForTimeout(150)
  await emitOutput(page, 'stream-b', 82, 1)
  await expect(page.locator('.xterm-rows')).toContainText('stream-b-82')
  await expect(page.locator('.xterm-rows')).toContainText('stream-b-81', { timeout: 1000 })
})

test('late history does not override user scrolling on warm cache', async ({ page }) => {
  await setup(page)
  await page.locator('[data-tab-id="tab-b"]').click()
  await expect(page.locator('.xterm-rows')).toContainText('B-0080')
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:history' && args[0] === 'stream-a') {
        return new Promise(resolve => { w.__e2e_resolveHistory = resolve })
      }
      return original(channel, ...args)
    }
  })
  await page.locator('[data-tab-id="tab-a"]').click()
  await page.waitForFunction(() => typeof (window as any).__e2e_resolveHistory === 'function')
  await expect(page.locator('.xterm-rows')).toContainText('A-0500')
  await page.locator('.xterm-helper-textarea').focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+PageUp')
  await expect(page.locator('.xterm-rows')).not.toContainText('A-0500')
  const before = await page.locator('.xterm-rows').textContent()
  await page.evaluate(() => {
    const w = window as any
    w.__e2e_resolveHistory([
      ...w.__e2e_terminal_histories['stream-a'],
      { text: 'LATE-HISTORY-501\r\n', stream: 'stdout', timestamp: 501, seq: 501 }
    ])
  })
  await page.waitForTimeout(350)
  const after = await page.locator('.xterm-rows').textContent()
  expect(after?.slice(0, 6)).toBe(before?.slice(0, 6))
  expect(after).not.toContain('LATE-HISTORY-501')
})


test('overlapping coalesced live output and history does not replay bytes twice', async ({ page, electronApp }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:history' && args[0] === 'stream-b') {
        return new Promise(resolve => { w.__e2e_resolveHistory = resolve })
      }
      return original(channel, ...args)
    }
  })
  await page.locator('[data-tab-id="tab-b"]').click()
  await page.waitForFunction(() => typeof (window as any).__e2e_resolveHistory === 'function')
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('session:output', {
        sessionId: 'stream-b', data: 'B-0080\r\nB-0081\r\n', stream: 'stdout', timestamp: 81, seq: 81, chunkLengths: [8, 8]
      })
    }
  })
  await page.evaluate(() => {
    const w = window as any
    w.__e2e_resolveHistory(w.__e2e_terminal_histories['stream-b'])
  })
  await expect(page.locator('.xterm-rows')).toContainText('B-0081')
  const text = await page.locator('.xterm-rows').textContent() ?? ''
  expect(text.split('B-0080').length - 1).toBe(1)
})


test('loading more history keeps the current reading position and includes older output', async ({ page }) => {
  await setup(page, 16000)
  const loadMore = page.locator('.terminal-toolbar button').first()
  await expect(loadMore).toBeEnabled()
  await page.locator('.xterm-helper-textarea').focus()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+PageUp')
  await expect(page.locator('.xterm-rows')).not.toContainText('A-16000')
  const before = await page.locator('.xterm-rows').textContent()
  // Older history and newly produced tail output can arrive in the same read.
  await page.evaluate(() => {
    const history = (window as any).__e2e_terminal_histories['stream-a']
    for (let seq = 16001; seq <= 16050; seq++) {
      history.push({ text: `NEW-${seq}\r\n`, stream: 'stdout', timestamp: seq, seq })
    }
  })
  await loadMore.click()
  await expect(page.locator('.history-window-hint')).toBeVisible()
  await expect(page.locator('.terminal-toolbar button').first()).toBeDisabled()
  await expect(page.locator('.history-window-hint')).not.toContainText('...', { timeout: 10000 })
  await expect.poll(async () => (await page.locator('.xterm-rows').textContent())?.slice(0, 7)).toBe(before?.slice(0, 7))
  const after = await page.locator('.xterm-rows').textContent()
  expect(after?.slice(0, 7)).toBe(before?.slice(0, 7))
  await page.locator('.xterm-helper-textarea').focus()
  for (let i = 0; i < 400; i++) await page.keyboard.press('Shift+PageUp')
  await expect(page.locator('.xterm-rows')).toContainText('A-0001')
})

test('an old failed history request cannot release the new tab history queue', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:history') {
        return new Promise((resolve, reject) => {
          if (args[0] === 'stream-b') w.__e2e_rejectB = reject
          else w.__e2e_resolveA = resolve
        })
      }
      return original(channel, ...args)
    }
  })
  await page.locator('[data-tab-id="tab-b"]').click()
  await page.waitForFunction(() => !!(window as any).__e2e_rejectB)
  await page.locator('[data-tab-id="tab-a"]').click()
  await page.waitForFunction(() => !!(window as any).__e2e_resolveA)
  await page.evaluate(() => (window as any).__e2e_rejectB(new Error('old request failed')))
  await emitOutput(page, 'stream-a', 501, 1)
  // Response contains newer history so leaking 501 into the live path early
  // would cause it to be overwritten by a subsequent reset/replay.
  await page.evaluate(() => {
    const w = window as any
    w.__e2e_resolveA(w.__e2e_terminal_histories['stream-a'].slice(0, 500))
  })
  await expect(page.locator('.xterm-rows')).toContainText('stream-a-501')
  await expect(page.locator('.xterm-rows')).not.toContainText('B-')
})

test('closing a tab while history is pending cannot restore output into its replacement', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:history' && args[0] === 'stream-b') {
        return new Promise(resolve => { w.__e2e_resolveB = resolve })
      }
      return original(channel, ...args)
    }
  })
  await page.locator('[data-tab-id="tab-b"]').click()
  await page.waitForFunction(() => !!(window as any).__e2e_resolveB)
  await page.locator('[data-tab-id="tab-b"] .pane-tab-close').click()
  await expect(page.locator('.pane-session-name')).toHaveText('Stream A')
  await page.evaluate(() => (window as any).__e2e_resolveB([
    { text: 'CLOSED-TAB-OUTPUT\r\n', stream: 'stdout', timestamp: 81, seq: 81 }
  ]))
  await emitOutput(page, 'stream-b', 82, 1)
  await emitOutput(page, 'stream-a', 501, 1)
  await expect(page.locator('.xterm-rows')).toContainText('stream-a-501')
  await expect(page.locator('.xterm-rows')).not.toContainText('CLOSED-TAB-OUTPUT')
  await expect(page.locator('.xterm-rows')).not.toContainText('stream-b-82')
})


test('terminal search can locate retained history and report a match', async ({ page }) => {
  await setup(page)
  await page.locator('.xterm-helper-textarea').focus()
  await page.keyboard.press('Control+f')
  const search = page.locator('.terminal-search-bar input').first()
  await search.fill('A-0001')
  await search.press('Enter')
  await expect(page.locator('.xterm-rows')).toContainText('A-0001')
  await expect(page.locator('.terminal-search-result')).toContainText('1')
  await search.fill('NO-SUCH-HISTORY-MARKER')
  await expect(page.locator('.terminal-search-result')).not.toContainText('1')
})

test('a history response captured before clear cannot restore cleared output', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__clearCalls = []
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:history' && args[0] === 'stream-b') {
        return new Promise(resolve => { w.__resolveHistory = resolve })
      }
      if (channel === 'session:output:clear') {
        w.__clearCalls.push(args[0])
        w.__e2e_terminal_histories[args[0]] = []
        return 80
      }
      return original(channel, ...args)
    }
  })
  await page.locator('[data-tab-id="tab-b"]').click()
  await page.waitForFunction(() => !!(window as any).__resolveHistory)
  await page.locator('.terminal-toolbar button').last().click()
  await page.locator('.confirm-actions button').last().click()
  await page.waitForFunction(() => (window as any).__clearCalls.length === 1)
  await page.evaluate(() => (window as any).__resolveHistory([
    { text: 'CLEARED-BUT-RESTORED\r\n', stream: 'stdout', timestamp: 80, seq: 80 }
  ]))
  await emitOutput(page, 'stream-b', 81, 1)
  await expect(page.locator('.xterm-rows')).toContainText('stream-b-81')
  const text = await page.locator('.xterm-rows').textContent()
  expect(text).not.toContain('CLEARED-BUT-RESTORED')
})


test('clear retains post-cutoff output received before acknowledgement and rejects old frames', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:clear') return new Promise(resolve => { w.__finishClear = resolve })
      return original(channel, ...args)
    }
  })
  await page.locator('.terminal-toolbar button').last().click()
  await page.locator('.confirm-actions button').last().click()
  await page.waitForFunction(() => !!(window as any).__finishClear)
  await page.evaluate(() => {
    const w = window as any
    w.__easy_session_ipc_bus__.channels.get('session:output').bridge({}, {
      sessionId: 'stream-a', data: 'STALE-PRE-CLEAR\r\n', seq: 500, stream: 'stdout', timestamp: 500
    })
  })
  await emitOutput(page, 'stream-a', 501, 1)
  await page.evaluate(() => (window as any).__finishClear(500))
  await expect(page.locator('.terminal-toolbar button').last()).toBeEnabled()
  await expect(page.locator('.xterm-rows')).toContainText('stream-a-501')
  await expect(page.locator('.xterm-rows')).not.toContainText('STALE-PRE-CLEAR')
  await expect(page.locator('.xterm-rows')).not.toContainText('A-0500')
  await emitOutput(page, 'stream-a', 502, 1)
  await expect(page.locator('.xterm-rows')).toContainText('stream-a-502')
})

test('clear failure keeps the existing view and allows subsequent streaming', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:clear') throw new Error('clear rejected')
      return original(channel, ...args)
    }
  })
  await page.locator('.terminal-toolbar button').last().click()
  await page.locator('.confirm-actions button').last().click()
  await expect(page.locator('.terminal-toolbar button').last()).toBeEnabled()
  await expect(page.locator('.xterm-rows')).toContainText('A-0500')
  await emitOutput(page, 'stream-a', 501, 1)
  await expect(page.locator('.xterm-rows')).toContainText('stream-a-501')
  await expect(page.locator('.sessions-page')).toBeVisible()
})

test('a clear confirmation cannot clear a different session selected in the meantime', async ({ page }) => {
  await setup(page)
  await page.evaluate(() => {
    const w = window as any
    const original = w.__e2e_ipc_mock__
    w.__clearedSessions = []
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:output:clear') { w.__clearedSessions.push(args[0]); return 500 }
      return original(channel, ...args)
    }
  })
  await page.locator('.terminal-toolbar button').last().click()
  await expect(page.locator('.confirm-actions')).toBeVisible()
  // Simulate a focus request from another surface while the confirmation is open.
  await page.evaluate(() => (window as any).__pinia__._s.get('workspace').setActiveTab('pane-stream', 'tab-b'))
  await expect(page.locator('.pane-session-name')).toHaveText('Stream B')
  await page.locator('.confirm-actions button').last().click()
  await expect(page.locator('.confirm-actions')).toBeHidden()
  await expect(page.locator('.xterm-rows')).toContainText('B-0080')
  expect(await page.evaluate(() => (window as any).__clearedSessions)).toEqual([])
})


test('initial instance refresh must not delete restored tabs before the session list arrives', async ({ page }) => {
  await page.evaluate(({ fixtureSessions, initialLayout }) => {
    const w = window as any
    w.__pendingInitialLists = []
    w.__e2e_ipc_mock__ = (channel: string, ...args: any[]) => {
      if (channel === 'session:list') return new Promise(resolve => { w.__pendingInitialLists.push(() => resolve(structuredClone(fixtureSessions))) })
      if (channel === 'remote-instance:list' || channel === 'project:list') return []
      if (channel === 'workspace:getLayout') return structuredClone(initialLayout)
      if (channel === 'workspace:updateLayout') return structuredClone(args[0])
      if (channel === 'session:output:history') return []
      if (channel === 'session:resize') return true
      if (channel === 'project:gitBranches') return {
        target: { projectPath: '/stream', projectName: 'stream' }, state: 'available', repoRoot: '/stream',
        projectSubpath: '', currentBranch: 'main', branches: [], message: null
      }
      return undefined
    }
  }, { fixtureSessions: sessions, initialLayout: layout })
  await page.keyboard.press('Control+2')
  await page.waitForURL(/#\/sessions/)
  await page.waitForFunction(() => (window as any).__pinia__._s.get('workspace')?.loaded && (window as any).__pendingInitialLists.length > 0)
  await page.waitForTimeout(200)
  const tabIds = await page.evaluate(() => Object.keys((window as any).__pinia__._s.get('workspace').layout.tabs))
  expect(tabIds.sort()).toEqual(['tab-a', 'tab-b'])
  await page.evaluate(() => { for (const finish of (window as any).__pendingInitialLists) finish() })
  await expect(page.locator('.pane-tab')).toHaveCount(2)
})
