import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'

type Fixtures = {
  electronApp: ElectronApplication
  page: Page
}

export const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    const app = await _electron.launch({
      args: [path.join(__dirname, '../out/main/index.js')],
      env: { ...process.env, NODE_ENV: 'test' }
    })
    await use(app)
    await app.close()
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect } from '@playwright/test'
