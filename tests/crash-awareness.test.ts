// UX-13：崩溃感知——崩溃记录窗口、安全模式阈值与恢复判定单测
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') },
  ipcMain: { handle: vi.fn() },
  shell: { showItemInFolder: vi.fn() }
}))

import {
  recordCrashAndDecide,
  isCrashSafeMode,
  clearCrashSafeMode
} from '../src/main/ipc/crash-handlers'

describe('crash awareness (UX-13)', () => {
  beforeEach(() => {
    clearCrashSafeMode()
  })

  afterEach(() => {
    clearCrashSafeMode()
    vi.restoreAllMocks()
  })

  it('reports recovered for a single crash', () => {
    const notice = recordCrashAndDecide(1000)
    expect(notice.level).toBe('recovered')
    expect(notice.count).toBe(1)
    expect(isCrashSafeMode()).toBe(false)
  })

  it('stays recovered for scattered crashes outside the window', () => {
    // 10 分钟窗口外的时间戳彼此不累计
    recordCrashAndDecide(0)
    recordCrashAndDecide(11 * 60 * 1000)
    const notice = recordCrashAndDecide(22 * 60 * 1000)
    expect(notice.level).toBe('recovered')
  })

  it('enters safe mode on the third crash within the window', () => {
    recordCrashAndDecide(0)
    recordCrashAndDecide(1000)
    const notice = recordCrashAndDecide(2000)
    expect(notice.level).toBe('safe-mode')
    expect(notice.count).toBe(3)
    expect(isCrashSafeMode()).toBe(true)
  })

  it('clear resets history and safe mode', () => {
    recordCrashAndDecide(0)
    recordCrashAndDecide(1)
    recordCrashAndDecide(2)
    expect(isCrashSafeMode()).toBe(true)
    clearCrashSafeMode()
    expect(isCrashSafeMode()).toBe(false)
    const notice = recordCrashAndDecide(3)
    expect(notice.level).toBe('recovered')
  })
})
