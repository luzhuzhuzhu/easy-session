import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'
import ts from 'typescript'
import { nativeSessionPathOptions, discoveryForPathOptions } from '../src/shared/native-session-path-options'
import { discoverNativeSessions } from '../src/main/services/native-session-discovery'
import { getBuiltinArgDescriptors } from '../src/renderer/src/models/cli-launch-args'
import { GeminiAdapter } from '../src/main/services/gemini-adapter'
import { HermesAdapter } from '../src/main/services/hermes-adapter'

afterEach(() => vi.restoreAllMocks())

describe('Per-CLI capabilities and profile isolation', () => {
  it('extracts only path selectors valid for this CLI, not arbitrary shell text', () => {
    expect(nativeSessionPathOptions('omp',[{name:'--profile=work'},{name:'--session-dir',value:'relative sessions'}])).toEqual({profile:'work',sessionDir:'relative sessions'})
    expect(nativeSessionPathOptions('hermes',[{name:'-p',value:'work'}])).toEqual({profile:'work'})
    expect(nativeSessionPathOptions('pi',[{name:'--profile',value:'work'}])).toBeUndefined()
    expect(nativeSessionPathOptions('omp',[{name:'--'},{name:'--profile',value:'text'}])).toBeUndefined()
  })
  it('never uses default-profile candidates returned by an older remote', () => {
    const payload={status:'ready',candidates:[{id:'wrong-profile',title:'wrong'}]}
    expect(discoveryForPathOptions(payload,{profile:'work'})).toMatchObject({status:'unsupported',candidates:[]})
    expect(discoveryForPathOptions({...payload,pathContextApplied:true},{profile:'work'})).toMatchObject({status:'ready'})
    expect(discoveryForPathOptions(payload,{})).toMatchObject({status:'ready'})
  })
  it('forwards path context through real discovery without mutating process environment', async () => {
    const before=process.env.OMP_PROFILE
    const collector=vi.fn(async()=>[])
    const result=await discoverNativeSessions('omp','/project',undefined,{candidateCollectorFor:()=>collector},40,{profile:'work'})
    expect(collector).toHaveBeenCalledWith('/project',undefined,40,{profile:'work'})
    expect(result).toEqual({status:'empty',candidates:[],pathContextApplied:true})
    expect(process.env.OMP_PROFILE).toBe(before)
  })
  it.each([GeminiAdapter,HermesAdapter])('does not inject unsupported system-prompt flags into %s', Adapter => {
    const spawn=vi.fn(()=> 'process')
    const adapter=new Adapter({spawn} as never)
    // Recreate the old boot wiring when a legacy adapter still exposes this method.
    if ('setAppendSystemPrompt' in adapter) (adapter.setAppendSystemPrompt as (s:string)=>void)('context')
    adapter.startSession('/project')
    expect(spawn.mock.calls[0][2]).not.toContain('--append-system-prompt')
  })
  it('does not advertise OMP permission flags as built-in Pi flags', () => {
    expect(getBuiltinArgDescriptors('pi').map(d=>d.flag)).not.toContain('--approval-mode')
    expect(getBuiltinArgDescriptors('omp').map(d=>d.flag)).toContain('--approval-mode')
  })
})

describe('Terminal shell form uses target instance', () => {
  function form() {
    const source=readFileSync(resolve('src/renderer/src/components/SessionOptionsForm.vue'),'utf8').match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1]
    const ast=ts.createSourceFile('form.ts',source,ts.ScriptTarget.Latest,true)
    const funcs=ast.statements.filter(s=>ts.isFunctionDeclaration(s) && ['ensureShellsLoaded','syncShellChoice'].includes(s.name?.text || ''))
    const code=ts.transpileModule(funcs.map(f=>f.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText
    const local=vi.fn(async()=>[{id:'cmd',path:'C:\\Windows\\cmd.exe',label:'CMD'}])
    const remote=vi.fn(async()=>[{id:'bash',path:'/bin/bash',label:'Bash'}])
    const sandbox={props:{cliType:'terminal',instanceId:'remote-linux',initialOptions:{}},detectedShells:{value:[] as unknown[]},shellChoice:{value:''},customShellPath:{value:''},shellRequestSequence:0,shellsLoadedFor:'',LOCAL_INSTANCE_ID:'local',detectShells:local,getSharedGatewayResolver:()=>({resolve:async()=>({getShells:remote})})}
    const load=runInNewContext(code+'\nensureShellsLoaded',sandbox) as ()=>Promise<void>
    return {sandbox,load,local,remote}
  }
  it('loads remote shells but leaves the safe target-default selection', async () => {
    const {sandbox,load,local,remote}=form()
    await load()
    expect(local).not.toHaveBeenCalled()
    expect(remote).toHaveBeenCalledWith('remote-linux')
    expect(sandbox.detectedShells.value).toEqual([{id:'bash',path:'/bin/bash',label:'Bash'}])
    expect(sandbox.shellChoice.value).toBe('')
  })
  it('does not let an old target response overwrite the new target', async () => {
    const {sandbox,load,remote}=form()
    let finish!:(value: {id:string;path:string;label:string}[])=>void
    remote.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
    const pending=load()
    await Promise.resolve()
    sandbox.props.instanceId='remote-mac'
    await load()
    finish([{id:'old',path:'/old',label:'old'}])
    await pending
    expect(sandbox.shellsLoadedFor).toBe('remote-mac')
    expect(sandbox.detectedShells.value).not.toEqual([{id:'old',path:'/old',label:'old'}])
  })
})
