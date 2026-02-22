import { test, expect } from './fixtures'

const MOCK_PROJECTS = [
  {
    id: 'proj-1', name: 'Test Project', path: '/home/user/test-project',
    createdAt: 1700000000000, lastOpenedAt: 1700000000000,
    settings: { collaborationEnabled: false, defaultCliType: 'claude', claude: {}, codex: {}, customSettings: {} }
  },
  {
    id: 'proj-2', name: 'Second Project', path: '/home/user/second',
    createdAt: 1700000000000, lastOpenedAt: 1700000000000,
    settings: { collaborationEnabled: false, defaultCliType: 'codex', claude: {}, codex: {}, customSettings: {} }
  }
]

const MOCK_TEMPLATES: any[] = [
  {
    id: 'tpl-1', name: 'Code Review', description: 'Review code with AI pair',
    members: [
      { role: 'reviewer', cliType: 'claude', description: 'Reviews code', defaultPrompt: '', canSendTo: ['author'] },
      { role: 'author', cliType: 'codex', description: 'Writes code', defaultPrompt: '', canSendTo: ['reviewer'] }
    ],
    isBuiltin: true
  }
]

const MOCK_TEAMS: any[] = []
const MOCK_SKILLS: any[] = []

async function mockIpcAndNavigate(page: import('@playwright/test').Page, opts: {
  teams?: any[]
  templates?: any[]
  projects?: any[]
  skills?: any[]
} = {}) {
  const teams = opts.teams ?? MOCK_TEAMS
  const templates = opts.templates ?? MOCK_TEMPLATES
  const projects = opts.projects ?? MOCK_PROJECTS
  const skills = opts.skills ?? MOCK_SKILLS

  await page.evaluate(({ teams, templates, projects, skills }) => {
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'team:list') return teams
      if (channel === 'template:list') return templates
      if (channel === 'project:list' || channel === 'project:listAll') return projects
      if (channel === 'skill:list') return skills
      if (channel === 'team:create') {
        const p = args[0]
        const newTeam = { id: 'team-new', name: p.name, projectId: p.projectId, members: [], status: 'idle', createdAt: Date.now() }
        teams.push(newTeam)
        return newTeam
      }
      if (channel === 'template:apply') {
        const newTeam = { id: 'team-tpl', name: 'From Template', projectId: args[1], members: [], status: 'idle', createdAt: Date.now() }
        teams.push(newTeam)
        return newTeam
      }
      if (channel === 'team:start') {
        const t = teams.find((t: any) => t.id === args[0])
        if (t) t.status = 'running'
        return true
      }
      if (channel === 'team:pause') {
        const t = teams.find((t: any) => t.id === args[0])
        if (t) t.status = 'paused'
        return true
      }
      if (channel === 'team:dissolve') {
        const idx = teams.findIndex((t: any) => t.id === args[0])
        if (idx >= 0) teams.splice(idx, 1)
        return true
      }
      if (channel === 'team:messages') return []
      if (channel === 'team:sendMessage') {
        return { id: 'msg-new', fromSessionId: args[0], toSessionId: args[1], type: args[2], content: args[3], timestamp: Date.now() }
      }
      if (channel === 'team:removeMember') {
        const t = teams.find((t: any) => t.id === args[0])
        if (t) t.members = t.members.filter((m: any) => m.sessionId !== args[1])
        return true
      }
      if (channel === 'session:output:clear') return null
      return undefined
    }
  }, { teams, templates, projects, skills })

  await page.evaluate(() => { window.location.hash = '#/orchestration' })
  await page.waitForURL(/#\/orchestration/)
}

async function restoreIpc(page: import('@playwright/test').Page) {
  await page.evaluate(() => {
    ;(window as any).__e2e_ipc_mock__ = null
  })
}

// ==================== 工具栏 ====================

