import { afterEach, afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, posix, win32, resolve, sep } from 'path'
import { resolveCliConfigPath } from '../src/main/services/config-paths'
import { resolveCliRoot, resolveCliSessionsRoot } from '../src/main/services/cli-paths'
import { collectGeminiSessionCandidates, collectHermesSessionCandidates, collectPiSessionCandidates, HermesCandidatesUnsupportedError } from '../src/main/services/native-session-candidates'
import { ConfigService } from '../src/main/services/config-service'

const fixture = mkdtempSync(join(tmpdir(), 'es-platform-paths-'))
afterAll(() => {
  if (!resolve(fixture).startsWith(resolve(tmpdir()) + sep)) throw new Error('Unsafe fixture cleanup')
  rmSync(fixture, {recursive:true,force:true})
})
function write(file: string, text: string) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text) }
afterEach(() => vi.unstubAllEnvs())

describe.each(['linux', 'darwin', 'win32'] as const)('CLI path contracts (%s)', platform => {
  const p = platform === 'win32' ? win32 : posix
  const home = platform === 'win32' ? 'C:\\Users\\tester' : '/home/tester'
  const root = p.join(home, 'custom root')
  it.each([
    ['claude', 'CLAUDE_CONFIG_DIR', 'settings.json'], ['codex', 'CODEX_HOME', 'config.toml'],
    ['pi', 'PI_CODING_AGENT_DIR', 'settings.json'], ['grok', 'GROK_HOME', 'config.toml'],
    ['hermes', 'HERMES_HOME', 'config.yaml']
  ] as const)('%s follows its custom root', (cli, variable, filename) => {
    expect(resolveCliConfigPath(cli, { platform, homeDir: home, env: { [variable]: root } })).toBe(p.join(root, filename))
  })
  it('Gemini HOME is not its .gemini root', () => {
    expect(resolveCliConfigPath('gemini', {platform, homeDir:home,env:{GEMINI_CLI_HOME:root}})).toBe(p.join(root,'.gemini','settings.json'))
  })
  it('OpenCode follows XDG and explicit config paths', () => {
    expect(resolveCliConfigPath('opencode',{platform,homeDir:home,env:{XDG_CONFIG_HOME:root}})).toBe(p.join(root,'opencode','opencode.json'))
    expect(resolveCliConfigPath('opencode',{platform,homeDir:home,env:{OPENCODE_CONFIG:p.join(root,'custom.jsonc')}})).toBe(p.join(root,'custom.jsonc'))
  })
  it('Pi expands ~ and honors independent session storage', () => {
    expect(resolveCliConfigPath('pi',{platform,homeDir:home,env:{PI_CODING_AGENT_DIR:'~/custom'}})).toBe(p.join(home,'custom','settings.json'))
    expect(resolveCliSessionsRoot('pi',{platform,homeDir:home,env:{PI_CODING_AGENT_SESSION_DIR:root}})).toBe(root)
  })
  it('OMP profile semantics match the CLI', () => {
    expect(resolveCliConfigPath('omp',{platform,homeDir:home,env:{OMP_PROFILE:'',PI_PROFILE:'work'}})).toBe(p.join(home,'.omp','agent','config.yml'))
    expect(resolveCliConfigPath('omp',{platform,homeDir:home,env:{OMP_PROFILE:'work',PI_CODING_AGENT_DIR:root}})).toBe(p.join(home,'.omp','profiles','work','agent','config.yml'))
    expect(resolveCliConfigPath('omp',{platform,homeDir:home,env:{PI_CONFIG_DIR:'.custom'}})).toBe(p.join(home,'.custom','agent','config.yml'))
    expect(()=>resolveCliRoot('omp',{platform,homeDir:home,env:{OMP_PROFILE:'../escape'}})).toThrow()
  })
  it('OMP uses migrated XDG data only where it exists', () => {
    const context = {platform,homeDir:home,env:{XDG_DATA_HOME:root},exists:()=>true}
    expect(resolveCliSessionsRoot('omp',context)).toBe(platform==='win32' ? p.join(home,'.omp','agent','sessions') : p.join(root,'omp','sessions'))
    expect(resolveCliSessionsRoot('omp',{...context,exists:()=>false})).toBe(p.join(home,'.omp','agent','sessions'))
  })
})

describe('Real config and discovery boundaries', () => {
  it('reads and preserves a selected OpenCode JSONC document', async () => {
    const root = join(fixture,'opencode')
    write(join(root,'opencode.json'),'{}')
    write(join(root,'opencode.jsonc'),'{// comment\n"model":"test",}')
    const service = new ConfigService({env:{OPENCODE_CONFIG_DIR:root}})
    const doc = await service.readConfig('opencode')
    expect(doc.path).toBe(join(root,'opencode.jsonc'))
    expect(doc.format).toBe('jsonc')
    expect(await service.getOpenCodeConfig()).toEqual({model:'test'})
    await expect(service.writeConfig('opencode',doc.content,doc.revision)).resolves.toMatchObject({content:doc.content})
  })
  it('Gemini and Pi discovery use the configured roots', async () => {
    const root = join(fixture,'custom-home'), project = join(fixture,'project'), id='12345678-1234-4234-8234-123456789abc'
    vi.stubEnv('GEMINI_CLI_HOME',root)
    write(join(root,'.gemini','tmp','bucket','.project_root'),project)
    write(join(root,'.gemini','tmp','bucket','chats','session-a.json'),JSON.stringify({sessionId:id,messages:[{type:'user',content:'fixture'}]}))
    expect(await collectGeminiSessionCandidates(project)).toHaveLength(1)
    const sessions = join(fixture,'pi-sessions')
    vi.stubEnv('PI_CODING_AGENT_SESSION_DIR',sessions)
    write(join(sessions,'session.jsonl'),JSON.stringify({type:'session',id,cwd:project})+'\n')
    expect(await collectPiSessionCandidates(project)).toHaveLength(1)
  })
  it('Hermes config and database agree on HERMES_HOME', async () => {
    const root=join(fixture,'hermes')
    vi.stubEnv('HERMES_HOME',root)
    let opened=''
    await collectHermesSessionCandidates(fixture,undefined,40,async file=>{opened=file;throw new HermesCandidatesUnsupportedError()}).catch(()=>undefined)
    expect(opened).toBe(join(root,'state.db'))
    expect(resolveCliConfigPath('hermes')).toBe(join(root,'config.yaml'))
  })
})
