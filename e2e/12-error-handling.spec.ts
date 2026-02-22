import { test, expect } from './fixtures'

// ==================== ErrorBoundary 组件 ====================

test.describe('ErrorBoundary 组件', () => {
  test('子组件抛出异常时 ErrorBoundary 捕获，不导致白屏', async ({ page }) => {
    await page.evaluate(() => {
      const eb = (window as any).__e2e_errorBoundary__
      if (eb) { eb.hasError.value = true; eb.errorMsg.value = 'E2E test error' }
    })
    await expect(page.locator('.error-boundary')).toBeVisible({ timeout: 3000 })
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  test('错误状态下显示友好的错误提示界面', async ({ page }) => {
    await page.evaluate(() => {
      const eb = (window as any).__e2e_errorBoundary__
      if (eb) { eb.hasError.value = true; eb.errorMsg.value = '测试错误信息' }
    })

    const eb = page.locator('.error-boundary')
    await expect(eb.locator('.error-icon')).toHaveText('⚠️')
    await expect(eb.locator('.error-msg')).toHaveText('页面组件发生错误')
    await expect(eb.locator('.error-detail')).toHaveText('测试错误信息')
    await expect(eb.locator('.retry-btn')).toHaveText('重试')

    await eb.locator('.retry-btn').click()
    await expect(eb).toBeHidden()
  })
})

// ==================== Toast 通知系统 ====================

test.describe('Toast 通知系统', () => {
  test('成功操作显示绿色 Toast', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__pinia__._s.get('toast').add('success', '操作成功')
    })
    const toast = page.locator('.toast-item.success')
    await expect(toast).toBeVisible()
    await expect(toast.locator('.toast-icon')).toHaveText('✓')
  })

  test('失败操作显示红色 Toast', async ({ page }) => {
    await page.evaluate(() => {
      ;(window as any).__pinia__._s.get('toast').add('error', '操作失败')
    })
    const toast = page.locator('.toast-item.error')
    await expect(toast).toBeVisible()
    await expect(toast.locator('.toast-icon')).toHaveText('✕')
  })

  test('Toast 自动消失（超时后移除）', async ({ page }) => {
    await page.evaluate(() => {
      const store = (window as any).__pinia__._s.get('toast')
      store.toasts.push({ id: Date.now(), type: 'info', message: '即将消失', duration: 1000 })
    })
    await expect(page.locator('.toast-item')).toBeVisible()
    await expect(page.locator('.toast-item')).toBeHidden({ timeout: 5000 })
  })

  test('多个 Toast 可同时显示（堆叠）', async ({ page }) => {
    await page.evaluate(() => {
      const s = (window as any).__pinia__._s.get('toast')
      s.add('success', '消息1')
      s.add('error', '消息2')
      s.add('info', '消息3')
    })
    await expect(page.locator('.toast-item')).toHaveCount(3)
  })
})

// ==================== IPC 错误处理 ====================

