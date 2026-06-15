import type { RemoteCapabilityMap } from './types'

// passthroughOnly 语义澄清：它只关闭「生命周期管理」类能力（项目/会话的增删启停），
// 而 sessionInput/sessionResize/sessionSubscribe/sessionOutputHistory 始终开放 ——
// 即便 passthroughOnly=true，远程仍可向运行中的会话写 PTY 输入（具备完整远程命令执行能力）。
// 切勿据此名字误以为「只读」。
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
