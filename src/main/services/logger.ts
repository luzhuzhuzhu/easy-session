// 主进程统一日志：基于 pino，收敛此前散落的 console.*。
// 边界：仅主进程使用；远程 HTTP 层在 remote/server.ts 自带 pino-http 实例。
// 用法：
//   import { logger } from './logger'
//   logger.info('[scope] message')
//   logger.error({ err }, '[scope] message')   // 错误对象放第一个参数，pino 会结构化序列化
//   const log = createLogger('agent-bus'); log.warn('...')
import pino from 'pino'

// 测试环境默认静默，避免污染 vitest 输出；可用 EASYSESSION_LOG_LEVEL 覆盖。
const level =
  process.env.EASYSESSION_LOG_LEVEL ||
  (process.env.NODE_ENV === 'test' ? 'silent' : 'info')

export const logger = pino({
  name: 'easysession-main',
  level
})

export type MainLogger = typeof logger

// 带模块标签的子日志，便于按 scope 过滤。
export function createLogger(scope: string): MainLogger {
  return logger.child({ scope })
}
