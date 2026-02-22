import { mkdir, readFile, readdir, rm, writeFile } from 'fs/promises'
import { dirname, join, relative, resolve } from 'path'
import { homedir } from 'os'
import type { SessionManager } from './session-manager'
import type { CliType } from './types'
import type { Skill, SkillFilter } from './skill-types'

const SKILL_FILE_NAME = 'SKILL.md'

interface SkillFileInfo {
  source: CliType
  rootDir: string
  absolutePath: string
  relativePath: string
}

export class SkillManager {
  constructor(private sessionManager: SessionManager) {}

  private getSkillRoot(source: CliType, projectPath?: string): string {
    const base = projectPath || homedir()
    return source === 'claude'
      ? join(base, '.claude', 'skills')
      : join(base, '.codex', 'skills')
  }

  private normalizePath(pathValue: string): string {
    return pathValue.replace(/\\/g, '/')
  }

  private isPathInsideRoot(rootDir: string, targetPath: string): boolean {
    const root = this.normalizePath(resolve(rootDir)).replace(/\/+$/, '')
    const target = this.normalizePath(resolve(targetPath))
    return target === root || target.startsWith(`${root}/`)
  }

  private toSkillId(source: CliType, relativePath: string): string {
    return `${source}:${encodeURIComponent(this.normalizePath(relativePath))}`
  }

  private parseSkillId(id: string): { source: CliType; relativePath: string } | null {
    const idx = id.indexOf(':')
    if (idx <= 0) return null

    const source = id.slice(0, idx)
    if (source !== 'claude' && source !== 'codex') return null

    try {
      const relativePath = decodeURIComponent(id.slice(idx + 1))
      return { source, relativePath: this.normalizePath(relativePath) }
    } catch {
      return null
    }
  }

  private async fileExists(pathValue: string): Promise<boolean> {
    try {
      await readFile(pathValue)
      return true
    } catch {
      return false
    }
  }

  private async listSkillFiles(source: CliType, projectPath?: string): Promise<SkillFileInfo[]> {
    const rootDir = this.getSkillRoot(source, projectPath)

    const walk = async (currentDir: string): Promise<SkillFileInfo[]> => {
      let entries
      try {
        entries = await readdir(currentDir, { withFileTypes: true })
      } catch {
        return []
      }

      const result: SkillFileInfo[] = []

      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name)
        if (entry.isDirectory()) {
          result.push(...await walk(fullPath))
          continue
        }

        if (entry.isFile() && entry.name.toLowerCase() === SKILL_FILE_NAME.toLowerCase()) {
          const relativePath = this.normalizePath(relative(rootDir, fullPath))
          result.push({
            source,
            rootDir,
            absolutePath: fullPath,
            relativePath
          })
        }
      }

