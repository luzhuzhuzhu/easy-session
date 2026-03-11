import { describe, expect, it } from 'vitest'
import { buildProjectRouteLocation, resolveProjectRouteRef } from '../src/renderer/src/utils/project-routing'

describe('project routing helpers', () => {
  it('keeps old local project detail route compatible', () => {
    const route = buildProjectRouteLocation({
      instanceId: 'local',
      projectId: 'project-local',
      globalProjectKey: 'local:project-local'
    })

    expect(route).toEqual({
      name: 'projectDetail',
      params: { id: 'project-local' }
    })

    expect(
      resolveProjectRouteRef({
        name: 'projectDetail',
        params: { id: 'project-local' }
      } as never)
    ).toEqual({
      instanceId: 'local',
      projectId: 'project-local',
      globalProjectKey: 'local:project-local'
    })
  })

  it('builds and resolves unique routes for remote projects', () => {
    const route = buildProjectRouteLocation({
      instanceId: 'remote-1',
      projectId: 'project-remote',
      globalProjectKey: 'remote-1:project-remote'
    })

    expect(route).toEqual({
      name: 'instanceProjectDetail',
      params: {
        instanceId: 'remote-1',
        projectId: 'project-remote'
      }
    })

    expect(
      resolveProjectRouteRef({
        name: 'instanceProjectDetail',
        params: {
          instanceId: 'remote-1',
          projectId: 'project-remote'
        }
      } as never)
    ).toEqual({
      instanceId: 'remote-1',
      projectId: 'project-remote',
      globalProjectKey: 'remote-1:project-remote'
    })
  })
})
