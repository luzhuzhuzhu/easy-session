import { app, BrowserWindow, shell, ipcMain, dialog, Notification } from 'electron'
import { existsSync, appendFileSync, statSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { exec, execFile } from 'child_process'
import dotenv from 'dotenv'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { CliManager } from './services/cli-manager'
import { ClaudeAdapter } from './services/claude-adapter'
import { CodexAdapter } from './services/codex-adapter'
import { OpenCodeAdapter } from './services/opencode-adapter'
import { TerminalAdapter } from './services/terminal-adapter'
import { ConfigService } from './services/config-service'
import { SessionManager } from './services/session-manager'
import { ClaudeSessionLifecycle } from './services/claude-session-lifecycle'
import { CodexSessionLifecycle } from './services/codex-session-lifecycle'
import { OpenCodeSessionLifecycle } from './services/opencode-session-lifecycle'
import { TerminalSessionLifecycle } from './services/terminal-session-lifecycle'
import { GeminiAdapter } from './services/gemini-adapter'
import { GeminiSessionLifecycle } from './services/gemini-session-lifecycle'
import { PiAdapter, OmpAdapter } from './services/pi-family-adapter'
import { GrokAdapter } from './services/grok-adapter'
import { HermesAdapter } from './services/hermes-adapter'
import { GenericIdSessionLifecycle } from './services/generic-id-session-lifecycle'
import { ProjectManager } from './services/project-manager'
import { SkillManager } from './services/skill-manager'
import { DataStore } from './services/data-store'
import { registerAllHandlers } from './ipc'
import { getProbeableCliIds } from './ipc/cli-registry'
import { registerCrashHandlers, recordCrashAndDecide, CRASH_NOTICE_CHANNEL } from './ipc/crash-handlers'
import { onSessionExitNotifyPrefChange, onTaskNotifyPrefChange } from './ipc/settings-handlers'
import { registerRemoteInstanceHandlers } from './ipc/remote-instance-handlers'
import { registerRemoteServiceHandlers } from './ipc/remote-service-handlers'
import { registerCloudflareTunnelHandlers } from './ipc/cloudflare-tunnel-handlers'
import { registerRemoteNetworkHandlers } from './ipc/remote-network-handlers'
import { registerRemoteGatewayHandlers } from './ipc/remote-gateway-handlers'
import { WorkspaceLayoutManager } from './services/workspace-layout-manager'
import { RemoteInstanceManager } from './services/remote-instance-manager'
import { RemoteServiceManager } from './services/remote-service-manager'
import { CloudflareTunnelManager } from './services/cloudflare-tunnel-manager'
import { RemoteNetworkSettingsManager } from './services/remote-network-settings-manager'
import { RemoteGatewayManager } from './services/remote-gateway-manager'
import { candidateCollectorFor } from './services/native-session-candidates'

import { SessionOutputManager } from './services/session-output'
import { AgentBus } from './services/agent-bus'
import { ES_SYSTEM_PROMPT_HINT, getEsSkillMarkdown } from './services/agent-bus/skill'
import { aggregateBusResults, type BusTargetResult } from './services/agent-bus/bus-action-result'
import { createLogger } from './services/logger'
import { HeadlessControlServer } from './lifecycle/headless-control'

const log = createLogger('main')

function loadEnvironmentFiles(): void {
  const candidates = [join(process.cwd(), '.env.local'), join(process.cwd(), '.env')]
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue
    dotenv.config({ path: filePath, override: false })
  }
}

loadEnvironmentFiles()

// headless（引擎模式）：外部宿主（如 DSH 插件包）以 `--headless` 参数或
// EASYSESSION_HEADLESS=1 启动本应用时，不创建任何窗口，只跑主进程服务
// （会话/终端管理 + remote API），供外部宿主经 EASYSESSION_REMOTE_* 环境变量
// 配置 remote 服务后全权驱动。窗口相关的副作用（通知、任务栏闪烁、激活窗口等）
// 一律旁路。注意：single instance lock 仍然生效——headless 引擎与桌面 GUI
// 同一 userData 下互斥，外部宿主应先探测既有实例的 remote 端口再决定拉起。
const isHeadless =
  process.argv.includes('--headless') || process.env.EASYSESSION_HEADLESS === '1'

