import type { Session, CreateSessionParams } from './session-types'

// 会话生命周期接口 - Claude 和 Codex 各自实现
export interface ISessionLifecycle {
  // 创建新会话并启动进程
  create(id: string, name: string, params: CreateSessionParams): Session
  // 恢复/重启已有会话的进程
  startProcess(session: Session, startAt: number): void
  // 处理进程输出（Codex 用于 ID 发现）
  handleOutput(session: Session, data: string): void
  // 会话销毁/暂停时的清理
  cleanup(session: Session): void
  // 加载时的数据迁移
  migrateOnLoad(session: Session): boolean
  // 加载时尝试补全原生会话ID
  hydrateSessionId(session: Session): boolean
}
