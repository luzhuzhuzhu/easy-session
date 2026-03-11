import { timingSafeEqual } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import type { Socket } from 'socket.io'
import type { RemoteErrorBody } from './types'

function safeCompare(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  if (actualBuffer.length !== expectedBuffer.length) return false
  return timingSafeEqual(actualBuffer, expectedBuffer)
}

function extractBearerToken(headerValue: unknown): string | null {
  if (typeof headerValue !== 'string') return null
  const trimmed = headerValue.trim()
  if (!trimmed.toLowerCase().startsWith('bearer ')) return null
  return trimmed.slice(7).trim() || null
}

function buildError(requestId: string, message: string): RemoteErrorBody {
  return {
    code: 'UNAUTHORIZED',
    message,
    requestId
  }
}

export function createRestAuthMiddleware(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === 'OPTIONS') {
      next()
      return
    }
    const requestId = (req.headers['x-request-id'] as string | undefined) || 'n/a'
    const token = extractBearerToken(req.headers.authorization)
    if (!token || !safeCompare(token, expectedToken)) {
      res.status(401).json(buildError(requestId, 'Invalid or missing token'))
      return
    }
    next()
  }
}

export function validateSocketToken(socket: Socket, expectedToken: string): boolean {
  const handshakeTokenRaw = socket.handshake.auth?.token
  if (typeof handshakeTokenRaw === 'string' && safeCompare(handshakeTokenRaw, expectedToken)) {
    return true
  }

  const authHeaderToken = extractBearerToken(socket.handshake.headers.authorization)
  if (authHeaderToken && safeCompare(authHeaderToken, expectedToken)) {
    return true
  }
  return false
}
