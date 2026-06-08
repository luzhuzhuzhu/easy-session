import { LOCAL_INSTANCE_ID, type Instance, type SessionRef } from '@/models/unified-resource'

type Translate = (key: string, params?: Record<string, unknown>) => string

type InstanceLookup = {
  getInstance(id: string): Instance | null | undefined
}

type RemoteOperationErrorOptions = {
  t: Translate
  instancesStore: InstanceLookup
  instanceId: string
  action: string
  target: string
  error: unknown
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  const message = String(error ?? '').trim()
  return message || 'Unknown error'
}

function inferRecoveryAdvice(message: string, t: Translate): string {
  const normalized = message.toLowerCase()

  if (
    normalized.includes('token') ||
    normalized.includes('unauthorized') ||
    normalized.includes('401') ||
    normalized.includes('403')
  ) {
    return t('remoteOperation.advice.auth')
  }

  if (
    normalized.includes('cloudflare') ||
    normalized.includes('trycloudflare') ||
    normalized.includes('523') ||
    normalized.includes('524') ||
    normalized.includes('530')
  ) {
    return t('remoteOperation.advice.cloudflare')
  }

  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('econnrefused') ||
    normalized.includes('不可达') ||
    normalized.includes('离线')
  ) {
    return t('remoteOperation.advice.network')
  }

  if (
    normalized.includes('passthrough') ||
    normalized.includes('capability') ||
    normalized.includes('disabled') ||
    normalized.includes('not allowed') ||
    normalized.includes('权限') ||
    normalized.includes('透传')
  ) {
    return t('remoteOperation.advice.capability')
  }

  return t('remoteOperation.advice.default')
}

export function formatRemoteOperationError(options: RemoteOperationErrorOptions): string {
  const message = getErrorMessage(options.error)
  if (options.instanceId === LOCAL_INSTANCE_ID) {
    return `${options.t('toast.operationFailed')}: ${message}`
  }

  const instance = options.instancesStore.getInstance(options.instanceId)
  const instanceName = instance?.name || options.instanceId
  return options.t('remoteOperation.failure', {
    instance: instanceName,
    action: options.action,
    target: options.target,
    reason: message,
    advice: inferRecoveryAdvice(message, options.t)
  })
}

export function formatSessionOperationTarget(sessionRef: SessionRef, fallbackName?: string | null): string {
  const label = fallbackName?.trim() || sessionRef.sessionId
  return `${label} (${sessionRef.sessionId})`
}
