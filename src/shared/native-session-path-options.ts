import type { CliType, CustomCliArgument } from './cli-types'
import { normalizeNativeSessionDiscoveryPayload, type NativeSessionDiscoveryResult } from './native-session-candidates'

export interface NativeSessionPathOptions { profile?: string; sessionDir?: string }

export function normalizeNativeSessionPathOptions(value: unknown): NativeSessionPathOptions | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid native session path options')
  const raw = value as Record<string, unknown>
  const options: NativeSessionPathOptions = {}
  for (const key of ['profile', 'sessionDir'] as const) {
    if (raw[key] === undefined) continue
    if (typeof raw[key] !== 'string' || raw[key].length > 4096 || /[\r\n\0]/.test(raw[key])) throw new Error('Invalid native session path option')
    options[key] = raw[key].trim()
  }
  return Object.keys(options).length ? options : undefined
}

/** Only interpret documented path selectors; never shell-parse arbitrary custom arguments. */
export function nativeSessionPathOptions(cli: CliType, args: CustomCliArgument[]): NativeSessionPathOptions | undefined {
  const options: NativeSessionPathOptions = {}
  for (const arg of args) {
    if (arg.name === '--') break
    const [name, ...inline] = arg.name.split('=')
    const value = inline.length ? inline.join('=') : arg.value
    if (value === undefined) continue
    if ((cli === 'omp' || cli === 'hermes') && (name === '--profile' || cli === 'hermes' && name === '-p')) options.profile = value
    if ((cli === 'pi' || cli === 'omp') && name === '--session-dir') options.sessionDir = value
  }
  return normalizeNativeSessionPathOptions(options)
}

export function discoveryForPathOptions(payload: unknown, options?: NativeSessionPathOptions): NativeSessionDiscoveryResult {
  if (normalizeNativeSessionPathOptions(options) && !(payload && typeof payload === 'object' && 'pathContextApplied' in payload && payload.pathContextApplied === true)) {
    return {status:'unsupported',candidates:[],message:'This instance does not support profile-specific session discovery'}
  }
  return normalizeNativeSessionDiscoveryPayload(payload)
}
