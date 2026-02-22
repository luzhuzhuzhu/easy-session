import { test, expect } from './fixtures'

function mkSession(id: string, name: string, type: 'claude' | 'codex', status: string, projectPath = '/a') {
  return { id, name, type, status, projectPath, createdAt: Date.now() }
}

async function navigateToSessions(page: import('@playwright/test').Page) {
  await page.locator('.nav-menu > .nav-item').nth(2).click()
  await page.waitForURL(/#\/sessions/)
}

async function injectSessions(page: import('@playwright/test').Page, data: any[]) {
  await page.evaluate((json) => {
    ;(window as any).__e2e_inject__('sessions', 'sessions', json)
  }, JSON.stringify(data))
}

async function injectActiveSession(page: import('@playwright/test').Page, id: string) {
  await page.evaluate((sid) => {
    ;(window as any).__e2e_inject__('sessions', 'activeSessionId', JSON.stringify(sid))
  }, id)
}

async function injectOutputBuffer(page: import('@playwright/test').Page, sessionId: string, lines: any[]) {
  await page.evaluate(({ sid, data }) => {
    const store = (window as any).__pinia__?._s?.get('sessions')
    if (store) store.outputBuffers.set(sid, data)
  }, { sid: sessionId, data: lines })
}

// ==================== 左侧列表面板 ====================

test.describe('Session - 创建 Session', () => {
  test('点击 "+ 新建会话" 按钮打开 CreateSessionDialog', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    await expect(page.locator('.dialog-overlay .dialog')).toBeVisible()
  })

  test('对话框包含：名称输入、类型选择（Claude/Codex radio）、项目路径选择、确认/取消', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    const dialog = page.locator('.dialog')
    await expect(dialog.locator('.form-input').first()).toBeVisible()
    await expect(dialog.locator('input[type="radio"][value="claude"]')).toBeVisible()
    await expect(dialog.locator('input[type="radio"][value="codex"]')).toBeVisible()
    await expect(dialog.locator('.path-input')).toBeVisible()
    await expect(dialog.locator('.dialog-footer .btn-primary')).toBeVisible()
    await expect(dialog.locator('.dialog-footer .btn:not(.btn-primary)')).toBeVisible()
  })

  test('类型选 Claude 时显示 model + systemPrompt 字段', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    const dialog = page.locator('.dialog')
    // 默认是 claude
    await expect(dialog.locator('input[type="radio"][value="claude"]')).toBeChecked()
    await expect(dialog.locator('textarea')).toBeVisible()
    // model input (placeholder contains claude)
    await expect(dialog.locator('input[placeholder*="claude"]')).toBeVisible()
  })

  test('类型选 Codex 时显示 model + approvalMode 字段', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    const dialog = page.locator('.dialog')
    await dialog.locator('input[type="radio"][value="codex"]').click()
    await expect(dialog.locator('select')).toBeVisible()
    await expect(dialog.locator('input[placeholder*="o4"]')).toBeVisible()
    // systemPrompt textarea should not be visible
    await expect(dialog.locator('textarea')).toBeHidden()
  })

  test('项目路径为空时提交显示错误提示', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    // Submit without filling project path
    await page.locator('.dialog-footer .btn-primary').click()
    await expect(page.locator('.error-text')).toBeVisible()
  })

  test('点击 "浏览" 按钮触发 dialog:selectFolder IPC', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    await page.evaluate(() => {
      ;(window as any).__selectFolderCalled = false
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'dialog:selectFolder') {
          ;(window as any).__selectFolderCalled = true
          return null
        }
        return undefined
      }
    })
    await page.locator('.path-input .btn').click()
    const called = await page.evaluate(() => (window as any).__selectFolderCalled)
    expect(called).toBe(true)
  })

  test('不填名称时使用默认名称格式 Claude-001 / Codex-001', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    const dialog = page.locator('.dialog')
    const nameInput = dialog.locator('.form-input').first()
    const placeholder = await nameInput.getAttribute('placeholder')
    expect(placeholder).toMatch(/Claude-\d{3}/)
  })

  test('提交成功后对话框关闭 + Toast 提示 + 列表刷新', async ({ page }) => {
    await navigateToSessions(page)
    await page.locator('.list-toolbar .btn-primary').click()
    // Mock IPC
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'dialog:selectFolder') return '/test/path'
        if (channel === 'session:create') return {
          id: 'new-s1', name: 'Claude-001', type: 'claude', status: 'idle',
          projectPath: '/test/path', createdAt: Date.now(), lastActiveAt: Date.now(),
          processId: null, options: {}, parentId: null
        }
        if (channel === 'session:output:history') return []
        return undefined
      }
    })
    // Select folder
    await page.locator('.path-input .btn').click()
    // Submit
    await page.locator('.dialog-footer .btn-primary').click()
    // Dialog should close
    await expect(page.locator('.dialog-overlay')).toBeHidden()
    // Toast should appear
    await expect(page.locator('.toast')).toBeVisible()
    // Session should appear in list
    await expect(page.locator('.session-item')).toHaveCount(1)
  })

  test('点击取消或点击遮罩层关闭对话框', async ({ page }) => {
    await navigateToSessions(page)
    // Test cancel button
    await page.locator('.list-toolbar .btn-primary').click()
    await expect(page.locator('.dialog-overlay')).toBeVisible()
    await page.locator('.dialog-footer .btn:not(.btn-primary)').click()
    await expect(page.locator('.dialog-overlay')).toBeHidden()
    // Test overlay click
    await page.locator('.list-toolbar .btn-primary').click()
    await expect(page.locator('.dialog-overlay')).toBeVisible()
    await page.locator('.dialog-overlay').click({ position: { x: 10, y: 10 } })
    await expect(page.locator('.dialog-overlay')).toBeHidden()
  })

  test('URL 带 ?action=create 时自动打开创建对话框', async ({ page }) => {
    await page.evaluate(() => { window.location.hash = '#/sessions?action=create' })
    await page.waitForURL(/#\/sessions/)
    await expect(page.locator('.dialog-overlay .dialog')).toBeVisible()
  })
})

