import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, dirname, resolve, sep } from 'path'
const state=vi.hoisted(()=>({home:'/not-read-before-test'}))
vi.mock('os',async importOriginal=>({...await importOriginal<typeof import('os')>(),homedir:()=>state.home}))
import { SkillManager } from '../src/main/services/skill-manager'
beforeAll(()=>{state.home=mkdtempSync(join(tmpdir(),'es-skill-paths-'))})
beforeEach(()=>{
  vi.stubEnv('CLAUDE_CONFIG_DIR',join(state.home,'claude'))
  vi.stubEnv('CODEX_HOME',join(state.home,'codex'))
  vi.stubEnv('XDG_CONFIG_HOME',join(state.home,'config'))
  vi.stubEnv('OPENCODE_CONFIG_DIR',join(state.home,'custom'))
})
afterEach(()=>vi.unstubAllEnvs())
afterAll(()=>{
  if (!resolve(state.home).startsWith(resolve(tmpdir())+sep)) throw new Error('Unsafe fixture cleanup')
  rmSync(state.home,{recursive:true,force:true})
})
describe('OpenCode skill directories',()=>{
  it('discovers both custom and global roots',async()=>{
    for (const [root,name] of [[join(state.home,'custom'),'Custom'],[join(state.home,'config','opencode'),'Global']]) {
      const file=join(root,'skills',name.toLowerCase(),'SKILL.md')
      mkdirSync(dirname(file),{recursive:true})
      writeFileSync(file, '# '+name+String.fromCharCode(10)+'Fixture instructions')
    }
    const skills=await new SkillManager({} as never).listSkills()
    expect(skills.filter(s=>s.sourceCli==='opencode').map(s=>s.name)).toEqual(expect.arrayContaining(['Custom','Global']))
  })
  it('creates in the configured primary root instead of a shadowed global directory',async()=>{
    const created=await new SkillManager({} as never).createSkill({name:'Created',slug:'created',description:'Fixture',prompt:'Fixture',compatibleCli:['opencode'],category:'user',inputSchema:{fields:[]},outputSchema:{format:'text'}})
    expect(created.filePath).toBe(join(state.home,'custom','skills','created','SKILL.md'))
  })
})
