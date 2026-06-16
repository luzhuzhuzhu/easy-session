import { describe, expect, it } from 'vitest'
import { TaskStore } from '../src/main/services/agent-bus/task-store'
import type { AgentTaskStatus, SessionBridge } from '../src/main/services/agent-bus/types'

function makeBridge(): SessionBridge {
  return {
    resolveCaller: () => null,
    resolveByQuery: () => ({ candidates: [] }),
    listAgents: () => [],
    getName: (sid) => sid,
    isInjectable: () => false, // 不自动投递，create 后停在 'created'
    isRunning: () => true,
    readHistory: () => '',
    writeRaw: () => true
  }
}

function makeStore(): { store: TaskStore; changes: () => number } {
  let changes = 0
  const store = new TaskStore({
    bridge: makeBridge(),
    notify: () => {},
    isIdle: () => true,
    onChange: () => {
      changes += 1
    }
  })
  return { store, changes: () => changes }
}

// 把任务推进到指定状态（forceStatus 不走 allowed 表，可直接落到终态）。
function toStatus(store: TaskStore, id: string, status: AgentTaskStatus): void {
  const r = store.forceStatus(id, 'user', status)
  expect(r.error).toBeUndefined()
}

describe('TaskStore archive / unarchive', () => {
  it('非终态任务归档报错，且不打标记/不触发 onChange', () => {
    const { store, changes } = makeStore()
    const task = store.create('A', 'B', '任务')
    const before = changes()
    const r = store.archive(task.id, 'user')
    expect(r.error).toBe('仅已结束的任务可归档')
    expect(task.archivedAt).toBeUndefined()
    expect(changes()).toBe(before) // 失败不应触发变更
  })

  it('in_progress 也属非终态，不可归档', () => {
    const { store } = makeStore()
    const task = store.create('A', 'B', '任务')
    toStatus(store, task.id, 'in_progress')
    expect(store.archive(task.id, 'user').error).toBe('仅已结束的任务可归档')
  })

  it('各终态均可归档：打 archivedAt 时间戳并写入归档历史', () => {
    const terminal: AgentTaskStatus[] = ['done', 'failed', 'rejected', 'cancelled', 'expired']
    for (const status of terminal) {
      const { store } = makeStore()
      const task = store.create('A', 'B', `任务-${status}`)
      toStatus(store, task.id, status)
      const r = store.archive(task.id, 'user')
      expect(r.error).toBeUndefined()
      expect(typeof r.task?.archivedAt).toBe('number')
      const last = task.history[task.history.length - 1]
      expect(last.status).toBe('note')
      expect(last.text).toBe('已归档')
    }
  })

  it('归档幂等：再次归档成功且不改 archivedAt、不重复写历史', () => {
    const { store, changes } = makeStore()
    const task = store.create('A', 'B', '任务')
    toStatus(store, task.id, 'done')
    const first = store.archive(task.id, 'user')
    const stamp = first.task?.archivedAt
    const changesAfterFirst = changes()
    const histLen = task.history.length

    const second = store.archive(task.id, 'user')
    expect(second.error).toBeUndefined()
    expect(second.task?.archivedAt).toBe(stamp) // 未改动
    expect(task.history.length).toBe(histLen) // 幂等不再写历史
    expect(changes()).toBe(changesAfterFirst) // 幂等不再触发变更
  })

  it('取消归档清除 archivedAt 并写历史；未归档时幂等成功', () => {
    const { store } = makeStore()
    const task = store.create('A', 'B', '任务')
    toStatus(store, task.id, 'done')
    store.archive(task.id, 'user')

    const un = store.unarchive(task.id, 'user')
    expect(un.error).toBeUndefined()
    expect(task.archivedAt).toBeUndefined()
    expect(task.history[task.history.length - 1].text).toBe('已取消归档')

    // 未归档再取消：幂等成功，不产生噪声历史
    const histLen = task.history.length
    const again = store.unarchive(task.id, 'user')
    expect(again.error).toBeUndefined()
    expect(task.history.length).toBe(histLen)
  })

  it('任务不存在时 archive/unarchive 返回错误', () => {
    const { store } = makeStore()
    expect(store.archive('nope', 'user').error).toContain('不存在')
    expect(store.unarchive('nope', 'user').error).toContain('不存在')
  })

  it('归档不改变 status（正交于状态机）', () => {
    const { store } = makeStore()
    const task = store.create('A', 'B', '任务')
    toStatus(store, task.id, 'done')
    store.archive(task.id, 'user')
    expect(task.status).toBe('done') // 仍是 done，归档只是附加标记
  })
})
