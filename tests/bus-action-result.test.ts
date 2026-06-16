import { describe, expect, it } from 'vitest'
import { aggregateBusResults } from '../src/main/services/agent-bus/bus-action-result'

describe('aggregateBusResults', () => {
  it('单目标成功：ok 为 true 且回填 taskId', () => {
    const r = aggregateBusResults([{ targetId: 's1', ok: true, taskId: 't-1' }])
    expect(r.ok).toBe(true)
    expect(r.taskId).toBe('t-1')
    expect(r.error).toBeUndefined()
    expect(r.results).toHaveLength(1)
  })

  it('单目标成功但无 taskId（群发消息场景）：不回填 taskId', () => {
    const r = aggregateBusResults([{ targetId: 's1', ok: true }])
    expect(r.ok).toBe(true)
    expect(r.taskId).toBeUndefined()
  })

  it('多目标部分成功：ok 为 true，不汇总 error，不回填 taskId', () => {
    const r = aggregateBusResults([
      { targetId: 's1', ok: true, taskId: 't-1' },
      { targetId: 's2', ok: false, error: '目标会话未运行' }
    ])
    expect(r.ok).toBe(true)
    expect(r.error).toBeUndefined()
    // 多目标不回填顶层 taskId（仅单目标兼容）。
    expect(r.taskId).toBeUndefined()
    expect(r.results).toHaveLength(2)
  })

  it('多目标全部失败：ok 为 false 且汇总各目标错误', () => {
    const r = aggregateBusResults([
      { targetId: 's1', ok: false, error: '目标会话未运行' },
      { targetId: 's2', ok: false, error: '任务描述不能为空' }
    ])
    expect(r.ok).toBe(false)
    expect(r.error).toContain('s1: 目标会话未运行')
    expect(r.error).toContain('s2: 任务描述不能为空')
    expect(r.taskId).toBeUndefined()
  })

  it('全部失败但缺少 error 文案时给出兜底原因', () => {
    const r = aggregateBusResults([{ targetId: 's1', ok: false }])
    expect(r.ok).toBe(false)
    expect(r.error).toBe('s1: 失败')
  })
})
