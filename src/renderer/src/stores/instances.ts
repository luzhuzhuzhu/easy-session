import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  addRemoteInstance as apiAddRemoteInstance,
  getRemoteInstanceToken as apiGetRemoteInstanceToken,
  listRemoteInstances as apiListRemoteInstances,
  removeRemoteInstance as apiRemoveRemoteInstance,
  testRemoteInstance as apiTestRemoteInstance,
  updateRemoteInstance as apiUpdateRemoteInstance,
  type RemoteInstanceConnectionResult,
  type RemoteInstanceDraft,
  type RemoteInstanceUpdate
} from '@/api/remote-instance'
import {
  buildLocalInstance,
  LOCAL_INSTANCE_ID,
  type InstanceCapabilities,
  type Instance,
  type LocalInstance,
  type RemoteInstance
} from '../models/unified-resource'
import { getSharedGatewayResolver } from '../gateways'
import { useSettingsStore } from './settings'

function detectPlatform(): NodeJS.Platform {
  const globalValue = globalThis as typeof globalThis & {
    electronAPI?: { platform?: NodeJS.Platform }
    process?: { platform?: NodeJS.Platform }
  }

  if (typeof globalValue.electronAPI?.platform === 'string') {
    return globalValue.electronAPI.platform
  }

  if (typeof globalValue.process?.platform === 'string') {
    return globalValue.process.platform
  }

  return 'win32'
}

function cloneRemoteInstance(instance: RemoteInstance): RemoteInstance {
  return {
    ...instance,
    capabilities: { ...instance.capabilities }
  }
}

function mergeConnectionResult(
  instance: RemoteInstance,
  result: RemoteInstanceConnectionResult
): RemoteInstance {
  return {
    ...instance,
    status: result.status,
    lastCheckedAt: result.lastCheckedAt,
    passthroughOnly: result.passthroughOnly,
    capabilities: { ...result.capabilities },
    lastError: result.error,
    latencyMs: result.latencyMs
  }
}

function normalizeRemoteError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim()
  }

  const message = String(error ?? '').trim()
  return message || 'Unknown remote error'
}

function resolveRemoteFailureStatus(error: unknown): RemoteInstance['status'] {
  const status =
    typeof (error as { status?: unknown })?.status === 'number'
      ? (error as { status: number }).status
      : null

  if (typeof status === 'number') {
    if ([502, 503, 504, 522, 523, 524, 525, 526, 530].includes(status)) {
      return 'offline'
    }
    return 'error'
  }

  const message = normalizeRemoteError(error).toLowerCase()
  if (
    message.includes('failed to fetch') ||
    message.includes('econnrefused') ||
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('cloudflare quick tunnel') ||
    message.includes('远程服务当前不可达')
  ) {
    return 'offline'
  }

  return 'error'
}

