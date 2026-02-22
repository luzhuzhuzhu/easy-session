import { access } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { Project } from './project-types'
import { DataStore } from './data-store'

export interface ProjectLoadResult {
  projects: Project[]
  restoredFromBackup: boolean
}

export class ProjectStore {
  private store: DataStore<Project[]>

  constructor() {
    this.store = new DataStore<Project[]>(join(app.getPath('userData'), 'projects.json'))
  }

  async load(): Promise<ProjectLoadResult> {
    const result = await this.store.load()
    const projects: Project[] = result.data ?? []

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

    return { projects, restoredFromBackup: !!result.restoredFromBackup }
  }

  async save(projects: Project[]): Promise<void> {
    await this.store.save(projects)
  }

  flush(): Promise<void> {
    return this.store.flush()
  }
}