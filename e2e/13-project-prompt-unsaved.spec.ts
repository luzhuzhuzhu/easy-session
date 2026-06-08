import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const PROJECT = {
  id: 'proj-prompt',
  name: 'Prompt Project',
  path: 'D:\\repo\\prompt-project',
  createdAt: 1700000000000,
  lastOpenedAt: 1700000000000,
  pathExists: true
}

function defaultWorkspaceLayout() {
  return {
    version: 2,
    root: {
      type: 'leaf',
      paneId: 'pane-1',
      activeTabId: null,
      tabs: []
    },
    tabs: {},
    activePaneId: 'pane-1'
  }
}

async function setupProjectPromptMocks(page: Page) {
  await page.evaluate(({ project, workspaceLayout }) => {
    ;(window as any).__e2e_prompt_read_count = 0
    ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
      if (channel === 'remote-instance:list') return []
      if (channel === 'project:list') return [project]
      if (channel === 'project:get') return args[0] === project.id ? project : null
      if (channel === 'project:open') return args[0] === project.id ? project : null
      if (channel === 'project:sessions') return []
      if (channel === 'project:detect') return { claude: true, codex: true, opencode: false }
      if (channel === 'project:prompt:read') {
        ;(window as any).__e2e_prompt_read_count += 1
        return {
          path: args[1] === 'codex'
            ? 'D:\\repo\\prompt-project\\AGENTS.md'
            : 'D:\\repo\\prompt-project\\CLAUDE.md',
          content: 'original prompt',
          exists: true
        }
      }
      if (channel === 'project:prompt:write') {
        return {
          path: args[1] === 'codex'
            ? 'D:\\repo\\prompt-project\\AGENTS.md'
            : 'D:\\repo\\prompt-project\\CLAUDE.md',
          content: args[2],
          exists: true
        }
      }
      if (channel === 'session:list') return []
      if (channel === 'workspace:getLayout') return structuredClone(workspaceLayout)
      if (channel === 'workspace:updateLayout') return args[0]
      if (channel === 'workspace:resetLayout') return structuredClone(workspaceLayout)
      return undefined
    }
  }, { project: PROJECT, workspaceLayout: defaultWorkspaceLayout() })
}

async function openPromptTab(page: Page) {
  await page.evaluate((projectId) => {
    window.location.hash = `#/projects/${projectId}`
  }, PROJECT.id)
  await page.waitForURL(new RegExp(`#\\/projects\\/${PROJECT.id}`))
  await expect(page.locator('.project-detail-page')).toBeVisible()
  await expect(page.locator('.name-input')).toHaveValue(PROJECT.name)
  await page.getByRole('button', { name: '项目提示词' }).click()
  await expect(page.locator('.prompt-editor')).toHaveValue('original prompt')
}

test.describe('Project Prompt 未保存离开确认', () => {
  test.beforeEach(async ({ page }) => {
    await setupProjectPromptMocks(page)
  })

  test('取消离开会保留当前 Prompt 编辑，确认继续才跳转', async ({ page }) => {
    await openPromptTab(page)
    const editor = page.locator('.prompt-editor')
    await editor.fill('original prompt\nunsaved edit')
    await expect(page.locator('.modified-hint')).toBeVisible()

    await page.locator('.nav-menu > .nav-item').nth(1).click()
    const confirmDialog = page.locator('.confirm-dialog')
    await expect(confirmDialog).toBeVisible()
    await expect(confirmDialog).toContainText('离开前保存 Prompt？')
    await expect(confirmDialog).toContainText('D:\\repo\\prompt-project\\CLAUDE.md')

    await confirmDialog.locator('.confirm-actions .btn').first().click()
    await expect(confirmDialog).toBeHidden()
    await expect(page).toHaveURL(new RegExp(`#\\/projects\\/${PROJECT.id}`))
    await expect(editor).toHaveValue('original prompt\nunsaved edit')

    await page.locator('.nav-menu > .nav-item').nth(1).click()
    await expect(confirmDialog).toBeVisible()
    await confirmDialog.locator('.confirm-actions .btn-danger').click()
    await page.waitForURL(/#\/sessions/)
    await expect(page.locator('.sessions-page')).toBeVisible()
  })
})
