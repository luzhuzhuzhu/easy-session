import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../src/renderer/src/stores/settings'

describe('settings store compatibility', () => {
  const invokeMock = vi.fn()

  beforeEach(() => {
    setActivePinia(createPinia())
    invokeMock.mockReset()
    vi.stubGlobal('window', {
      electronAPI: {
        invoke: invokeMock
      }
    })
  })

  it('merges legacy app-settings.json with defaults without renaming keys', async () => {
    invokeMock.mockResolvedValueOnce({
      theme: 'light',
      language: 'en',
      claudePath: 'C:/tools/claude.exe',
      manualProjectOrder: ['local::d:/repo/demo']
    })

    const store = useSettingsStore()
    await store.load()

    expect(store.settings.theme).toBe('light')
    expect(store.settings.language).toBe('en')
    expect(store.settings.claudePath).toBe('C:/tools/claude.exe')
    expect(store.settings.manualProjectOrder).toEqual(['local::d:/repo/demo'])
    expect(store.settings.desktopRemoteMountEnabled).toBe(false)
    expect(store.settings.sessionsListPosition).toBe('left')
    expect(store.settings.terminalFontSizeByPane).toEqual({})
    expect(store.settings.manualSessionOrder).toEqual({})
  })

  it('sanitizes invalid legacy values and falls back to safe defaults', async () => {
    invokeMock.mockResolvedValueOnce({
      theme: 'neon',
      language: 'jp',
      desktopRemoteMountEnabled: 'true',
      terminalFontSize: '18',
      terminalFontSizeByPane: {
        'pane-1': 16,
        'pane-2': 'bad'
      },
      manualProjectOrder: ['project-a', 42],
      manualSessionOrder: {
        groupA: ['s1', 's2'],
        groupB: 'bad'
      },
      sessionsListPosition: 'middle'
    })

    const store = useSettingsStore()
    await store.load()

    expect(store.settings.theme).toBe('dark')
    expect(store.settings.language).toBe('zh-CN')
    expect(store.settings.desktopRemoteMountEnabled).toBe(false)
    expect(store.settings.terminalFontSize).toBe(13)
    expect(store.settings.terminalFontSizeByPane).toEqual({ 'pane-1': 16 })
    expect(store.settings.manualProjectOrder).toEqual(['project-a'])
    expect(store.settings.manualSessionOrder).toEqual({ groupA: ['s1', 's2'], groupB: [] })
    expect(store.settings.sessionsListPosition).toBe('left')
  })
})