test.describe('IPC 错误处理', () => {
  test('session:create 失败时显示错误 Toast，不崩溃', async ({ page }) => {
    await page.locator('.nav-menu > .nav-item').nth(2).click()
    await page.waitForURL(/#\/sessions/)

    // 一次性 mock 所有需要的 IPC channel
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'dialog:selectFolder') return '/test/path'
        if (channel === 'session:create') throw new Error('mock error')
        return undefined
      }
    })

    await page.locator('.list-toolbar .btn-primary').click()
    await page.locator('.path-input .btn').click()
    await page.locator('.dialog-footer .btn-primary').click()

    await expect(page.locator('.toast-item.error')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('.sidebar')).toBeVisible()
  })

  test('team:create 失败时显示错误 Toast', async ({ page }) => {
    await page.locator('.nav-menu > .nav-item').nth(4).click()
    await page.waitForURL(/#\/orchestration/)

    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'team:create') throw new Error('mock error')
        return undefined
      }
      ;(window as any).__e2e_inject__('projects', 'projects', JSON.stringify([
        { id: 'p1', name: '项目A', path: '/a', createdAt: 1000, lastOpenedAt: 3000,
          settings: { collaborationEnabled: false, defaultCliType: 'both', claude: {}, codex: {}, customSettings: {} } }
      ]))
    })

    await page.locator('.btn-primary:has-text("新建团队")').click()
    await expect(page.locator('.dialog')).toBeVisible()
    await page.locator('.dialog .form-input').first().fill('测试团队')
    const select = page.locator('.dialog select')
    if (await select.isVisible()) await select.selectOption('p1')
    await page.locator('.dialog-footer .btn-primary').click()

    await expect(page.locator('.toast-item.error')).toBeVisible({ timeout: 5000 })
  })

  test('skill:execute 失败时显示错误 Toast', async ({ page }) => {
    await page.locator('.nav-menu > .nav-item').nth(5).click()
    await page.waitForURL(/#\/skills/)

    // Mock skill:execute 失败 + skill:preview:prompt 正常
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'skill:execute') throw new Error('mock error')
        return undefined
      }
    })

    // 注入 skill + running session
    await page.evaluate(() => {
      ;(window as any).__e2e_inject__('skills', 'skills', JSON.stringify([
        { id: 'sk1', name: 'Test Skill', slug: 'test-skill', description: 'desc',
          category: 'dev', prompt: 'hello {{name}}',
          inputSchema: { fields: [{ name: 'name', type: 'string', description: 'Name', required: true }] },
          outputSchema: { format: 'text' }, compatibleCli: ['claude'], isBuiltin: false }
      ]))
      ;(window as any).__e2e_inject__('sessions', 'sessions', JSON.stringify([
        { id: 'rs1', name: 'RunSession', type: 'claude', status: 'running', projectPath: '/a', createdAt: Date.now() }
      ]))
    })

    // 选中 skill
    await page.locator('.skill-item').first().click()
    // 选择 session + 填写必填字段
    await page.locator('.skill-execute-panel select').selectOption('rs1')
    await page.locator('.skill-execute-panel .panel-input').last().fill('test')
    // 点击执行
    await page.locator('.skill-execute-panel .btn-primary').click()

    await expect(page.locator('.toast-item.error')).toBeVisible({ timeout: 5000 })
  })

  test('config:save 失败时显示错误消息 + Toast', async ({ page }) => {
    await page.locator('.nav-menu > .nav-item').nth(1).click()
    await page.waitForURL(/#\/config/)

    // Mock config:claude:write 失败
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'config:claude:write' || channel === 'config:codex:write') throw new Error('写入失败')
        return undefined
      }
    })

    // 修改编辑器内容以启用保存按钮
    const editor = page.locator('.json-editor')
    await editor.click()
    await editor.fill('{"modified": true}')

    await page.locator('.btn-primary:has-text("保存")').click()
    await expect(page.locator('.toast-item.error')).toBeVisible({ timeout: 5000 })
  })

  test('project:add 失败时显示错误 Toast', async ({ page }) => {
    await page.locator('.nav-menu > .nav-item').nth(3).click()
    await page.waitForURL(/#\/projects/)

    // 一次性 mock selectFolder 返回路径 + project:add 失败
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'project:selectFolder') return '/test/project'
        if (channel === 'project:add') throw new Error('mock error')
        return undefined
      }
    })

    await page.locator('.btn-primary:has-text("添加项目")').click()
    await expect(page.locator('.toast-item.error')).toBeVisible({ timeout: 5000 })
  })
})

// ==================== 网络/进程异常 ====================

test.describe('网络/进程异常', () => {
  test('CLI 进程意外退出时 Session 状态更新为 error', async ({ page }) => {
    await page.locator('.nav-menu > .nav-item').nth(2).click()
    await page.waitForURL(/#\/sessions/)

    await page.evaluate(() => {
      ;(window as any).__e2e_inject__('sessions', 'sessions', JSON.stringify([
        { id: 's1', name: 'Running', type: 'claude', status: 'running', projectPath: '/a', createdAt: Date.now() }
      ]))
    })

    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('sessions')
      return store?.sessions?.some((s: any) => s.id === 's1')
    })
    await expect(page.locator('.session-item .status-dot')).toHaveClass(/running/)

    // 模拟 CLI 进程退出
    await page.evaluate(() => {
      const store = (window as any).__pinia__._s.get('sessions')
      const s = store.sessions.find((x: any) => x.id === 's1')
      if (s) s.status = 'error'
    })

    await expect(page.locator('.session-item .status-dot')).toHaveClass(/error/)
  })
})
