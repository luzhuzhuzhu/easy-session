import { randomUUID } from 'crypto'
import { access, readFile, writeFile } from 'fs/promises'
import { basename, join, normalize, parse, resolve } from 'path'
import { ProjectStore } from './project-store'
import type { Project } from './project-types'

export class ProjectManager {
  private projects = new Map<string, Project>()
  private store: ProjectStore

  constructor() {
    this.store = new ProjectStore()
  }

  private normalizeProjectPath(rawPath: string): string {
    let normalizedPath = normalize(resolve(rawPath))
    const root = parse(normalizedPath).root
    if (normalizedPath !== root) {
      normalizedPath = normalizedPath.replace(/[\\/]+$/, '')
    }
    return normalizedPath
  }

  private toPathKey(path: string): string {
    return process.platform === 'win32' ? path.toLowerCase() : path
  }

  private async checkPathExists(path: string): Promise<boolean> {
    try {
      await access(path)
      return true
    } catch {
      return false
    }
  }

  private async refreshProjectPathState(project: Project): Promise<void> {
    project.pathExists = await this.checkPathExists(project.path)
  }

  private getPromptCandidates(projectPath: string, cliType: 'claude' | 'codex'): string[] {
    if (cliType === 'claude') {
      return [join(projectPath, 'CLAUDE.md'), join(projectPath, 'CLAUDE.MD')]
    }
    return [join(projectPath, 'AGENTS.md'), join(projectPath, 'AGENTS.MD')]
  }

  private async resolvePromptPath(
    projectPath: string,
    cliType: 'claude' | 'codex'
  ): Promise<{ path: string; exists: boolean }> {
    const candidates = this.getPromptCandidates(projectPath, cliType)
    for (const candidate of candidates) {
      if (await this.checkPathExists(candidate)) {
        return { path: candidate, exists: true }
      }
    }
    return { path: candidates[0], exists: false }
  }

  async init(): Promise<void> {
    const { projects: list, restoredFromBackup } = await this.store.load()
    let changed = restoredFromBackup

    for (const p of list) {
      const normalizedPath = this.normalizeProjectPath(p.path)
      if (normalizedPath !== p.path) {
        p.path = normalizedPath
        changed = true
      }

      const pathExists = await this.checkPathExists(p.path)
      if (p.pathExists !== pathExists) {
        p.pathExists = pathExists
        changed = true
      }

      this.projects.set(p.id, p)
    }

    if (changed) {
      await this.persist()
    }
  }

  private async persist(): Promise<void> {
    await this.store.save(Array.from(this.projects.values()))
  }

  flush(): Promise<void> {
    return this.store.flush()
  }

  async addProject(path: string, name?: string): Promise<Project> {
    const normalizedPath = this.normalizeProjectPath(path)
    await access(normalizedPath)

    const pathKey = this.toPathKey(normalizedPath)
    for (const p of this.projects.values()) {
      if (this.toPathKey(p.path) === pathKey) return p
    }

    const now = Date.now()
    const project: Project = {
      id: randomUUID(),
      name: name || basename(normalizedPath),
      path: normalizedPath,
      createdAt: now,
      lastOpenedAt: now,
      pathExists: true
    }

    this.projects.set(project.id, project)
    await this.persist()
    return project
  }

  async removeProject(id: string): Promise<boolean> {
    const deleted = this.projects.delete(id)
    if (deleted) await this.persist()
    return deleted
  }

  async updateProject(id: string, updates: Partial<Pick<Project, 'name'>>): Promise<Project | null> {
    const project = this.projects.get(id)
    if (!project) return null

    if (updates.name !== undefined) project.name = updates.name
    await this.persist()
    return project
  }

  getProject(id: string): Project | undefined {
    return this.projects.get(id)
  }

  async listProjects(): Promise<Project[]> {
    await this.refreshPathStates()
    return Array.from(this.projects.values())
  }

  getProjectByPath(path: string): Project | undefined {
    const normalizedPath = this.normalizeProjectPath(path)
    const pathKey = this.toPathKey(normalizedPath)

    for (const p of this.projects.values()) {
      if (this.toPathKey(p.path) === pathKey) return p
    }

    return undefined
  }

  async refreshPathStates(projectIds?: string[]): Promise<Project[]> {
    const targets = projectIds?.length
      ? projectIds.map((id) => this.projects.get(id)).filter((project): project is Project => !!project)
      : Array.from(this.projects.values())

    await Promise.all(targets.map((project) => this.refreshProjectPathState(project)))
    return targets
  }

  async openProject(id: string): Promise<Project | null> {
    const project = this.projects.get(id)
    if (!project) return null

    await this.refreshProjectPathState(project)
    project.lastOpenedAt = Date.now()
    await this.persist()
    return project
  }

  async readProjectPromptFile(
    id: string,
    cliType: 'claude' | 'codex'
  ): Promise<{ path: string; content: string; exists: boolean } | null> {
    const project = this.projects.get(id)
    if (!project) return null

    const resolved = await this.resolvePromptPath(project.path, cliType)
    const content = resolved.exists ? await readFile(resolved.path, 'utf-8') : ''
    return {
      path: resolved.path,
      content,
      exists: resolved.exists
    }
  }

  async writeProjectPromptFile(
    id: string,
    cliType: 'claude' | 'codex',
    content: string
  ): Promise<{ path: string; content: string; exists: boolean } | null> {
    const project = this.projects.get(id)
    if (!project) return null

    const resolved = await this.resolvePromptPath(project.path, cliType)
    await writeFile(resolved.path, content, 'utf-8')
    return {
      path: resolved.path,
      content,
      exists: true
    }
  }
}