// 开发模式使用独立的 app 名与 userData 目录，与已安装版隔离：
// 否则二者共享同一 single instance lock —— 安装版在运行时，dev 实例（同名 easysession）
// 会 requestSingleInstanceLock() 失败而立即 app.quit() 退出，表现为 npm run dev 起不来。
// 独立 userData 同时避免 dev 调试读写污染安装版的真实数据。
if (is.dev) {
  app.setName('easysession-dev')
  app.setPath('userData', join(app.getPath('appData'), 'easysession-dev'))
}

const hasSingleInstanceLock = process.env.NODE_ENV === 'test' || app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // headless 引擎没有窗口可聚焦；同 userData 的桌面实例也因锁被本进程持有而无法
    // 启动，故二次启动请求在引擎模式下直接忽略（外部宿主统一走 remote 协议）。
    if (isHeadless) return
    const existing = BrowserWindow.getAllWindows()[0]
    if (!existing || existing.isDestroyed()) return
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
  })
}

const cliManager = new CliManager()
const claudeAdapter = new ClaudeAdapter(cliManager)
const codexAdapter = new CodexAdapter(cliManager)
const openCodeAdapter = new OpenCodeAdapter(cliManager)
const terminalAdapter = new TerminalAdapter(cliManager)
const configService = new ConfigService()
const outputManager = new SessionOutputManager()
const claudeLifecycle = new ClaudeSessionLifecycle(claudeAdapter, outputManager)
const codexLifecycle = new CodexSessionLifecycle(codexAdapter, outputManager)
const opencodeLifecycle = new OpenCodeSessionLifecycle(openCodeAdapter, outputManager)
const terminalLifecycle = new TerminalSessionLifecycle(terminalAdapter, outputManager)
const geminiAdapter = new GeminiAdapter(cliManager)
const geminiLifecycle = new GeminiSessionLifecycle(geminiAdapter, outputManager)
const piAdapter = new PiAdapter(cliManager)
const ompAdapter = new OmpAdapter(cliManager)
const grokAdapter = new GrokAdapter(cliManager)
const hermesAdapter = new HermesAdapter(cliManager)
const piLifecycle = new GenericIdSessionLifecycle(piAdapter, outputManager, 'pi', 'pi')
const ompLifecycle = new GenericIdSessionLifecycle(ompAdapter, outputManager, 'omp', 'omp')
const grokLifecycle = new GenericIdSessionLifecycle(grokAdapter, outputManager, 'grok', 'grok')
const hermesLifecycle = new GenericIdSessionLifecycle(hermesAdapter, outputManager, 'hermes', 'hermes')
const sessionManager = new SessionManager(
  cliManager,
  claudeLifecycle,
  codexLifecycle,
  outputManager,
  opencodeLifecycle,
  terminalLifecycle,
  geminiLifecycle,
  piLifecycle,
  ompLifecycle,
  grokLifecycle,
  hermesLifecycle
)
const projectManager = new ProjectManager()
const skillManager = new SkillManager(sessionManager)
const workspaceLayoutManager = new WorkspaceLayoutManager()
const agentBus = new AgentBus(sessionManager, cliManager)
let remoteInstanceManager: RemoteInstanceManager | null = null
let remoteServiceManager: RemoteServiceManager | null = null
let cloudflareTunnelManager: CloudflareTunnelManager | null = null
let remoteNetworkSettingsManager: RemoteNetworkSettingsManager | null = null
let remoteGatewayManager: RemoteGatewayManager | null = null

const SHUTDOWN_FLUSH_WARN_MS = 12_000
const SHUTDOWN_START_CHANNEL = 'app:shutdown-start'
let isShuttingDown = false

// 会话意外退出提醒：进程自己退出（用户主动 pause/restart/destroy 不经此路径）时，
// 按设置弹系统通知 + 闪烁任务栏（sessionExitNotify：abnormal 仅异常退出 / all 全部 / off 关闭；
// 窗口正聚焦时不打扰，仅闪烁）。窗口最小化/后台时后台 agent 死亡不再无感。
let sessionExitNotifyPref: 'abnormal' | 'off' | 'all' = 'abnormal'

