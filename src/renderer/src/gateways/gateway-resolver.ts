import { getRemoteInstanceToken } from '../api/remote-instance'
import { LOCAL_INSTANCE_ID, type RemoteInstance } from '../models/unified-resource'
import type { Gateway } from './types'
import { LocalGateway } from './local-gateway'
import { RemoteGateway } from './remote-gateway'

export type RemoteInstanceLoader = (instanceId: string) => RemoteInstance | null | Promise<RemoteInstance | null>

export class GatewayResolver {
  private readonly localGateway = new LocalGateway()
  private readonly remoteGateways = new Map<string, RemoteGateway>()

  constructor(private readonly loadRemoteInstance: RemoteInstanceLoader) {}

  private canUseElectronBridge(): boolean {
    if (typeof window === 'undefined') return false
    const api = window.electronAPI
    return (
      !!api &&
      typeof api.invoke === 'function' &&
      typeof api.on === 'function' &&
      typeof api.removeListener === 'function'
    )
  }

  async resolve(instanceId: string): Promise<Gateway> {
    if (instanceId === LOCAL_INSTANCE_ID) {
      return this.localGateway
    }

    const cached = this.remoteGateways.get(instanceId)
    if (cached) return cached

    const instance = await this.loadRemoteInstance(instanceId)
    if (!instance) {
      throw new Error(`Remote instance not found: ${instanceId}`)
    }

    const token = this.canUseElectronBridge() ? undefined : await getRemoteInstanceToken(instanceId)
    const gateway = new RemoteGateway(instance, token ?? undefined)
    this.remoteGateways.set(instanceId, gateway)
    return gateway
  }

  invalidate(instanceId?: string): void {
    if (!instanceId) {
      for (const gateway of this.remoteGateways.values()) {
        gateway.dispose()
      }
      this.remoteGateways.clear()
      return
    }
    const gateway = this.remoteGateways.get(instanceId)
    gateway?.dispose()
    this.remoteGateways.delete(instanceId)
  }
}

let sharedGatewayResolver: GatewayResolver | null = null

export function getSharedGatewayResolver(): GatewayResolver {
  if (sharedGatewayResolver) return sharedGatewayResolver

  sharedGatewayResolver = new GatewayResolver(async (instanceId) => {
    const { useInstancesStore } = await import('../stores/instances')
    const instance = useInstancesStore().getInstance(instanceId)
    return instance?.type === 'remote' ? instance : null
  })

  return sharedGatewayResolver
}

export function resetSharedGatewayResolver(): void {
  sharedGatewayResolver?.invalidate()
  sharedGatewayResolver = null
}
