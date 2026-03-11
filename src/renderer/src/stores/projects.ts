import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  addProject as apiAddProject,
  removeProject as apiRemoveProject,
  updateProject as apiUpdateProject,
  openProject as apiOpenProject,
  selectFolder,
  type Project,
  type ProjectPromptCliType,
  type ProjectPromptFile
} from '@/api/local-project'
import {
  buildGlobalProjectKey,
  LOCAL_INSTANCE_ID,
  toProjectRef,
  toUnifiedProject,
  type ProjectRef,
  type UnifiedProject,
  type UnifiedSession
} from '../models/unified-resource'
import { getSharedGatewayResolver } from '../gateways'
import type {
  GatewayCreateProjectParams,
  GatewayDetectProjectResult,
  GatewayUpdateProjectParams
} from '../gateways/types'
import { useInstancesStore } from './instances'
import { useSessionsStore } from './sessions'
import { useWorkspaceStore } from './workspace'

export type { Project, UnifiedProject, ProjectRef }

export const useProjectsStore = defineStore('projects', () => {
  const projects = ref<Project[]>([])
  const activeGlobalProjectKeyState = ref<string | null>(null)
  const loading = ref(false)
  const remoteProjectsByInstance = ref<Record<string, UnifiedProject[]>>({})
  const resolver = getSharedGatewayResolver()

  const unifiedProjects = computed<UnifiedProject[]>(() =>
    [
      ...projects.value.map((project) => toUnifiedProject(project)),
      ...Object.values(remoteProjectsByInstance.value).flat()
    ]
  )

  const projectIndexByGlobalKey = computed<Record<string, UnifiedProject>>(() =>
    Object.fromEntries(unifiedProjects.value.map((project) => [project.globalProjectKey, project]))
  )

  const activeProjectRef = computed<ProjectRef | null>(() => {
    if (!activeGlobalProjectKeyState.value) return null
    const project = projectIndexByGlobalKey.value[activeGlobalProjectKeyState.value]
    return project ? toProjectRef(project) : null
  })

  const activeUnifiedProject = computed<UnifiedProject | null>(() => {
    if (!activeGlobalProjectKeyState.value) return null
    return projectIndexByGlobalKey.value[activeGlobalProjectKeyState.value] ?? null
  })

  const activeProjectId = computed<string | null>(() =>
    activeUnifiedProject.value?.instanceId === LOCAL_INSTANCE_ID ? activeUnifiedProject.value.projectId : null
  )

  const activeProject = computed<Project | null>(() => {
    const activeId = activeProjectId.value
    if (!activeId) return null
    return projects.value.find((project) => project.id === activeId) || null
  })

  const recentProjects = computed(() =>
    [...projects.value]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 5)
  )

  const unifiedRecentProjects = computed(() =>
    [...unifiedProjects.value]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 5)
  )

  const quickAccessProjects = computed<UnifiedProject[]>(() => {
    const instancesStore = useInstancesStore()
    return unifiedProjects.value.filter((project) => {
      if (project.instanceId === LOCAL_INSTANCE_ID) return true
      const instance = instancesStore.getInstance(project.instanceId)
      if (!instance || instance.type !== 'remote') return false
      return instance.enabled && instance.status !== 'offline' && instance.status !== 'error'
    })
  })

  const quickAccessRecentProjects = computed(() =>
    [...quickAccessProjects.value]
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
      .slice(0, 5)
  )

  const quickAccessProjectCount = computed(() => quickAccessProjects.value.length)

  const unavailableRemoteProjectCount = computed(() => {
    const instancesStore = useInstancesStore()
    return Object.entries(remoteProjectsByInstance.value).reduce((count, [instanceId, projectList]) => {
      const instance = instancesStore.getInstance(instanceId)
      if (!instance || instance.type !== 'remote') return count
      if (instance.status !== 'offline' && instance.status !== 'error') return count
      return count + projectList.length
    }, 0)
  })

  async function fetchProjects() {
    loading.value = true
    try {
      const gateway = await resolver.resolve(LOCAL_INSTANCE_ID)
      projects.value = (await gateway.listProjects(LOCAL_INSTANCE_ID)).map((project) => ({
        id: project.projectId,
        name: project.name,
        path: project.path,
        createdAt: project.createdAt,
        lastOpenedAt: project.lastOpenedAt,
        pathExists: project.pathExists
      }))
    } finally {
      loading.value = false
    }
  }

  async function fetchProjectsForInstance(instanceId: string): Promise<UnifiedProject[]> {
    if (instanceId === LOCAL_INSTANCE_ID) {
      await fetchProjects()
      return unifiedProjects.value.filter((project) => project.instanceId === LOCAL_INSTANCE_ID)
    }

    const gateway = await resolver.resolve(instanceId)
    const remoteProjects = await gateway.listProjects(instanceId)
    useInstancesStore().markRemoteFetchSuccess(instanceId)
    remoteProjectsByInstance.value = {
      ...remoteProjectsByInstance.value,
      [instanceId]: remoteProjects
    }
    return remoteProjects
  }

  async function fetchAllProjects(instanceIds?: string[]): Promise<UnifiedProject[]> {
    const targets =
      instanceIds ??
      useInstancesStore().instances
        .filter((instance) => instance.type === 'local' || instance.enabled)
        .map((instance) => instance.id)

    const targetSet = new Set(targets)
    for (const existingInstanceId of Object.keys(remoteProjectsByInstance.value)) {
      if (targetSet.has(existingInstanceId)) continue
      clearRemoteProjects(existingInstanceId)
    }
    loading.value = true
    try {
      await Promise.allSettled(
        targets.map(async (instanceId) => {
          try {
            await fetchProjectsForInstance(instanceId)
          } catch (error) {
            useInstancesStore().markRemoteFetchFailure(instanceId, error)
            // 保留该实例上次已知数据，不让单个远程故障拖垮整页聚合
          }
        })
      )
      return unifiedProjects.value
    } finally {
      loading.value = false
    }
  }

  function clearRemoteProjects(instanceId?: string): void {
    if (!instanceId) {
      remoteProjectsByInstance.value = {}
      resolver.invalidate()
      return
    }

    if (instanceId === LOCAL_INSTANCE_ID) return
    const next = { ...remoteProjectsByInstance.value }
    delete next[instanceId]
    remoteProjectsByInstance.value = next
    resolver.invalidate(instanceId)
  }

  function getProjectRef(projectId: string): ProjectRef {
    return {
      instanceId: LOCAL_INSTANCE_ID,
      projectId,
      globalProjectKey: buildGlobalProjectKey(LOCAL_INSTANCE_ID, projectId)
    }
  }

  function getProjectRefByGlobalKey(globalProjectKey: string): ProjectRef | null {
    const project = projectIndexByGlobalKey.value[globalProjectKey]
    return project ? toProjectRef(project) : null
  }

  function getUnifiedProject(globalProjectKey: string): UnifiedProject | null {
    return projectIndexByGlobalKey.value[globalProjectKey] ?? null
  }

  function setActiveProject(projectId: string | null): void {
    setActiveProjectRef(projectId ? getProjectRef(projectId) : null)
  }

  function setActiveProjectRef(projectRef: ProjectRef | null): void {
    activeGlobalProjectKeyState.value = projectRef?.globalProjectKey ?? null
  }

  async function addProject(path: string, name?: string) {
    const project = await apiAddProject(path, name)
    const exists = projects.value.some((item) => item.id === project.id)
    if (!exists) projects.value.push(project)
    return project
  }

  async function createProjectForInstance(
    instanceId: string,
    params: GatewayCreateProjectParams
  ): Promise<UnifiedProject> {
    const gateway = await resolver.resolve(instanceId)
    const project = await gateway.createProject(instanceId, params)
    if (instanceId === LOCAL_INSTANCE_ID) {
      const localProject = await apiOpenProject(project.projectId)
      const exists = projects.value.some((item) => item.id === localProject.id)
      if (!exists) projects.value.push(localProject)
      else {
        const index = projects.value.findIndex((item) => item.id === localProject.id)
        projects.value[index] = localProject
      }
    } else {
      const current = remoteProjectsByInstance.value[instanceId] || []
      remoteProjectsByInstance.value = {
        ...remoteProjectsByInstance.value,
        [instanceId]: [...current.filter((item) => item.projectId !== project.projectId), project]
      }
      useInstancesStore().markRemoteFetchSuccess(instanceId)
    }
    return project
  }

  async function createProjectRef(
    instanceId: string,
    params: GatewayCreateProjectParams
  ): Promise<UnifiedProject> {
    return createProjectForInstance(instanceId, params)
  }

  async function removeProject(id: string) {
    await removeProjectRef(getProjectRef(id))
  }

  async function removeProjectRef(projectRef: ProjectRef): Promise<boolean> {
    if (projectRef.instanceId === LOCAL_INSTANCE_ID) {
      await apiRemoveProject(projectRef.projectId)
      projects.value = projects.value.filter((project) => project.id !== projectRef.projectId)
    } else {
      const gateway = await resolver.resolve(projectRef.instanceId)
      const deleted = await gateway.removeProject(projectRef.instanceId, projectRef.projectId)
      if (!deleted) return false
      const current = remoteProjectsByInstance.value[projectRef.instanceId] || []
      remoteProjectsByInstance.value = {
        ...remoteProjectsByInstance.value,
        [projectRef.instanceId]: current.filter((project) => project.projectId !== projectRef.projectId)
      }
      const sessionsStore = useSessionsStore()
      await sessionsStore.fetchSessionsForInstance(projectRef.instanceId)
    }

    if (activeGlobalProjectKeyState.value === projectRef.globalProjectKey) {
      activeGlobalProjectKeyState.value = null
    }

    const sessionsStore = useSessionsStore()
    if (projectRef.instanceId === LOCAL_INSTANCE_ID) {
      await sessionsStore.fetchSessions()
    }

    const workspaceStore = useWorkspaceStore()
    workspaceStore.reconcileSessionRefs(
      sessionsStore.unifiedSessions.map((session) => session.globalSessionKey),
      {
        fallbackSessionRef: sessionsStore.activeSessionRef ?? undefined
      }
    )

    return true
  }

  async function openProjectRef(projectRef: ProjectRef): Promise<UnifiedProject | null> {
    setActiveProjectRef(projectRef)

    if (projectRef.instanceId === LOCAL_INSTANCE_ID) {
      try {
        const updated = await apiOpenProject(projectRef.projectId)
        const index = projects.value.findIndex((project) => project.id === projectRef.projectId)
        if (index !== -1) {
          projects.value[index] = updated
        } else {
          projects.value.push(updated)
        }
        const unified = toUnifiedProject(updated)
        activeGlobalProjectKeyState.value = unified.globalProjectKey
        return unified
      } catch {
        return null
      }
    }

    const gateway = await resolver.resolve(projectRef.instanceId)
    const updated = await gateway.openProject(projectRef.instanceId, projectRef.projectId)
    if (!updated) return null

    const current = remoteProjectsByInstance.value[projectRef.instanceId] || []
    remoteProjectsByInstance.value = {
      ...remoteProjectsByInstance.value,
      [projectRef.instanceId]: [
        updated,
        ...current.filter((project) => project.projectId !== projectRef.projectId)
      ]
    }
    activeGlobalProjectKeyState.value = updated.globalProjectKey
    return updated
  }

  async function updateProject(id: string, updates: { name?: string }) {
    const updated = await updateProjectRef(getProjectRef(id), updates)
    if (!updated) {
      throw new Error(`Project not found: ${id}`)
    }
    return {
      id: updated.projectId,
      name: updated.name,
      path: updated.path,
      createdAt: updated.createdAt,
      lastOpenedAt: updated.lastOpenedAt,
      pathExists: updated.pathExists
    } satisfies Project
  }

  async function updateProjectRef(
    projectRef: ProjectRef,
    updates: GatewayUpdateProjectParams
  ): Promise<UnifiedProject | null> {
    if (projectRef.instanceId === LOCAL_INSTANCE_ID) {
      const updated = await apiUpdateProject(projectRef.projectId, updates)
      const index = projects.value.findIndex((project) => project.id === projectRef.projectId)
      if (index !== -1) projects.value[index] = updated
      return toUnifiedProject(updated)
    }

    const gateway = await resolver.resolve(projectRef.instanceId)
    const updated = await gateway.updateProject(projectRef.instanceId, projectRef.projectId, updates)
    if (!updated) return null
    const current = remoteProjectsByInstance.value[projectRef.instanceId] || []
    remoteProjectsByInstance.value = {
      ...remoteProjectsByInstance.value,
      [projectRef.instanceId]: [
        updated,
        ...current.filter((project) => project.projectId !== projectRef.projectId)
      ]
    }
    return updated
  }

  async function getProjectByRef(projectRef: ProjectRef): Promise<UnifiedProject | null> {
    const cached = projectIndexByGlobalKey.value[projectRef.globalProjectKey]
    if (cached) return cached

    const gateway = await resolver.resolve(projectRef.instanceId)
    return gateway.getProject(projectRef.instanceId, projectRef.projectId)
  }

  async function listProjectSessionsForRef(projectRef: ProjectRef): Promise<UnifiedSession[]> {
    const gateway = await resolver.resolve(projectRef.instanceId)
    return gateway.listProjectSessions(projectRef.instanceId, projectRef.projectId)
  }

  async function detectProjectForRef(projectRef: ProjectRef): Promise<GatewayDetectProjectResult> {
    const gateway = await resolver.resolve(projectRef.instanceId)
    return gateway.detectProject(projectRef.instanceId, projectRef.projectId)
  }

  async function readProjectPromptForRef(
    projectRef: ProjectRef,
    cliType: ProjectPromptCliType
  ): Promise<ProjectPromptFile | null> {
    const gateway = await resolver.resolve(projectRef.instanceId)
    return gateway.readProjectPrompt(projectRef.instanceId, projectRef.projectId, cliType)
  }

  async function writeProjectPromptForRef(
    projectRef: ProjectRef,
    cliType: ProjectPromptCliType,
    content: string
  ): Promise<ProjectPromptFile | null> {
    const gateway = await resolver.resolve(projectRef.instanceId)
    return gateway.writeProjectPrompt(projectRef.instanceId, projectRef.projectId, cliType, content)
  }

  return {
    projects,
    remoteProjectsByInstance,
    unifiedProjects,
    projectIndexByGlobalKey,
    activeProjectId,
    activeProjectRef,
    activeGlobalProjectKey: activeGlobalProjectKeyState,
    loading,
    activeProject,
    activeUnifiedProject,
    recentProjects,
    unifiedRecentProjects,
    quickAccessProjects,
    quickAccessRecentProjects,
    quickAccessProjectCount,
    unavailableRemoteProjectCount,
    fetchProjects,
    fetchProjectsForInstance,
    fetchAllProjects,
    addProject,
    createProjectForInstance,
    createProjectRef,
    removeProject,
    removeProjectRef,
    setActiveProject,
    setActiveProjectRef,
    openProjectRef,
    updateProject,
    updateProjectRef,
    getProjectRef,
    getProjectRefByGlobalKey,
    getUnifiedProject,
    getProjectByRef,
    listProjectSessionsForRef,
    detectProjectForRef,
    readProjectPromptForRef,
    writeProjectPromptForRef,
    clearRemoteProjects,
    selectFolder
  }
})
