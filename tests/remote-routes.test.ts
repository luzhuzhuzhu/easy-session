import { beforeEach, describe, expect, it, vi } from 'vitest'
import express from 'express'
import { createServer } from 'http'
import cors from 'cors'
import { createRestAuthMiddleware } from '../src/main/remote/auth'
import { registerRemoteRoutes } from '../src/main/remote/routes'
import type { RemoteDependencies, RemoteRouteRegistrationOptions } from '../src/main/remote/types'

const routeOptions: RemoteRouteRegistrationOptions = {
  defaultBaseUrl: 'http://127.0.0.1:18765',
  passthroughOnly: true,
  serverName: 'EasySession',
  serverVersion: '0.1.7-beta',
  platform: process.platform,
  machineName: 'route-test-host'
}

async function startServer(app: express.Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = createServer(app)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to start server')
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      })
  }
}

describe('remote routes', () => {
  const token = 'c'.repeat(64)
  let deps: RemoteDependencies

  beforeEach(() => {
    const projects = [
      {
        id: 'p1',
        name: 'demo',
        path: 'D:/repo/demo',
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        pathExists: true
      }
    ]
    const sessions = [
      {
        id: 's1',
        name: 'Claude-001',
        icon: null,
        type: 'claude',
        projectPath: 'D:/repo/demo',
        status: 'running',
        createdAt: Date.now(),
        lastStartAt: Date.now(),
        totalRunMs: 0,
        lastRunMs: 0,
        lastActiveAt: Date.now(),
        processId: 'proc-s1',
        options: {},
        parentId: null,
        claudeSessionId: null
      }
    ] as any[]

    deps = {
      outputManager: {
        getHistory: vi.fn((_sessionId: string, lines?: number) => [
          {
            text: 'hello\n',
            stream: 'stdout',
            timestamp: Date.now(),
            seq: 1
          }
        ].slice(0, lines ? 1 : 1)),
        subscribe: vi.fn(() => () => undefined)
      } as any,
      projectManager: {
        listProjects: vi.fn(async () => projects),
        getProject: vi.fn((id: string) => projects.find((p) => p.id === id)),
        getProjectByPath: vi.fn((path: string) => projects.find((p) => p.path === path)),
        addProject: vi.fn(async (path: string, name?: string) => ({
          id: 'p2',
          name: name || 'new-project',
          path,
          createdAt: Date.now(),
          lastOpenedAt: Date.now(),
          pathExists: true
        })),
        updateProject: vi.fn(async (id: string, updates: { name?: string }) => {
          const project = projects.find((p) => p.id === id)
          return project ? { ...project, ...updates } : null
        }),
        removeProject: vi.fn(async (id: string) => id === 'p1'),
        openProject: vi.fn(async (id: string) => projects.find((p) => p.id === id) ?? null),
        readProjectPromptFile: vi.fn(async (id: string, cliType: 'claude' | 'codex') => {
          if (id !== 'p1') return null
          return {
            path: cliType === 'claude' ? 'D:/repo/demo/CLAUDE.md' : 'D:/repo/demo/AGENTS.md',
            content: `prompt-${cliType}`,
            exists: true
          }
        }),
        writeProjectPromptFile: vi.fn(async (id: string, cliType: 'claude' | 'codex', content: string) => {
          if (id !== 'p1') return null
          return {
            path: cliType === 'claude' ? 'D:/repo/demo/CLAUDE.md' : 'D:/repo/demo/AGENTS.md',
            content,
            exists: true
          }
        })
      } as any,
      sessionManager: {
        listSessions: vi.fn(() => sessions),
        getSession: vi.fn((id: string) => sessions.find((s) => s.id === id)),
        createSession: vi.fn((params: any) => ({ ...sessions[0], id: 's2', name: params.name || 'new' })),
        startSession: vi.fn(async (id: string) => (id === 's1' ? sessions[0] : null)),
        pauseSession: vi.fn((id: string) => (id === 's1' ? { ...sessions[0], status: 'stopped' } : null)),
        restartSession: vi.fn(async (id: string) => (id === 's1' ? sessions[0] : null)),
        destroySession: vi.fn((id: string) => id === 's1')
      } as any
    }
  })

  function buildApp(passthroughOnly = true): express.Express {
    const app = express()
    const corsOptions = {
      origin: true,
      credentials: false,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
      optionsSuccessStatus: 204
    } as const
    app.use(express.json())
    app.use((req, _res, next) => {
      ;(req as any).__requestId = 'route-test'
      next()
    })
    app.use(cors(corsOptions))
    app.options('*', cors(corsOptions))
    app.use('/api', createRestAuthMiddleware(token))
    registerRemoteRoutes(app, deps, {
      ...routeOptions,
      passthroughOnly
    })
    return app
  }

  it('should enforce bearer auth', async () => {
    const server = await startServer(buildApp())
    try {
      const resp = await fetch(`${server.baseUrl}/api/health`)
      expect(resp.status).toBe(401)
    } finally {
      await server.close()
    }
  })

  it('should return projects and sessions with projectId mapping', async () => {
    const server = await startServer(buildApp())
    try {
      const projectsResp = await fetch(`${server.baseUrl}/api/projects`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(projectsResp.status).toBe(200)
      const projectsBody = await projectsResp.json()
      expect(projectsBody.data).toHaveLength(1)

      const sessionsResp = await fetch(`${server.baseUrl}/api/sessions`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(sessionsResp.status).toBe(200)
      const sessionsBody = await sessionsResp.json()
      expect(sessionsBody.data).toHaveLength(1)
      expect(sessionsBody.data[0].projectId).toBe('p1')
    } finally {
      await server.close()
    }
  })

  it('should return capabilities and server info', async () => {
    const server = await startServer(buildApp())
    try {
      const [capResp, infoResp] = await Promise.all([
        fetch(`${server.baseUrl}/api/capabilities`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${server.baseUrl}/api/server-info`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      expect(capResp.status).toBe(200)
      expect(infoResp.status).toBe(200)

      const capBody = await capResp.json()
      expect(capBody.data.passthroughOnly).toBe(true)
      expect(capBody.data.serverVersion).toBe(routeOptions.serverVersion)
      expect(capBody.data.capabilities.sessionInput).toBe(true)
      expect(capBody.data.capabilities.sessionCreate).toBe(false)
      expect(capBody.data.capabilities.projectRead).toBe(true)
      expect(capBody.data.capabilities.projectCreate).toBe(false)
      expect(capBody.data.capabilities.projectSessionsList).toBe(true)
      expect(capBody.data.capabilities.projectPromptRead).toBe(true)

      const infoBody = await infoResp.json()
      expect(infoBody.data.name).toBe(routeOptions.serverName)
      expect(infoBody.data.machineName).toBe(routeOptions.machineName)
      expect(infoBody.data.baseUrl).toBe(server.baseUrl)
      expect(infoBody.data.passthroughOnly).toBe(true)
    } finally {
      await server.close()
    }
  })

  it('should disable caching for login and sessions html pages', async () => {
    const server = await startServer(buildApp())
    try {
      const [loginResp, sessionsResp] = await Promise.all([
        fetch(`${server.baseUrl}/login`),
        fetch(`${server.baseUrl}/sessions`)
      ])

      expect(loginResp.status).toBe(200)
      expect(sessionsResp.status).toBe(200)
      expect(loginResp.headers.get('cache-control')).toBe('no-store')
      expect(sessionsResp.headers.get('cache-control')).toBe('no-store')
    } finally {
      await server.close()
    }
  })

  it('should keep root redirect relative so reverse proxies can preserve path prefixes', async () => {
    const server = await startServer(buildApp())
    try {
      const resp = await fetch(`${server.baseUrl}/`, {
        redirect: 'manual'
      })

      expect(resp.status).toBe(302)
      expect(resp.headers.get('location')).toBe('sessions')
    } finally {
      await server.close()
    }
  })

  it('should derive public base url from forwarded proxy headers', async () => {
    const server = await startServer(buildApp())
    try {
      const forwardedHeaders = {
        Authorization: `Bearer ${token}`,
        'X-Forwarded-Proto': 'https',
        'X-Forwarded-Host': 'remote.example.com',
        'X-Forwarded-Prefix': '/easy'
      }

      const [loginResp, sessionsResp, infoResp] = await Promise.all([
        fetch(`${server.baseUrl}/login`, { headers: forwardedHeaders }),
        fetch(`${server.baseUrl}/sessions`, { headers: forwardedHeaders }),
        fetch(`${server.baseUrl}/api/server-info`, { headers: forwardedHeaders })
      ])

      expect(loginResp.status).toBe(200)
      expect(sessionsResp.status).toBe(200)
      expect(infoResp.status).toBe(200)

      const [loginHtml, sessionsHtml, infoBody] = await Promise.all([
        loginResp.text(),
        sessionsResp.text(),
        infoResp.json()
      ])

      expect(loginHtml).toContain('const defaultBaseUrl = "https://remote.example.com/easy";')
      expect(loginHtml).toContain("location.href = 'sessions';")
      expect(sessionsHtml).toContain('href="./remote-assets/xterm.css"')
      expect(sessionsHtml).toContain("location.href = 'login';")
      expect(infoBody.data.baseUrl).toBe('https://remote.example.com/easy')
    } finally {
      await server.close()
    }
  })

  it('should serve xterm fit addon under both legacy and addon-fit asset names', async () => {
    const server = await startServer(buildApp())
    try {
      const [legacyResp, addonResp] = await Promise.all([
        fetch(`${server.baseUrl}/remote-assets/xterm-fit.js`),
        fetch(`${server.baseUrl}/remote-assets/xterm-addon-fit.js`)
      ])

      expect(legacyResp.status).toBe(200)
      expect(addonResp.status).toBe(200)
      expect(legacyResp.headers.get('content-type')).toContain('application/javascript')
      expect(addonResp.headers.get('content-type')).toContain('application/javascript')
    } finally {
      await server.close()
    }
  })

  it('should answer CORS preflight for authenticated api routes', async () => {
    const server = await startServer(buildApp())
    try {
      const resp = await fetch(`${server.baseUrl}/api/projects`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5173',
          'Access-Control-Request-Method': 'GET',
          'Access-Control-Request-Headers': 'authorization'
        }
      })
      expect(resp.status).toBe(204)
      expect(resp.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
      expect(resp.headers.get('access-control-allow-headers')).toContain('Authorization')
    } finally {
      await server.close()
    }
  })

  it('should return session output history via rest endpoint', async () => {
    const server = await startServer(buildApp())
    try {
      const resp = await fetch(`${server.baseUrl}/api/sessions/s1/output?lines=10`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(resp.status).toBe(200)
      const body = await resp.json()
      expect(body.data.sessionId).toBe('s1')
      expect(body.data.lines).toHaveLength(1)
      expect((deps.outputManager.getHistory as any).mock.calls[0]).toEqual(['s1', 10])
    } finally {
      await server.close()
    }
  })

  it('should reject invalid session output history query', async () => {
    const server = await startServer(buildApp())
    try {
      const resp = await fetch(`${server.baseUrl}/api/sessions/s1/output?lines=0`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      expect(resp.status).toBe(400)
      const body = await resp.json()
      expect(body.code).toBe('BAD_REQUEST')
    } finally {
      await server.close()
    }
  })

  it('should allow project read endpoints in passthrough-only mode', async () => {
    const server = await startServer(buildApp())
    try {
      const [projectResp, sessionsResp, detectResp, promptResp] = await Promise.all([
        fetch(`${server.baseUrl}/api/projects/p1`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${server.baseUrl}/api/projects/p1/sessions`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${server.baseUrl}/api/projects/p1/detect`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch(`${server.baseUrl}/api/projects/p1/prompt?cliType=claude`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ])

      expect(projectResp.status).toBe(200)
      expect(sessionsResp.status).toBe(200)
      expect(detectResp.status).toBe(200)
      expect(promptResp.status).toBe(200)

      const projectBody = await projectResp.json()
      const sessionsBody = await sessionsResp.json()
      const detectBody = await detectResp.json()
      const promptBody = await promptResp.json()

      expect(projectBody.data.id).toBe('p1')
      expect(sessionsBody.data[0].projectId).toBe('p1')
      expect(detectBody.data).toEqual({
        claude: false,
        codex: false,
        opencode: false
      })
      expect(promptBody.data.content).toBe('prompt-claude')
    } finally {
      await server.close()
    }
  })

  it('should keep project write endpoints disabled in passthrough-only mode', async () => {
    const server = await startServer(buildApp())
    try {
      const resp = await fetch(`${server.baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: 'D:/repo/new-project',
          name: 'new-project'
        })
      })
      expect(resp.status).toBe(403)
      const body = await resp.json()
      expect(body.code).toBe('PASSTHROUGH_ONLY')
      expect((deps.projectManager.addProject as any).mock.calls.length).toBe(0)
    } finally {
      await server.close()
    }
  })

  it('should allow project write endpoints when passthrough-only is disabled', async () => {
    const server = await startServer(buildApp(false))
    try {
      const createResp = await fetch(`${server.baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: 'D:/repo/new-project',
          name: 'new-project'
        })
      })
      expect(createResp.status).toBe(200)
      const createBody = await createResp.json()
      expect(createBody.data.path).toBe('D:/repo/new-project')

      const promptResp = await fetch(`${server.baseUrl}/api/projects/p1/prompt?cliType=claude`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: 'updated prompt'
        })
      })
      expect(promptResp.status).toBe(200)
      const promptBody = await promptResp.json()
      expect(promptBody.data.content).toBe('updated prompt')
      expect((deps.projectManager.writeProjectPromptFile as any).mock.calls[0]).toEqual([
        'p1',
        'claude',
        'updated prompt'
      ])
    } finally {
      await server.close()
    }
  })

  it('should return PROJECT_ALREADY_EXISTS when creating a duplicate remote project', async () => {
    const server = await startServer(buildApp(false))
    try {
      const resp = await fetch(`${server.baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          path: 'D:/repo/demo',
          name: 'demo'
        })
      })
      expect(resp.status).toBe(409)
      const body = await resp.json()
      expect(body.code).toBe('PROJECT_ALREADY_EXISTS')
      expect((deps.projectManager.addProject as any).mock.calls.length).toBe(0)
    } finally {
      await server.close()
    }
  })

  it('should reject lifecycle operations in passthrough-only mode', async () => {
    const server = await startServer(buildApp())
    try {
      const resp = await fetch(`${server.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'claude',
          projectId: 'p1',
          name: 'remote-created'
        })
      })
      expect(resp.status).toBe(403)
      const body = await resp.json()
      expect(body.code).toBe('PASSTHROUGH_ONLY')
      expect((deps.sessionManager.createSession as any).mock.calls.length).toBe(0)
    } finally {
      await server.close()
    }
  })

  it('should allow lifecycle operations when passthrough-only is disabled', async () => {
    const server = await startServer(buildApp(false))
    try {
      const resp = await fetch(`${server.baseUrl}/api/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'claude',
          projectId: 'p1',
          name: 'remote-created'
        })
      })
      expect(resp.status).toBe(200)
      expect((deps.sessionManager.createSession as any).mock.calls[0][0].projectPath).toBe('D:/repo/demo')
      const body = await resp.json()
      expect(body.data.projectId).toBe('p1')
    } finally {
      await server.close()
    }
  })
})
