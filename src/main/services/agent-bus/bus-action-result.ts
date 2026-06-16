// 批量协作动作（群发消息 / 批量建任务）的单目标结果类型，以及把多个单目标结果
// 聚合成对外契约 BusActionResult 的纯函数。抽成独立模块便于单测（无需启动 Electron）。

export interface BusTargetResult {
  targetId: string
  ok: boolean
  error?: string
  taskId?: string
}

export interface BusActionResult {
  // 只要 >=1 个目标成功即 true。
  ok: boolean
  // 全部失败时的汇总原因（拼接各目标错误）。
  error?: string
  // 兼容旧单目标调用方：targetIds.length===1 且成功时回填该目标的 taskId。
  taskId?: string
  // 每个目标的明细，供前端按目标展示成功/失败。
  results?: BusTargetResult[]
}

// 聚合多目标结果：>=1 成功即 ok:true；全失败时汇总各目标错误；
// 单目标且成功时回填 taskId 以兼容旧调用方。
export function aggregateBusResults(results: BusTargetResult[]): BusActionResult {
  const anyOk = results.some((r) => r.ok)
  const aggregate: BusActionResult = { ok: anyOk, results }
  if (!anyOk) {
    aggregate.error =
      results.map((r) => `${r.targetId}: ${r.error ?? '失败'}`).join('; ') || '全部目标投递失败'
  }
  if (results.length === 1 && results[0].ok && results[0].taskId) {
    aggregate.taskId = results[0].taskId
  }
  return aggregate
}