test.describe('Orchestration - 工具栏', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('显示标题、项目筛选下拉、创建团队按钮、模板按钮', async ({ page }) => {
    await mockIpcAndNavigate(page, { templates: MOCK_TEMPLATES })

    // 标题
    const toolbar = page.locator('.page-toolbar')
    await expect(toolbar.locator('h2')).toBeVisible()

    // 项目筛选下拉
    const filterSelect = toolbar.locator('.filter-select')
    await expect(filterSelect).toBeVisible()

    // 创建团队按钮
    const createBtn = toolbar.locator('.btn-primary')
    await expect(createBtn).toBeVisible()
    await expect(createBtn).toContainText('创建')

    // 模板按钮（有模板时显示）
    const templateBtn = toolbar.locator('.dropdown .btn')
    await expect(templateBtn).toBeVisible()
  })

  test('项目筛选下拉列出所有项目，选择后过滤团队列表', async ({ page }) => {
    const teams = [
      { id: 'team-a', name: 'Team Alpha', projectId: 'proj-1', members: [], status: 'idle', createdAt: Date.now() },
      { id: 'team-b', name: 'Team Beta', projectId: 'proj-2', members: [], status: 'running', createdAt: Date.now() },
      { id: 'team-c', name: 'Team Gamma', projectId: 'proj-1', members: [], status: 'paused', createdAt: Date.now() }
    ]
    await mockIpcAndNavigate(page, { teams, templates: [] })

    const filterSelect = page.locator('.filter-select')

    // 下拉列出所有项目（含默认空选项）
    const options = filterSelect.locator('option')
    await expect(options).toHaveCount(3) // 空选项 + 2 个项目
    await expect(options.nth(1)).toHaveText('Test Project')
    await expect(options.nth(2)).toHaveText('Second Project')

    // 默认显示全部团队
    await expect(page.locator('.team-card')).toHaveCount(3)

    // 选择 proj-1 后只显示该项目的团队
    await filterSelect.selectOption('proj-1')
    await expect(page.locator('.team-card')).toHaveCount(2)
    await expect(page.locator('.team-card-name').nth(0)).toHaveText('Team Alpha')
    await expect(page.locator('.team-card-name').nth(1)).toHaveText('Team Gamma')

    // 选择 proj-2 后只显示该项目的团队
    await filterSelect.selectOption('proj-2')
    await expect(page.locator('.team-card')).toHaveCount(1)
    await expect(page.locator('.team-card-name')).toHaveText('Team Beta')

    // 重置为空选项恢复全部
    await filterSelect.selectOption('')
    await expect(page.locator('.team-card')).toHaveCount(3)
  })
})

// ==================== 创建团队对话框 ====================

test.describe('Orchestration - 创建团队对话框', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('点击 "创建团队" 打开对话框，包含团队名 + 项目选择', async ({ page }) => {
    await mockIpcAndNavigate(page)

    // 点击创建团队按钮
    await page.locator('.page-toolbar .btn-primary').click()

    // 对话框可见
    const dialog = page.locator('.dialog')
    await expect(dialog).toBeVisible()

    // 包含团队名输入
    const nameInput = dialog.locator('input.dialog-input')
    await expect(nameInput).toBeVisible()

    // 包含项目选择下拉
    const projectSelect = dialog.locator('select.dialog-input')
    await expect(projectSelect).toBeVisible()
  })

  test('名称或项目为空时确认按钮 disabled', async ({ page }) => {
    await mockIpcAndNavigate(page)
    await page.locator('.page-toolbar .btn-primary').click()

    const dialog = page.locator('.dialog')
    const confirmBtn = dialog.locator('.btn-primary')
    const nameInput = dialog.locator('input.dialog-input')
    const projectSelect = dialog.locator('select.dialog-input')

    // 初始状态：两者为空，按钮 disabled
    await expect(confirmBtn).toBeDisabled()

    // 只填名称，按钮仍 disabled
    await nameInput.fill('My Team')
    await expect(confirmBtn).toBeDisabled()

    // 清空名称，只选项目，按钮仍 disabled
    await nameInput.fill('')
    await projectSelect.selectOption('proj-1')
    await expect(confirmBtn).toBeDisabled()

    // 两者都填，按钮 enabled
    await nameInput.fill('My Team')
    await expect(confirmBtn).toBeEnabled()
  })

  test('提交成功后关闭对话框 + Toast + 列表刷新', async ({ page }) => {
    await mockIpcAndNavigate(page, { teams: [] })
    await page.locator('.page-toolbar .btn-primary').click()

    const dialog = page.locator('.dialog')
    await dialog.locator('input.dialog-input').fill('New Team')
    await dialog.locator('select.dialog-input').selectOption('proj-1')
    await dialog.locator('.btn-primary').click()

    // 对话框关闭
    await expect(dialog).toBeHidden()

    // Toast 显示
    await expect(page.locator('.toast, .toast-message, [class*="toast"]')).toBeVisible()

    // 列表中出现新团队
    await expect(page.locator('.team-card')).toHaveCount(1)
  })

  test('点击取消或遮罩关闭对话框', async ({ page }) => {
    await mockIpcAndNavigate(page)

    // 打开对话框，点击取消关闭
    await page.locator('.page-toolbar .btn-primary').click()
    await expect(page.locator('.dialog')).toBeVisible()
    await page.locator('.dialog-actions .btn:not(.btn-primary)').click()
    await expect(page.locator('.dialog')).toBeHidden()

    // 再次打开，点击遮罩关闭
    await page.locator('.page-toolbar .btn-primary').click()
    await expect(page.locator('.dialog')).toBeVisible()
    await page.locator('.dialog-overlay').click({ position: { x: 5, y: 5 } })
    await expect(page.locator('.dialog')).toBeHidden()
  })
})

// ==================== 模板快速启动 ====================

