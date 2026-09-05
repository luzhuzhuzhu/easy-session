import { defineConfig } from '@playwright/test'

// ENG-2：e2e 门禁配置。
// - webServer 由外部脚本负责（electron 应用，无法用 http webServer 表达），
//   通过 test:e2e 前置 build 保证产物新鲜（见 package.json）。
// - 本地 0 重试（快速反馈），CI 2 次重试吸收偶发 flake。
// - 失败自动保留 trace/截图/视频便于排查。

const isCI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  }
})