sessionManager.setExitNotifier((session, exitCode) => {
  if (isShuttingDown) return
  // 引擎模式没有窗口：会话退出提醒没有可承载的 UI（通知点击需要聚焦窗口），直接跳过。
  if (isHeadless) return
  const abnormal = exitCode !== 0
  if (sessionExitNotifyPref === 'off') return
  if (sessionExitNotifyPref === 'abnormal' && !abnormal) return

  const win = getMainWindow()
  const windowFocused = !!win && win.isFocused()
  // 用户正盯着窗口时系统通知是噪音；仍闪烁任务栏兜底。
  if (!windowFocused) {
    const label = session.type === 'terminal' ? '终端会话' : `${session.type.toUpperCase()} 会话`
    const title = `${session.name} 已退出`
    const body = abnormal
      ? `${label}异常退出（exit code ${exitCode ?? 'unknown'}），点击查看。`
      : `${label}正常结束。`
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({ title, body, silent: false })
        notification.on('click', () => {
          const target = getMainWindow()
          if (!target) return
          if (target.isMinimized()) target.restore()
          target.show()
          target.focus()
          target.webContents.send('session:focus-request', session.id)
        })
        notification.show()
      }
    } catch (err) {
      log.warn({ err }, '[notify] session exit notification failed')
    }
  }
  if (win && !win.isFocused()) win.flashFrame(true)
})

registerAllHandlers({
  cliManager,
  claudeAdapter,
  codexAdapter,
  openCodeAdapter,
  piAdapter,
  ompAdapter,
  grokAdapter,
  hermesAdapter,
  configService,
  sessionManager,
  projectManager,
  skillManager,
  workspaceLayoutManager,
  agentBus
})

registerCrashHandlers()

// 设置页改通知偏好 → settings:write → 同步给 exit notifier（无需重启应用）。
onSessionExitNotifyPrefChange((pref) => {
  if (pref === 'abnormal' || pref === 'off' || pref === 'all') {
    sessionExitNotifyPref = pref
  }
})

// UX-2：任务事件系统通知。偏好 taskNotify：'fail' 仅失败/阻塞（默认）/ 'all' 全部终态 / 'off'。
let taskNotifyPref: 'fail' | 'off' | 'all' = 'fail'
onTaskNotifyPrefChange((pref) => {
  if (pref === 'fail' || pref === 'off' || pref === 'all') {
    taskNotifyPref = pref
  }
})

agentBus.onTaskEvent((task, next) => {
  if (isShuttingDown || isHeadless) return
  if (taskNotifyPref === 'off') return
  const interesting: Record<string, boolean> = {
    failed: true,
    blocked: true,
    done: taskNotifyPref === 'all',
    review: taskNotifyPref === 'all'
  }
  if (!interesting[next]) return
  const win = getMainWindow()
  if (win && win.isFocused()) return
  const emoji = next === 'done' ? '🎉' : next === 'failed' ? '❌' : next === 'blocked' ? '⛔' : '🧾'
  const title = `任务 ${task.id} ${next}`
  const body = `${emoji} 「${task.title}」${next === 'blocked' ? '被阻塞，需要你的澄清' : `状态更新为 ${next}`}`
  try {
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body, silent: false })
      notification.on('click', () => {
        const target = getMainWindow()
        if (!target) return
        if (target.isMinimized()) target.restore()
        target.show()
        target.focus()
        target.webContents.send('collab:focus', task.id)
      })
      notification.show()
    }
  } catch (err) {
    log.warn({ err }, '[notify] task notification failed')
  }
  if (win && !win.isFocused()) win.flashFrame(true)
})

// 应用启动时读取一次已保存的通知偏好（settings 文件由 renderer 首次保存，读失败保持默认）。
void (async () => {
  try {
    const { readFile } = await import('fs/promises')
    const { join } = await import('path')
    const raw = await readFile(join(app.getPath('userData'), 'app-settings.json'), 'utf-8')
    const parsed = JSON.parse(raw) as { sessionExitNotify?: unknown; taskNotify?: unknown }
    if (parsed.sessionExitNotify === 'abnormal' || parsed.sessionExitNotify === 'off' || parsed.sessionExitNotify === 'all') {
      sessionExitNotifyPref = parsed.sessionExitNotify
    }
    if (parsed.taskNotify === 'fail' || parsed.taskNotify === 'off' || parsed.taskNotify === 'all') {
      taskNotifyPref = parsed.taskNotify
    }
  } catch {
    // 文件不存在或解析失败：保持默认 'abnormal'
  }
})()

