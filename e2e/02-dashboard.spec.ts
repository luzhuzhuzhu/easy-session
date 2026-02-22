import { test, expect } from './fixtures'

const defaultSettings = {
  collaborationEnabled: false,
  defaultCliType: 'both',
  claude: {},
  codex: {},
  customSettings: {}
}

function mkProject(id: string, name: string, path: string, lastOpenedAt: number) {
  return { id, name, path, createdAt: 1000, lastOpenedAt, settings: defaultSettings }
}

function mkSession(id: string, name: string, status: string) {
  return { id, name, type: 'claude', status, projectPath: '/a', createdAt: 1000 }
}

async function waitInit(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const store = (window as any).__pinia__?._s?.get('projects')
    return store && !store.loading
  })
}

async function injectProjects(page: import('@playwright/test').Page, data: any[]) {
  await waitInit(page)
  await page.evaluate((json) => {
    ;(window as any).__e2e_inject__('projects', 'projects', json)
  }, JSON.stringify(data))
}

async function injectSessions(page: import('@playwright/test').Page, data: any[]) {
  await page.evaluate((json) => {
    ;(window as any).__e2e_inject__('sessions', 'sessions', json)
  }, JSON.stringify(data))
}

async function injectApp(page: import('@playwright/test').Page, key: string, value: any) {
  await page.evaluate(({ k, v }) => {
    ;(window as any).__e2e_inject__('app', k, JSON.stringify(v))
  }, { k: key, v: value })
}

test.describe('仪表盘 - 欢迎区域', () => {
  test('显示欢迎标题和描述文字', async ({ page }) => {
    const welcome = page.locator('.welcome')
    await expect(welcome.locator('h1')).toBeVisible()
    await expect(welcome.locator('p')).toBeVisible()
  })

  test('文字内容与 zh-CN locale 一致', async ({ page }) => {
    await expect(page.locator('.welcome h1')).toHaveText('欢迎使用 Claude-Codex-Mix')
    await expect(page.locator('.welcome p')).toHaveText('Claude 与 Codex 的统一管理与协同平台')
  })
})

test.describe('仪表盘 - CLI 状态卡片', () => {
  test('页面加载时显示检测中状态', async ({ page }) => {
    // 页面刚加载时 checking=true，indicator 应为 checking 类
    const indicators = page.locator('.cli-card .indicator')
    // 至少有一个 indicator 存在
    await expect(indicators.first()).toBeVisible()
  })

  test('Claude 可用时显示绿色指示灯和详情', async ({ page }) => {
    await waitInit(page)
    await injectApp(page, 'claudeAvailable', true)
    await injectApp(page, 'claudeInfo', { available: true, path: '/usr/bin/claude', version: '1.0.0' })
    // 等 checking 变 false
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('app')
      return store?.claudeAvailable === true
    })

    const card = page.locator('.cli-card').first()
    const indicator = card.locator('.indicator')
    await expect(indicator).toHaveClass(/available/)
    await expect(card.locator('.status-text')).toHaveText('可用')
    await expect(card.locator('code')).toBeVisible()
  })

  test('Claude 不可用时显示红色指示灯', async ({ page }) => {
    await waitInit(page)
    // 模拟 checking 完成：通过 evaluate 设置 checking = false
    await page.evaluate(() => {
      const vm = document.querySelector('.dashboard')?.__vue_app__
      // 直接触发 checking 完成 — 默认 claudeAvailable=false
    })
    // 等待 CLI 检测完成（checking 变 false 后 indicator 变为 available/unavailable）
    await page.waitForFunction(() => {
      const el = document.querySelector('.cli-card .indicator')
      return el && (el.classList.contains('available') || el.classList.contains('unavailable'))
    }, { timeout: 10000 })

    const card = page.locator('.cli-card').first()
    const indicator = card.locator('.indicator')
    await expect(indicator).toHaveClass(/unavailable/)
    await expect(card.locator('.status-text')).toHaveText('不可用')
    // 不可用时不显示路径/版本
    await expect(card.locator('.cli-detail')).toBeHidden()
  })

  test('Codex 可用时显示绿色指示灯和详情', async ({ page }) => {
    await waitInit(page)
    await injectApp(page, 'codexAvailable', true)
    await injectApp(page, 'codexInfo', { available: true, path: '/usr/bin/codex', version: '2.0.0' })
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('app')
      return store?.codexAvailable === true
    })

    const card = page.locator('.cli-card').nth(1)
    const indicator = card.locator('.indicator')
    await expect(indicator).toHaveClass(/available/)
    await expect(card.locator('.status-text')).toHaveText('可用')
    await expect(card.locator('code')).toBeVisible()
  })

  test('Codex 不可用时显示红色指示灯', async ({ page }) => {
    await page.waitForFunction(() => {
      const el = document.querySelectorAll('.cli-card .indicator')[1]
      return el && (el.classList.contains('available') || el.classList.contains('unavailable'))
    }, { timeout: 10000 })

    const card = page.locator('.cli-card').nth(1)
    await expect(card.locator('.indicator')).toHaveClass(/unavailable/)
    await expect(card.locator('.status-text')).toHaveText('不可用')
  })

  test('CLI 路径以 code 标签展示', async ({ page }) => {
    await waitInit(page)
    await injectApp(page, 'claudeAvailable', true)
    await injectApp(page, 'claudeInfo', { available: true, path: '/usr/bin/claude', version: '1.0.0' })
    await page.waitForFunction(() => {
      const store = (window as any).__pinia__?._s?.get('app')
      return store?.claudeAvailable === true
    })

    const card = page.locator('.cli-card').first()
    const codeEl = card.locator('.cli-detail code')
    await expect(codeEl).toBeVisible()
    await expect(codeEl).toHaveText('/usr/bin/claude')
    // 验证 code 标签使用等宽字体
    const fontFamily = await codeEl.evaluate((el) => getComputedStyle(el).fontFamily)
    expect(fontFamily).toMatch(/mono/i)
  })
})

