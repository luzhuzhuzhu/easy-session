import type { Express, Request, Response } from 'express'
import { existsSync } from 'fs'
import { access } from 'fs/promises'
import { createRequire } from 'module'
import { join } from 'path'
import type {
  RemoteCapabilitiesResponse,
  RemoteDependencies,
  RemoteProjectCreateBody,
  RemoteProjectDto,
  RemoteProjectPromptBody,
  RemoteRouteRegistrationOptions,
  RemoteServerInfoResponse,
  RemoteProjectUpdateBody,
  RemoteSessionCreateBody,
  RemoteSessionDto,
  RemoteSessionOutputHistoryResponse,
  RemoteSuccessBody
} from './types'
import { buildRemoteCapabilityMap } from './capabilities'
import { renderLoginPage, renderSessionsPage } from './web'

const moduleRequire = createRequire(import.meta.url)

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message)
  }
}

function getRequestId(req: Request): string {
  return ((req as any).__requestId as string | undefined) || 'n/a'
}

function sendSuccess<T>(res: Response, requestId: string, data: T): void {
  const body: RemoteSuccessBody<T> = { data, requestId }
  res.json(body)
}

function sendError(res: Response, requestId: string, status: number, code: string, message: string): void {
  res.status(status).json({
    code,
    message,
    requestId
  })
}

function parseSessionListFilter(req: Request): {
  type?: 'claude' | 'codex' | 'opencode'
  status?: 'idle' | 'running' | 'stopped' | 'error'
  projectId?: string
  projectPath?: string
  parentId?: string
} {
  const filter: {
    type?: 'claude' | 'codex' | 'opencode'
    status?: 'idle' | 'running' | 'stopped' | 'error'
    projectId?: string
    projectPath?: string
    parentId?: string
  } = {}

  const typeRaw = req.query.type
  if (typeof typeRaw === 'string' && ['claude', 'codex', 'opencode'].includes(typeRaw)) {
    filter.type = typeRaw as 'claude' | 'codex' | 'opencode'
  }

  const statusRaw = req.query.status
  if (typeof statusRaw === 'string' && ['idle', 'running', 'stopped', 'error'].includes(statusRaw)) {
    filter.status = statusRaw as 'idle' | 'running' | 'stopped' | 'error'
  }

  const projectIdRaw = req.query.projectId
  if (typeof projectIdRaw === 'string' && projectIdRaw.trim()) {
    filter.projectId = projectIdRaw.trim()
  }

  const projectPathRaw = req.query.projectPath
  if (typeof projectPathRaw === 'string' && projectPathRaw.trim()) {
    filter.projectPath = projectPathRaw.trim()
  }

  const parentIdRaw = req.query.parentId
  if (typeof parentIdRaw === 'string' && parentIdRaw.trim()) {
    filter.parentId = parentIdRaw.trim()
  }

  return filter
}

function parseHistoryLines(req: Request): number | undefined {
  const linesRaw = req.query.lines
  if (linesRaw === undefined) return undefined
  if (typeof linesRaw !== 'string' || !linesRaw.trim()) {
    throw new HttpError(400, 'BAD_REQUEST', 'lines must be a positive integer')
  }

  const parsed = Number.parseInt(linesRaw.trim(), 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new HttpError(400, 'BAD_REQUEST', 'lines must be a positive integer')
  }

  return Math.min(parsed, 2000)
}

function getRouteParam(req: Request, key: string): string {
  const raw = req.params[key]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'BAD_REQUEST', `${key} is required`)
  }
  return value.trim()
}

function parseCreateBody(body: unknown): RemoteSessionCreateBody {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'BAD_REQUEST', 'Body must be an object')
  }

  const candidate = body as Record<string, unknown>
  const type = candidate.type
  if (type !== 'claude' && type !== 'codex' && type !== 'opencode') {
    throw new HttpError(400, 'BAD_REQUEST', 'Invalid session type')
  }

  const startPausedRaw = candidate.startPaused
  const startPaused =
    typeof startPausedRaw === 'boolean'
      ? startPausedRaw
      : typeof startPausedRaw === 'string'
        ? startPausedRaw === 'true'
        : undefined

  const parsed: RemoteSessionCreateBody = {
    type,
    projectId: typeof candidate.projectId === 'string' ? candidate.projectId.trim() : undefined,
    projectPath: typeof candidate.projectPath === 'string' ? candidate.projectPath.trim() : undefined,
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : undefined,
    icon: typeof candidate.icon === 'string' ? candidate.icon : undefined,
    options: typeof candidate.options === 'object' && candidate.options ? (candidate.options as Record<string, unknown>) : {},
    parentId: typeof candidate.parentId === 'string' ? candidate.parentId.trim() : undefined,
    startPaused
  }

  if (!parsed.projectId && !parsed.projectPath) {
    throw new HttpError(400, 'BAD_REQUEST', 'projectId or projectPath is required')
  }

  return parsed
}

