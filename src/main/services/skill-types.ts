import type { CliType } from './types'

export interface SkillInputField {
  name: string
  type: 'text' | 'number' | 'select' | 'boolean'
  required: boolean
  description: string
  default?: string | number | boolean
  options?: string[] // for select type
}

export interface SkillInput {
  fields: SkillInputField[]
}

export interface SkillOutputField {
  name: string
  type: string
  description: string
}

export interface SkillOutput {
  format: 'text' | 'json' | 'markdown' | 'diff'
  fields?: SkillOutputField[]
}

export interface Skill {
  id: string
  name: string
  slug: string
  description: string
  sourceCli: CliType
  filePath: string
  compatibleCli: CliType[]
  inputSchema: SkillInput
  outputSchema: SkillOutput
  prompt: string
  isBuiltin: boolean
  category: string
}

export interface SkillFilter {
  category?: string
  cliType?: CliType
}