      return result
    }

    return walk(rootDir)
  }

  private inferCategory(relativePath: string): string {
    const dir = dirname(relativePath)
    if (dir === '.' || dir === '') return 'custom'

    const first = this.normalizePath(dir).split('/')[0]
    if (first === '.system') return 'system'
    if (first.startsWith('.')) return first.slice(1) || 'system'
    return first
  }

  private extractName(content: string, fallback: string): string {
    const match = content.match(/^#\s+(.+)$/m)
    return match?.[1]?.trim() || fallback
  }

  private extractDescription(content: string): string {
    const lines = content.replace(/\r\n/g, '\n').split('\n')
    let start = 0

    const h1Idx = lines.findIndex((line) => /^#\s+/.test(line.trim()))
    if (h1Idx >= 0) start = h1Idx + 1

    const buffer: string[] = []
    for (let i = start; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) {
        if (buffer.length > 0) break
        continue
      }
      if (/^#+\s+/.test(line)) {
        if (buffer.length > 0) break
        continue
      }
      buffer.push(line)
    }

    return buffer.join(' ').trim()
  }

  private extractPrompt(content: string): string {
    const normalized = content.replace(/\r\n/g, '\n')
    const promptMatch = normalized.match(/(?:^|\n)##\s*Prompt\s*\n([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i)
    if (promptMatch?.[1]) {
      return promptMatch[1].trim()
    }
    return normalized.trim()
  }

  private extractFields(prompt: string): Skill['inputSchema']['fields'] {
    const names = new Set<string>()
    const reg = /\{\{([#\/]?)([a-zA-Z0-9_]+)\}\}/g
    let match: RegExpExecArray | null

    while ((match = reg.exec(prompt)) !== null) {
      if (match[1] === '') {
        names.add(match[2])
      }
    }

    return Array.from(names).map((name) => ({
      name,
      type: 'text' as const,
      required: false,
      description: ''
    }))
  }

  private buildSkillFromFileInfo(fileInfo: SkillFileInfo, content: string): Skill {
    const dir = dirname(fileInfo.relativePath)
    const slug = this.normalizePath(dir === '.' ? 'root-skill' : dir)
      .split('/')
      .filter(Boolean)
      .pop()
      ?.toLowerCase() || 'skill'

    const name = this.extractName(content, slug)
    const description = this.extractDescription(content)
    const prompt = this.extractPrompt(content)
    const category = this.inferCategory(fileInfo.relativePath)
    const isBuiltin = this.normalizePath(fileInfo.relativePath).startsWith('.system/')

    return {
      id: this.toSkillId(fileInfo.source, fileInfo.relativePath),
      name,
      slug,
      description,
      sourceCli: fileInfo.source,
      filePath: fileInfo.absolutePath,
      compatibleCli: [fileInfo.source],
      inputSchema: { fields: this.extractFields(prompt) },
      outputSchema: { format: 'markdown' },
      prompt,
      isBuiltin,
      category
    }
  }

  private async loadSkillById(id: string, projectPath?: string): Promise<{ info: SkillFileInfo; skill: Skill; content: string } | null> {
    const parsed = this.parseSkillId(id)
    if (!parsed) return null

    const rootDir = this.getSkillRoot(parsed.source, projectPath)
    const absolutePath = resolve(rootDir, parsed.relativePath)

    // Prevent path traversal
    if (!this.isPathInsideRoot(rootDir, absolutePath)) {
      return null
    }

    let content: string
    try {
      content = await readFile(absolutePath, 'utf-8')
    } catch {
      return null
    }

    const info: SkillFileInfo = {
      source: parsed.source,
      rootDir,
      absolutePath,
      relativePath: this.normalizePath(relative(rootDir, absolutePath))
    }

    const skill = this.buildSkillFromFileInfo(info, content)
    return { info, skill, content }
  }

  private sanitizeSlug(value: string): string {
    const normalized = value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    return normalized || 'skill'
  }

  private composeSkillMarkdown(skill: {
    name: string
    description: string
    prompt: string
  }): string {
    const name = skill.name.trim() || 'Unnamed Skill'
    const description = skill.description.trim() || 'Local skill managed by Claude-Codex-Mix'
    const prompt = skill.prompt.replace(/\r\n/g, '\n').trim()

    return [
      `# ${name}`,
      '',
      description,
      '',
      '## Prompt',
      '',
      prompt,
      ''
    ].join('\n')
  }


  private async createSkillFile(source: CliType, skill: Omit<Skill, 'id' | 'isBuiltin' | 'sourceCli' | 'filePath'>): Promise<Skill> {
    const rootDir = this.getSkillRoot(source)
    await mkdir(rootDir, { recursive: true })

    const baseSlug = this.sanitizeSlug(skill.slug || skill.name)
    let slug = baseSlug
    let seq = 1

    while (await this.fileExists(join(rootDir, slug, SKILL_FILE_NAME))) {
      slug = `${baseSlug}-${seq}`
      seq += 1
    }

    const dirPath = join(rootDir, slug)
    await mkdir(dirPath, { recursive: true })

    const content = this.composeSkillMarkdown({
      name: skill.name,
      description: skill.description,
      prompt: skill.prompt
    })

    const filePath = join(dirPath, SKILL_FILE_NAME)
    await writeFile(filePath, content, 'utf-8')

    const info: SkillFileInfo = {
      source,
      rootDir,
      absolutePath: filePath,
      relativePath: this.normalizePath(relative(rootDir, filePath))
    }

    return this.buildSkillFromFileInfo(info, content)
  }

  async getSkill(id: string): Promise<Skill | undefined> {
    const loaded = await this.loadSkillById(id)
    return loaded?.skill
  }

  async getSkillBySlug(slug: string): Promise<Skill | undefined> {
    const all = await this.listSkills()
    return all.find((s) => s.slug === slug)
  }

  async listSkills(filter?: SkillFilter): Promise<Skill[]> {
    const [claudeFiles, codexFiles] = await Promise.all([
      this.listSkillFiles('claude'),
      this.listSkillFiles('codex')
    ])

    const files = [...claudeFiles, ...codexFiles]
    const loaded = await Promise.all(
      files.map(async (fileInfo) => {
        try {
          const content = await readFile(fileInfo.absolutePath, 'utf-8')
          return this.buildSkillFromFileInfo(fileInfo, content)
        } catch {
          return null
        }
      })
    )

    let skills = loaded.filter((item): item is Skill => item !== null)

    if (filter?.category) {
      skills = skills.filter((s) => s.category === filter.category)
    }
    if (filter?.cliType) {
      skills = skills.filter((s) => s.compatibleCli.includes(filter.cliType!))
    }

    skills.sort((a, b) => {
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return a.name.localeCompare(b.name)
    })

    return skills
  }

  async createSkill(skill: Omit<Skill, 'id' | 'isBuiltin' | 'sourceCli' | 'filePath'>): Promise<Skill> {
    const targets = Array.from(new Set(skill.compatibleCli)).filter((cli): cli is CliType => cli === 'claude' || cli === 'codex')
    const sources: CliType[] = targets.length > 0 ? targets : ['codex']

    let first: Skill | null = null
    for (const source of sources) {
      const created = await this.createSkillFile(source, skill)
      if (!first) first = created
    }

    if (!first) {
      throw new Error('No target CLI selected for skill creation')
    }
    return first
  }


  async deleteSkill(id: string): Promise<boolean> {
    const loaded = await this.loadSkillById(id)
    if (!loaded) return false

    if (loaded.skill.isBuiltin) {
      return false
    }

    const rootDir = resolve(loaded.info.rootDir)
    const targetDir = resolve(dirname(loaded.info.absolutePath))

    // Do not allow deleting the root skill directory itself.
    if (!this.isPathInsideRoot(rootDir, targetDir) || this.normalizePath(targetDir) === this.normalizePath(rootDir)) {
      return false
    }

    await rm(targetDir, { recursive: true, force: true })
    return true
  }

  renderPrompt(skill: Skill, inputs: Record<string, any>): string {
    let prompt = skill.prompt
    prompt = prompt.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_match, key, content) => {
      return inputs[key]
        ? content.replace(/\{\{(\w+)\}\}/g, (_: string, k: string) => String(inputs[k] ?? ''))
        : ''
    })
    prompt = prompt.replace(/\{\{(\w+)\}\}/g, (_match, key) => String(inputs[key] ?? ''))
    return prompt.trim()
  }

  async listProjectSkills(projectPath: string): Promise<Skill[]> {
    const [claudeFiles, codexFiles] = await Promise.all([
      this.listSkillFiles('claude', projectPath),
      this.listSkillFiles('codex', projectPath)
    ])
    const files = [...claudeFiles, ...codexFiles]
    const loaded = await Promise.all(
      files.map(async (fileInfo) => {
        try {
          const content = await readFile(fileInfo.absolutePath, 'utf-8')
          return this.buildSkillFromFileInfo(fileInfo, content)
        } catch {
          return null
        }
      })
    )
    return loaded.filter((item): item is Skill => item !== null)
  }


  async deleteProjectSkill(projectPath: string, id: string): Promise<boolean> {
    const loaded = await this.loadSkillById(id, projectPath)
    if (!loaded || loaded.skill.isBuiltin) return false

    const rootDir = resolve(loaded.info.rootDir)
    const targetDir = resolve(dirname(loaded.info.absolutePath))

    if (!this.isPathInsideRoot(rootDir, targetDir) || this.normalizePath(targetDir) === this.normalizePath(rootDir)) {
      return false
    }

    await rm(targetDir, { recursive: true, force: true })
    return true
  }

  async executeSkill(
    skillId: string,
    sessionId: string,
    inputs: Record<string, any>
  ): Promise<{ success: boolean; prompt: string }> {
    const skill = await this.getSkill(skillId)
    if (!skill) return { success: false, prompt: '' }

    const prompt = this.renderPrompt(skill, inputs)
    const sent = this.sessionManager.sendInput(sessionId, prompt)
    return { success: sent, prompt }
  }
}