function parseProjectCreateBody(body: unknown): RemoteProjectCreateBody {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'BAD_REQUEST', 'Body must be an object')
  }

  const candidate = body as Record<string, unknown>
  if (typeof candidate.path !== 'string' || !candidate.path.trim()) {
    throw new HttpError(400, 'BAD_REQUEST', 'path is required')
  }

  return {
    path: candidate.path.trim(),
    name: typeof candidate.name === 'string' && candidate.name.trim() ? candidate.name.trim() : undefined
  }
}

function parseProjectUpdateBody(body: unknown): RemoteProjectUpdateBody {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'BAD_REQUEST', 'Body must be an object')
  }

  const candidate = body as Record<string, unknown>
  const parsed: RemoteProjectUpdateBody = {}

  if (candidate.name !== undefined) {
    if (typeof candidate.name !== 'string' || !candidate.name.trim()) {
      throw new HttpError(400, 'BAD_REQUEST', 'name must be a non-empty string')
    }
    parsed.name = candidate.name.trim()
  }

  if (parsed.name === undefined) {
    throw new HttpError(400, 'BAD_REQUEST', 'No supported project fields provided')
  }

  return parsed
}

function parseProjectPromptBody(body: unknown): RemoteProjectPromptBody {
  if (!body || typeof body !== 'object') {
    throw new HttpError(400, 'BAD_REQUEST', 'Body must be an object')
  }

  const candidate = body as Record<string, unknown>
  if (typeof candidate.content !== 'string') {
    throw new HttpError(400, 'BAD_REQUEST', 'content must be a string')
  }

  return {
    content: candidate.content
  }
}

function parsePromptCliType(req: Request): 'claude' | 'codex' {
  const raw = req.query.cliType
  if (raw === 'claude' || raw === 'codex') return raw
  throw new HttpError(400, 'BAD_REQUEST', 'cliType must be claude or codex')
}

async function resolveProjectPath(
  deps: RemoteDependencies,
  body: RemoteSessionCreateBody
): Promise<string> {
  if (body.projectPath) return body.projectPath
  if (!body.projectId) {
    throw new HttpError(400, 'BAD_REQUEST', 'projectId or projectPath is required')
  }
  const project = deps.projectManager.getProject(body.projectId)
  if (!project) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${body.projectId}`)
  }
  return project.path
}

function withHandler(
  handler: (req: Request, res: Response) => Promise<void> | void
): (req: Request, res: Response) => Promise<void> {
  return async (req: Request, res: Response) => {
    const requestId = getRequestId(req)
    try {
      await handler(req, res)
    } catch (err) {
      if (err instanceof HttpError) {
        sendError(res, requestId, err.status, err.code, err.message)
        return
      }
      const message = err instanceof Error ? err.message : String(err)
      sendError(res, requestId, 500, 'INTERNAL_ERROR', message)
    }
  }
}

function assertLifecycleAllowed(passthroughOnly: boolean): void {
  if (!passthroughOnly) return
  throw new HttpError(
    403,
    'PASSTHROUGH_ONLY',
    'Remote passthrough mode enabled: lifecycle operations are disabled'
  )
}

function assertRemoteCapability(enabled: boolean, message: string): void {
  if (enabled) return
  throw new HttpError(403, 'PASSTHROUGH_ONLY', message)
}

function toRemoteSessionDto(deps: RemoteDependencies, session: RemoteSessionDto | any): RemoteSessionDto {
  const project = deps.projectManager.getProjectByPath(session.projectPath)
  return {
    ...session,
    projectId: project?.id ?? null
  }
}

function getFirstHeaderValue(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined
  const [firstValue] = value.split(',')
  const normalized = firstValue?.trim()
  return normalized ? normalized : undefined
}

function normalizeForwardedPrefix(rawPrefix: string | undefined): string {
  const prefix = getFirstHeaderValue(rawPrefix)
  if (!prefix || prefix === '/') return ''
  return '/' + prefix.replace(/^\/+/, '').replace(/\/+$/, '')
}

function resolveRequestBaseUrl(req: Request, fallbackBaseUrl: string): string {
  try {
    const fallback = new URL(fallbackBaseUrl)
    const protocol =
      getFirstHeaderValue(req.header('x-forwarded-proto')) ||
      req.protocol ||
      fallback.protocol.replace(/:$/, '')
    const host =
      getFirstHeaderValue(req.header('x-forwarded-host')) ||
      req.get('host') ||
      fallback.host
    const prefix = normalizeForwardedPrefix(
      req.header('x-forwarded-prefix') || req.header('x-forwarded-pathbase')
    )

    return `${protocol}://${host}${prefix}`
  } catch {
    return fallbackBaseUrl.replace(/\/$/, '')
  }
}