async function flushAllStoresOnShutdown(): Promise<void> {
  let warned = false
  const warnTimer = setTimeout(() => {
    warned = true
    log.warn(
      `[shutdown] flush still running after ${SHUTDOWN_FLUSH_WARN_MS}ms, waiting for completion to protect data`
    )
  }, SHUTDOWN_FLUSH_WARN_MS)
  warnTimer.unref?.()

  const values = await Promise.allSettled([
    sessionManager.flush(),
    projectManager.flush(),
    workspaceLayoutManager.flush(),
    remoteInstanceManager?.flush() ?? Promise.resolve(),
    remoteServiceManager?.flush() ?? Promise.resolve(),
    cloudflareTunnelManager?.flush() ?? Promise.resolve(),
    remoteNetworkSettingsManager?.flush() ?? Promise.resolve()
  ]).finally(() => {
    clearTimeout(warnTimer)
  })

  if (warned) {
    log.warn('[shutdown] flush completed after extended wait')
  }

  for (const item of values) {
    if (item.status === 'rejected') {
      log.error({ err: item.reason }, '[shutdown] flush failed')
    }
  }
}

function notifyShutdownStarted(): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(SHUTDOWN_START_CHANNEL)
    }
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function shutdownApp(): Promise<void> {
  if (isShuttingDown) return
  isShuttingDown = true

  notifyShutdownStarted()
  await delay(80)

  if (cloudflareTunnelManager) {
    try {
      await cloudflareTunnelManager.stop()
    } catch (err) {
      log.warn({ err }, '[cloudflare-tunnel] stop failed')
    } finally {
      cloudflareTunnelManager = null
    }
  }

  if (remoteServiceManager) {
    try {
      await remoteServiceManager.stop()
    } catch (err) {
      log.warn({ err }, '[remote] stop failed')
    } finally {
      remoteServiceManager = null
    }
  }

  if (remoteGatewayManager) {
    try {
      remoteGatewayManager.dispose()
    } catch (err) {
      log.warn({ err }, '[remote-gateway] dispose failed')
    } finally {
      remoteGatewayManager = null
    }
  }

  await agentBus.stop().catch((err) => log.warn({ err }, '[agent-bus] stop failed'))

  // 关停前把全部会话的最近输出落一份 journal，重启后可回看（terminal 会话尤其救急）。
  // await 落盘完成后再杀进程，否则最后一屏输出可能来不及写。
  for (const session of sessionManager.listSessions()) {
    outputManager.writeJournal(session.id, { name: session.name, type: session.type })
  }
  await outputManager.flushJournals()

  sessionManager.shutdownAll()
  cliManager.killAll()
  configService.unwatchAll()

  await flushAllStoresOnShutdown()
  app.quit()
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 900,
    minWidth: 600,
    minHeight: 500,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // SEC-5：preload 仅使用 ipcRenderer/contextBridge，完全可沙箱化——
      // renderer 被攻破时无法直接触碰 Node 原语，缩小爆炸半径。
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 渲染进程崩溃（Vue 错误失控 / OOM）时自动重载：后台会话都在主进程，
  // 布局与会话列表持久化在 userData，reload 即可恢复 UI，避免白屏等死。
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    if (isShuttingDown) return
    log.error({ details }, '[window] renderer process gone, reloading')
    const reason = details?.reason ?? 'unknown'
    const exitCode = details?.exitCode ?? 0
    try {
      // STAB-8：crash 日志限长（1MB），超限保留尾部，防止异常刷崩溃把文件撑爆
      const crashLogPath = join(app.getPath('userData'), 'renderer-crash.log')
      const entry = `[${new Date().toISOString()}] reason=${reason} exitCode=${exitCode}\n`
      try {
        const stats = statSync(crashLogPath)
        if (stats.size > 1024 * 1024) {
          const tail = readFileSync(crashLogPath, 'utf-8').slice(-512 * 1024)
          writeFileSync(crashLogPath, tail, 'utf-8')
        }
      } catch {
        // 文件不存在或读失败：直接追加
      }
      appendFileSync(crashLogPath, entry)
    } catch {
      // 日志写失败不影响恢复
    }
    if (details?.reason === 'clean-exit') return
    // UX-13：崩溃感知——记录本次崩溃并决定提示等级（单次恢复 / 连崩安全模式），
    // reload 完成后向渲染层发 app:crash:notice，由渲染层弹 toast。
    const crashNotice = recordCrashAndDecide()
    setTimeout(() => {
      if (mainWindow.isDestroyed() || isShuttingDown) return
      mainWindow.webContents.reload()
      mainWindow.webContents.once('did-finish-load', () => {
        if (!mainWindow.isDestroyed() && !isShuttingDown) {
          mainWindow.webContents.send(CRASH_NOTICE_CHANNEL, crashNotice)
        }
      })
    }, 300)
  })

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' || isShuttingDown) return
    // 有运行中的会话时拦截：关窗会静默杀掉全部 agent，防护等级应高于删除单个会话。
    const runningCount = sessionManager.listSessions({ status: 'running' }).length
    if (runningCount > 0 && process.env.EASYSESSION_SKIP_CLOSE_CONFIRM !== '1') {
      event.preventDefault()
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: 'EasySession',
        message: `${runningCount} 个会话正在运行`,
        detail: '关闭应用会停止所有运行中的会话进程（会话记录保留，可再次启动）。',
        buttons: ['取消', '停止会话并关闭'],
        defaultId: 0,
        cancelId: 0,
        noLink: true
      })
      if (choice !== 1) return
    }
    event.preventDefault()
    void shutdownApp()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC Handlers
