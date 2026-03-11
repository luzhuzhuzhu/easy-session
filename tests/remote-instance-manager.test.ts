import { copyFile, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteInstanceManager } from '../src/main/services/remote-instance-manager'

async function createTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'easysession-remote-instance-'))
}

describe('RemoteInstanceManager', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await createTempDir()
  })

  afterEach(async () => {
    vi.unstubAllGlobals()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('stores remote instance config and token in separate files', async () => {
    const manager = new RemoteInstanceManager(tempDir)
    await manager.init()

    const instance = await manager.addInstance({
      name: 'office',
      baseUrl: 'https://example.com/',
      token: 't'.repeat(64)
    })
    await manager.flush()

    const instancesRaw = await readFile(join(tempDir, 'remote-instances.json'), 'utf-8')
    const secretsRaw = await readFile(join(tempDir, 'remote-instance-secrets.json'), 'utf-8')
    const instances = JSON.parse(instancesRaw) as Array<Record<string, unknown>>
    const secrets = JSON.parse(secretsRaw) as Array<Record<string, unknown>>

    expect(instances).toHaveLength(1)
    expect(instances[0].name).toBe('office')
    expect(instances[0].baseUrl).toBe('https://example.com')
    expect(instances[0]).not.toHaveProperty('token')

    expect(secrets).toEqual([
      {
        instanceId: instance.id,
        token: 't'.repeat(64)
      }
    ])
    expect(manager.getToken(instance.id)).toBe('t'.repeat(64))
  })

  it('tests a stored instance and updates status, latency and capabilities', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()

      if (url.endsWith('/api/health')) {
        return new Response(JSON.stringify({ data: { ok: true, ts: 1 }, requestId: 'r1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      if (url.endsWith('/api/capabilities')) {
        return new Response(
          JSON.stringify({
            data: {
              passthroughOnly: true,
              serverVersion: '0.1.7-beta',
              capabilities: {
                projectsList: true,
                projectRead: true,
                projectCreate: false,
                projectUpdate: false,
                projectRemove: false,
                projectOpen: false,
                projectSessionsList: true,
                projectDetect: true,
                sessionsList: true,
                sessionSubscribe: true,
                sessionInput: true,
                sessionResize: true,
                sessionOutputHistory: true,
                sessionCreate: false,
                sessionStart: false,
                sessionPause: false,
                sessionRestart: false,
                sessionDestroy: false,
                projectPromptRead: false,
                projectPromptWrite: false,
                localPathOpen: false
              }
            },
            requestId: 'r2'
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }
      if (url.endsWith('/api/server-info')) {
        return new Response(
          JSON.stringify({
            data: {
              name: 'EasySession',
              machineName: 'office-host',
              platform: process.platform,
              serverVersion: '0.1.7-beta',
              baseUrl: 'https://example.com',
              passthroughOnly: true
            },
            requestId: 'r3'
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }
        )
      }

      throw new Error(`Unexpected url: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const manager = new RemoteInstanceManager(tempDir)
    await manager.init()
    const instance = await manager.addInstance({
      name: 'office',
      baseUrl: 'https://example.com',
      token: 'a'.repeat(64)
    })

    const result = await manager.testInstance(instance.id)
    const updated = manager.getInstance(instance.id)

    expect(result.ok).toBe(true)
    expect(result.status).toBe('online')
    expect(result.serverInfo?.machineName).toBe('office-host')
    expect(result.capabilities.sessionCreate).toBe(false)
    expect(result.latencyMs).not.toBeNull()

    expect(updated?.status).toBe('online')
    expect(updated?.passthroughOnly).toBe(true)
    expect(updated?.capabilities.sessionOutputHistory).toBe(true)
    expect(updated?.latencyMs).not.toBeNull()
    expect(updated?.lastError).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('marks stored instance as offline when connectivity test fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('connect ECONNREFUSED')
    }))

    const manager = new RemoteInstanceManager(tempDir)
    await manager.init()
    const instance = await manager.addInstance({
      name: 'home',
      baseUrl: 'https://home.example.com',
      token: 'b'.repeat(64)
    })

    const result = await manager.testInstance(instance.id)
    const updated = manager.getInstance(instance.id)

    expect(result.ok).toBe(false)
    expect(result.status).toBe('offline')
    expect(result.error).toContain('ECONNREFUSED')
    expect(updated?.status).toBe('offline')
    expect(updated?.lastError).toContain('ECONNREFUSED')
  })

  it('treats Cloudflare Quick Tunnel 530 as offline with actionable guidance', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      return new Response('<html>origin down</html>', {
        status: 530,
        headers: { 'Content-Type': 'text/html' }
      })
    }))

    const manager = new RemoteInstanceManager(tempDir)
    await manager.init()
    const instance = await manager.addInstance({
      name: 'cloudflare',
      baseUrl: 'https://demo.trycloudflare.com',
      token: 'd'.repeat(64)
    })

    const result = await manager.testInstance(instance.id)
    const updated = manager.getInstance(instance.id)

    expect(result.ok).toBe(false)
    expect(result.status).toBe('offline')
    expect(result.httpStatus).toBe(530)
    expect(result.error).toContain('Cloudflare Quick Tunnel')
    expect(updated?.status).toBe('offline')
    expect(updated?.lastError).toContain('Cloudflare Quick Tunnel')
  })

  it('restores instances and secrets from backup files when primary files are corrupted', async () => {
    const manager = new RemoteInstanceManager(tempDir)
    await manager.init()

    const created = await manager.addInstance({
      name: 'backup-office',
      baseUrl: 'https://backup.example.com',
      token: 'c'.repeat(64)
    })
    await manager.flush()

    const instancePath = join(tempDir, 'remote-instances.json')
    const secretsPath = join(tempDir, 'remote-instance-secrets.json')
    await copyFile(instancePath, `${instancePath}.bak`)
    await copyFile(secretsPath, `${secretsPath}.bak`)

    await writeFile(instancePath, '{"broken": ]', 'utf-8')
    await writeFile(secretsPath, '{"broken": ]', 'utf-8')

    const restored = new RemoteInstanceManager(tempDir)
    await restored.init()

    const instances = restored.listInstances()
    expect(instances).toHaveLength(1)
    expect(instances[0].id).toBe(created.id)
    expect(instances[0].name).toBe('backup-office')
    expect(restored.getToken(created.id)).toBe('c'.repeat(64))

    const persistedInstances = JSON.parse(await readFile(instancePath, 'utf-8')) as Array<Record<string, unknown>>
    const persistedSecrets = JSON.parse(await readFile(secretsPath, 'utf-8')) as Array<Record<string, unknown>>
    expect(persistedInstances[0].name).toBe('backup-office')
    expect(persistedSecrets[0].token).toBe('c'.repeat(64))
  })

  it('fills missing capability fields for legacy remote-instance records on init', async () => {
    await writeFile(
      join(tempDir, 'remote-instances.json'),
      JSON.stringify(
        [
          {
            id: 'legacy-remote',
            type: 'remote',
            name: 'legacy-office',
            baseUrl: 'https://legacy.example.com/',
            enabled: true,
            authRef: 'legacy-remote',
            status: 'unknown',
            capabilities: {
              projectsList: true,
              sessionsList: true
            }
          }
        ],
        null,
        2
      ),
      'utf-8'
    )
    await writeFile(
      join(tempDir, 'remote-instance-secrets.json'),
      JSON.stringify([{ instanceId: 'legacy-remote', token: 'z'.repeat(64) }], null, 2),
      'utf-8'
    )

    const manager = new RemoteInstanceManager(tempDir)
    await manager.init()

    const instance = manager.getInstance('legacy-remote')
    expect(instance).not.toBeNull()
    expect(instance?.baseUrl).toBe('https://legacy.example.com')
    expect(instance?.passthroughOnly).toBe(true)
    expect(instance?.capabilities.projectRead).toBe(true)
    expect(instance?.capabilities.projectCreate).toBe(false)
    expect(instance?.capabilities.sessionCreate).toBe(false)
    expect(instance?.capabilities.projectPromptRead).toBe(true)
  })
})
