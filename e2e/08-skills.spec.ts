import { test, expect } from './fixtures'

function mkSkill(id: string, name: string, slug: string, category: string, isBuiltin: boolean, compatibleCli: string[] = ['claude', 'codex']) {
  return {
    id, name, slug, description: `${name} 描述`,
    compatibleCli, isBuiltin, category,
    inputSchema: {
      fields: [
        { name: 'filePath', type: 'text', required: true, description: '文件路径' },
        { name: 'context', type: 'text', required: false, description: '上下文' }
      ]
    },
    outputSchema: { format: 'markdown' },
    prompt: '请处理 {{filePath}}。{{context}}'
  }
}

const BUILTIN_SKILLS = [
  mkSkill('b1', '代码审查', 'code-review', '审查', true),
  mkSkill('b2', '单元测试生成', 'generate-tests', '测试', true),
  mkSkill('b3', '代码解释', 'explain-code', '开发', true),
  mkSkill('b4', 'Bug 修复', 'fix-bug', '开发', true),
  mkSkill('b5', '架构分析', 'architecture-analysis', '分析', true, ['claude']),
  mkSkill('b6', '代码重构', 'refactor', '开发', true)
]

async function navigateToSkills(page: import('@playwright/test').Page) {
  await page.locator('.nav-menu > .nav-item').nth(5).click()
  await page.waitForURL(/#\/skills/)
}

async function injectSkills(page: import('@playwright/test').Page, data: any[]) {
  await page.evaluate((json) => {
    ;(window as any).__e2e_inject__('skills', 'skills', json)
  }, JSON.stringify(data))
}

async function injectSessions(page: import('@playwright/test').Page, data: any[]) {
  await page.evaluate((json) => {
    ;(window as any).__e2e_inject__('sessions', 'sessions', json)
  }, JSON.stringify(data))
}

function mkSession(id: string, name: string, type: 'claude' | 'codex', status: string) {
  return { id, name, type, status, projectPath: '/a', createdAt: Date.now() }
}

// ==================== 左侧列表 ====================

test.describe('Skill - 左侧列表', () => {
  test('按分类分组展示 Skill（开发/审查/测试/分析）', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    const headers = page.locator('.category-header')
    const texts = await headers.allTextContents()
    expect(texts.join(',')).toContain('开发')
    expect(texts.join(',')).toContain('审查')
    expect(texts.join(',')).toContain('测试')
    expect(texts.join(',')).toContain('分析')
  })

  test('分类标题可点击折叠/展开', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    const header = page.locator('.category-header').first()
    // 获取该分类下的 skill 数量
    const group = page.locator('.category-group').first()
    await expect(group.locator('.skill-item').first()).toBeVisible()
    // 点击折叠
    await header.click()
    await expect(group.locator('.skill-item')).toHaveCount(0)
    // 再次点击展开
    await header.click()
    await expect(group.locator('.skill-item').first()).toBeVisible()
  })

  test('每个 Skill 项显示：名称、内置/自定义标签、CLI 兼容徽章、描述', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    const item = page.locator('.skill-item').first()
    await expect(item.locator('.skill-item-name')).toBeVisible()
    await expect(item.locator('.skill-tag')).toBeVisible()
    await expect(item.locator('.cli-badge').first()).toBeVisible()
    await expect(item.locator('.skill-item-desc')).toBeVisible()
  })

  test('点击 Skill 项右侧显示详情，当前项高亮', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    const item = page.locator('.skill-item').first()
    await item.click()
    await expect(item).toHaveClass(/active/)
    await expect(page.locator('.skill-detail .detail-header h3')).toBeVisible()
  })

  test('无 Skill 时显示空状态', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, [])
    await expect(page.locator('.empty-list')).toBeVisible()
  })
})

// ==================== 右侧详情 ====================

test.describe('Skill - 右侧详情', () => {
  test('显示 Skill 完整信息：name/slug/description/compatibleCli/category', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.locator('.skill-item').first().click()
    const detail = page.locator('.skill-detail')
    await expect(detail.locator('.detail-header h3')).toBeVisible()
    const sections = detail.locator('.detail-section')
    // slug, description, compatibleCli, category, input, prompt, output = 7 sections
    await expect(sections).toHaveCount(7)
  })

  test('输入字段表格：字段名、类型、必填/可选、描述', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.locator('.skill-item').first().click()
    const row = page.locator('.field-row').first()
    await expect(row.locator('.field-name')).toBeVisible()
    await expect(row.locator('.field-type')).toBeVisible()
    await expect(row.locator('.field-badge')).toBeVisible()
    await expect(row.locator('.field-desc-text')).toBeVisible()
  })

  test('Prompt 模板以 pre 块展示', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.locator('.skill-item').first().click()
    await expect(page.locator('.prompt-block')).toBeVisible()
  })

  test('输出格式显示', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.locator('.skill-item').first().click()
    // 最后一个 detail-section 是 output
    const sections = page.locator('.skill-detail .detail-section')
    const lastSection = sections.last()
    await expect(lastSection).toContainText('markdown')
  })
})

// ==================== 创建 Skill ====================