ipcMain.handle('app:getVersion', () => {
  return app.getVersion()
})

ipcMain.handle('app:getPlatform', () => {
  return process.platform
})

// 取当前主窗口（用于通知点击聚焦、任务栏闪烁等）。无可用窗口时返回 null。
function getMainWindow(): BrowserWindow | null {
  const win = BrowserWindow.getAllWindows()[0]
  return win && !win.isDestroyed() ? win : null
}

// 系统级未读角标：跨平台设置 app badge；Windows 额外闪烁任务栏（count>0 闪、归 0 停）。
ipcMain.handle('app:setBadgeCount', (_event, count: number) => {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0
  try {
    app.setBadgeCount(n)
  } catch {
    // 部分平台/环境不支持 badge，忽略即可。
  }
  if (process.platform === 'win32') {
    getMainWindow()?.flashFrame(n > 0)
  }
  return { ok: true }
})

// 系统级用户提醒：弹系统通知；点击后聚焦主窗口并向渲染层发 collab:focus(taskId) 以跳转。
ipcMain.handle(
  'app:notifyUser',
  (_event, payload: { title: string; body: string; taskId?: string }) => {
    if (!payload || typeof payload !== 'object') throw new Error('参数 payload 必须为对象')
    const { title, body, taskId } = payload
    if (typeof title !== 'string' || !title) throw new Error('参数 title 必须为非空字符串')
    if (typeof body !== 'string') throw new Error('参数 body 必须为字符串')
    if (taskId !== undefined && typeof taskId !== 'string') {
      throw new Error('参数 taskId 必须为字符串')
    }
    if (!Notification.isSupported()) return { ok: false, error: '当前系统不支持通知' }
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      const win = getMainWindow()
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      win.webContents.send('collab:focus', taskId)
    })
    notification.show()
    return { ok: true }
  }
)

// 终端间通信：UI 把文本发送到另一个会话（人触发，走 agent bus 注入门控）。
ipcMain.handle('session:sendTo', (_event, targetId: string, text: string) => {
  if (typeof targetId !== 'string' || !targetId) throw new Error('参数 targetId 必须为非空字符串')
  if (typeof text !== 'string' || !text.trim()) throw new Error('参数 text 必须为非空字符串')
  return agentBus.sendFromUI(targetId, text)
})

// Agent 协作面板：拉取在线会话、任务板与消息流快照。
ipcMain.handle('bus:snapshot', () => agentBus.snapshot())

// 群发消息：targetIds 为目标会话数组，逐个投递并聚合结果（>=1 成功即 ok:true）。
// 兼容旧单目标调用方：传入单个 string 时按单元素数组处理（前端切换窗口期不报错）。
ipcMain.handle('bus:sendMessage', (_event, targetIds: string[] | string, text: string) => {
  const ids = typeof targetIds === 'string' ? [targetIds] : targetIds
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: '参数 targetIds 必须为非空字符串数组' }
  }
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, error: '参数 text 必须为非空字符串' }
  }
  const results: BusTargetResult[] = ids.map((targetId) => {
    if (typeof targetId !== 'string' || !targetId) {
      return { targetId: String(targetId), ok: false, error: '目标 id 必须为非空字符串' }
    }
    const r = agentBus.sendFromUI(targetId, text)
    return { targetId, ok: r.ok, error: r.error }
  })
  return aggregateBusResults(results)
})

// 批量建任务：对 targetIds 每个目标各建一条任务，聚合结果；单目标成功时回填 taskId。
// 兼容旧单目标调用方：传入单个 string 时按单元素数组处理（前端切换窗口期不报错）。
ipcMain.handle('bus:createTask', (_event, targetIds: string[] | string, title: string) => {
  const ids = typeof targetIds === 'string' ? [targetIds] : targetIds
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: '参数 targetIds 必须为非空字符串数组' }
  }
  if (typeof title !== 'string' || !title.trim()) {
    return { ok: false, error: '参数 title 必须为非空字符串' }
  }
  const results: BusTargetResult[] = ids.map((targetId) => {
    if (typeof targetId !== 'string' || !targetId) {
      return { targetId: String(targetId), ok: false, error: '目标 id 必须为非空字符串' }
    }
    const r = agentBus.createTaskFromUI(targetId, title)
    return { targetId, ok: r.ok, error: r.error, taskId: r.taskId }
  })
  return aggregateBusResults(results)
})

