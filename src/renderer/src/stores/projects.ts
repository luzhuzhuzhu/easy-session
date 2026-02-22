import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  listProjects as apiListProjects,
  addProject as apiAddProject,
  removeProject as apiRemoveProject,
  updateProject as apiUpdateProject,
  openProject as apiOpenProject,
  type Project
} from '@/api/project'
import { useSessionsStore } from './sessions'

export type { Project }

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const activeProjectId = ref<string | null>(null)
  const loading = ref(false)

  const activeProject = computed(() =>
    projects.value.find((p) => p.id === activeProjectId.value) || null
  )

  const recentProjects = computed(() =>
    [...projects.value]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 5)
  )

  async function fetchProjects() {
    loading.value = true
    try {
      projects.value = await apiListProjects()
    } finally {
      loading.value = false
    }
  }

  async function addProject(path: string, name?: string) {
    const project = await apiAddProject(path, name)
    const exists = projects.value.some((p) => p.id === project.id)
    if (!exists) projects.value.push(project)
    return project
  }

  async function removeProject(id: string) {
    await apiRemoveProject(id)
    projects.value = projects.value.filter((p) => p.id !== id)
    if (activeProjectId.value === id) {
      activeProjectId.value = null
    }

    const sessionsStore = useSessionsStore()
    await sessionsStore.fetchSessions()
  }

  function setActiveProject(id: string | null) {
    activeProjectId.value = id
    if (!id) return

    void apiOpenProject(id).then((updated) => {
      const idx = projects.value.findIndex((p) => p.id === id)
      if (idx !== -1) {
        projects.value[idx] = updated
      }
    }).catch(() => {
      // Keep UI stable when openProject call fails.
    })
  }

  async function updateProject(id: string, updates: { name?: string }) {
    const updated = await apiUpdateProject(id, updates)
    const idx = projects.value.findIndex((p) => p.id === id)
    if (idx !== -1) projects.value[idx] = updated
    return updated
  }

  return {
    projects,
    activeProjectId,
    loading,
    activeProject,
    recentProjects,
    fetchProjects,
    addProject,
    removeProject,
    setActiveProject,
    updateProject
  }
})