test.describe('Skill - 创建', () => {
  test('点击 "创建" 按钮打开 SkillEditorDialog', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    await expect(page.locator('.dialog-overlay .editor-dialog')).toBeVisible()
  })

  test('表单字段：name/slug/description/category/compatibleCli/fields/prompt/outputFormat', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    // name + slug + description inputs
    await expect(dialog.locator('.dialog-input').first()).toBeVisible()
    // category select
    await expect(dialog.locator('select').first()).toBeVisible()
    // compatibleCli checkboxes
    await expect(dialog.locator('.checkbox-row input[type="checkbox"]')).toHaveCount(2)
    // fields editor
    await expect(dialog.locator('.fields-editor')).toBeVisible()
    // prompt textarea
    await expect(dialog.locator('.prompt-textarea')).toBeVisible()
    // output format select
    await expect(dialog.locator('select').last()).toBeVisible()
  })

  test('输入 name 时自动生成 slug（小写+连字符）', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    const nameInput = dialog.locator('.dialog-input').first()
    const slugInput = dialog.locator('.dialog-input').nth(1)
    await nameInput.fill('My Test Skill')
    await nameInput.dispatchEvent('input')
    await expect(slugInput).toHaveValue('my-test-skill')
  })

  test('添加输入字段：name/type/required/description/default', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    await dialog.locator('.fields-editor .btn').click()
    const row = dialog.locator('.field-edit-row')
    await expect(row).toHaveCount(1)
    // name input, type select, required checkbox, description input, default input
    await expect(row.locator('.field-input')).toHaveCount(4)
    await expect(row.locator('.field-req input[type="checkbox"]')).toBeVisible()
  })

  test('Prompt 编辑器中 {{varName}} 高亮显示', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    // 添加一个字段
    await dialog.locator('.fields-editor .btn').click()
    await dialog.locator('.field-edit-row .field-input').first().fill('code')
    // 输入包含变量的 prompt
    await dialog.locator('.prompt-textarea').fill('请审查 {{code}}')
    await expect(dialog.locator('.prompt-highlight .hl-var')).toBeVisible()
  })

  test('右侧显示可用变量标签', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    await dialog.locator('.fields-editor .btn').click()
    await dialog.locator('.field-edit-row .field-input').first().fill('myVar')
    await expect(dialog.locator('.var-tag')).toHaveCount(1)
    await expect(dialog.locator('.var-tag')).toContainText('{{myVar}}')
  })

  test('name 为空时提交显示验证错误', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    // 不填 name 直接提交
    await dialog.locator('.dialog-actions .btn-primary').click()
    await expect(dialog.locator('.error-msg')).toBeVisible()
  })

  test('slug 重复时提交显示验证错误', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    await dialog.locator('.dialog-input').first().fill('Code Review')
    // 手动设置 slug 为已存在的
    await dialog.locator('.dialog-input').nth(1).fill('code-review')
    await dialog.locator('.dialog-actions .btn-primary').click()
    await expect(dialog.locator('.error-msg')).toBeVisible()
  })

  test('prompt 中引用不存在的变量时显示验证错误', async ({ page }) => {
    await navigateToSkills(page)
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    await dialog.locator('.dialog-input').first().fill('TestSkill')
    await dialog.locator('.prompt-textarea').fill('请处理 {{nonExistent}}')
    await dialog.locator('.dialog-actions .btn-primary').click()
    await expect(dialog.locator('.error-msg')).toBeVisible()
  })

  test('提交成功后关闭对话框 + Toast + 列表刷新', async ({ page }) => {
    await navigateToSkills(page)
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'skill:create') return {
          id: 'new-1', name: 'NewSkill', slug: 'new-skill', description: 'desc',
          compatibleCli: ['claude'], isBuiltin: false, category: '开发',
          inputSchema: { fields: [] }, outputSchema: { format: 'text' }, prompt: 'hello'
        }
        if (channel === 'skill:list') return []
        return undefined
      }
    })
    await page.locator('.page-toolbar .btn-primary').click()
    const dialog = page.locator('.editor-dialog')
    await dialog.locator('.dialog-input').first().fill('NewSkill')
    await dialog.locator('.dialog-actions .btn-primary').click()
    await expect(page.locator('.dialog-overlay')).toBeHidden()
    await expect(page.locator('.toast')).toBeVisible()
  })
})

// ==================== 编辑 Skill ====================

test.describe('Skill - 编辑', () => {
  const MIXED = [
    ...BUILTIN_SKILLS,
    mkSkill('c1', '自定义技能', 'custom-skill', '开发', false)
  ]

  test('自定义 Skill 详情页显示 "编辑" 按钮', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, MIXED)
    // 点击自定义 skill
    const customItem = page.locator('.skill-item').filter({ hasText: '自定义技能' })
    await customItem.click()
    await expect(page.locator('.detail-actions .btn:not(.btn-danger)')).toBeVisible()
  })

  test('内置 Skill 不显示编辑/删除按钮', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, MIXED)
    // 点击内置 skill
    const builtinItem = page.locator('.skill-item').filter({ hasText: '代码审查' })
    await builtinItem.click()
    await expect(page.locator('.detail-actions .btn')).toHaveCount(0)
  })

  test('编辑时表单预填现有数据', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, MIXED)
    const customItem = page.locator('.skill-item').filter({ hasText: '自定义技能' })
    await customItem.click()
    await page.locator('.detail-actions .btn:not(.btn-danger)').click()
    const dialog = page.locator('.editor-dialog')
    await expect(dialog.locator('.dialog-input').first()).toHaveValue('自定义技能')
    await expect(dialog.locator('.dialog-input').nth(1)).toHaveValue('custom-skill')
  })
})