ipcMain.handle('bus:taskTransition', (_event, taskId: string, action: string, text?: string) => {
  if (typeof taskId !== 'string' || !taskId) throw new Error('参数 taskId 必须为非空字符串')
  if (action !== 'confirm' && action !== 'cancel' && action !== 'unblock') {
    throw new Error('参数 action 无效')
  }
  if (text !== undefined && typeof text !== 'string') throw new Error('参数 text 必须为字符串')
  return agentBus.transitionTaskFromUI(taskId, action, text)
})

ipcMain.handle('bus:getCollabSkill', () => getEsSkillMarkdown())

ipcMain.handle('bus:setTaskStatus', (_event, taskId: string, status: string, text?: string) => {
  if (typeof taskId !== 'string' || !taskId) throw new Error('参数 taskId 必须为非空字符串')
  if (!isAgentTaskStatus(status)) throw new Error('参数 status 无效')
  if (text !== undefined && typeof text !== 'string') throw new Error('参数 text 必须为字符串')
  return agentBus.setTaskStatusFromUI(taskId, status, text)
})

// 归档/取消归档：正交标记，仅终态任务可归档（前端按 archivedAt 区分活跃/归档视图）。
ipcMain.handle('bus:archiveTask', (_event, taskId: string) => {
  if (typeof taskId !== 'string' || !taskId) throw new Error('参数 taskId 必须为非空字符串')
  return agentBus.archiveTaskFromUI(taskId)
})

ipcMain.handle('bus:unarchiveTask', (_event, taskId: string) => {
  if (typeof taskId !== 'string' || !taskId) throw new Error('参数 taskId 必须为非空字符串')
  return agentBus.unarchiveTaskFromUI(taskId)
})

ipcMain.handle('bus:setSessionCollabMode', (_event, sessionId: string, mode: string) => {
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('参数 sessionId 必须为非空字符串')
  if (
    mode !== 'known-agent' &&
    mode !== 'terminal-readonly' &&
    mode !== 'terminal-nudge' &&
    mode !== 'terminal-inject'
  ) {
    throw new Error('参数 mode 无效')
  }
  return agentBus.setSessionCollabMode(sessionId, mode)
})

function isAgentTaskStatus(value: string): value is Parameters<typeof agentBus.setTaskStatusFromUI>[1] {
  return (
    value === 'created' ||
    value === 'delivered' ||
    value === 'accepted' ||
    value === 'in_progress' ||
    value === 'blocked' ||
    value === 'review' ||
    value === 'done' ||
    value === 'failed' ||
    value === 'rejected' ||
    value === 'cancelled' ||
    value === 'expired'
  )
}

ipcMain.handle('window:minimize', (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})

ipcMain.handle('window:maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.isMaximized() ? win.unmaximize() : win.maximize()
  }
})

ipcMain.handle('window:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return

  if (process.platform === 'darwin') {
    win.close()
    return
  }

  void shutdownApp()
})

async function selectFolderDialog(event: Electron.IpcMainInvokeEvent) {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return null
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
}

ipcMain.handle('dialog:selectFolder', selectFolderDialog)

ipcMain.handle('shell:openPath', async (_event, targetPath: string) => {
  return shell.openPath(targetPath)
})

