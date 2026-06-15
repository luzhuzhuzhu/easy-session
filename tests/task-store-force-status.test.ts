import { describe, it, expect } from 'vitest'
import { TaskStore } from '../src/main/services/agent-bus/task-store'
import type { SessionBridge } from '../src/main/services/agent-bus/types'

// 报告 P0：forceStatus 曾允许把 done/expired 复活到 created/delivered，破坏状态机不变量。
// 已修为「禁止手动置入系统专属初始态 + 拒绝同态空跳转 + 保留用户重开终结态的能力」。
// 这里直接对 task-store 锁定该不变量，防回归。
function makeStore() {
  const notifications: Array<{ to: string; text: string }> = []
  const bridge = {
    getName: (id: string) => (({ A: 'Alice', B: 'Bob' } as Record<string, string>)[id] ?? null),
    isInjectable: () => false, // 不可注入 → create 后停在 created
  } as unknown as SessionBridge
  const store = new TaskStore({
    bridge,
    notify: (to: string, text: string) => notifications.push({ to, text }),
    isIdle: () => false,
    onChange: () => {},
  })
  return { store, notifications }
}

describe('TaskStore.forceStatus（用户手动校正的状态机不变量）', () => {
  it('拒绝手动置入系统专属初始态 created（不破坏投递/计时不变量）', () => {
    const { store } = makeStore()
    const t = store.create('A', 'B', '任务')
    const r = store.forceStatus(t.id, 'user', 'created')
    expect(r.error).toBeTruthy()
    expect(r.task).toBeUndefined()
    expect(store.get(t.id)!.status).toBe('created') // 原状态未被改动
  })

  it('拒绝手动置入系统专属初始态 delivered', () => {
    const { store } = makeStore()
    const t = store.create('A', 'B', '任务')
    const r = store.forceStatus(t.id, 'user', 'delivered')
    expect(r.error).toBeTruthy()
  })

  it('拒绝同状态空跳转', () => {
    const { store } = makeStore()
    const t = store.create('A', 'B', '任务')
    store.forceStatus(t.id, 'user', 'in_progress')
    const r = store.forceStatus(t.id, 'user', 'in_progress')
    expect(r.error).toContain('已处于')
  })

  it('保留用户重开已完成（done）任务到活动态的能力，并清空 result', () => {
    const { store } = makeStore()
    const t = store.create('A', 'B', '任务')
    store.forceStatus(t.id, 'user', 'done', '完成了')
    expect(store.get(t.id)!.result).toBe('完成了')
    const r = store.forceStatus(t.id, 'user', 'in_progress', '重新打开')
    expect(r.error).toBeUndefined()
    expect(r.task!.status).toBe('in_progress')
    expect(r.task!.result).toBeUndefined() // 回活动态清空交付结果
  })

  it('改到终结态时记录 result，并通知相关方（排除操作者与 user）', () => {
    const { store, notifications } = makeStore()
    const t = store.create('A', 'B', '任务')
    notifications.length = 0
    const r = store.forceStatus(t.id, 'user', 'cancelled', '不需要了')
    expect(r.task!.status).toBe('cancelled')
    expect(r.task!.result).toBe('不需要了')
    expect(notifications.map((n) => n.to).sort()).toEqual(['A', 'B'])
  })

  it('对不存在的任务报错', () => {
    const { store } = makeStore()
    const r = store.forceStatus('t-nope', 'user', 'in_progress')
    expect(r.error).toContain('不存在')
  })

  it('history 记录每次强制改动（含操作者 by 与目标状态）', () => {
    const { store } = makeStore()
    const t = store.create('A', 'B', '任务')
    store.forceStatus(t.id, 'user', 'in_progress')
    const h = store.get(t.id)!.history
    const last = h[h.length - 1]
    expect(last.status).toBe('in_progress')
    expect(last.by).toBe('user')
  })
})