test.describe('Session - 列表展示', () => {
  test('无 Session 时显示空状态文字', async ({ page }) => {
    await navigateToSessions(page)
    await expect(page.locator('.empty-list')).toBeVisible()
  })

  test('有 Session 时按列表展示，每项显示：类型徽章 + 名称 + 时间 + 状态点', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Test-001', 'claude', 'running')])
    const item = page.locator('.session-item').first()
    await expect(item.locator('.type-badge')).toBeVisible()
    await expect(item.locator('.item-name')).toHaveText('Test-001')
    await expect(item.locator('.item-time')).toBeVisible()
    await expect(item.locator('.status-dot')).toBeVisible()
  })

  test('Claude 类型徽章蓝色背景，Codex 类型徽章紫色背景', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [
      mkSession('s1', 'C1', 'claude', 'idle'),
      mkSession('s2', 'X1', 'codex', 'idle')
    ])
    const items = page.locator('.session-item')
    await expect(items.nth(0).locator('.type-badge')).toHaveClass(/claude/)
    await expect(items.nth(0).locator('.type-badge')).toHaveText('C')
    await expect(items.nth(1).locator('.type-badge')).toHaveClass(/codex/)
    await expect(items.nth(1).locator('.type-badge')).toHaveText('X')
  })

  test('状态点颜色：idle=灰 / running=绿(闪烁) / stopped=黄 / error=红', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [
      mkSession('s1', 'A', 'claude', 'idle'),
      mkSession('s2', 'B', 'claude', 'running'),
      mkSession('s3', 'C', 'claude', 'stopped'),
      mkSession('s4', 'D', 'claude', 'error')
    ])
    const items = page.locator('.session-item')
    await expect(items.nth(0).locator('.status-dot')).toHaveClass(/idle/)
    await expect(items.nth(1).locator('.status-dot')).toHaveClass(/running/)
    await expect(items.nth(2).locator('.status-dot')).toHaveClass(/stopped/)
    await expect(items.nth(3).locator('.status-dot')).toHaveClass(/error/)
  })
})

