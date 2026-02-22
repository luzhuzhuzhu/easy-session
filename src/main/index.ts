import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { exec } from 'child_process'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { CliManager } from './services/cli-manager'
import { ClaudeAdapter } from './services/claude-adapter'
import { CodexAdapter } from './services/codex-adapter'
import { ConfigService } from './services/config-service'
import { SessionManager } from './services/session-manager'
import { ClaudeSessionLifecycle } from './services/claude-session-lifecycle'
import { CodexSessionLifecycle } from './services/codex-session-lifecycle'
import { ProjectManager } from './services/project-manager'
import { SkillManager } from './services/skill-manager'
import { DataStore } from './services/data-store'
import { registerAllHandlers } from './ipc'

import { SessionOutputManager } from './services/session-output'

const cliManager = new CliManager()
const claudeAdapter = new ClaudeAdapter(cliManager)
const codexAdapter = new CodexAdapter(cliManager)
const configService = new ConfigService()
const outputManager = new SessionOutputManager()
const claudeLifecycle = new ClaudeSessionLifecycle(claudeAdapter, outputManager)
const codexLifecycle = new CodexSessionLifecycle(codexAdapter, outputManager)
const sessionManager = new SessionManager(cliManager, claudeLifecycle, codexLifecycle, outputManager)
const projectManager = new ProjectManager()
const skillManager = new SkillManager(sessionManager)

const SHUTDOWN_FLUSH_WARN_MS = 12_000
const SHUTDOWN_START_CHANNEL = 'app:shutdown-start'
let isShuttingDown = false

registerAllHandlers({
  cliManager,
  claudeAdapter,
  codexAdapter,
  configService,
  sessionManager,
  projectManager,
  skillManager
})

async function flushAllStoresOnShutdown(): Promise<void> {
  let warned = false
  const warnTimer = setTimeout(() => {
    warned = true
    console.warn(
      `[shutdown] flush still running after ${SHUTDOWN_FLUSH_WARN_MS}ms, waiting for completion to protect data`
    )
  }, SHUTDOWN_FLUSH_WARN_MS)
  warnTimer.unref?.()

  const values = await Promise.allSettled([
    sessionManager.flush(),
    projectManager.flush()
  ]).finally(() => {
    clearTimeout(warnTimer)
  })

  if (warned) {
    console.warn('[shutdown] flush completed after extended wait')
  }

  for (const item of values) {
    if (item.status === 'rejected') {
      console.error('[shutdown] flush failed:', item.reason)
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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (event) => {
    if (process.platform === 'darwin' || isShuttingDown) return
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

ipcMain.handle('cli:check', (_event, cliName: string) => {
  if (process.env.NODE_ENV === 'test') return Promise.resolve({ available: false })
  const allowedClis = ['claude', 'codex']
  if (!allowedClis.includes(cliName)) return Promise.resolve({ available: false })
  const cmd = process.platform === 'win32' ? `where ${cliName}` : `which ${cliName}`
  return new Promise((resolve) => {
    exec(cmd, (error, stdout) => {
      if (error) {
        resolve({ available: false })
        return
      }
      const cliPath = stdout.trim().split('\n')[0]
      exec(`${cliName} --version`, (verErr, verOut) => {
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

app.whenReady().then(async () => {
  try {
    const userData = app.getPath('userData')
    sessionManager.setStore(new DataStore(join(userData, 'sessions.json')))

    const [projectResult, sessionResult] = await Promise.allSettled([
      projectManager.init(),
      sessionManager.loadSessions()
    ])

    if (projectResult.status === 'rejected') {
      console.error('[init] project init failed:', projectResult.reason)
    }
    if (sessionResult.status === 'rejected') {
      console.error('[init] session load failed:', sessionResult.reason)
    }

    electronApp.setAppUserModelId('com.easysession')

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
    console.error('[App] init failed:', err)
    app.quit()
  }
})

app.on('before-quit', (event) => {
  if (isShuttingDown) return
  event.preventDefault()
  void shutdownApp()
})

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') {
    return
  }
  void shutdownApp()
})
