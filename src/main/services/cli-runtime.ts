import { execFile } from 'child_process'
import { accessSync, constants, readFileSync, statSync, openSync, readSync, closeSync } from 'fs'
import { randomUUID } from 'crypto'
import { expandCliPath, pathContext, type CliPathContext } from './cli-paths'

export interface CliExecutionContext extends CliPathContext {
  env?: NodeJS.ProcessEnv
}
export interface CliLaunchCommand {
  file: string
  args: string[]
  env: NodeJS.ProcessEnv
}

function pathValue(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  const key = platform === 'win32' ? Object.keys(env).find(k => k.toLowerCase() === 'path') : 'PATH'
  return (key ? env[key] : '') || ''
}

export function executableFallbackDirs(context?: CliExecutionContext): string[] {
  const c = pathContext(context)
  const user = [c.path.join(c.home, '.local', 'bin'), c.path.join(c.home, '.bun', 'bin'), c.path.join(c.home, '.volta', 'bin')]
  return c.platform === 'win32' ? [
    ...user,
    c.path.join(c.env.APPDATA || c.path.join(c.home, 'AppData', 'Roaming'), 'npm'),
    c.path.join(c.env.LOCALAPPDATA || c.path.join(c.home, 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links'),
    c.path.join(c.env.LOCALAPPDATA || c.path.join(c.home, 'AppData', 'Local'), 'hermes', 'bin')
  ] : [
    ...user, c.path.join(c.home, '.npm-global', 'bin'), c.path.join(c.home, '.local', 'share', 'pnpm'),
    c.path.join(c.home, '.cargo', 'bin'), c.path.join(c.home, '.opencode', 'bin'), c.path.join(c.home, '.hermes', 'bin'),
    '/opt/homebrew/bin', '/usr/local/bin', '/home/linuxbrew/.linuxbrew/bin', '/usr/bin', '/bin'
  ]
}

export function cliEnvironment(context?: CliExecutionContext): NodeJS.ProcessEnv {
  const c = pathContext(context)
  const env = { ...c.env }
  const seen = new Set<string>()
  const paths = [...pathValue(env, c.platform).split(c.path.delimiter), ...executableFallbackDirs(context)]
    .filter(dir => {
      if (!dir) return false
      const key = c.platform === 'win32' ? dir.toLowerCase() : dir
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  // Windows environment names are case-insensitive: never emit both PATH and Path.
  if (c.platform === 'win32') for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key]
  env.PATH = paths.join(c.path.delimiter)
  return env
}

function executableFile(file: string, platform: NodeJS.Platform): boolean {
  try {
    if (!statSync(file).isFile()) return false
    accessSync(file, platform === 'win32' ? constants.F_OK : constants.X_OK)
    return true
  } catch { return false }
}

export function findCliExecutable(command: string, context?: CliExecutionContext): string | null {
  const c = pathContext(context)
  const name = command.trim()
  if (!name || /[\r\n\0]/.test(name)) return null
  if (/[/\\]/.test(name) || c.path.isAbsolute(name) || name.startsWith('~')) {
    const file = expandCliPath(name, context)
    return executableFile(file, c.platform) ? file : null
  }
  const extensions = c.platform === 'win32' && !c.path.extname(name) ? ['.exe', '.cmd', '.bat', '.com', ''] : ['']
  for (const dir of (cliEnvironment(context).PATH || '').split(c.path.delimiter)) {
    if (!dir) continue
    for (const ext of extensions) {
      const file = c.path.resolve(c.cwd, dir, name + ext)
      if (executableFile(file, c.platform)) return file
    }
  }
  return null
}

/** Resolve generated npm shims without passing user-controlled arguments through cmd.exe. */
export function prepareCliCommand(command: string, args: string[], context?: CliExecutionContext): CliLaunchCommand {
  const c = pathContext(context)
  const env = cliEnvironment(context)
  let file = findCliExecutable(command, { ...context, env }) || command.trim()
  if (!file || /[\r\n\0]/.test(file)) throw new Error('CLI_INVALID_EXECUTABLE')
  if (c.platform !== 'win32' || !/\.(?:cmd|bat|ps1)$/i.test(file)) return { file, args, env }
  if (/\.ps1$/i.test(file)) file = file.replace(/\.ps1$/i, '.cmd')
  let shim: string
  try {
    if (statSync(file).size > 64 * 1024) throw new Error('oversized shim')
    shim = readFileSync(file, 'utf8')
  } catch { throw new Error('CLI_SHIM_UNSUPPORTED: select the native executable or npm-generated .cmd launcher') }
  // Official Hermes uses a pure native delegator for relocatable Python venvs.
  // Only unwrap this exact form; never ignore arbitrary batch commands or SETs.
  const delegate = shim.trim().match(/^@echo off\r?\n"([^"\r\n%]+\.exe)"\s+%\*$/i)
  if (delegate && c.path.isAbsolute(delegate[1])) return {file:delegate[1],args,env}
  // npm cmd-shim: "%_prog%" "%dp0%\node_modules\package\entry.js" %*
  const match = shim.match(/"(?:%dp0%|%~dp0)[\\/]*([^"\r\n%]+)"\s+%\*/i)
  if (!match || !/(?:^|[\\/])node_modules[\\/]/i.test(match[1])) {
    throw new Error('CLI_SHIM_UNSUPPORTED: select the native executable or npm-generated .cmd launcher')
  }
  const target = c.path.resolve(c.path.dirname(file), match[1])
  if (/\.(exe|com)$/i.test(target)) return { file: target, args, env }
  let header: string
  try {
    const fd = openSync(target, 'r')
    try {
      const buffer = Buffer.alloc(256)
      header = buffer.subarray(0, readSync(fd, buffer, 0, buffer.length, 0)).toString('utf8')
    } finally { closeSync(fd) }
  } catch { throw new Error('CLI_SHIM_TARGET_MISSING') }
  if (header.startsWith('MZ')) return {file:target,args,env}
  const runtime = /^#![^\r\n]*\bbun\b/.test(header) ? 'bun' : /^#![^\r\n]*\bnode\b/.test(header) || /\.[cm]?js$/i.test(target) ? 'node' : null
  if (!runtime) throw new Error('CLI_SHIM_UNSUPPORTED: launcher runtime cannot be determined safely')
  const bundled = c.path.join(c.path.dirname(file), runtime + '.exe')
  const executable = executableFile(bundled, c.platform) ? bundled : findCliExecutable(runtime, { ...context, env })
  if (!executable) throw new Error(`CLI_RUNTIME_NOT_FOUND: ${runtime}`)
  return { file: executable, args: [target, ...args], env }
}

export interface ExecuteCliOptions extends CliExecutionContext {
  timeout?: number
  maxBuffer?: number
}
export function executeCli(command: string, args: string[], options: ExecuteCliOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const launch = prepareCliCommand(command, args, options)
    const timeout = Math.max(1, Math.min(60000, options.timeout ?? 5000))
    let settled = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    const finish = (error: Error | null, stdout = '', stderr = '') => {
      if (settled) return
      settled = true
      if (deadline) clearTimeout(deadline)
      if (error) reject(error)
      else resolve({stdout:String(stdout),stderr:String(stderr)})
    }
    const child = execFile(launch.file, launch.args, {
      cwd: options.cwd, env: launch.env, shell: false, windowsHide: true,
      timeout, killSignal: 'SIGKILL', maxBuffer: options.maxBuffer ?? 1024 * 1024
    }, (error, stdout, stderr) => finish(error, String(stdout ?? ''), String(stderr ?? '')))
    // A login script can leave a descendant holding stdout open. Do not wait
    // indefinitely for ChildProcess's close event after the parent has exited.
    if (!settled) {
      deadline = setTimeout(() => {
        finish(new Error('CLI_EXECUTION_TIMEOUT'))
        child?.stdout?.destroy()
        child?.stderr?.destroy()
        try { child?.kill?.('SIGKILL') } catch { /* the process may have already exited */ }
      }, timeout + 100)
      deadline.unref()
    }
  })
}