test.describe('Orchestration - 模板快速启动', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('有模板时显示模板卡片区域', async ({ page }) => {
    await mockIpcAndNavigate(page, { templates: MOCK_TEMPLATES })
    await expect(page.locator('.template-section')).toBeVisible()
    await expect(page.locator('.template-section h4')).toBeVisible()
  })

  test('模板卡片显示名称、描述、成员角色徽章', async ({ page }) => {
    await mockIpcAndNavigate(page, { templates: MOCK_TEMPLATES })
    const card = page.locator('.template-card').first()
    await expect(card.locator('.tpl-name')).toHaveText('Code Review')
    await expect(card.locator('.tpl-desc')).toHaveText('Review code with AI pair')
    const badges = card.locator('.type-badge')
    await expect(badges).toHaveCount(2)
    await expect(badges.nth(0)).toHaveText('reviewer')
    await expect(badges.nth(1)).toHaveText('author')
  })

  test('点击模板卡片应用模板创建团队', async ({ page }) => {
    await mockIpcAndNavigate(page, { teams: [], templates: MOCK_TEMPLATES })
    await page.locator('.template-card').first().click()
    await expect(page.locator('.team-card')).toHaveCount(1)
    await expect(page.locator('.toast, .toast-message, [class*="toast"]')).toBeVisible()
  })

  test('工具栏模板下拉菜单列出所有模板', async ({ page }) => {
    await mockIpcAndNavigate(page, { templates: MOCK_TEMPLATES })
    await page.locator('.dropdown .btn').click()
    const items = page.locator('.dropdown-menu .dropdown-item')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toHaveText('Code Review')
  })
})

// ==================== 团队列表（无活跃团队时） ====================

test.describe('Orchestration - 团队列表', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  test('无团队时显示空状态', async ({ page }) => {
    await mockIpcAndNavigate(page, { teams: [], templates: [] })
    await expect(page.locator('.empty-list')).toBeVisible()
    await expect(page.locator('.team-card')).toHaveCount(0)
  })

  test('团队卡片显示名称、状态标签、成员数、项目名', async ({ page }) => {
    const teams = [
      { id: 'team-1', name: 'Alpha Team', projectId: 'proj-1', members: [{ sessionId: 's1', role: 'dev', cliType: 'claude' }], status: 'running', createdAt: Date.now() }
    ]
    await mockIpcAndNavigate(page, { teams, templates: [] })

    const card = page.locator('.team-card').first()
    await expect(card.locator('.team-card-name')).toHaveText('Alpha Team')
    await expect(card.locator('.status-tag')).toBeVisible()
    await expect(card.locator('.status-tag')).toHaveClass(/running/)
    const meta = card.locator('.team-card-meta')
    await expect(meta).toContainText('1')
    await expect(meta).toContainText('Test Project')
  })

  test('点击团队卡片进入团队工作区', async ({ page }) => {
    const teams = [
      { id: 'team-1', name: 'Alpha Team', projectId: 'proj-1', members: [{ sessionId: 's1', role: 'dev', cliType: 'claude' }], status: 'idle', createdAt: Date.now() }
    ]
    await mockIpcAndNavigate(page, { teams, templates: [] })

    await page.locator('.team-card').first().click()
    await expect(page.locator('.team-workspace')).toBeVisible()
    await expect(page.locator('.team-header h3')).toHaveText('Alpha Team')
  })
})

// ==================== 团队工作区（有活跃团队时） ====================

