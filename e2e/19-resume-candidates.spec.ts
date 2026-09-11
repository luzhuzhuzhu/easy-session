import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'

const FIRST_ID = '11111111-1111-4111-8111-111111111111'
const SECOND_ID = '22222222-2222-4222-8222-222222222222'

async function openCreateDialog(page: Page): Promise<void> {
  await page.getByRole('link', { name: '会话管理' }).click()
  await page.waitForURL(/#\/sessions/)
  await page.locator('.session-list-panel').getByRole('button', { name: '新建会话', exact: true }).first().click()
  await expect(page.getByRole('dialog', { name: '新建会话' })).toBeVisible()
}

test.describe('Resume candidates', () => {
  test('renders summaries, searches, marks selection, selects an ID, and retries discovery', async ({ page }) => {
    await openCreateDialog(page)

    await page.evaluate(({ firstId, secondId }) => {
      const testWindow = window as Window & {
        __resumeCandidateCalls?: number
        __e2e_ipc_mock__?: (channel: string) => Promise<unknown>
      }
      testWindow.__resumeCandidateCalls = 0
      testWindow.__e2e_ipc_mock__ = async (channel: string) => {
        if (channel === 'dialog:selectFolder') return 'D:\\work\\resume-project'
        if (channel === 'session:nativeIdCandidates') {
          testWindow.__resumeCandidateCalls = (testWindow.__resumeCandidateCalls ?? 0) + 1
          if (testWindow.__resumeCandidateCalls === 1) throw new Error('temporary discovery failure')
          return {
            status: 'ready',
            candidates: [
              {
                id: firstId,
                title: 'Fix authentication callback',
                titleSource: 'summary',
                content: 'Investigate the OAuth redirect and preserve the original destination.',
                updated: Date.UTC(2026, 7, 20, 9, 30),
                projectPath: 'D:\\work\\resume-project'
              },
              {
                id: secondId,
                title: 'Improve terminal resizing',
                titleSource: 'session-title',
                content: 'Stabilize split pane sizing after restoring the workspace layout.',
                updated: Date.UTC(2026, 7, 19, 8, 15),
                projectPath: 'D:\\work\\resume-project\\renderer'
              }
            ]
          }
        }
        return undefined
      }
    }, { firstId: FIRST_ID, secondId: SECOND_ID })

    const dialog = page.getByRole('dialog', { name: '新建会话' })
    await dialog.getByRole('button', { name: '浏览', exact: true }).click()

    const resume = dialog.locator('.resume-section')
    const liveRegion = resume.getByRole('status')
    await expect(liveRegion).toHaveCount(1)
    await expect(liveRegion).toHaveAttribute('aria-live', 'polite')
    await expect(liveRegion).toHaveAttribute('aria-atomic', 'true')
    await expect(liveRegion).toBeEmpty()

    await resume.locator('.pick-button').click()
    await expect(liveRegion).toContainText('无法发现本机会话')
    await expect(resume.getByRole('alert')).toContainText('重试')
    await resume.locator('.retry-button').click()

    const candidates = resume.locator('.candidate-item')
    await expect(candidates).toHaveCount(2)
    await expect(liveRegion).toHaveText('续接候选会话')
    await expect(candidates.first().locator('.candidate-title')).toHaveText('Fix authentication callback')
    await expect(candidates.first().locator('.candidate-content')).toContainText('OAuth redirect')
    await expect(candidates.first().locator('.candidate-meta code')).toHaveText('11111111…1111')
    await expect(candidates.first()).toHaveAttribute('title', new RegExp(`${FIRST_ID}.*resume-project`, 's'))

    const resumeId = resume.locator('#claude-resume-id')
    await resumeId.fill(FIRST_ID)
    await expect(candidates.first()).toHaveClass(/selected/)
    await expect(candidates.first()).toHaveAttribute('aria-pressed', 'true')

    const search = resume.locator('.candidate-search')
    await search.fill('workspace layout')
    await expect(candidates).toHaveCount(1)
    await expect(candidates.first().locator('.candidate-title')).toHaveText('Improve terminal resizing')

    await search.fill('no matching session')
    await expect(resume.locator('.state-message')).toContainText('没有与搜索条件匹配')
    await expect(liveRegion).toHaveText('没有与搜索条件匹配的会话。')

    await search.fill('renderer')
    await expect(liveRegion).toHaveText('续接候选会话')
    await candidates.first().click()
    await expect(resumeId).toHaveValue(SECOND_ID)
    await expect(resume.locator('.picker-panel')).toBeHidden()
    await expect(liveRegion).toBeEmpty()
    await expect.poll(() => page.evaluate(() =>
      (window as Window & { __resumeCandidateCalls?: number }).__resumeCandidateCalls
    )).toBe(2)
  })
})
