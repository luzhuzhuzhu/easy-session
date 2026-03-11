import { createHash, randomBytes } from 'crypto'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import {
  DEFAULT_REMOTE_HOST,
  DEFAULT_REMOTE_IDLE_TIMEOUT_MS,
  DEFAULT_REMOTE_PORT,
  DEFAULT_REMOTE_RATE_LIMIT_MAX,
  DEFAULT_REMOTE_RATE_LIMIT_WINDOW_MS,
  DEFAULT_REMOTE_TOKEN_FILE
} from './defaults'
import type { RemoteRuntimeConfig } from './types'
import { readRemoteServiceSettingsSnapshot } from '../services/remote-service-settings-manager'
import type {
  RemoteServiceEnvOverrides,
  RemoteServiceSettingsSnapshot
} from '../services/remote-service-settings-types'

function parseBool(raw: string | undefined, fallback = false): boolean {
  if (!raw) return fallback
  const normalized = raw.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function parseIntWithDefault(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return parsed
}

function normalizeToken(raw: string): string {
  return raw.trim()
}

function hasTruthyEnv(raw: string | undefined): boolean {
  return typeof raw === 'string' && raw.trim().length > 0
}

function getEnvOverrides(): RemoteServiceEnvOverrides {
  return {
    enabled: typeof process.env.EASYSESSION_REMOTE_ENABLED === 'string',
    host: hasTruthyEnv(process.env.EASYSESSION_REMOTE_HOST),
    port: hasTruthyEnv(process.env.EASYSESSION_REMOTE_PORT),
    passthroughOnly: typeof process.env.EASYSESSION_REMOTE_PASSTHROUGH_ONLY === 'string',
    token: hasTruthyEnv(process.env.EASYSESSION_REMOTE_TOKEN)
  }
}

async function tryReadTokenFromFile(filePath: string): Promise<string | null> {
  try {
    const token = normalizeToken(await readFile(filePath, 'utf-8'))
    if (token.length >= 64) return token
    return null
  } catch {
    return null
  }
}

async function writeTokenToFile(filePath: string, token: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, token, 'utf-8')
}

export function fingerprintToken(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 12)
}

export function getRemoteTokenFilePath(userDataPath: string): string {
  return join(userDataPath, DEFAULT_REMOTE_TOKEN_FILE)
}

function formatUrlHost(host: string): string {
  if (host.includes(':') && !host.startsWith('[') && !host.endsWith(']')) {
    return `[${host}]`
  }
  return host
}

export function buildRemoteBaseUrl(host: string, port: number): string {
  return `http://${formatUrlHost(host.trim())}:${port}`
}

export async function regenerateDefaultRemoteToken(userDataPath: string): Promise<string> {
  const tokenFilePath = getRemoteTokenFilePath(userDataPath)
  const generatedToken = randomBytes(32).toString('hex')
  await writeTokenToFile(tokenFilePath, generatedToken)
  return generatedToken
}

export async function loadRemoteRuntimeConfig(
  userDataPath: string,
  settingsSnapshot?: RemoteServiceSettingsSnapshot
): Promise<RemoteRuntimeConfig> {
  const settings = settingsSnapshot ?? (await readRemoteServiceSettingsSnapshot(userDataPath))
  const envOverrides = getEnvOverrides()

  const enabled = envOverrides.enabled
    ? parseBool(process.env.EASYSESSION_REMOTE_ENABLED, settings.enabled)
    : settings.enabled
  const passthroughOnly = envOverrides.passthroughOnly
    ? parseBool(process.env.EASYSESSION_REMOTE_PASSTHROUGH_ONLY, settings.passthroughOnly)
    : settings.passthroughOnly
  const host = envOverrides.host
    ? process.env.EASYSESSION_REMOTE_HOST!.trim()
    : settings.host || DEFAULT_REMOTE_HOST
  const port = envOverrides.port
    ? parseIntWithDefault(process.env.EASYSESSION_REMOTE_PORT, settings.port)
    : settings.port || DEFAULT_REMOTE_PORT
  const idleTimeoutMs = parseIntWithDefault(
    process.env.EASYSESSION_REMOTE_IDLE_TIMEOUT_MS,
    DEFAULT_REMOTE_IDLE_TIMEOUT_MS
  )
  const rateLimitWindowMs = parseIntWithDefault(
    process.env.EASYSESSION_REMOTE_RATE_LIMIT_WINDOW_MS,
    DEFAULT_REMOTE_RATE_LIMIT_WINDOW_MS
  )
  const rateLimitMax = parseIntWithDefault(
    process.env.EASYSESSION_REMOTE_RATE_LIMIT_MAX,
    DEFAULT_REMOTE_RATE_LIMIT_MAX
  )
  const tokenFilePath = getRemoteTokenFilePath(userDataPath)

  const envToken = process.env.EASYSESSION_REMOTE_TOKEN
  if (envOverrides.token && envToken && normalizeToken(envToken).length >= 64) {
    return {
      enabled,
      configuredEnabled: settings.enabled,
      passthroughOnly,
      host,
      port,
      token: normalizeToken(envToken),
      idleTimeoutMs,
      rateLimitWindowMs,
      rateLimitMax,
      tokenSource: 'env',
      tokenFilePath,
      tokenMode: settings.tokenMode,
      envOverrides,
      baseUrl: buildRemoteBaseUrl(host, port)
    }
  }

  if (settings.tokenMode === 'custom' && settings.customToken && settings.customToken.length >= 64) {
    return {
      enabled,
      configuredEnabled: settings.enabled,
      passthroughOnly,
      host,
      port,
      token: settings.customToken,
      idleTimeoutMs,
      rateLimitWindowMs,
      rateLimitMax,
      tokenSource: 'custom',
      tokenFilePath,
      tokenMode: settings.tokenMode,
      envOverrides,
      baseUrl: buildRemoteBaseUrl(host, port)
    }
  }

  const fileToken = await tryReadTokenFromFile(tokenFilePath)
  if (fileToken) {
    return {
      enabled,
      configuredEnabled: settings.enabled,
      passthroughOnly,
      host,
      port,
      token: fileToken,
      idleTimeoutMs,
      rateLimitWindowMs,
      rateLimitMax,
      tokenSource: 'file',
      tokenFilePath,
      tokenMode: settings.tokenMode,
      envOverrides,
      baseUrl: buildRemoteBaseUrl(host, port)
    }
  }

  const generatedToken = randomBytes(32).toString('hex')
  await writeTokenToFile(tokenFilePath, generatedToken)
  return {
    enabled,
    configuredEnabled: settings.enabled,
    passthroughOnly,
    host,
    port,
    token: generatedToken,
    idleTimeoutMs,
    rateLimitWindowMs,
    rateLimitMax,
    tokenSource: 'generated',
    tokenFilePath,
    tokenMode: settings.tokenMode,
    envOverrides,
    baseUrl: buildRemoteBaseUrl(host, port)
  }
}