// ==================== 删除 Skill ====================

test.describe('Skill - 删除', () => {
  const MIXED = [
    ...BUILTIN_SKILLS,
    mkSkill('c1', '自定义技能', 'custom-skill', '开发', false)
  ]

  test('点击删除弹出 confirm，确认后删除 + Toast', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, MIXED)
    await page.locator('.skill-item').filter({ hasText: '自定义技能' }).click()
    await page.evaluate(() => { (window as any).confirm = () => true })
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'skill:delete') return true
        return undefined
      }
    })
    await page.locator('.detail-actions .btn-danger').click()
    await expect(page.locator('.toast')).toBeVisible()
  })

  test('删除后 selectedSkill 清空', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, MIXED)
    await page.locator('.skill-item').filter({ hasText: '自定义技能' }).click()
    await expect(page.locator('.detail-header h3')).toHaveText('自定义技能')
    await page.evaluate(() => { (window as any).confirm = () => true })
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'skill:delete') return true
        return undefined
      }
    })
    await page.locator('.detail-actions .btn-danger').click()
    // 详情区域应显示空状态
    await expect(page.locator('.skill-detail.empty-detail')).toBeVisible()
  })
})

// ==================== 执行 Skill（SkillExecutePanel） ====================

test.describe('Skill - 执行', () => {
  test('详情页底部显示执行面板', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.locator('.skill-item').first().click()
    await expect(page.locator('.skill-execute-panel')).toBeVisible()
  })

  test('Session 下拉只列出兼容 CLI 类型且 running 的 Session', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, [mkSkill('b5', '架构分析', 'arch', '分析', true, ['claude'])])
    await injectSessions(page, [
      mkSession('s1', 'Claude-Run', 'claude', 'running'),
      mkSession('s2', 'Codex-Run', 'codex', 'running'),
      mkSession('s3', 'Claude-Idle', 'claude', 'idle')
    ])
    await page.locator('.skill-item').first().click()
    const options = page.locator('.skill-execute-panel select option')
    // -- placeholder + Claude-Run only (compatible=claude, status=running)
    await expect(options).toHaveCount(2)
  })

  test('根据 inputSchema 动态渲染输入控件（text/number/select/boolean）', async ({ page }) => {
    await navigateToSkills(page)
    const skill = {
      ...mkSkill('t1', 'TypeTest', 'type-test', '开发', true),
      inputSchema: {
        fields: [
          { name: 'txt', type: 'text', required: true, description: '文本' },
          { name: 'num', type: 'number', required: false, description: '数字' },
          { name: 'sel', type: 'select', required: false, description: '选择', options: ['a', 'b'] },
          { name: 'bool', type: 'boolean', required: false, description: '布尔' }
        ]
      }
    }
    await injectSkills(page, [skill])
    await page.locator('.skill-item').first().click()
    const panel = page.locator('.skill-execute-panel')
    await expect(panel.locator('input[type="number"]')).toHaveCount(1)
    await expect(panel.locator('input[type="checkbox"]')).toHaveCount(1)
    // select for session + select for field
    await expect(panel.locator('select')).toHaveCount(2)
  })

  test('必填字段未填时执行按钮 disabled', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.locator('.skill-item').first().click()
    const btn = page.locator('.skill-execute-panel .btn-primary')
    await expect(btn).toBeDisabled()
  })

  test('输入变化时实时预览生成的 prompt', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'skill:preview') return '预览: test.ts'
        return undefined
      }
    })
    await page.locator('.skill-item').first().click()
    const panel = page.locator('.skill-execute-panel')
    await panel.locator('.panel-input').last().fill('test.ts')
    await expect(panel.locator('.prompt-preview')).toContainText('预览')
  })

  test('执行成功后显示结果 + Toast', async ({ page }) => {
    await navigateToSkills(page)
    await injectSkills(page, BUILTIN_SKILLS)
    await injectSessions(page, [mkSession('s1', 'Run', 'claude', 'running')])
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'skill:execute') return { success: true, prompt: '执行结果内容' }
        if (channel === 'skill:preview') return '预览文本'
        return undefined
      }
    })
    await page.locator('.skill-item').first().click()
    const panel = page.locator('.skill-execute-panel')
    // 选择 session
    await panel.locator('select').first().selectOption('s1')
    // 填写必填字段
    await panel.locator('.panel-input').last().fill('src/main.ts')
    // 执行
    await panel.locator('.btn-primary').click()
    await expect(panel.locator('.result-output')).toContainText('执行结果内容')
    await expect(page.locator('.toast')).toBeVisible()
  })
})