ipcMain.handle('cli:check', (_event, cliName: string, preferredPath?: string) => {
  if (process.env.NODE_ENV === 'test') return Promise.resolve({ available: false })
  // FEAT-2：可探测 CLI 白名单由注册表派生（有 settingsPathKey 的即需要 PATH 探测）。
  const allowedClis = getProbeableCliIds()
  if (!allowedClis.includes(cliName)) return Promise.resolve({ available: false })

  const normalizedPreferredPath =
    typeof preferredPath === 'string' && preferredPath.trim().length > 0
      ? preferredPath.trim()
      : null

  if (normalizedPreferredPath) {
    return new Promise((resolve) => {
      // 坏 shim/挂起的可执行文件不能让可用性检测永久 pending，统一 5s 超时。
      // execFile + shell:false（SEC-2）：preferredPath 来自 renderer，绝不能经 shell 拼接，
      // 否则路径内含引号即可在 cmd.exe 逃逸成任意命令注入。
      execFile(normalizedPreferredPath, ['--version'], { shell: false, timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve({ available: false, path: normalizedPreferredPath })
          return
        }
        resolve({
          available: true,
          path: normalizedPreferredPath,
          version: String(stdout).trim() || undefined
        })
      })
    })
  }

  const cmd = process.platform === 'win32' ? `where ${cliName}` : `which ${cliName}`
  return new Promise((resolve) => {
    exec(cmd, { timeout: 5000 }, (error, stdout) => {
      if (error) {
        resolve({ available: false })
        return
      }
      const cliPath = stdout.trim().split('\n')[0]
      exec(`${cliName} --version`, { timeout: 5000 }, (verErr, verOut) => {
        resolve({
          available: true,
          path: cliPath,
          version: verErr ? undefined : verOut.trim()
        })
      })
    })
  })
})

// Expose for e2e tests
if (process.env.NODE_ENV === 'test') {
  ;(global as any).__projectManager__ = projectManager
}

