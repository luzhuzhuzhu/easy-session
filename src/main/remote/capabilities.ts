import type { RemoteCapabilityMap } from './types'

export function buildRemoteCapabilityMap(passthroughOnly: boolean): RemoteCapabilityMap {
  const lifecycleAllowed = !passthroughOnly

  return {
    projectsList: true,
    projectRead: true,
    projectCreate: lifecycleAllowed,
    projectUpdate: lifecycleAllowed,
    projectRemove: lifecycleAllowed,
    projectOpen: lifecycleAllowed,
    projectSessionsList: true,
    projectDetect: true,
    sessionsList: true,
    sessionSubscribe: true,
    sessionInput: true,
    sessionResize: true,
    sessionOutputHistory: true,
    sessionCreate: lifecycleAllowed,
    sessionStart: lifecycleAllowed,
    sessionPause: lifecycleAllowed,
    sessionRestart: lifecycleAllowed,
    sessionDestroy: lifecycleAllowed,
    projectPromptRead: true,
    projectPromptWrite: lifecycleAllowed,
    localPathOpen: false
  }
}
