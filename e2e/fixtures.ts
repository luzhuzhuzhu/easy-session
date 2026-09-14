import { test as base, _electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import { mkdtemp, rm } from 'fs/promises'
import { tmpdir } from 'os'

type Fixtures = {
  electronApp: ElectronApplication
  page: Page
}

export const test = base.extend<Fixtures>({
  electronApp: async ({}, use) => {
    const temporaryRoot = path.resolve(tmpdir())
    const userData = await mkdtemp(path.join(temporaryRoot, 'easysession-e2e-'))
    if (!path.resolve(userData).startsWith(temporaryRoot + path.sep)) throw new Error('Unsafe e2e data cleanup')
    let app: ElectronApplication | undefined
    try {
      app = await _electron.launch({
        args: [path.join(__dirname, '../out/main/index.js')],
        env: { ...process.env, NODE_ENV: 'test', EASYSESSION_TEST_USER_DATA: userData, EASYSESSION_REMOTE_ENABLED: 'false', EASYSESSION_HEADLESS: '0' }
      })
      await use(app)
    } finally {
      await app?.close()
      await rm(userData, {recursive:true,force:true,maxRetries:10,retryDelay:100})
    }
  },
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await use(page)
  }
})

export { expect } from '@playwright/test'