export const useInstancesStore = defineStore('instances', () => {
  const settingsStore = useSettingsStore()
  const remoteInstances = ref<RemoteInstance[]>([])
  const loading = ref(false)
  const testingIds = ref<string[]>([])
  const remoteStateVersion = ref(0)

  const localInstance = computed<LocalInstance>(() => buildLocalInstance(detectPlatform()))
  const remoteMountEnabled = computed(() => settingsStore.settings.desktopRemoteMountEnabled)

  const instances = computed<Instance[]>(() => [
    localInstance.value,
    ...remoteInstances.value
      .map((instance) => cloneRemoteInstance(instance))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
  ])

  const instanceIndex = computed<Record<string, Instance>>(() =>
    Object.fromEntries(instances.value.map((instance) => [instance.id, instance]))
  )

  const remoteInstanceIndex = computed<Record<string, RemoteInstance>>(() =>
    Object.fromEntries(remoteInstances.value.map((instance) => [instance.id, cloneRemoteInstance(instance)]))
  )

  const onlineRemoteCount = computed(() =>
    remoteInstances.value.filter((instance) => instance.status === 'online').length
  )

  function replaceRemoteInstance(nextInstance: RemoteInstance): void {
    const index = remoteInstances.value.findIndex((instance) => instance.id === nextInstance.id)
    if (index === -1) {
      remoteInstances.value.push(cloneRemoteInstance(nextInstance))
      remoteStateVersion.value += 1
      return
    }
    remoteInstances.value[index] = cloneRemoteInstance(nextInstance)
    remoteStateVersion.value += 1
  }

  function patchRemoteInstance(
    id: string,
    patch: Partial<Pick<RemoteInstance, 'status' | 'lastCheckedAt' | 'lastError' | 'latencyMs'>>
  ): void {
    const current = remoteInstances.value.find((instance) => instance.id === id)
    if (!current) return
    replaceRemoteInstance({
      ...current,
      ...patch
    })
  }

  function markTesting(id: string, active: boolean): void {
    if (active) {
      if (!testingIds.value.includes(id)) {
        testingIds.value = [...testingIds.value, id]
      }
      return
    }
    testingIds.value = testingIds.value.filter((value) => value !== id)
  }

  function clearRemoteState(): void {
    remoteInstances.value = []
    testingIds.value = []
    remoteStateVersion.value += 1
    getSharedGatewayResolver().invalidate()
  }

  async function fetchInstances(): Promise<Instance[]> {
    loading.value = true
    try {
      if (!remoteMountEnabled.value) {
        clearRemoteState()
        return instances.value
      }
      remoteInstances.value = (await apiListRemoteInstances()).map((instance) => cloneRemoteInstance(instance))
      remoteStateVersion.value += 1
      return instances.value
    } finally {
      loading.value = false
    }
  }

  async function addRemoteInstance(draft: RemoteInstanceDraft): Promise<RemoteInstance> {
    const created = await apiAddRemoteInstance(draft)
    getSharedGatewayResolver().invalidate(created.id)
    replaceRemoteInstance(created)
    return created
  }

  async function updateRemoteInstance(id: string, updates: RemoteInstanceUpdate): Promise<RemoteInstance | null> {
    const updated = await apiUpdateRemoteInstance(id, updates)
    if (updated) {
      getSharedGatewayResolver().invalidate(id)
      replaceRemoteInstance(updated)
    }
    return updated
  }

  async function removeRemoteInstance(id: string): Promise<boolean> {
    const deleted = await apiRemoveRemoteInstance(id)
    if (deleted) {
      getSharedGatewayResolver().invalidate(id)
      remoteInstances.value = remoteInstances.value.filter((instance) => instance.id !== id)
      remoteStateVersion.value += 1
    }
    return deleted
  }

  async function testRemoteInstance(target: string): Promise<RemoteInstanceConnectionResult> {
    markTesting(target, true)
    try {
      const result = await apiTestRemoteInstance(target)
      const current = remoteInstances.value.find((instance) => instance.id === target)
      if (current) {
        replaceRemoteInstance(mergeConnectionResult(current, result))
      }
      return result
    } finally {
      markTesting(target, false)
    }
  }

  async function testRemoteDraft(
    target: Pick<RemoteInstanceDraft, 'baseUrl' | 'token'>
  ): Promise<RemoteInstanceConnectionResult> {
    return apiTestRemoteInstance(target)
  }

  async function getRemoteToken(id: string): Promise<string | null> {
    if (id === LOCAL_INSTANCE_ID) return null
    return apiGetRemoteInstanceToken(id)
  }

  function markRemoteFetchSuccess(id: string): void {
    if (id === LOCAL_INSTANCE_ID) return
    patchRemoteInstance(id, {
      status: 'online',
      lastCheckedAt: Date.now(),
      lastError: null
    })
  }

  function markRemoteFetchFailure(id: string, error: unknown): void {
    if (id === LOCAL_INSTANCE_ID) return
    patchRemoteInstance(id, {
      status: resolveRemoteFailureStatus(error),
      lastCheckedAt: Date.now(),
      lastError: normalizeRemoteError(error)
    })
  }

  function syncRemoteCapabilities(
    id: string,
    snapshot: { passthroughOnly: boolean; capabilities: InstanceCapabilities }
  ): void {
    if (id === LOCAL_INSTANCE_ID) return
    const current = remoteInstances.value.find((instance) => instance.id === id)
    if (!current) return
    replaceRemoteInstance({
      ...current,
      passthroughOnly: snapshot.passthroughOnly,
      capabilities: { ...snapshot.capabilities }
    })
  }

  function getInstance(id: string): Instance | null {
    return instanceIndex.value[id] ?? null
  }

  return {
    remoteInstances,
    localInstance,
    remoteMountEnabled,
    instances,
    instanceIndex,
    remoteInstanceIndex,
    remoteStateVersion,
    loading,
    testingIds,
    onlineRemoteCount,
    fetchInstances,
    addRemoteInstance,
    updateRemoteInstance,
    removeRemoteInstance,
    testRemoteInstance,
    testRemoteDraft,
    getRemoteToken,
    markRemoteFetchSuccess,
    markRemoteFetchFailure,
    syncRemoteCapabilities,
    getInstance,
    clearRemoteState
  }
})