test.describe('Orchestration - 团队工作区', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  const WORKSPACE_TEAM = [
    { id: 'team-1', name: 'Alpha Team', projectId: 'proj-1', members: [{ sessionId: 's1', role: 'dev', cliType: 'claude' }], status: 'idle', createdAt: Date.now() }
  ]

  async function enterWorkspace(page: import('@playwright/test').Page, teams?: any[]) {
    await mockIpcAndNavigate(page, { teams: teams ?? JSON.parse(JSON.stringify(WORKSPACE_TEAM)), templates: [] })
    await page.locator('.team-card').first().click()
    await expect(page.locator('.team-workspace')).toBeVisible()
  }

  test('返回按钮（←）回到团队列表', async ({ page }) => {
    await enterWorkspace(page)

    // 返回按钮可见
    const backBtn = page.locator('.btn-link')
    await expect(backBtn).toBeVisible()
    await expect(backBtn).toContainText('←')

    // 点击返回
    await backBtn.click()

    // 工作区隐藏，团队列表可见
    await expect(page.locator('.team-workspace')).toBeHidden()
    await expect(page.locator('.team-card')).toHaveCount(1)
  })

  test('团队头部显示名称 + 状态标签', async ({ page }) => {
    await enterWorkspace(page)

    await expect(page.locator('.team-header h3')).toHaveText('Alpha Team')
    const statusTag = page.locator('.team-header .status-tag')
    await expect(statusTag).toBeVisible()
    await expect(statusTag).toHaveClass(/idle/)
  })

  test('idle/paused 状态显示 "启动" 按钮', async ({ page }) => {
    // idle 状态
    await enterWorkspace(page)
    const controls = page.locator('.team-controls')
    const startBtn = controls.locator('.btn-primary')
    await expect(startBtn).toBeVisible()
    await expect(startBtn).toContainText('启动')

    // 点击启动后状态变为 running，启动按钮消失
    await startBtn.click()
    await expect(controls.locator('.btn-primary')).toBeHidden()

    // 暂停回到 paused
    await controls.locator('.btn-sm:not(.btn-primary):not(.btn-danger)').click()
    // paused 状态下启动按钮重新出现
    await expect(controls.locator('.btn-primary')).toBeVisible()
    await expect(controls.locator('.btn-primary')).toContainText('启动')
  })

  test('running 状态显示 "暂停" 按钮', async ({ page }) => {
    const teams = [{ id: 'team-1', name: 'Alpha Team', projectId: 'proj-1', members: [{ sessionId: 's1', role: 'dev', cliType: 'claude' }], status: 'running', createdAt: Date.now() }]
    await enterWorkspace(page, teams)

    const controls = page.locator('.team-controls')
    // running 状态下不应有启动按钮（btn-primary 在 controls 中只有启动按钮）
    const pauseBtn = controls.locator('.btn-sm:not(.btn-primary):not(.btn-danger)')
    await expect(pauseBtn).toBeVisible()
    await expect(pauseBtn).toContainText('暂停')
  })

  test('"解散" 按钮弹出 confirm 确认', async ({ page }) => {
    await enterWorkspace(page)

    const dissolveBtn = page.locator('.team-controls .btn-danger')
    await expect(dissolveBtn).toBeVisible()
    await expect(dissolveBtn).toContainText('解散')

    // 拦截 confirm 对话框并接受
    page.on('dialog', dialog => dialog.accept())
    await dissolveBtn.click()

    // 解散后回到列表，团队消失
    await expect(page.locator('.team-workspace')).toBeHidden()
    await expect(page.locator('.team-card')).toHaveCount(0)
    // Toast 显示
    await expect(page.locator('.toast, .toast-message, [class*="toast"]')).toBeVisible()
  })
})

// ==================== 成员面板 ====================

test.describe('Orchestration - 成员面板', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  const MEMBERS_TEAM = [
    {
      id: 'team-1', name: 'Alpha Team', projectId: 'proj-1', status: 'idle', createdAt: Date.now(),
      members: [
        { sessionId: 's1', role: 'reviewer', cliType: 'claude', description: 'Reviews code', canSendTo: ['author'] },
        { sessionId: 's2', role: 'author', cliType: 'codex', description: 'Writes code', canSendTo: ['reviewer'] },
        { sessionId: 's3', role: 'tester', cliType: 'claude', description: 'Runs tests', canSendTo: ['reviewer', 'author'] }
      ]
    }
  ]

  async function enterMembersWorkspace(page: import('@playwright/test').Page) {
    await mockIpcAndNavigate(page, { teams: JSON.parse(JSON.stringify(MEMBERS_TEAM)), templates: [] })
    await page.locator('.team-card').first().click()
    await expect(page.locator('.team-workspace')).toBeVisible()
  }

  test('显示成员数量标题', async ({ page }) => {
    await enterMembersWorkspace(page)
    const section = page.locator('.members-section')
    await expect(section).toBeVisible()
    const heading = section.locator('h4')
    await expect(heading).toBeVisible()
    await expect(heading).toContainText('3')
  })

  test('TeamMemberCard 横向排列，可横向滚动', async ({ page }) => {
    await enterMembersWorkspace(page)
    const row = page.locator('.members-row')
    await expect(row).toBeVisible()

    // 验证成员卡片数量
    const cards = row.locator('.team-member-card')
    await expect(cards).toHaveCount(3)

    // 验证横向排列（flex布局）
    const display = await row.evaluate(el => getComputedStyle(el).display)
    expect(display).toBe('flex')

    // 验证可横向滚动
    const overflowX = await row.evaluate(el => getComputedStyle(el).overflowX)
    expect(overflowX).toBe('auto')

    // 验证卡片角色内容
    await expect(cards.nth(0).locator('.member-role')).toHaveText('reviewer')
    await expect(cards.nth(1).locator('.member-role')).toHaveText('author')
    await expect(cards.nth(2).locator('.member-role')).toHaveText('tester')
  })

  test('成员卡片支持：发送消息、执行 Skill、查看 Session、移除、清除输出', async ({ page }) => {
    await enterMembersWorkspace(page)
    const card = page.locator('.team-member-card').first()

    // 展开卡片
    await card.locator('.card-header').click()
    await expect(card).toHaveClass(/expanded/)

    // 验证操作按钮可见
    const actions = card.locator('.card-actions')
    await expect(actions).toBeVisible()
    const btns = actions.locator('.action-btn')
    await expect(btns).toHaveCount(4) // 💬 🧩 📋 ✕

    // 发送消息按钮（💬）
    await expect(btns.nth(0)).toBeVisible()
    // 执行 Skill 按钮（🧩）
    await expect(btns.nth(1)).toBeVisible()
    // 查看 Session 按钮（📋）
    await expect(btns.nth(2)).toBeVisible()
    // 移除按钮（✕）
    const removeBtn = btns.nth(3)
    await expect(removeBtn).toBeVisible()
    await expect(removeBtn).toHaveClass(/danger/)

    // 点击移除按钮触发移除操作
    await removeBtn.click()
    await expect(page.locator('.toast, .toast-message, [class*="toast"]')).toBeVisible()

    // 成员数减少
    await expect(page.locator('.team-member-card')).toHaveCount(2)
  })
})