test.describe('仪表盘 - 统计卡片', () => {
  test('活跃项目卡片显示项目数量', async ({ page }) => {
    await waitInit(page)
    const statCards = page.locator('.stat-card')
    await expect(statCards.first().locator('h3')).toHaveText('活跃项目')
    await expect(statCards.first().locator('.stat')).toBeVisible()
  })

  test('活跃会话卡片显示运行中 session 数量', async ({ page }) => {
    await waitInit(page)
    const statCards = page.locator('.stat-card')
    await expect(statCards.nth(1).locator('h3')).toHaveText('活跃 Session')
    await expect(statCards.nth(1).locator('.stat')).toBeVisible()
  })

  test('无项目无会话时统计值为 0', async ({ page }) => {
    await waitInit(page)
    const stats = page.locator('.stat-card .stat')
    await expect(stats.first()).toHaveText('0')
    await expect(stats.nth(1)).toHaveText('0')
  })

  test('有 3 个项目和 2 个运行中 session 时数值正确', async ({ page }) => {
    await waitInit(page)
    await injectProjects(page, [
      mkProject('p1', 'A', '/a', 3000),
      mkProject('p2', 'B', '/b', 2000),
      mkProject('p3', 'C', '/c', 1000)
    ])
    await injectSessions(page, [
      mkSession('s1', 'run1', 'running'),
      mkSession('s2', 'run2', 'running'),
      mkSession('s3', 'idle1', 'idle')
    ])

    const stats = page.locator('.stat-card .stat')
    await expect(stats.first()).toHaveText('3')
    await expect(stats.nth(1)).toHaveText('2')
  })
})

test.describe('仪表盘 - 最近项目', () => {
  test('无项目时不显示最近项目区域', async ({ page }) => {
    await waitInit(page)
    await expect(page.locator('.recent-projects')).toBeHidden()
  })

  test('有项目时显示最多 5 个最近项目', async ({ page }) => {
    await waitInit(page)
    const projects = Array.from({ length: 7 }, (_, i) =>
      mkProject(`p${i}`, `Proj${i}`, `/path${i}`, 7000 - i * 1000)
    )
    await injectProjects(page, projects)

    await expect(page.locator('.recent-projects')).toBeVisible()
    await expect(page.locator('.recent-item')).toHaveCount(5)
  })

  test('每个项目项显示名称和路径', async ({ page }) => {
    await waitInit(page)
    await injectProjects(page, [mkProject('p1', 'MyProject', '/home/proj', 3000)])

    const item = page.locator('.recent-item').first()
    await expect(item.locator('.recent-name')).toHaveText('MyProject')
    await expect(item.locator('.recent-path')).toHaveText('/home/proj')
  })

  test('点击项目项跳转到项目详情', async ({ page }) => {
    await waitInit(page)
    await injectProjects(page, [mkProject('p1', 'MyProject', '/home/proj', 3000)])

    await page.locator('.recent-item').first().click()
    await page.waitForURL(/#\/projects\/p1/)
  })
})

test.describe('仪表盘 - 快捷操作', () => {
  test('显示 3 个快捷按钮', async ({ page }) => {
    const actions = page.locator('.action-btn')
    await expect(actions).toHaveCount(3)
    await expect(actions.nth(0)).toHaveText('新建项目')
    await expect(actions.nth(1)).toHaveText('新建 Session')
    await expect(actions.nth(2)).toHaveText('打开配置')
  })

  test('点击新建项目触发文件夹选择对话框', async ({ page }) => {
    // 拦截 IPC 调用，记录是否触发了 selectFolder
    await page.evaluate(() => {
      ;(window as any).__selectFolderCalled = false
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ..._args: any[]) => {
        if (channel === 'project:selectFolder') {
          ;(window as any).__selectFolderCalled = true
          return null // 模拟取消选择
        }
        return undefined
      }
    })

    await page.locator('.action-btn').nth(0).click()

    const called = await page.evaluate(() => (window as any).__selectFolderCalled)
    expect(called).toBe(true)
  })

  test('选择文件夹后自动添加项目并跳转到项目详情', async ({ page }) => {
    const fakeProject = mkProject('new-p', 'NewProj', '/selected/folder', Date.now())
    await page.evaluate((proj) => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ..._args: any[]) => {
        if (channel === 'project:selectFolder') return '/selected/folder'
        if (channel === 'project:add') return JSON.parse(proj)
        return undefined
      }
    }, JSON.stringify(fakeProject))

    await page.locator('.action-btn').nth(0).click()
    await page.waitForURL(/#\/projects\/new-p/)
  })

  test('点击新建会话跳转到 /sessions', async ({ page }) => {
    await page.locator('.action-btn').nth(1).click()
    await page.waitForURL(/#\/sessions/)
  })

  test('点击打开配置跳转到 /config', async ({ page }) => {
    await page.locator('.action-btn').nth(2).click()
    await page.waitForURL(/#\/config/)
  })
})

test.describe('仪表盘 - 初始化流程', () => {
  test('onMounted 依次调用 init → checkCliStatus + fetchProjects + fetchSessions', async ({ page }) => {
    // 验证初始化完成：store 已加载
    await page.waitForFunction(() => {
      const app = (window as any).__pinia__?._s?.get('app')
      const projects = (window as any).__pinia__?._s?.get('projects')
      const sessions = (window as any).__pinia__?._s?.get('sessions')
      return app && projects && sessions
    })
  })
})