export async function cliVersion(command: string, preferredPath?: string): Promise<string> {
  const result = await executeCli(preferredPath?.trim() || command, ['--version'])
  return result.stdout.trim() || result.stderr.trim()
}

export async function checkCli(command: string, preferredPath?: string): Promise<{ available: boolean; path?: string; version?: string; reason?: string }> {
  const path = findCliExecutable(preferredPath?.trim() || command)
  if (!path) return { available: false, path: preferredPath, reason: 'CLI_NOT_FOUND' }
  try {
    return { available: true, path, version: await cliVersion(path) }
  } catch (error) {
    return { available: false, path, reason: error instanceof Error ? error.message : String(error) }
  }
}

/** Use the bundled runtime rather than env -0 (unavailable on older macOS).
 * JSON preserves newlines and equals signs inside values. Nothing is evaluated
 * from shell output, and executable paths remain one literal shell argument.
 */
export function shellEnvironmentCommand(executable: string, marker: string): string {
  const quote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'"
  const script = 'process.stdout.write(JSON.stringify(process.env))'
  return `printf '%s\\n' ${quote(marker)}; /usr/bin/env ELECTRON_RUN_AS_NODE=1 ${quote(executable)} -e ${quote(script)}; printf '\\n%s\\n' ${quote(marker)}`
}

export function parseShellEnvironment(output: string, marker: string): NodeJS.ProcessEnv {
  const start = output.indexOf(marker + '\n')
  const end = output.indexOf('\n' + marker, start + marker.length + 1)
  if (start < 0 || end < 0) throw new Error('CLI_SHELL_ENV_INVALID')
  let values: unknown
  try { values = JSON.parse(output.slice(start + marker.length + 1, end)) }
  catch { throw new Error('CLI_SHELL_ENV_INVALID') }
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('CLI_SHELL_ENV_INVALID')
  const env: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(values)) {
    if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z_0-9]*$/.test(key)
      || /^(?:ELECTRON_|EASYSESSION_|NODE_OPTIONS$|NODE_PATH$|PWD$|OLDPWD$|SHLVL$|_$)/.test(key)) continue
    env[key] = value
  }
  return env
}

let initialization: Promise<void> | undefined
/** Run once, before any window/remote endpoint is exposed. Never block the main thread. */
export function initializeCliEnvironment(): Promise<void> {
  return initialization ??= (async () => {
    if (process.platform !== 'win32' && process.env.NODE_ENV !== 'test') {
      const shell = process.env.SHELL || (process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash')
      const marker = `ES_ENV_${randomUUID().replace(/-/g, '')}`
      try {
        const { stdout } = await executeCli(shell, ['-ilc', shellEnvironmentCommand(process.execPath, marker)], { timeout: 5000 })
        const recovered = parseShellEnvironment(stdout.replace(/\r\n/g, '\n'), marker)
        const inherited = { ...process.env }
        for (const [key, value] of Object.entries(recovered)) if (value !== undefined && inherited[key] === undefined) process.env[key] = value
        if (recovered.PATH) process.env.PATH = `${recovered.PATH}:${inherited.PATH || ''}`
      } catch {
        // Broken/interactive startup files must not prevent the desktop from opening.
      }
    }
    const env = cliEnvironment()
    if (process.platform === 'win32') for (const key of Object.keys(process.env)) if (key.toLowerCase() === 'path') delete process.env[key]
    process.env.PATH = env.PATH
  })()
}
