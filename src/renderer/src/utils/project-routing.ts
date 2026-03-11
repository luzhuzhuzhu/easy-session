import type { RouteLocationNormalizedLoaded, RouteLocationRaw } from 'vue-router'
import {
  buildGlobalProjectKey,
  LOCAL_INSTANCE_ID,
  type ProjectRef,
  type UnifiedProject
} from '../models/unified-resource'

type ProjectRouteInput =
  | ProjectRef
  | Pick<UnifiedProject, 'instanceId' | 'projectId' | 'globalProjectKey'>

export function buildProjectRef(instanceId: string, projectId: string): ProjectRef {
  return {
    instanceId,
    projectId,
    globalProjectKey: buildGlobalProjectKey(instanceId, projectId)
  }
}

export function normalizeProjectRef(input: ProjectRouteInput): ProjectRef {
  return {
    instanceId: input.instanceId,
    projectId: input.projectId,
    globalProjectKey: input.globalProjectKey || buildGlobalProjectKey(input.instanceId, input.projectId)
  }
}

export function buildProjectRouteLocation(input: ProjectRouteInput): RouteLocationRaw {
  const projectRef = normalizeProjectRef(input)
  if (projectRef.instanceId === LOCAL_INSTANCE_ID) {
    return {
      name: 'projectDetail',
      params: { id: projectRef.projectId }
    }
  }

  return {
    name: 'instanceProjectDetail',
    params: {
      instanceId: projectRef.instanceId,
      projectId: projectRef.projectId
    }
  }
}

export function resolveProjectRouteRef(
  route: Pick<RouteLocationNormalizedLoaded, 'name' | 'params'>
): ProjectRef | null {
  if (route.name === 'projectDetail') {
    const projectId = typeof route.params.id === 'string' ? route.params.id : ''
    return projectId ? buildProjectRef(LOCAL_INSTANCE_ID, projectId) : null
  }

  if (route.name === 'instanceProjectDetail') {
    const instanceId = typeof route.params.instanceId === 'string' ? route.params.instanceId : ''
    const projectId = typeof route.params.projectId === 'string' ? route.params.projectId : ''
    if (!instanceId || !projectId) return null
    return buildProjectRef(instanceId, projectId)
  }

  return null
}
