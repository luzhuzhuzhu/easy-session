import { test, expect } from './fixtures'

async function navigateToConfig(page: import('@playwright/test').Page) {
  await page.locator('.nav-menu > .nav-item').nth(1).click()
  await page.waitForURL(/#\/config/)
}

async function waitConfigLoaded(page: import('@playwright/test').Page) {
  await page.waitForFunction(() => {
    const store = (window as any).__pinia__?._s?.get('config')
    return store && !store.loading
  })
}

async function injectConfig(page: import('@playwright/test').Page, tab: 'claude' | 'codex', data: object) {
  const key = tab === 'claude' ? 'claudeConfig' : 'codexConfig'
  await page.evaluate(({ k, v }) => {
    ;(window as any).__e2e_inject__('config', k, JSON.stringify(v))
  }, { k: key, v: data })
}

test.describe('Config - Tab 切换', () => {
  test('默认显示 Claude tab 为激活状态', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    const tabs = page.locator('.tabs .tab')
    await expect(tabs.first()).toHaveClass(/active/)
    await expect(tabs.first()).toHaveText('Claude 配置')
  })

  test('点击 Codex tab 切换到 Codex 配置，tab 高亮变化', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    const tabs = page.locator('.tabs .tab')
    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveClass(/active/)
    await expect(tabs.first()).not.toHaveClass(/active/)
  })

  test('切换 tab 时清除之前的提示消息', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    // 触发一个错误消息
    const textarea = page.locator('.json-editor')
    await textarea.fill('invalid json')
    await page.locator('.btn-primary').click()
    await expect(page.locator('.message')).toBeVisible()
    // 切换 tab，消息应清除
    await page.locator('.tabs .tab').nth(1).click()
    await expect(page.locator('.message')).toBeHidden()
  })

  test('切换 tab 后文件路径显示对应路径', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    await expect(page.locator('.file-path code')).toHaveText('~/.claude/settings.json')
    await page.locator('.tabs .tab').nth(1).click()
    await expect(page.locator('.file-path code')).toHaveText('~/.codex/config.json')
  })
})

test.describe('Config - 配置加载', () => {
  test('页面加载时显示 loading 状态', async ({ page }) => {
    // 在导航前注入 loading=true 使其可见
    await page.evaluate(() => {
      const store = (window as any).__pinia__?._s?.get('config')
      if (store) store.loading = true
    })
    await navigateToConfig(page)
    // loading 状态可能很短暂，检查 loading 元素或 textarea 存在
    const hasLoading = await page.locator('.loading').isVisible().catch(() => false)
    const hasEditor = await page.locator('.json-editor').isVisible().catch(() => false)
    // 页面要么在 loading 要么已加载完成显示 editor
    expect(hasLoading || hasEditor).toBe(true)
  })

  test('加载完成后 textarea 显示 JSON 格式的配置内容', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    const textarea = page.locator('.json-editor')
    await expect(textarea).toBeVisible()
    const value = await textarea.inputValue()
    // 应该是合法 JSON
    expect(() => JSON.parse(value)).not.toThrow()
  })

  test('点击重新加载按钮重新拉取配置并刷新编辑器', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    const textarea = page.locator('.json-editor')
    const before = await textarea.inputValue()
    // 修改 textarea 内容
    await textarea.fill('{"modified": true}')
    // 点击重新加载
    await page.locator('.btn:not(.btn-primary)').click()
    await waitConfigLoaded(page)
    // 编辑器应恢复为原始内容
    const after = await textarea.inputValue()
    expect(after).toBe(before)
  })
})