// ==================== 消息流 ====================

test.describe('Orchestration - 消息流', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  const MSG_MEMBERS = [
    { sessionId: 's1', role: 'reviewer', cliType: 'claude', description: 'Reviews code', canSendTo: ['s2'] },
    { sessionId: 's2', role: 'author', cliType: 'codex', description: 'Writes code', canSendTo: ['s1'] }
  ]

  const MSG_TEAM_A = {
    id: 'team-a', name: 'Team Alpha', projectId: 'proj-1', status: 'running', createdAt: Date.now(),
    members: MSG_MEMBERS
  }

  const MSG_TEAM_B = {
    id: 'team-b', name: 'Team Beta', projectId: 'proj-1', status: 'idle', createdAt: Date.now(),
    members: [
      { sessionId: 's3', role: 'lead', cliType: 'claude', description: 'Leads', canSendTo: ['s4'] },
      { sessionId: 's4', role: 'dev', cliType: 'codex', description: 'Develops', canSendTo: ['s3'] }
    ]
  }

  const MESSAGES_A = [
    { id: 'msg-1', fromSessionId: 's1', toSessionId: 's2', type: 'notification', content: 'Hello from reviewer', timestamp: 1700000001000 },
    { id: 'msg-2', fromSessionId: 's2', toSessionId: 's1', type: 'command', content: 'Run tests please', timestamp: 1700000002000 }
  ]

  const MESSAGES_B = [
    { id: 'msg-3', fromSessionId: 's3', toSessionId: 's4', type: 'result', content: 'Build passed', timestamp: 1700000003000 }
  ]

  async function mockWithMessages(page: import('@playwright/test').Page, teams: any[], messagesMap: Record<string, any[]>) {
    const templates: any[] = []
    const projects = MOCK_PROJECTS
    const skills: any[] = []

    await page.evaluate(({ teams, templates, projects, skills, messagesMap }) => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'team:list') return teams
        if (channel === 'template:list') return templates
        if (channel === 'project:list' || channel === 'project:listAll') return projects
        if (channel === 'skill:list') return skills
        if (channel === 'team:messages') return messagesMap[args[0]] || []
        if (channel === 'team:start') { const t = teams.find((t: any) => t.id === args[0]); if (t) t.status = 'running'; return true }
        if (channel === 'team:pause') { const t = teams.find((t: any) => t.id === args[0]); if (t) t.status = 'paused'; return true }
        if (channel === 'team:dissolve') { const idx = teams.findIndex((t: any) => t.id === args[0]); if (idx >= 0) teams.splice(idx, 1); return true }
        if (channel === 'team:removeMember') { const t = teams.find((t: any) => t.id === args[0]); if (t) t.members = t.members.filter((m: any) => m.sessionId !== args[1]); return true }
        if (channel === 'session:output:clear') return null
        return undefined
      }
    }, { teams, templates, projects, skills, messagesMap })

    await page.evaluate(() => { window.location.hash = '#/orchestration' })
    await page.waitForURL(/#\/orchestration/)
  }

  test('MessageTimeline 展示团队消息历史', async ({ page }) => {
    await mockWithMessages(page, [JSON.parse(JSON.stringify(MSG_TEAM_A))], { 'team-a': MESSAGES_A })

    // 进入团队工作区
    await page.locator('.team-card').first().click()
    await expect(page.locator('.team-workspace')).toBeVisible()

    // 消息区域可见
    const timeline = page.locator('.message-timeline')
    await expect(timeline).toBeVisible()

    // 显示 2 条消息
    const items = timeline.locator('.message-item')
    await expect(items).toHaveCount(2)

    // 第一条消息：notification 类型，reviewer → author
    await expect(items.nth(0)).toHaveClass(/msg-notification/)
    await expect(items.nth(0).locator('.msg-from')).toHaveText('reviewer')
    await expect(items.nth(0).locator('.msg-to')).toHaveText('author')
    await expect(items.nth(0).locator('.msg-content')).toContainText('Hello from reviewer')

    // 第二条消息：command 类型，author → reviewer
    await expect(items.nth(1)).toHaveClass(/msg-command/)
    await expect(items.nth(1).locator('.msg-from')).toHaveText('author')
    await expect(items.nth(1).locator('.msg-to')).toHaveText('reviewer')
    await expect(items.nth(1).locator('.msg-content')).toContainText('Run tests please')
  })

  test('切换活跃团队时拉取对应消息', async ({ page }) => {
    const teams = [JSON.parse(JSON.stringify(MSG_TEAM_A)), JSON.parse(JSON.stringify(MSG_TEAM_B))]
    await mockWithMessages(page, teams, { 'team-a': MESSAGES_A, 'team-b': MESSAGES_B })

    // 进入 Team Alpha
    await page.locator('.team-card').nth(0).click()
    await expect(page.locator('.team-workspace')).toBeVisible()
    await expect(page.locator('.message-timeline .message-item')).toHaveCount(2)

    // 返回列表
    await page.locator('.btn-link').click()
    await expect(page.locator('.team-workspace')).toBeHidden()

    // 进入 Team Beta
    await page.locator('.team-card').nth(1).click()
    await expect(page.locator('.team-workspace')).toBeVisible()

    // 应显示 Team Beta 的 1 条消息
    const items = page.locator('.message-timeline .message-item')
    await expect(items).toHaveCount(1)
    await expect(items.nth(0)).toHaveClass(/msg-result/)
    await expect(items.nth(0).locator('.msg-from')).toHaveText('lead')
    await expect(items.nth(0).locator('.msg-content')).toContainText('Build passed')
  })
})

