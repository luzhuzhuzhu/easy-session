if (process.versions.electron !== process.env.EASYSESSION_SMOKE_EXPECTED_ELECTRON) throw new Error('Unexpected Electron version: ' + process.versions.electron)
const { DatabaseSync } = require('node:sqlite')
const pty = require(process.argv[2])
const { tmpdir } = require('node:os')
const db = new DatabaseSync(':memory:')
if (db.prepare('SELECT 1 AS ok').get().ok !== 1) throw new Error('SQLite query failed')
db.close()
console.log(JSON.stringify({ electron: process.versions.electron, node: process.versions.node, platform: process.platform, arch: process.arch, sqlite: 'ok' }))
const isWin = process.platform === 'win32'
const env = { ...process.env, ENV: '', BASH_ENV: '' }
const terminal = pty.spawn(isWin ? process.env.ComSpec || 'cmd.exe' : '/bin/sh', isWin ? ['/d', '/q'] : [], {
  cols: 80, rows: 24, cwd: tmpdir(), env
})
let output = '', sent = false
function send() {
  if (sent) return
  sent = true
  terminal.resize(100, 30)
  terminal.write(isWin ? 'set ES_SMOKE_PART=PTY_OK\r\necho ES_RUNTIME_%ES_SMOKE_PART%\r\nexit\r\n' : "printf 'ES_RUNTIME_%s\\n' PTY_OK; exit\n")
}
terminal.onData(data => { output += data; send() })
terminal.onExit(({ exitCode }) => {
  const ok = exitCode === 0 && output.includes('ES_RUNTIME_PTY_OK')
  console.log(JSON.stringify({ pty: ok ? 'ok' : 'failed', exitCode }))
  if (!ok) console.error(output)
  process.exit(ok ? 0 : 1)
})
setTimeout(send, 300)
setTimeout(() => { console.error('PTY smoke timed out'); terminal.kill(); process.exit(1) }, 10000)
