import { access } from 'fs/promises'
import { basename, join } from 'path'
import { app } from 'electron'
import type { Project } from './project-types'
import { DataStore } from './data-store'

export interface ProjectLoadResult {
  projects: Project[]
  restoredFromBackup: boolean
  normalized: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function normalizeProjectRecord(raw: unknown): { project: Project | null; normalized: boolean } {
  if (!isRecord(raw)) {
    return { project: null, normalized: true }
  }

  const id = typeof raw.id === 'string' ? raw.id.trim() : ''
  const path = typeof raw.path === 'string' ? raw.path.trim() : ''

  if (!id || !path) {
    return { project: null, normalized: true }
  }

  const createdAt =
    typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now()
  const lastOpenedAt =
    typeof raw.lastOpenedAt === 'number' && Number.isFinite(raw.lastOpenedAt) ? raw.lastOpenedAt : createdAt
  const normalizedName = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : basename(path)
  const pathExists = typeof raw.pathExists === 'boolean' ? raw.pathExists : undefined

  return {
    normalized:
      raw.id !== id ||
      raw.path !== path ||
      raw.name !== normalizedName ||
      raw.createdAt !== createdAt ||
      raw.lastOpenedAt !== lastOpenedAt ||
      raw.pathExists !== pathExists,
    project: {
      id,
      name: normalizedName || id,
      path,
      createdAt,
      lastOpenedAt,
      pathExists
    }
  }
}

export class ProjectStore {
  private store: DataStore<Project[]>

  constructor() {
    this.store = new DataStore<Project[]>(join(app.getPath('userData'), 'projects.json'))
  }

  async load(): Promise<ProjectLoadResult> {
    const result = await this.store.load()
    let normalized = false
    const rawProjects = Array.isArray(result.data) ? result.data : []
    if (result.data && !Array.isArray(result.data)) {
      normalized = true
    }

    const projects: Project[] = []
    for (const rawProject of rawProjects) {
      const normalizedRecord = normalizeProjectRecord(rawProject)
      normalized = normalized || normalizedRecord.normalized
      if (!normalizedRecord.project) continue
      projects.push(normalizedRecord.project)
    }

    for (const project of projects) {
      try {
        await access(project.path)
        project.pathExists = true
      } catch {
        project.pathExists = false
      }
    }

    if (result.restoredFromBackup) {
      console.warn('[ProjectStore] 项目数据从备份恢复')
    }

    return { projects, restoredFromBackup: !!result.restoredFromBackup, normalized }
  }

  async save(projects: Project[]): Promise<void> {
    await this.store.save(projects)
  }

  flush(): Promise<void> {
    return this.store.flush()
  }
}