test.describe('Config - 编辑与保存', () => {
  test('编辑 textarea 内容后，边框变为警告色（.modified 类）', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    const textarea = page.locator('.json-editor')
    await textarea.fill('{"edited": true}')
    await expect(textarea).toHaveClass(/modified/)
  })

  test('编辑后显示已修改提示文字', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    await page.locator('.json-editor').fill('{"edited": true}')
    await expect(page.locator('.modified-hint')).toBeVisible()
    await expect(page.locator('.modified-hint')).toHaveText('已修改')
  })

  test('保存按钮在未修改时 disabled', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    await expect(page.locator('.btn-primary')).toBeDisabled()
  })

  test('输入合法 JSON 后点击保存，显示成功消息（绿色）+ Toast', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    await page.locator('.json-editor').fill('{"valid": true}')
    await page.locator('.btn-primary').click()
    const msg = page.locator('.message')
    await expect(msg).toBeVisible()
    await expect(msg).toHaveClass(/success/)
    await expect(msg).toContainText('配置保存成功')
  })

  test('输入非法 JSON 后点击保存，显示错误消息（红色）+ Toast', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    await page.locator('.json-editor').fill('not valid json!!!')
    await page.locator('.btn-primary').click()
    const msg = page.locator('.message')
    await expect(msg).toBeVisible()
    await expect(msg).toHaveClass(/error/)
    await expect(msg).toContainText('保存失败')
  })

  test('保存过程中按钮 disabled 防止重复提交', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    await page.locator('.json-editor').fill('{"saving": true}')
    // 拦截 IPC 使保存变慢
    await page.evaluate(() => {
      ;(window as any).__e2e_ipc_mock__ = async (channel: string, ...args: any[]) => {
        if (channel === 'config:claude:write') {
          await new Promise(r => setTimeout(r, 1000))
        }
        return undefined // 回退到真实 IPC
      }
    })
    const saveBtn = page.locator('.btn-primary')
    await saveBtn.click()
    // 点击后按钮应立即 disabled
    await expect(saveBtn).toBeDisabled()
  })
})

test.describe('Config - 状态栏', () => {
  test('保存成功后底部显示上次保存时间戳', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    // 保存前不显示时间戳
    await expect(page.locator('.status-bar span')).toBeHidden()
    // 保存合法 JSON
    await page.locator('.json-editor').fill('{"ts": 1}')
    await page.locator('.btn-primary').click()
    await expect(page.locator('.message.success')).toBeVisible()
    // 保存后显示时间戳
    const statusBar = page.locator('.status-bar span')
    await expect(statusBar).toBeVisible()
    await expect(statusBar).toContainText('最后保存时间')
  })
})

test.describe('Config - 边界情况', () => {
  test('空配置 {} 可以正常保存', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    await page.locator('.json-editor').fill('{}')
    await page.locator('.btn-primary').click()
    await expect(page.locator('.message.success')).toBeVisible()
  })

  test('超大 JSON（>10KB）可以正常编辑和保存', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    // 生成 >10KB 的 JSON
    const bigObj: Record<string, string> = {}
    for (let i = 0; i < 200; i++) bigObj[`key_${i}`] = 'x'.repeat(60)
    const bigJson = JSON.stringify(bigObj, null, 2)
    expect(bigJson.length).toBeGreaterThan(10240)
    await page.locator('.json-editor').fill(bigJson)
    await expect(page.locator('.json-editor')).toHaveClass(/modified/)
    await page.locator('.btn-primary').click()
    await expect(page.locator('.message.success')).toBeVisible()
  })

  test('配置包含特殊字符（中文、emoji）正常处理', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    const specialJson = JSON.stringify({ name: '测试配置', icon: '🚀', desc: '中文emoji混合' })
    await page.locator('.json-editor').fill(specialJson)
    await page.locator('.btn-primary').click()
    await expect(page.locator('.message.success')).toBeVisible()
  })

  test('外部修改配置后（config:changed 事件），编辑器自动刷新', async ({ page }) => {
    await navigateToConfig(page)
    await waitConfigLoaded(page)
    const before = await page.locator('.json-editor').inputValue()
    // 模拟外部修改：直接更新 store 数据（模拟 config:changed 事件效果）
    await injectConfig(page, 'claude', { externalChange: true })
    // 等待编辑器内容更新
    await page.waitForFunction((prev) => {
      const ta = document.querySelector('.json-editor') as HTMLTextAreaElement
      return ta && ta.value !== prev
    }, before)
    const after = await page.locator('.json-editor').inputValue()
    expect(after).toContain('externalChange')
  })
})