if (hasSingleInstanceLock) {
app.whenReady().then(async () => {
  try {
    const userData = app.getPath('userData')
    sessionManager.setStore(new DataStore(join(userData, 'sessions.json')))
    // 启用输出日志（output journal）：会话退出/应用关停时落最近 2000 条输出，重启后回灌。
    outputManager.setJournalDir(join(userData, 'output-journal'))
    remoteInstanceManager = new RemoteInstanceManager(userData)
    remoteNetworkSettingsManager = new RemoteNetworkSettingsManager(userData)
    remoteGatewayManager = new RemoteGatewayManager(remoteInstanceManager)
    cliManager.setRemoteNetworkSettingsManager(remoteNetworkSettingsManager)
    remoteServiceManager = new RemoteServiceManager(
      {
        sessionManager,
        projectManager,
        outputManager,
        openCodeAdapter,
        nativeSessionCandidates: async (cliType, projectPath, preferredPath, maxCount) => {
          if (cliType === 'opencode') {
            return openCodeAdapter.collectSessionCandidatesByPath(projectPath, preferredPath, maxCount)
          }
          if (cliType === 'codex') {
            return codexAdapter.collectSessionCandidatesByPath(projectPath, maxCount)
          }
          const collector = candidateCollectorFor(cliType)
          return collector ? collector(projectPath, preferredPath, maxCount) : []
        }
      },
      userData
    )
    cloudflareTunnelManager = new CloudflareTunnelManager(
      userData,
      remoteServiceManager,
      remoteNetworkSettingsManager
    )

    const [projectResult, sessionResult, workspaceResult, remoteInstanceResult, remoteNetworkSettingsResult, remoteServiceResult, cloudflareTunnelResult] = await Promise.allSettled([
      projectManager.init(),
      sessionManager.loadSessions(),
      workspaceLayoutManager.init(),
      remoteInstanceManager.init(),
      remoteNetworkSettingsManager.init(),
      remoteServiceManager.init(),
      cloudflareTunnelManager.init()
    ])

    if (projectResult.status === 'rejected') {
      log.error({ err: projectResult.reason }, '[init] project init failed')
    }
    if (sessionResult.status === 'rejected') {
      log.error({ err: sessionResult.reason }, '[init] session load failed')
    }
    // STAB-7：会话清单加载后清理孤儿 journal（sessions.json 恢复/删除中断留下的残留文件）。
    void outputManager
      .reconcileJournals(sessionManager.listSessions().map((s) => s.id))
      .catch((err) => log.warn({ err }, '[init] journal reconcile failed'))
    if (workspaceResult.status === 'rejected') {
      log.error({ err: workspaceResult.reason }, '[init] workspace layout init failed')
    }
    if (remoteInstanceResult.status === 'rejected') {
      log.error({ err: remoteInstanceResult.reason }, '[init] remote instance init failed')
    }
    if (remoteNetworkSettingsResult.status === 'rejected') {
      log.error({ err: remoteNetworkSettingsResult.reason }, '[init] remote network settings init failed')
    }
    if (remoteServiceResult.status === 'rejected') {
      log.error({ err: remoteServiceResult.reason }, '[init] remote service init failed')
    }
    if (cloudflareTunnelResult.status === 'rejected') {
      log.error({ err: cloudflareTunnelResult.reason }, '[init] cloudflare tunnel init failed')
    }

    registerRemoteInstanceHandlers(remoteInstanceManager)
    registerRemoteServiceHandlers(remoteServiceManager)
    registerCloudflareTunnelHandlers(cloudflareTunnelManager)
    registerRemoteNetworkHandlers(remoteNetworkSettingsManager)
    registerRemoteGatewayHandlers(remoteGatewayManager)

    // 启动 agent bus（终端 / agent 间通信），并把 es 环境注入与 claude 系统提示挂上。
    // 不阻塞首窗：bus 初始化（文件 I/O + listen）与窗口加载并行，未就绪时 env provider 返回 null。
    const agentBusStart = (async () => {
      try {
        await agentBus.start({ userDataDir: userData, electronPath: process.execPath })
        // env provider 始终挂上：bus 未就绪时 getEnvBundle 返回 null，buildSpawnEnv 自动跳过。
        cliManager.setAgentBusEnvProvider((pid) => agentBus.getEnvBundle(pid))
        if (agentBus.isReady()) {
          claudeAdapter.setAppendSystemPrompt(ES_SYSTEM_PROMPT_HINT)
          geminiAdapter.setAppendSystemPrompt(ES_SYSTEM_PROMPT_HINT)
          piAdapter.setAppendSystemPrompt(ES_SYSTEM_PROMPT_HINT)
          ompAdapter.setAppendSystemPrompt(ES_SYSTEM_PROMPT_HINT)
          grokAdapter.setAppendSystemPrompt(ES_SYSTEM_PROMPT_HINT)
          hermesAdapter.setAppendSystemPrompt(ES_SYSTEM_PROMPT_HINT)
        } else {
          // 未就绪时不挂 es 系统提示（避免 claude 误以为有 es 可用）；协作面板会显示不可用横幅。
          log.error({ err: agentBus.getStartError() }, '[init] agent bus 未就绪，终端间协作不可用')
        }
      } catch (err) {
        log.error({ err }, '[init] agent bus 启动失败')
      }
    })()
    cliManager.setAgentBusEnvProvider((pid) => agentBus.getEnvBundle(pid))
    void agentBusStart

    electronApp.setAppUserModelId('com.easysession')

    if (isHeadless) {
      // 引擎模式：不创建窗口。服务（会话/终端 + remote）已在上文启动完成，
      // 进程生命周期交给外部宿主：控制端口（默认 19765，EASYSESSION_CONTROL_PORT
      // 可改）收 quit 命令优雅关停（GUI 子系统进程的 stdin 管道在 Windows 上
      // 不可靠，控制端口是主通道；信号仍作兜底注册）。
      // SEC-12：鉴权 + 按行分帧 + 空闲超时，全部收口在 HeadlessControlServer。
      log.info('[main] headless engine ready (no window); remote 服务由 EASYSESSION_REMOTE_* 配置')
      const requestShutdown = (): void => {
        if (isShuttingDown) return
        log.info('[main] headless engine shutdown requested')
        void shutdownApp()
      }
      const controlPort = Number.parseInt(process.env.EASYSESSION_CONTROL_PORT ?? '19765', 10)
      const controlToken = process.env.EASYSESSION_CONTROL_TOKEN
      const headlessControl = new HeadlessControlServer({ port: controlPort, requestShutdown, token: controlToken })
      headlessControl.listen()
      app.on('will-quit', () => headlessControl.dispose())
      // stdin 兜底仅在确认可读/TTY 时注册：Windows GUI 子系统下 detached 进程的
      // stdin 可能立即 emit 'end'，导致引擎随机自退。
      try {
        if (process.stdin && (process.stdin.isTTY || process.stdin.readable)) {
          process.stdin.on('data', (chunk: Buffer | string) => {
            if (String(chunk).trim().toLowerCase() === 'quit') requestShutdown()
          })
        }
      } catch {
        // stdin 不可用：控制端口与信号仍可关停
      }
      process.on('SIGINT', requestShutdown)
      process.on('SIGTERM', requestShutdown)
      return
    }

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  } catch (err) {
    log.error({ err }, '[App] init failed')
    app.quit()
  }
})
}

app.on('before-quit', (event) => {
  if (!hasSingleInstanceLock) return
  if (isShuttingDown) return
  event.preventDefault()
  void shutdownApp()
})

app.on('window-all-closed', () => {
  if (!hasSingleInstanceLock) return
  if (process.platform === 'darwin') {
    return
  }
  void shutdownApp()
})