// ==================== Skill 执行面板 ====================

test.describe('Orchestration - Skill 执行面板', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  const SKILL_MEMBERS = [
    { sessionId: 's1', role: 'reviewer', cliType: 'claude', description: 'Reviews code', canSendTo: ['s2'] },
    { sessionId: 's2', role: 'author', cliType: 'codex', description: 'Writes code', canSendTo: ['s1'] }
  ]

  const SKILL_TEAM = [
    { id: 'team-1', name: 'Alpha Team', projectId: 'proj-1', status: 'running', createdAt: Date.now(), members: SKILL_MEMBERS }
  ]

  const SKILL_LIST: any[] = [
    {
      id: 'sk-1', name: 'Code Review', slug: 'code-review', description: 'Review code',
      compatibleCli: ['claude'], isBuiltin: true, category: 'review',
      inputSchema: { fields: [
        { name: 'filePath', type: 'text', required: true, description: 'File to review' },
        { name: 'depth', type: 'text', required: false, description: 'Review depth', default: 'normal' }
      ] },
      outputSchema: { format: 'markdown' }, prompt: 'Review {{filePath}}'
    },
    {
      id: 'sk-2', name: 'Generate Tests', slug: 'gen-tests', description: 'Generate tests',
      compatibleCli: ['codex'], isBuiltin: false, category: 'testing',
      inputSchema: { fields: [
        { name: 'target', type: 'text', required: true, description: 'Target module' }
      ] },
      outputSchema: { format: 'text' }, prompt: 'Test {{target}}'
    },
    {
      id: 'sk-3', name: 'Incompatible Skill', slug: 'incompat', description: 'Not for this team',
      compatibleCli: ['aider' as any], isBuiltin: false, category: 'other',
      inputSchema: { fields: [] },
      outputSchema: { format: 'text' }, prompt: 'noop'
    }
  ]

  async function enterSkillWorkspace(page: import('@playwright/test').Page) {
    await page.evaluate(({ teams, templates, projects, skills }) => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'team:list') return teams
        if (channel === 'template:list') return templates
        if (channel === 'project:list' || channel === 'project:listAll') return projects
        if (channel === 'skill:list') return skills
        if (channel === 'team:messages') return []
        if (channel === 'skill:preview') return 'Preview: ' + JSON.stringify(args[1])
        if (channel === 'skill:execute') return { success: true, prompt: 'done' }
        if (channel === 'team:sendMessage') return { id: 'msg-new', fromSessionId: args[0], toSessionId: args[1], type: args[2], content: args[3], timestamp: Date.now() }
        if (channel === 'team:start') { const t = teams.find((t: any) => t.id === args[0]); if (t) t.status = 'running'; return true }
        if (channel === 'team:pause') { const t = teams.find((t: any) => t.id === args[0]); if (t) t.status = 'paused'; return true }
        if (channel === 'team:dissolve') { const idx = teams.findIndex((t: any) => t.id === args[0]); if (idx >= 0) teams.splice(idx, 1); return true }
        if (channel === 'team:removeMember') { const t = teams.find((t: any) => t.id === args[0]); if (t) t.members = t.members.filter((m: any) => m.sessionId !== args[1]); return true }
        if (channel === 'session:output:clear') return null
        return undefined
      }
    }, {
      teams: JSON.parse(JSON.stringify(SKILL_TEAM)),
      templates: [] as any[],
      projects: MOCK_PROJECTS,
      skills: JSON.parse(JSON.stringify(SKILL_LIST))
    })

    await page.evaluate(() => { window.location.hash = '#/orchestration' })
    await page.waitForURL(/#\/orchestration/)
    await page.locator('.team-card').first().click()
    await expect(page.locator('.team-workspace')).toBeVisible()
  }

  test('点击 Skill 按钮打开 Skill 面板对话框', async ({ page }) => {
    await enterSkillWorkspace(page)

    // 点击发送栏的 Skill 按钮
    await page.locator('.send-bar .btn-sm:not(.btn-primary)').click()

    // Skill 面板对话框可见
    const dialog = page.locator('.dialog-overlay .dialog').last()
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('h3')).toBeVisible()

    // 包含 Skill 选择下拉
    await expect(dialog.locator('select.dialog-input').first()).toBeVisible()

    // 包含取消和执行按钮
    await expect(dialog.locator('.dialog-actions .btn')).toHaveCount(2)
  })

  test('下拉列出兼容当前团队成员 CLI 类型的 Skill', async ({ page }) => {
    await enterSkillWorkspace(page)
    await page.locator('.send-bar .btn-sm:not(.btn-primary)').click()

    const dialog = page.locator('.dialog-overlay .dialog').last()
    const skillSelect = dialog.locator('select.dialog-input').first()
    const options = skillSelect.locator('option')

    // 团队有 claude + codex 成员，sk-1(claude) 和 sk-2(codex) 兼容，sk-3(aider) 不兼容
    // 选项：默认空 + 2 个兼容 skill = 3
    await expect(options).toHaveCount(3)
    await expect(options.nth(1)).toContainText('Code Review')
    await expect(options.nth(2)).toContainText('Generate Tests')
  })

  test('选择 Skill 后显示目标成员下拉 + 输入字段', async ({ page }) => {
    await enterSkillWorkspace(page)
    await page.locator('.send-bar .btn-sm:not(.btn-primary)').click()

    const dialog = page.locator('.dialog-overlay .dialog').last()
    const skillSelect = dialog.locator('select.dialog-input').first()

    // 选择 Code Review（compatibleCli: claude）
    await skillSelect.selectOption('sk-1')

    // 目标成员下拉出现（第二个 select）
    const targetSelect = dialog.locator('select.dialog-input').nth(1)
    await expect(targetSelect).toBeVisible()

    // 只列出 claude 成员：reviewer (s1)
    const targetOptions = targetSelect.locator('option')
    await expect(targetOptions).toHaveCount(2) // 空选项 + reviewer
    await expect(targetOptions.nth(1)).toHaveText('reviewer')

    // 选择目标成员后显示输入字段
    await targetSelect.selectOption('s1')
    const fields = dialog.locator('.skill-field')
    await expect(fields).toHaveCount(2) // filePath + depth
    await expect(fields.nth(0).locator('label')).toContainText('filePath')
    await expect(fields.nth(1).locator('label')).toContainText('depth')

    // 必填字段有 * 标记
    await expect(fields.nth(0).locator('.field-hint')).toHaveText('*')
    await expect(fields.nth(1).locator('.field-hint')).toHaveText('')
  })

  test('必填字段未填时执行按钮 disabled', async ({ page }) => {
    await enterSkillWorkspace(page)

    // 先设置 sendFrom（canExecuteSkill 需要 sendFrom）
    await page.locator('.send-bar .send-select').nth(0).selectOption('s1')

    await page.locator('.send-bar .btn-sm:not(.btn-primary)').click()
    const dialog = page.locator('.dialog-overlay .dialog').last()
    const execBtn = dialog.locator('.dialog-actions .btn-primary')

    // 初始：无 skill 选中 → disabled
    await expect(execBtn).toBeDisabled()

    // 选择 skill
    await dialog.locator('select.dialog-input').first().selectOption('sk-1')
    await expect(execBtn).toBeDisabled()

    // 选择目标成员
    await dialog.locator('select.dialog-input').nth(1).selectOption('s1')
    // filePath 必填但为空 → disabled
    await expect(execBtn).toBeDisabled()

    // 填写必填字段 filePath
    await dialog.locator('.skill-field').nth(0).locator('input').fill('src/main.ts')
    await expect(execBtn).toBeEnabled()

    // 清空必填字段 → disabled
    await dialog.locator('.skill-field').nth(0).locator('input').fill('')
    await expect(execBtn).toBeDisabled()
  })

  test('执行成功后关闭面板 + Toast', async ({ page }) => {
    await enterSkillWorkspace(page)

    // 设置 sendFrom
    await page.locator('.send-bar .send-select').nth(0).selectOption('s1')

    await page.locator('.send-bar .btn-sm:not(.btn-primary)').click()
    const dialog = page.locator('.dialog-overlay .dialog').last()

    // 选择 skill + 目标 + 填写必填字段
    await dialog.locator('select.dialog-input').first().selectOption('sk-1')
    await dialog.locator('select.dialog-input').nth(1).selectOption('s1')
    await dialog.locator('.skill-field').nth(0).locator('input').fill('src/app.ts')

    // 点击执行
    await dialog.locator('.dialog-actions .btn-primary').click()

    // 面板关闭
    await expect(dialog).toBeHidden()

    // Toast 显示
    await expect(page.locator('.toast, .toast-message, [class*="toast"]')).toBeVisible()
  })
})