test.describe('Session - 筛选', () => {
  test('下拉筛选器默认 "全部"', async ({ page }) => {
    await navigateToSessions(page)
    const select = page.locator('.filter-select')
    await expect(select).toHaveValue('')
  })

  test('选择 Claude 只显示 type=claude 的 Session', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [
      mkSession('s1', 'C1', 'claude', 'idle'),
      mkSession('s2', 'X1', 'codex', 'idle')
    ])
    await page.locator('.filter-select').selectOption('claude')
    await expect(page.locator('.session-item')).toHaveCount(1)
    await expect(page.locator('.session-item .item-name')).toHaveText('C1')
  })

  test('选择 Codex 只显示 type=codex 的 Session', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [
      mkSession('s1', 'C1', 'claude', 'idle'),
      mkSession('s2', 'X1', 'codex', 'idle')
    ])
    await page.locator('.filter-select').selectOption('codex')
    await expect(page.locator('.session-item')).toHaveCount(1)
    await expect(page.locator('.session-item .item-name')).toHaveText('X1')
  })
})

test.describe('Session - 选中与激活', () => {
  test('点击列表项设为 activeSession，左侧高亮 + 左边框蓝色', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'A', 'claude', 'idle')])
    await page.locator('.session-item').first().click()
    await expect(page.locator('.session-item').first()).toHaveClass(/active/)
  })

  test('右侧面板显示选中 Session 的详情', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'MySession', 'claude', 'idle', '/proj')])
    await page.locator('.session-item').first().click()
    await expect(page.locator('.detail-header h2')).toHaveText('MySession')
  })
})

// ==================== 右侧详情面板 ====================

test.describe('Session - 详情头部', () => {
  test('显示类型徽章(大号) + Session 名称 + 项目路径 + 状态标签', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Detail-Test', 'claude', 'running', '/my/proj')])
    await injectActiveSession(page, 's1')
    const header = page.locator('.detail-header')
    await expect(header.locator('.type-badge.lg')).toBeVisible()
    await expect(header.locator('h2')).toHaveText('Detail-Test')
    await expect(header.locator('.header-meta')).toContainText('/my/proj')
    await expect(header.locator('.status-tag')).toBeVisible()
  })

  test('running 状态时显示运行时长（每秒刷新 Xm Xs 格式）', async ({ page }) => {
    await navigateToSessions(page)
    const ts = Date.now() - 125000 // 2m 5s ago
    await injectSessions(page, [{ id: 's1', name: 'R', type: 'claude', status: 'running', projectPath: '/a', createdAt: ts }])
    await injectActiveSession(page, 's1')
    const meta = page.locator('.header-meta')
    await expect(meta).toContainText(/\d+m \d+s/)
  })

  test('销毁按钮点击弹出 confirm 确认框，确认后销毁 Session + Toast', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'ToDestroy', 'claude', 'idle')])
    await injectActiveSession(page, 's1')
    // Mock confirm to return true
    await page.evaluate(() => { (window as any).confirm = () => true })
    await page.locator('.btn-danger').click()
    // Session should be removed
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      return !store?.sessions?.find((s: any) => s.id === 's1')
    })
  })
})

test.describe('Session - 终端输出', () => {
  test('TerminalOutput 组件渲染 outputBuffers 中的内容', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'T1', 'claude', 'running')])
    await injectActiveSession(page, 's1')
    await injectOutputBuffer(page, 's1', [
      { text: 'hello world', stream: 'stdout', timestamp: Date.now() }
    ])
    await expect(page.locator('.terminal-line')).toHaveCount(1)
    await expect(page.locator('.terminal-line').first()).toContainText('hello world')
  })

  test('输出超过 2000 行时只显示最近 2000 行', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'T2', 'claude', 'running')])
    await injectActiveSession(page, 's1')
    const lines = Array.from({ length: 2500 }, (_, i) => ({
      text: `line-${i}`, stream: 'stdout' as const, timestamp: Date.now()
    }))
    await injectOutputBuffer(page, 's1', lines)
    // View should cap at 2000
    await expect(page.locator('.terminal-line')).toHaveCount(2000)
  })

  test('清除按钮清空当前 Session 的输出缓冲', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'T3', 'claude', 'running')])
    await injectActiveSession(page, 's1')
    await injectOutputBuffer(page, 's1', [
      { text: 'to-clear', stream: 'stdout', timestamp: Date.now() }
    ])
    await expect(page.locator('.terminal-line')).toHaveCount(1)
    // Click clear button (✕ in terminal toolbar)
    await page.locator('.terminal-toolbar .tool-btn').last().click()
    await expect(page.locator('.terminal-line')).toHaveCount(0)
  })
})

