import { afterAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, symlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, resolve, sep } from 'path'
import { cliEnvironment, executeCli, findCliExecutable, parseShellEnvironment, prepareCliCommand, shellEnvironmentCommand } from '../src/main/services/cli-runtime'

const root = mkdtempSync(join(tmpdir(), 'es-cli-runtime-'))
afterAll(() => {
  if (!resolve(root).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe fixture cleanup')
  rmSync(root, {recursive:true,force:true})
})
function file(path: string, content: string) { mkdirSync(dirname(path),{recursive:true});writeFileSync(path,content);chmodSync(path,0o755);return path }

describe('Shared CLI environment and execution', () => {
  it('preserves environment and PATH order, avoiding duplicate Windows keys', () => {
    const env = cliEnvironment({platform:'win32',homeDir:'C:\\Users\\tester',env:{Path:'C:\\chosen;C:\\other',TOKEN:'secret'}})
    expect(env.Path).toBeUndefined()
    expect(env.PATH?.startsWith('C:\\chosen;C:\\other;')).toBe(true)
    expect(env.TOKEN).toBe('secret')
    expect(env.PATH).toContain('.bun\\bin')
  })
  it('adds Unix fallbacks without overriding the selected version manager', () => {
    const env = cliEnvironment({platform:'darwin',homeDir:'/Users/tester',env:{PATH:'/selected/node/bin:/usr/bin'}})
    expect(env.PATH?.startsWith('/selected/node/bin:/usr/bin:')).toBe(true)
    expect(env.PATH).toContain('/opt/homebrew/bin')
    expect(env.PATH).toContain('/Users/tester/.local/bin')
  })
  it('only accepts environment data between markers, excluding app control variables', () => {
    const env = parseShellEnvironment(`noise\nMARK\n${JSON.stringify({PATH:'/chosen', CODEX_HOME:'/custom', ELECTRON_RUN_AS_NODE:'1', EASYSESSION_TOKEN:'bad', NODE_OPTIONS:'bad', INVALID_VALUE:42})}\nMARK\nmore noise`,'MARK')
    expect(env).toEqual({PATH:'/chosen',CODEX_HOME:'/custom'})
    expect(()=>parseShellEnvironment('no marker','MARK')).toThrow()
  })
  it('preserves multiline shell values without interpreting their contents as variables', () => {
    const values = { PATH: '/chosen', MULTILINE: 'first\nCODEX_HOME=/not-a-variable\nlast', EQUALS: 'a=b', EMPTY: '' }
    const env = parseShellEnvironment(`noise\nMARK\n${JSON.stringify(values)}\nMARK\nnoise`, 'MARK')
    expect(env).toEqual(values)
    expect(env.CODEX_HOME).toBeUndefined()
  })
  it.each(['[]', 'null', '42', 'not json'])('rejects malformed shell environment: %s', value => {
    expect(() => parseShellEnvironment(`MARK\n${value}\nMARK`, 'MARK')).toThrow('CLI_SHELL_ENV_INVALID')
  })
  it.runIf(process.platform !== 'win32')('recovers literal values through a real shell and a quoted runtime path', async () => {
    const executable = join(root, "node's runtime")
    symlinkSync(process.execPath, executable)
    const multiline = 'first\nCODEX_HOME=/not-a-variable\nlast'
    const { stdout } = await executeCli('/bin/sh', ['-c', shellEnvironmentCommand(executable, 'TEST_MARK')], {
      env: { PATH: '/usr/bin:/bin', MULTILINE: multiline, EQUALS: 'a=b', EMPTY: '' }
    })
    const recovered = parseShellEnvironment(stdout, 'TEST_MARK')
    expect(recovered.MULTILINE).toBe(multiline)
    expect(recovered.EQUALS).toBe('a=b')
    expect(recovered.EMPTY).toBe('')
    expect(recovered.CODEX_HOME).toBeUndefined()
    expect(recovered.ELECTRON_RUN_AS_NODE).toBeUndefined()
  })
  it('bounds a hung CLI even when it never writes output', async () => {
    const started=Date.now()
    await expect(executeCli(process.execPath,['-e','setInterval(()=>{},1000)'],{timeout:100})).rejects.toBeInstanceOf(Error)
    expect(Date.now()-started).toBeLessThan(2000)
  })
  it('does not consider directories or missing files executable', () => {
    mkdirSync(join(root,'not-a-file'),{recursive:true})
    expect(findCliExecutable(join(root,'not-a-file'))).toBeNull()
    expect(findCliExecutable(join(root,'not-installed'))).toBeNull()
  })
  it('resolves relative PATH entries against the requested working directory', () => {
    const cwd = join(root, 'project path')
    const name = process.platform === 'win32' ? 'project-cli.exe' : 'project-cli'
    const executable = file(join(cwd, 'tools', name), '#!/bin/sh\nexit 0\n')
    expect(findCliExecutable('project-cli', { cwd, env: { PATH: './tools' } })).toBe(executable)
    expect(prepareCliCommand('project-cli', [], { cwd, env: { PATH: './tools' } }).file).toBe(executable)
  })
  it('executes native programs with literal arguments, no shell expansion', async () => {
    const script=file(join(root,'echo args.cjs'),'console.log(JSON.stringify(process.argv.slice(2)))')
    const args=['& touch SHOULD_NOT_EXIST','%PATH%','$HOME','a"b','line\nbreak']
    const result=await executeCli(process.execPath,[script,...args])
    expect(JSON.parse(result.stdout)).toEqual(args)
  })
  it.runIf(process.platform==='win32')('unwraps npm cmd and ps1 shims into a runtime plus argument array', async () => {
    const bin=join(root,'npm with spaces')
    file(join(bin,'node_modules','fixture','main.cjs'),'console.log(JSON.stringify(process.argv.slice(2)))')
    const shim=file(join(bin,'fixture.cmd'),'@echo off\r\n"%_prog%" "%dp0%\\node_modules\\fixture\\main.cjs" %*\r\n')
    const ps1=file(join(bin,'fixture.ps1'),'# npm companion')
    const args=['--version','a&b','%PATH%','x"y']
    for (const command of [shim,ps1]) {
      const result=await executeCli(command,args,{env:{PATH:dirname(process.execPath)}})
      expect(JSON.parse(result.stdout)).toEqual(args)
    }
    const delegate=file(join(bin,'hermes.cmd'),`@echo off\r\n"${process.execPath}" %*`)
    expect((await executeCli(delegate,['-e','console.log("delegate")'])).stdout.trim()).toBe('delegate')
    const yarn=file(join(bin,'yarn-fixture.cmd'),'@echo off\r\n"node" "%~dp0/node_modules/fixture/main.cjs" %*\r\n')
    expect(JSON.parse((await executeCli(yarn,args,{env:{PATH:dirname(process.execPath)}})).stdout)).toEqual(args)
    const unsafe=file(join(bin,'arbitrary.cmd'),'@echo off\r\n%*\r\n')
    expect(()=>prepareCliCommand(unsafe,['--version'])).toThrow('CLI_SHIM_UNSUPPORTED')
  })
  it.runIf(process.platform!=='win32')('honors Unix executable permissions and shebangs', async () => {
    const shell=file(join(root,'fixture shell'),'#!/bin/sh\nprintf "%s" "$1"\n')
    expect((await executeCli(shell,['a&b;$HOME'])).stdout).toBe('a&b;$HOME')
    chmodSync(shell,0o644)
    expect(findCliExecutable(shell)).toBeNull()
  })
})