// ==================== 发送栏 ====================

test.describe('Orchestration - 发送栏', () => {
  test.afterEach(async ({ page }) => { await restoreIpc(page) })

  const SEND_TEAM = [
    {
      id: 'team-1', name: 'Alpha Team', projectId: 'proj-1', status: 'running', createdAt: Date.now(),
      members: [
        { sessionId: 's1', role: 'reviewer', cliType: 'claude', description: 'Reviews code', canSendTo: ['s2'] },
        { sessionId: 's2', role: 'author', cliType: 'codex', description: 'Writes code', canSendTo: ['s1'] }
      ]
    }
  ]

  async function enterSendWorkspace(page: import('@playwright/test').Page) {
    await mockIpcAndNavigate(page, { teams: JSON.parse(JSON.stringify(SEND_TEAM)), templates: [] })
    await page.locator('.team-card').first().click()
    await expect(page.locator('.team-workspace')).toBeVisible()
  }

  test('包含 from/to/type 下拉 + 内容输入 + 发送按钮 + Skill 按钮', async ({ page }) => {
    await enterSendWorkspace(page)
    const bar = page.locator('.send-bar')
    await expect(bar).toBeVisible()

    // 3 个 select（from / to / type）
    const selects = bar.locator('.send-select')
    await expect(selects).toHaveCount(3)

    // 内容输入
    await expect(bar.locator('.send-input')).toBeVisible()

    // 发送按钮
    await expect(bar.locator('.btn-primary')).toBeVisible()

    // Skill 按钮
    const skillBtn = bar.locator('.btn-sm:not(.btn-primary)')
    await expect(skillBtn).toBeVisible()
    await expect(skillBtn).toContainText('🧩')
  })

  test('from/to/content 任一为空时发送按钮 disabled', async ({ page }) => {
    await enterSendWorkspace(page)
    const bar = page.locator('.send-bar')
    const sendBtn = bar.locator('.btn-primary')
    const selects = bar.locator('.send-select')
    const input = bar.locator('.send-input')

    // 初始全空 → disabled
    await expect(sendBtn).toBeDisabled()

    // 只填 from → disabled
    await selects.nth(0).selectOption('s1')
    await expect(sendBtn).toBeDisabled()

    // 填 from + to，content 空 → disabled
    await selects.nth(1).selectOption('s2')
    await expect(sendBtn).toBeDisabled()

    // 三者都填 → enabled
    await input.fill('Hello')
    await expect(sendBtn).toBeEnabled()

    // 清空 content → disabled
    await input.fill('')
    await expect(sendBtn).toBeDisabled()
  })

  test('发送成功后清空内容 + Toast', async ({ page }) => {
    await enterSendWorkspace(page)
    const bar = page.locator('.send-bar')
    const selects = bar.locator('.send-select')
    const input = bar.locator('.send-input')

    await selects.nth(0).selectOption('s1')
    await selects.nth(1).selectOption('s2')
    await input.fill('Test message')
    await bar.locator('.btn-primary').click()

    // 内容已清空
    await expect(input).toHaveValue('')

    // Toast 显示
    await expect(page.locator('.toast, .toast-message, [class*="toast"]')).toBeVisible()
  })

  test('回车键触发发送', async ({ page }) => {
    await enterSendWorkspace(page)
    const bar = page.locator('.send-bar')
    const selects = bar.locator('.send-select')
    const input = bar.locator('.send-input')

    await selects.nth(0).selectOption('s1')
    await selects.nth(1).selectOption('s2')
    await input.fill('Enter message')
    await input.press('Enter')

    // 内容已清空（说明发送成功）
    await expect(input).toHaveValue('')

    // Toast 显示
    await expect(page.locator('.toast, .toast-message, [class*="toast"]')).toBeVisible()
  })
})
