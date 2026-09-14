// Run against the real Electron binary; never opens the user's app or data store.
const { spawn } = require('node:child_process')
const { existsSync } = require('node:fs')
const { resolve, join, dirname } = require('node:path')
const packaged = process.argv.includes('--packaged')
const dirIndex = process.argv.indexOf('--package-dir')
const packageDir = dirIndex >= 0 ? process.argv[dirIndex + 1] : process.argv.slice(2).find(arg => !arg.startsWith('--')) || 'release'
if (!packageDir) throw new Error('--package-dir requires a directory')
let executable, ptyRoot
if (packaged) {
  const candidates = process.platform === 'win32' ? ['release/win-unpacked/EasySession.exe']
    : process.platform === 'darwin' ? [`release/mac-${process.arch}/EasySession.app/Contents/MacOS/EasySession`, 'release/mac/EasySession.app/Contents/MacOS/EasySession']
      : [`release/linux-${process.arch}-unpacked/easysession`, 'release/linux-unpacked/easysession']
  executable = candidates.map(p => resolve(packageDir, p.replace(/^release\//, ''))).find(existsSync)
  if (!executable) throw new Error('Packaged application not found: ' + candidates.join(', '))
  const resources = process.platform === 'darwin' ? resolve(dirname(executable), '../Resources') : join(dirname(executable), 'resources')
  ptyRoot = join(resources, 'app.asar.unpacked', 'node_modules', 'node-pty')
  if (!existsSync(ptyRoot)) throw new Error('Packaged node-pty is missing: ' + ptyRoot)
} else {
  executable = require('electron')
  ptyRoot = dirname(require.resolve('node-pty/package.json'))
}
const child = spawn(executable, [resolve(__dirname, 'electron-runtime-smoke.cjs'), ptyRoot], {
  stdio: 'inherit', windowsHide: true,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '', EASYSESSION_SMOKE_EXPECTED_ELECTRON: require('../package.json').devDependencies.electron }
})
const timeout = setTimeout(() => { child.kill(); process.exitCode = 1 }, 20000)
child.on('error', error => { clearTimeout(timeout); console.error(error); process.exitCode = 1 })
child.on('exit', (code, signal) => { clearTimeout(timeout); process.exitCode = signal ? 1 : code ?? 1 })