export function resolveRemoteAssetPath(pathSegments: string[]): string | null {
  const moduleSpecifier = pathSegments.join('/')
  const candidates: string[] = []

  try {
    candidates.push(moduleRequire.resolve(moduleSpecifier))
  } catch {
    // Fall through to packaged and cwd-based lookups.
  }

  candidates.push(join(process.cwd(), 'node_modules', ...pathSegments))

  const resourcesPath =
    typeof process.resourcesPath === 'string' && process.resourcesPath.trim()
      ? process.resourcesPath.trim()
      : ''

  if (resourcesPath) {
    candidates.push(join(resourcesPath, 'app.asar', 'node_modules', ...pathSegments))
    candidates.push(join(resourcesPath, 'app.asar.unpacked', 'node_modules', ...pathSegments))
    candidates.push(join(resourcesPath, 'node_modules', ...pathSegments))
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function registerRemoteRoutes(
  app: Express,
  deps: RemoteDependencies,
  options: RemoteRouteRegistrationOptions
): void {
  const { defaultBaseUrl, passthroughOnly, machineName, platform, serverName, serverVersion } = options
  const capabilities = buildRemoteCapabilityMap(passthroughOnly)
  const xtermJsPath = resolveRemoteAssetPath(['@xterm', 'xterm', 'lib', 'xterm.js'])
  const xtermCssPath = resolveRemoteAssetPath(['@xterm', 'xterm', 'css', 'xterm.css'])
  const xtermFitPath = resolveRemoteAssetPath(['@xterm', 'addon-fit', 'lib', 'addon-fit.js'])

  app.get('/remote-assets/xterm.js', (_req, res) => {
    if (!xtermJsPath || !existsSync(xtermJsPath)) {
      res.status(404).send('xterm.js not found')
      return
    }
    res.type('application/javascript').sendFile(xtermJsPath)
  })

  app.get('/remote-assets/xterm.css', (_req, res) => {
    if (!xtermCssPath || !existsSync(xtermCssPath)) {
      res.status(404).send('xterm.css not found')
      return
    }
    res.type('text/css').sendFile(xtermCssPath)
  })

  const sendXtermFit = (_req: Request, res: Response): void => {
    if (!xtermFitPath || !existsSync(xtermFitPath)) {
      res.status(404).send('xterm-fit.js not found')
      return
    }
    res.type('application/javascript').sendFile(xtermFitPath)
  }

  app.get('/remote-assets/xterm-fit.js', sendXtermFit)
  app.get('/remote-assets/xterm-addon-fit.js', sendXtermFit)

  app.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store')
    res.redirect('sessions')
  })

  app.get('/login', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.type('html').send(renderLoginPage(resolveRequestBaseUrl(req, defaultBaseUrl)))
  })

  app.get('/sessions', (req, res) => {
    res.set('Cache-Control', 'no-store')
    res.type('html').send(renderSessionsPage(resolveRequestBaseUrl(req, defaultBaseUrl), passthroughOnly))
  })

  app.get(
    '/api/health',
    withHandler(async (req, res) => {
      sendSuccess(res, getRequestId(req), {
        ok: true,
        ts: Date.now()
      })
    })
  )

  app.get(
    '/api/capabilities',
    withHandler(async (req, res) => {
      const response: RemoteCapabilitiesResponse = {
        passthroughOnly,
        serverVersion,
        capabilities
      }
      sendSuccess(res, getRequestId(req), response)
    })
  )

  app.get(
    '/api/server-info',
    withHandler(async (req, res) => {
      const response: RemoteServerInfoResponse = {
        name: serverName,
        machineName,
        platform,
        serverVersion,
        baseUrl: resolveRequestBaseUrl(req, defaultBaseUrl),
        passthroughOnly
      }
      sendSuccess(res, getRequestId(req), response)
    })
  )

  app.get(
    '/api/projects',
    withHandler(async (req, res) => {
      const projects = await deps.projectManager.listProjects()
      sendSuccess(res, getRequestId(req), projects)
    })
  )

  app.get(
    '/api/projects/:id',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectRead, 'Remote project read is disabled')
      const id = getRouteParam(req, 'id')
      const project = deps.projectManager.getProject(id)
      if (!project) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      sendSuccess<RemoteProjectDto>(res, getRequestId(req), project)
    })
  )

  app.get(
    '/api/projects/:id/sessions',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectSessionsList, 'Remote project sessions list is disabled')
      const id = getRouteParam(req, 'id')
      const project = deps.projectManager.getProject(id)
      if (!project) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      const sessions = deps.sessionManager.listSessions({ projectPath: project.path })
      sendSuccess(
        res,
        getRequestId(req),
        sessions.map((session) => toRemoteSessionDto(deps, session))
      )
    })
  )

  app.get(
    '/api/projects/:id/detect',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectDetect, 'Remote project detect is disabled')
      const id = getRouteParam(req, 'id')
      const project = deps.projectManager.getProject(id)
      if (!project) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }

      const exists = async (relativePath: string): Promise<boolean> => {
        try {
          await access(join(project.path, relativePath))
          return true
        } catch {
          return false
        }
      }

      const [
        hasClaudeDir,
        hasClaudeSettings,
        hasClaudePrompt,
        hasClaudePromptUpper,
        hasCodexDir,
        hasCodexConfig,
        hasAgentsFile,
        hasAgentsFileUpper,
        hasOpenCodeDir,
        hasOpenCodeConfig,
        hasOpenCodeSkills,
        hasAgentsSkills
      ] = await Promise.all([
        exists('.claude'),
        exists(join('.claude', 'settings.json')),
        exists('CLAUDE.md'),
        exists('CLAUDE.MD'),
        exists('.codex'),
        exists(join('.codex', 'config.json')),
        exists('AGENTS.md'),
        exists('AGENTS.MD'),
        exists('.opencode'),
        exists('opencode.json'),
        exists(join('.opencode', 'skills')),
        exists(join('.agents', 'skills'))
      ])

      sendSuccess(res, getRequestId(req), {
        claude: hasClaudeDir || hasClaudeSettings || hasClaudePrompt || hasClaudePromptUpper,
        codex: hasCodexDir || hasCodexConfig || hasAgentsFile || hasAgentsFileUpper,
        opencode: hasOpenCodeDir || hasOpenCodeConfig || hasOpenCodeSkills || hasAgentsSkills
      })
    })
  )

  app.get(
    '/api/projects/:id/prompt',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectPromptRead, 'Remote project prompt read is disabled')
      const id = getRouteParam(req, 'id')
      const cliType = parsePromptCliType(req)
      const promptFile = await deps.projectManager.readProjectPromptFile(id, cliType)
      if (!promptFile) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      sendSuccess(res, getRequestId(req), promptFile)
    })
  )

  app.post(
    '/api/projects',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectCreate, 'Remote project creation is disabled in passthrough mode')
      const body = parseProjectCreateBody(req.body)
      const existing = deps.projectManager.getProjectByPath(body.path)
      if (existing) {
        throw new HttpError(409, 'PROJECT_ALREADY_EXISTS', `Project already exists: ${existing.id}`)
      }
      const project = await deps.projectManager.addProject(body.path, body.name)
      sendSuccess<RemoteProjectDto>(res, getRequestId(req), project)
    })
  )

  app.patch(
    '/api/projects/:id',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectUpdate, 'Remote project update is disabled in passthrough mode')
      const id = getRouteParam(req, 'id')
      const body = parseProjectUpdateBody(req.body)
      const project = await deps.projectManager.updateProject(id, body)
      if (!project) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      sendSuccess<RemoteProjectDto>(res, getRequestId(req), project)
    })
  )

  app.delete(
    '/api/projects/:id',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectRemove, 'Remote project remove is disabled in passthrough mode')
      const id = getRouteParam(req, 'id')
      const project = deps.projectManager.getProject(id)
      if (!project) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      const projectSessions = deps.sessionManager.listSessions({ projectPath: project.path })
      for (const session of projectSessions) {
        deps.sessionManager.destroySession(session.id)
      }
      const ok = await deps.projectManager.removeProject(id)
      if (!ok) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      sendSuccess(res, getRequestId(req), { deleted: true })
    })
  )

  app.post(
    '/api/projects/:id/open',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectOpen, 'Remote project open is disabled in passthrough mode')
      const id = getRouteParam(req, 'id')
      const project = await deps.projectManager.openProject(id)
      if (!project) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      sendSuccess<RemoteProjectDto>(res, getRequestId(req), project)
    })
  )

  app.put(
    '/api/projects/:id/prompt',
    withHandler(async (req, res) => {
      assertRemoteCapability(capabilities.projectPromptWrite, 'Remote project prompt write is disabled')
      const id = getRouteParam(req, 'id')
      const cliType = parsePromptCliType(req)
      const body = parseProjectPromptBody(req.body)
      const promptFile = await deps.projectManager.writeProjectPromptFile(id, cliType, body.content)
      if (!promptFile) {
        throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${id}`)
      }
      sendSuccess(res, getRequestId(req), promptFile)
    })
  )

  app.get(
    '/api/sessions',
    withHandler(async (req, res) => {
      const filter = parseSessionListFilter(req)
      let projectPath = filter.projectPath
      if (filter.projectId) {
        const project = deps.projectManager.getProject(filter.projectId)
        if (!project) {
          throw new HttpError(404, 'PROJECT_NOT_FOUND', `Project not found: ${filter.projectId}`)
        }
        projectPath = project.path
      }

      const sessions = deps.sessionManager.listSessions({
        type: filter.type,
        status: filter.status,
        projectPath,
        parentId: filter.parentId
      })

      sendSuccess(
        res,
        getRequestId(req),
        sessions.map((session) => toRemoteSessionDto(deps, session))
      )
    })
  )

  app.get(
    '/api/sessions/:id/output',
    withHandler(async (req, res) => {
      const id = getRouteParam(req, 'id')

      const session = deps.sessionManager.getSession(id)
      if (!session) {
        throw new HttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${id}`)
      }

      const lines = parseHistoryLines(req)
      const response: RemoteSessionOutputHistoryResponse = {
        sessionId: id,
        lines: deps.outputManager.getHistory(id, lines)
      }

      sendSuccess(res, getRequestId(req), response)
    })
  )

  app.post(
    '/api/sessions',
    withHandler(async (req, res) => {
      assertLifecycleAllowed(passthroughOnly)
      const body = parseCreateBody(req.body)
      const projectPath = await resolveProjectPath(deps, body)
      const session = deps.sessionManager.createSession({
        type: body.type,
        projectPath,
        name: body.name,
        icon: body.icon,
        options: body.options,
        parentId: body.parentId,
        startPaused: body.startPaused
      } as any)
      sendSuccess(res, getRequestId(req), toRemoteSessionDto(deps, session))
    })
  )

  app.post(
    '/api/sessions/:id/start',
    withHandler(async (req, res) => {
      assertLifecycleAllowed(passthroughOnly)
      const id = getRouteParam(req, 'id')
      const session = await deps.sessionManager.startSession(id)
      if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${id}`)
      sendSuccess(res, getRequestId(req), toRemoteSessionDto(deps, session))
    })
  )

  app.post(
    '/api/sessions/:id/pause',
    withHandler(async (req, res) => {
      assertLifecycleAllowed(passthroughOnly)
      const id = getRouteParam(req, 'id')
      const session = deps.sessionManager.pauseSession(id)
      if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${id}`)
      sendSuccess(res, getRequestId(req), toRemoteSessionDto(deps, session))
    })
  )

  app.post(
    '/api/sessions/:id/restart',
    withHandler(async (req, res) => {
      assertLifecycleAllowed(passthroughOnly)
      const id = getRouteParam(req, 'id')
      const session = await deps.sessionManager.restartSession(id)
      if (!session) throw new HttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${id}`)
      sendSuccess(res, getRequestId(req), toRemoteSessionDto(deps, session))
    })
  )

  app.delete(
    '/api/sessions/:id',
    withHandler(async (req, res) => {
      assertLifecycleAllowed(passthroughOnly)
      const id = getRouteParam(req, 'id')
      const ok = deps.sessionManager.destroySession(id)
      if (!ok) throw new HttpError(404, 'SESSION_NOT_FOUND', `Session not found: ${id}`)
      sendSuccess(res, getRequestId(req), { deleted: true })
    })
  )
}