test.describe('Session - 输入栏', () => {
  test('Session 非 running 状态时输入栏 disabled', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Idle', 'claude', 'idle')])
    await injectActiveSession(page, 's1')
    await expect(page.locator('.session-input')).toBeDisabled()
  })

  test('running 状态时可输入文字，回车或点击发送', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Run', 'claude', 'running')])
    await injectActiveSession(page, 's1')
    const input = page.locator('.session-input')
    await expect(input).toBeEnabled()
    await input.fill('test command')
    await input.press('Enter')
    // Input should be cleared after send
    await expect(input).toHaveValue('')
  })

  test('发送后调用 session:input IPC', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Run', 'claude', 'running')])
    await injectActiveSession(page, 's1')
    await page.evaluate(() => {
      ;(window as any).__inputCalled = false
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'session:input') { ;(window as any).__inputCalled = true; return true }
        return undefined
      }
    })
    await page.locator('.session-input').fill('hello')
    await page.locator('.session-input').press('Enter')
    const called = await page.evaluate(() => (window as any).__inputCalled)
    expect(called).toBe(true)
  })
})

// ==================== 右键菜单 ====================

test.describe('Session - 右键菜单', () => {
  test('右键点击列表项弹出上下文菜单（重命名 + 销毁）', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Ctx', 'claude', 'idle')])
    await page.locator('.session-item').first().click({ button: 'right' })
    await expect(page.locator('.context-menu')).toBeVisible()
    const items = page.locator('.context-item')
    await expect(items).toHaveCount(2)
  })

  test('点击 "重命名" 弹出 prompt 输入框，输入新名称后调用 session:rename', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'OldName', 'claude', 'idle')])
    await page.locator('.session-item').first().click({ button: 'right' })
    // Mock prompt and rename IPC
    await page.evaluate(() => {
      ;(window as any).prompt = () => 'NewName'
      ;(window as any).__renameCalled = false
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'session:rename') { ;(window as any).__renameCalled = true; return true }
        return undefined
      }
    })
    await page.locator('.context-item').first().click()
    const called = await page.evaluate(() => (window as any).__renameCalled)
    expect(called).toBe(true)
  })

  test('点击 "销毁" 弹出 confirm，确认后销毁', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'ToDel', 'claude', 'idle')])
    await page.locator('.session-item').first().click({ button: 'right' })
    await page.evaluate(() => { (window as any).confirm = () => true })
    await page.locator('.context-item.danger').click()
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      return store?.sessions?.length === 0
    })
  })

  test('点击菜单外区域关闭菜单', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Ctx2', 'claude', 'idle')])
    await page.locator('.session-item').first().click({ button: 'right' })
    await expect(page.locator('.context-menu')).toBeVisible()
    await page.locator('.context-overlay').click()
    await expect(page.locator('.context-menu')).toBeHidden()
  })
})

// ==================== 实时事件 ====================

test.describe('Session - 实时事件', () => {
  test('收到 session:output 事件时实时追加输出到终端', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'Live', 'claude', 'running')])
    await injectActiveSession(page, 's1')
    // Simulate session:output event via store's appendOutput
    await page.evaluate(() => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      if (store) store.appendOutput('s1', { text: 'realtime-line', stream: 'stdout', timestamp: Date.now() })
    })
    await expect(page.locator('.terminal-line')).toHaveCount(1)
    await expect(page.locator('.terminal-line').first()).toContainText('realtime-line')
  })

  test('收到 session:status 事件时更新列表中对应 Session 的状态点', async ({ page }) => {
    await navigateToSessions(page)
    await injectSessions(page, [mkSession('s1', 'StatusTest', 'claude', 'idle')])
    await expect(page.locator('.session-item .status-dot')).toHaveClass(/idle/)
    // Simulate status change
    await page.evaluate(() => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      const s = store?.sessions?.find((x: any) => x.id === 's1')
      if (s) s.status = 'running'
    })
    await expect(page.locator('.session-item .status-dot')).toHaveClass(/running/)
  })
})
